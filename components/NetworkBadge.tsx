import type { NetworkConfig } from '@/lib/network-config';
import { ConnectButton } from '@/components/ConnectButton';

/**
 * Modal prompting the user to switch their wallet to the app's configured
 * network when a mismatch is detected.
 */
function SwitchNetworkModal({ walletNetworkPassphrase, network }: {
  walletNetworkPassphrase?: string;
  network: NetworkConfig;
}) {
  return (
    <div className="network-mismatch-modal" role="dialog" aria-modal="true">
      <p>
        Your wallet is connected to a different Stellar network. Please switch to
        {' '}
        {network.label} in your wallet before submitting transactions.
      </p>
      <ConnectButton network={network} />
    </div>
  );
}

interface NetworkBadgeProps {
  network: NetworkConfig;
  walletNetworkPassphrase?: string;
}

/**
 * Persistent indicator for the currently active Stellar network. Hidden on
 * mainnet so it only draws attention when the user might be looking at
 * fake money (#559).
 */
export function NetworkBadge({ network, walletNetworkPassphrase }: NetworkBadgeProps) {
  const isMismatch =
    walletNetworkPassphrase !== undefined &&
    walletNetworkPassphrase !== network.networkPassphrase;

  if (isMismatch) {
    return (
      <span
        className="badge-network badge-network--warning"
        role="alert"
        title={`Wallet is connected to a different network. Switch to ${network.label}.`}
      >
        <SwitchNetworkModal
          network={network}
          walletNetworkPassphrase={walletNetworkPassphrase}
        />
      </span>
    );
  }

  if (network.name === 'mainnet') return null;

  return (
    <span className="badge-network" title={`Connected to ${network.label}`}>
      {network.label}
    </span>
  );
}
