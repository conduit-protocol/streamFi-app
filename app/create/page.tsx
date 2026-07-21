'use client';

import { useState }         from 'react';
import { useRouter }        from 'next/navigation';
import { useForm }          from 'react-hook-form';
import { zodResolver }      from '@hookform/resolvers/zod';
import { z }                from 'zod';
import { ArrowRight, Info } from 'lucide-react';
import { useWallet }        from '@/contexts/WalletContext';
import { createStream }     from '@/lib/factory';
import { toStroops }        from '@/lib/format';
import { TOKENS_TESTNET }   from '@/lib/tokens';
import { CopyHashButton }   from '@/components/ui/CopyHashButton';

const schema = z.object({
  recipient:       z.string().min(56, 'Must be a valid Stellar address').max(56),
  token:           z.string().min(1, 'Select a token'),
  depositAmount:   z.string().regex(/^\d+(\.\d+)?$/, 'Enter a valid amount'),
  durationSeconds: z.coerce.number().min(3600, 'Minimum 1 hour'),
  clawback:        z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function CreatePage() {
  const router = useRouter();
  const { publicKey, signTx, connected } = useWallet();

  const [step,    setStep]    = useState<1 | 2>(1);
  const [pending, setPending] = useState(false);
  const [txHash,  setTxHash]  = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: 'XLM', clawback: false, durationSeconds: 2592000 },
  });

  const deposit  = watch('depositAmount');
  const duration = watch('durationSeconds');
  const token    = watch('token');

  // Tokens aren't all 7 decimals (the native XLM/SAC convention) — this app
  // supports arbitrary TOKENS_TESTNET entries, so the preview must use each
  // token's own decimals rather than assume one for all of them.
  const tokenDecimals = TOKENS_TESTNET.find(t => t.symbol === token)?.decimals ?? 7;

  const rate = deposit && duration
    ? (parseFloat(deposit) * 10 ** tokenDecimals / duration).toFixed(2)
    : '—';

  const ratePerDay = deposit && duration
    ? (parseFloat(deposit) / (duration / 86400)).toFixed(4)
    : null;

  async function onSubmit(data: FormValues) {
    if (!publicKey) {
      setError('Connect your wallet first.');
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
      const rateStroops    = depositStroops / BigInt(data.durationSeconds);
      const startTime      = Math.floor(Date.now() / 1000) + 60; // 60s buffer
      const endTime        = startTime + data.durationSeconds;

      const hash = await createStream({
        sender:     publicKey,
        recipient:  data.recipient,
        token:      tokenAddr,
        deposit:    depositStroops,
        ratePerSec: rateStroops,
        startTime,
        endTime,
        clawback:   data.clawback,
      }, signTx);

      setTxHash(hash);
      setTimeout(() => router.push('/streams'), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setPending(false);
    }
  }

  if (txHash) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center">
        <div className="card py-12">
          <p className="text-4xl mb-4">✓</p>
          <h1 className="text-xl font-black mb-2">Stream created</h1>
          <p className="text-sm text-gray-500 mb-4">
            Transaction confirmed. Redirecting to your streams…
          </p>
          <div className="inline-flex items-center gap-1.5 max-w-full">
            <p className="font-mono text-xs text-gray-400 break-all">{txHash}</p>
            <CopyHashButton hash={txHash} className="shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-black tracking-tight mb-2">Create a stream</h1>
      <p className="text-sm text-gray-500 mb-8">
        Tokens will be deployed into a new DripStream contract and released continuously.
      </p>

      {!connected && (
        <div className="card border-gray-200 bg-gray-50 text-sm text-gray-600 mb-6 py-3 px-4">
          Connect your wallet before creating a stream.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Recipient */}
        <div>
          <label className="block text-xs font-semibold mb-1">Recipient address</label>
          <input
            {...register('recipient')}
            placeholder="G…"
            className="input font-mono"
          />
          {errors.recipient && (
            <p className="text-xs text-red-600 mt-1">{errors.recipient.message}</p>
          )}
        </div>

        {/* Token */}
        <div>
          <label className="block text-xs font-semibold mb-1">Token</label>
          <select {...register('token')} className="input">
            {TOKENS_TESTNET.map(t => (
              <option key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</option>
            ))}
          </select>
        </div>

        {/* Deposit */}
        <div>
          <label className="block text-xs font-semibold mb-1">Total deposit</label>
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
          <label className="block text-xs font-semibold mb-1">Duration (seconds)</label>
          <input
            {...register('durationSeconds')}
            placeholder="2592000"
            className="input"
            type="number"
          />
          <p className="text-xs text-gray-400 mt-1">
            {duration ? `${Math.floor(duration / 86400)}d ${Math.floor((duration % 86400) / 3600)}h` : ''}
          </p>
          {errors.durationSeconds && (
            <p className="text-xs text-red-600 mt-1">{errors.durationSeconds.message}</p>
          )}
        </div>

        {/* Rate preview */}
        {deposit && duration && (
          <div className="card bg-gray-50 border-gray-100 flex items-start gap-2">
            <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="text-xs text-gray-600 space-y-0.5">
              <p>
                Release rate:{' '}
                <span className="font-mono font-semibold text-black">{rate} stroops/s</span>
              </p>
              {ratePerDay && (
                <p>
                  ≈ <span className="font-semibold text-black">{ratePerDay} {token}</span> per day
                </p>
              )}
            </div>
          </div>
        )}

        {/* Clawback */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            {...register('clawback')}
            type="checkbox"
            className="mt-0.5 rounded border-gray-300"
          />
          <div>
            <span className="text-sm font-semibold">Enable clawback</span>
            <p className="text-xs text-gray-500 mt-0.5">
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
          disabled={pending || !connected}
          className="btn-primary w-full"
        >
          {pending ? 'Signing transaction…' : 'Create stream'}
          {!pending && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
