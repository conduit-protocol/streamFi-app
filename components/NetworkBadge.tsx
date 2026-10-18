import type { NetworkConfig } from '@/lib/network-config';

interface NetworkBadgeProps {
  network: NetworkConfig;
}

/**
 * Persistent indicator for the currently active Stellar network. Hidden on
 * mainnet so it only draws attention when the user might be looking at
 * fake money (#559).
 */
export function NetworkBadge({ network }: NetworkBadgeProps) {
  if (network.name === 'mainnet') return null;

  return (
    <span className="badge-network" title={`Connected to ${network.label}`}>
      {network.label}
    </span>
  );
}
