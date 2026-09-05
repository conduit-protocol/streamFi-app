'use client';

import { useState, useEffect } from 'react';
import { useRouter }        from 'next/navigation';
import { useForm }          from 'react-hook-form';
import { zodResolver }      from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Info } from 'lucide-react';
import { useWallet }        from '@/contexts/WalletContext';
import { createStream, isMock } from '@/lib/factory';
import { TOKENS_TESTNET, tokenLogoUrl } from '@/lib/tokens';
import { CopyHashButton }   from '@/components/ui/CopyHashButton';
import { checkRecipientExists } from '@/lib/soroban';
import { checkContractHasWithdraw } from '@/lib/contract-recipient-probe';
import { refreshStreamData } from '@/lib/queryClient';
import { getFactoryContractId } from '@/lib/env';
import { getTokenAllowanceGateway } from '@/lib/token-allowance-gateway';
import { useDebounce } from '@/hooks/useDebounce';
import styles from './CreateStream.module.css';
import { toStroops, fromStroops, wouldRateTruncateToZero } from '@/lib/format';
import { isValidStellarAddress, isValidStellarContract, isValidStellarPublicKey } from '@/lib/stellar-address';
import { withTimeout } from '@/lib/with-timeout';


const schema = z.object({
  recipient:       z.string()
    .min(56, 'Must be a valid Stellar address (56 characters)')
    .max(56, 'Must be a valid Stellar address (56 characters)')
    .refine(
      (v) => isValidStellarPublicKey(v) || isValidStellarContract(v),
      'Must be a valid Stellar address (G… account or C… contract)',
    ),
  token:           z.string().min(1, 'Select a token'),
  depositAmount:   z.string().regex(/^\d+(\.\d+)?$/, 'Enter a valid amount').refine(val => parseFloat(val) > 0, 'Amount must be greater than 0'),
  // #319 — no upper bound previously meant an accidental extra digit (e.g.
  // 25920000 instead of 2592000) had no client-side guard before signing.
  // 10 years mirrors DripGovernor's own default max_duration_seconds cap.
  durationSeconds: z.coerce.number().min(3600, 'Minimum 1 hour').max(315_360_000, 'Maximum 10 years'),
  clawback:        z.boolean(),
  // #392 — only meaningful for a C… recipient; see the superRefine below.
  acknowledgeContractRecipient: z.boolean(),
}).superRefine((data, ctx) => {
  // A contract can be set as a stream's recipient, but only an address that
  // can *call* DripStream::withdraw as the recipient can ever pull the funds
  // out. A SAC, a plain token contract, or a vault without that call path
  // leaves the whole deposit stranded, and nothing on-chain can tell us in
  // advance which kind we were handed — so the user has to say so.
  if (isValidStellarContract(data.recipient) && !data.acknowledgeContractRecipient) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['acknowledgeContractRecipient'],
      message: 'Confirm this contract can call withdraw() before creating the stream.',
    });
  }
});

/**
 * Timeout for the full create-stream pipeline (simulate + sign + submit + poll).
 * Must stay well below START_TIME_BUFFER_S so that start_time is always in the
 * future even on a congested network (see #373).
 */
const CREATE_STREAM_TIMEOUT_MS = 60_000;

/**
 * Timeout message for the create pipeline. It is rendered inline in the form,
 * so it stays form-specific rather than using the shared helper's default
 * `… timed out after 60000ms` (#393).
 */
function createTimeoutError(ms: number, label?: string): Error {
  return new Error(
    `${label ?? 'The operation'} timed out after ${ms / 1000}s. The network may be congested — please try again.`,
  );
}

type FormValues = z.infer<typeof schema>;

export default function CreatePage() {
  const router = useRouter();
  const { publicKey, signTx, connected } = useWallet();

  const [step,    setStep]    = useState<1 | 2>(1);
  const [pending, setPending] = useState(false);
  const [txHash,  setTxHash]  = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Tracks the SEP-41 allowance pre-flight (#218) so the button label can
  // tell the user which on-chain step they're currently waiting on — an
  // approve() transaction is a separate wallet prompt from create_stream's.
  const [allowanceStage, setAllowanceStage] = useState<'checking' | 'approving' | null>(null);

  // On-chain recipient existence check — only runs after the address passes
  // the Zod length/format guard (i.e. it's a plausible 56-char G… key).
  // Debounced to avoid hammering the RPC on every keystroke.
  const [recipientStatus, setRecipientStatus] = useState<
    'idle' | 'checking' | 'valid' | 'not-found' | 'error' | 'contract-checking' | 'contract-no-withdraw'
  >('idle');

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      token: 'XLM',
      clawback: false,
      durationSeconds: 2592000,
      acknowledgeContractRecipient: false,
    },
  });

  const deposit  = watch('depositAmount');
  const duration = watch('durationSeconds');
  const token    = watch('token');
  const recipient = watch('recipient');
  const acknowledgedContractRecipient = watch('acknowledgeContractRecipient');

  // #392 — a C… recipient needs an explicit acknowledgement before submit.
  const isContractRecipient = !!recipient && isValidStellarContract(recipient);

  // The acknowledgement is about one specific contract, so editing the
  // address always withdraws it.
  useEffect(() => {
    setValue('acknowledgeContractRecipient', false);
  }, [recipient, setValue]);

  // Debounce the recipient input with a 600ms delay to reduce RPC calls
  const debouncedRecipient = useDebounce(recipient, 600);

  // Async on-chain account existence check. Only fires once the
  // address satisfies the Zod schema (56 chars, starts with G) so we never
  // waste an RPC call on a partially-typed address — Zod already owns
  // partial-input/format feedback exclusively.
  //
  // An AbortController is created per effect run so that:
  //   1. If the address changes before the debounce fires, the in-flight
  //      check (if any) is cancelled and the loading state is cleared.
  //   2. If the RPC provider hangs indefinitely, a 10s timeout rejects the
  //      promise and transitions status to 'error' rather than leaving the
  //      user stuck on "Verifying recipient…" forever.
  //   3. If the component unmounts mid-flight the state update is suppressed.
  const RECIPIENT_CHECK_TIMEOUT_MS = 10_000;
  useEffect(() => {
    const validLength = debouncedRecipient?.length === 56;

    if (!validLength) {
      setRecipientStatus('idle');
      return;
    }

    setRecipientStatus('checking');

    const controller = new AbortController();
    let isMounted = true;

    (async () => {
      // Hard timeout: if the RPC never responds, reject after 10s so the
      // spinner is always cleared.
      const timeoutId = setTimeout(() => controller.abort('timeout'), RECIPIENT_CHECK_TIMEOUT_MS);

      try {
        // Add a 10-second timeout to prevent an infinite loading state (#123)
        const exists = await checkRecipientExists(debouncedRecipient, { timeoutMs: 10_000 });
        if (!isMounted) return;
        if (exists && isValidStellarContract(debouncedRecipient)) {
          setRecipientStatus('contract-checking');
          // Probe the contract for a withdraw() entry point (#458)
          const walletPk = watch('token') ? (window as any).stellarWallet?.publicKey : undefined;
          const sourceAddr = walletPk || debouncedRecipient;
          try {
            const hasWithdraw = await checkContractHasWithdraw(debouncedRecipient, sourceAddr, { timeoutMs: 10_000 });
            if (!isMounted) return;
            setRecipientStatus(hasWithdraw ? 'valid' : 'contract-no-withdraw');
          } catch {
            if (!isMounted) return;
            setRecipientStatus('valid'); // Fallback: allow if probe fails
          }
        } else {
          setRecipientStatus(exists ? 'valid' : 'not-found');
        }
      } catch (err) {
        // Network / RPC error — don't block the user, but surface a warning.
        if (!isMounted) return;
        console.error('Recipient check failed:', err);
        setRecipientStatus('error');
      }
    })();

    return () => {
      isMounted = false;
      // Cancel any in-flight check so the status doesn't flip back to
      // 'valid'/'not-found'/'error' after the address has already changed.
      controller.abort('cancelled');
    };
  }, [debouncedRecipient]);

  // Tokens aren't all 7 decimals (the native XLM/SAC convention) — this app
  // supports arbitrary TOKENS_TESTNET entries, so the preview must use each
  // token's own decimals rather than assume one for all of them.
  const tokenDecimals = TOKENS_TESTNET.find(t => t.symbol === token)?.decimals ?? 7;

  // #364 — mirror onSubmit's exact bigint pipeline (toStroops then truncating
  // BigInt division) instead of float math. parseFloat(deposit) * 10 **
  // tokenDecimals loses precision for large deposits / high-decimal tokens,
  // and float division rounds where the contract call truncates, so the
  // preview could show a different rate than what actually gets submitted.
  const previewRateStroops = deposit && duration
    ? (() => {
        try {
          const depositStroops = toStroops(deposit, tokenDecimals);
          if (depositStroops <= 0n || !Number.isFinite(duration) || duration <= 0) return null;
          return depositStroops / BigInt(Math.floor(duration));
        } catch {
          return null;
        }
      })()
    : null;

  const rate = previewRateStroops !== null ? previewRateStroops.toString() : '—';

  const ratePerDay = previewRateStroops !== null
    ? fromStroops(previewRateStroops * 86400n, tokenDecimals)
    : null;

  // Live check, mirrors the exact bigint math onSubmit uses (see #243):
  // depositStroops / durationSeconds truncates, and a small deposit over a
  // long duration can silently compute to a rate of 0n with nothing ever
  // streaming out. Caught here so the form blocks submission with a clear
  // message instead of letting funds get locked into a dead stream.
  const rateWouldBeZero = deposit && duration
    ? wouldRateTruncateToZero(deposit, tokenDecimals, duration)
    : false;

  async function onSubmit(data: FormValues) {
    if (!publicKey) {
      setError('Connect your wallet first.');
      return;
    }
    // #363 — block on 'not-found' AND 'checking': the debounced RPC check
    // can still be in flight when the user clicks Submit, and without this
    // guard the not-found check below is bypassed entirely, letting a
    // stream get created for a nonexistent recipient.
    if (recipientStatus === 'not-found') {
      setError('Recipient account does not exist on-chain. Please check the address.');
      return;
    }
    if (recipientStatus === 'checking') {
      setError('Still verifying the recipient address — please wait a moment and try again.');
      return;
    }
    // #392 — belt and braces alongside the schema check, mirroring the
    // recipientStatus guards above: never sign a deposit into a contract the
    // user hasn't confirmed can withdraw from the stream.
    if (isValidStellarContract(data.recipient) && !data.acknowledgeContractRecipient) {
      setError('Confirm this contract can call withdraw() before creating the stream.');
      return;
    }
    setPending(true);
    setError(null);

    try {
      const tokenMeta = TOKENS_TESTNET.find(t => t.symbol === data.token);
      const tokenAddr = tokenMeta?.address;
      if (!tokenAddr) throw new Error(`Unknown token: ${data.token}`);

      // Must use this token's own decimals, not the default — toStroops()
      // silently produces a value wrong by orders of magnitude for any
      // non-7-decimal token if the decimals argument is omitted.
      const depositStroops = toStroops(data.depositAmount, tokenMeta.decimals);
      if (depositStroops <= 0n) throw new Error('Deposit must be greater than 0');
      const rateStroops    = depositStroops / BigInt(data.durationSeconds);
      if (rateStroops <= 0n) {
        throw new Error(
          'Deposit too small for this duration — increase the amount or shorten the duration.',
        );
      }
      // 300s buffer — must exceed CREATE_STREAM_TIMEOUT_MS (60s) by a wide
      // margin so that even on a congested network the ledger-close timestamp
      // doesn't overtake start_time and trigger BackdatedStream (#373).
      const startTime      = Math.floor(Date.now() / 1000) + 300;
      const endTime        = startTime + data.durationSeconds;

      // DripFactory::create_stream pulls the deposit from the sender via the
      // token's SEP-41 transfer_from, which requires a pre-existing allowance
      // from sender -> factory at least as large as the deposit. Without this
      // check, the first-ever deposit fails with an opaque contract error
      // (see #218). Skipped in demo/mock mode — createStream() never issues
      // a real RPC call there either.
      if (!isMock()) {
        const spender = getFactoryContractId();
        const gateway = getTokenAllowanceGateway();

        setAllowanceStage('checking');
        const allowanceCheck = await gateway.checkAllowance({
          token:   tokenAddr,
          owner:   publicKey,
          spender,
          source:  publicKey,
        });
        if (!allowanceCheck.success) {
          throw new Error(
            allowanceCheck.error?.message ?? 'Could not verify token allowance. Please try again.',
          );
        }

        if ((allowanceCheck.data ?? 0n) < depositStroops) {
          setAllowanceStage('approving');
          const approveResult = await gateway.approve({
            token:  tokenAddr,
            spender,
            amount: depositStroops,
            source: publicKey,
            signTx,
          });
          if (!approveResult.success) {
            throw new Error(
              approveResult.error?.message ?? 'Token approval failed. Please try again.',
            );
          }
        }
        setAllowanceStage(null);
      }

      const { hash, streamId } = await withTimeout(
        createStream({
          sender:     publicKey,
          recipient:  data.recipient,
          token:      tokenAddr,
          deposit:    depositStroops,
          ratePerSec: rateStroops,
          startTime,
          endTime,
          clawback:   data.clawback,
        }, signTx),
        CREATE_STREAM_TIMEOUT_MS,
        { label: 'Stream creation', onTimeout: createTimeoutError },
      );

      // Invalidate and refetch active stream data so the streams/dashboard
      // pages reflect the newly created stream immediately (fixes #162).
      await refreshStreamData();

      setTxHash(hash);
      // #362 — createStream now decodes the confirmed transaction's return
      // value, so we can deep-link straight to the new stream instead of
      // redirecting to /streams and hoping the user finds it. Fall back to
      // /streams only if the RPC/node didn't report a return value.
      setTimeout(() => {
        router.push(streamId !== null ? `/stream/${streamId}` : '/streams');
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setPending(false);
      setAllowanceStage(null);
    }
  }

  if (txHash) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center">
        <div className="card py-12">
          <p className="text-4xl mb-4">✓</p>
          <h1 className="text-xl font-black mb-2">Stream created successfully</h1>
          <p className="text-sm text-gray-500 mb-4">
            Transaction confirmed. Redirecting to your streams…
          </p>
          <div className={`inline-flex items-center gap-1.5 max-w-full ${styles.inlineFlexRow}`}>
            <p className="font-mono text-xs text-gray-400 dark:text-gray-500 break-all">{txHash}</p>
            <CopyHashButton hash={txHash} className={`shrink-0 ${styles.shrink0}`} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-black tracking-tight mb-2">Create a stream</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Tokens will be deployed into a new DripStream contract and released continuously.
      </p>

      {!connected && (
        <div className="card border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 mb-6 py-3 px-4">
          Connect your wallet before creating a stream.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Recipient */}
        <div>
          <label className="block text-xs font-semibold mb-1 dark:text-white">Recipient address</label>
          <input
            {...register('recipient')}
            placeholder="G…"
            className="input font-mono"
          />
          {errors.recipient && (
            <p className="text-xs text-red-600 mt-1">{String(errors.recipient.message)}</p>
          )}
          {/* On-chain existence feedback — only shown once the address passes
              the Zod format check (no redundancy with live Zod validation) */}
          {!errors.recipient && recipientStatus === 'checking' && (
            <p className="text-xs text-gray-400 mt-1">Checking account on-chain…</p>
          )}
          {!errors.recipient && recipientStatus === 'not-found' && (
            <p className="text-xs text-red-600 mt-1" role="alert">
              <span aria-hidden="true">✗ </span>
              {isContractRecipient
                ? 'Contract not found on-chain — nothing is deployed at this address.'
                : 'Account not found on-chain — the recipient must be funded before receiving a stream.'}
            </p>
          )}
          {!errors.recipient && recipientStatus === 'valid' && (
            <p className="text-xs text-gray-500 mt-1" role="status">
              <span aria-hidden="true">✓ </span>
              {isContractRecipient
                ? 'Contract found on-chain. Whether it can withdraw cannot be verified — see below.'
                : 'Account verified on-chain.'}
            </p>
          )}
          {!errors.recipient && recipientStatus === 'error' && (
            <p className="text-xs text-gray-400 mt-1" role="status">
              Could not check this address — the RPC endpoint may be unreachable or
              misconfigured. This is not a statement about the recipient; you may still proceed.
            </p>
          )}

          {/* #392 — a contract recipient can only receive a stream it is able
              to withdraw from. Nothing on-chain reveals that ahead of time, so
              the risk is stated plainly and submit stays blocked until the
              user acknowledges it. */}
          {!errors.recipient && isContractRecipient && (
            <div
              className="mt-2 border border-red-200 rounded px-3 py-2"
              role="alert"
            >
              <p className="text-xs font-semibold text-red-600">
                Contract recipient — the deposit may be unrecoverable.
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Only an address that can call <span className="font-mono">withdraw()</span> on the
                stream can ever pull these tokens out. A token or SAC contract, or a vault without
                that call path, leaves the full deposit locked — and only the current recipient or
                sender can re-point the stream afterwards.
              </p>
              <label className={`flex items-start gap-2 mt-2 cursor-pointer ${styles.flexRowStart}`}>
                <input
                  {...register('acknowledgeContractRecipient')}
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  I control this contract and confirm it can call{' '}
                  <span className="font-mono">withdraw()</span> on the stream.
                </span>
              </label>
              {errors.acknowledgeContractRecipient && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.acknowledgeContractRecipient.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Token */}
        <div>
          <label className="block text-xs font-semibold mb-1 dark:text-white">Token</label>
          <div className={`relative flex items-center gap-2 ${styles.flexRow}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tokenLogoUrl(token, 'testnet')}
              alt={`${token} logo`}
              width={20}
              height={20}
              className={`w-5 h-5 rounded-full shrink-0 ${styles.shrink0}`}
            />
            <select {...register('token')} className={`input flex-1 ${styles.flexGrow}`}>
              {TOKENS_TESTNET.map(t => (
                <option key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Deposit */}
        <div>
          <label className="block text-xs font-semibold mb-1 dark:text-white">Total deposit</label>
          <input
            {...register('depositAmount')}
            placeholder="1000"
            className="input"
            type="text"
            inputMode="decimal"
          />
          {errors.depositAmount && (
            <p className="text-xs text-red-600 mt-1">{errors.depositAmount.message}</p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-semibold mb-1 dark:text-white">Duration (seconds)</label>
          <input
            {...register('durationSeconds')}
            placeholder="2592000"
            className="input"
            type="number"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {duration ? `${Math.floor(duration / 86400)}d ${Math.floor((duration % 86400) / 3600)}h` : ''}
          </p>
          {errors.durationSeconds && (
            <p className="text-xs text-red-600 mt-1">{errors.durationSeconds.message}</p>
          )}
        </div>

        {/* Rate preview */}
        {deposit && duration && (
          <div className={`card bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 flex items-start gap-2 ${styles.flexRowStart}`}>
            <Info className={`w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0 ${styles.shrink0}`} />
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
              <p>
                Release rate:{' '}
                <span className="font-mono font-semibold text-black dark:text-white">{rate} stroops/s</span>
              </p>
              {ratePerDay && (
                <p>
                  ≈ <span className="font-semibold text-black dark:text-white">{ratePerDay} {token}</span> per day
                </p>
              )}
              {rateWouldBeZero && (
                <p className="text-red-600 font-semibold">
                  Deposit too small for this duration — increase the amount or shorten the duration.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Clawback */}
        <label className={`flex items-start gap-3 cursor-pointer ${styles.flexRowStart}`}>
          <input
            {...register('clawback')}
            type="checkbox"
            className="mt-0.5 rounded border-gray-300"
          />
          <div>
            <span className="text-sm font-semibold dark:text-white">Enable clawback</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Allows you to reclaim unstreamed tokens at any time. Recipients can see this flag —
              use only when necessary.
            </p>
          </div>
        </label>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={
            pending ||
            !connected ||
            rateWouldBeZero ||
            recipientStatus === 'not-found' ||
            recipientStatus === 'contract-no-withdraw' ||
            recipientStatus === 'checking' ||
            (isContractRecipient && !acknowledgedContractRecipient)
          }
          className="btn-primary w-full"
        >
          {pending
            ? allowanceStage === 'checking'
              ? 'Checking token allowance…'
              : allowanceStage === 'approving'
                ? 'Requesting approval…'
                : 'Signing transaction…'
            : recipientStatus === 'checking'
              ? 'Verifying recipient…'
              : 'Create stream'}
          {!pending && recipientStatus !== 'checking' && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
