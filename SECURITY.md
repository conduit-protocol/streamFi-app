# Security

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Report privately to **security@conduit.sh** with: description, steps to reproduce, potential impact, and suggested fix if available. We will acknowledge within 48 hours.

## Application-level Considerations

### Wallet signing

All on-chain actions require the user's connected wallet to sign a transaction. The app never has access to private keys. Transaction XDR is assembled client-side, passed to Stellar Wallets Kit for user approval, and submitted after signing.

Never store or transmit the signed XDR outside the signing flow.

### Environment variables

All `NEXT_PUBLIC_*` variables are embedded in the client bundle at build time and are visible to anyone who inspects the page source. They must not contain any secrets — only public contract IDs and RPC endpoints.

| Variable | Public? | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_FACTORY_CONTRACT_ID` | Yes | Contract ID, not a secret |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Yes | RPC endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Yes | Network identifier |

### RPC endpoint

The app sends all transaction XDR to the configured Soroban RPC. Use a reputable provider. A malicious RPC could return fabricated simulation results or refuse to submit transactions. For high-value deployments, run your own node.

### Contract ID validation

The app reads `NEXT_PUBLIC_FACTORY_CONTRACT_ID` from build-time environment variables. If an attacker can modify the deployment environment, they could point the app at a malicious contract. Ensure your CI/CD pipeline protects these environment variables.

### Content Security Policy

The app does not yet ship a Content Security Policy header. This is tracked as a planned hardening item. Until then, avoid injecting user-supplied content into `dangerouslySetInnerHTML`.

## Audit Status

The underlying smart contracts have not been audited. Do not use this application with real funds on Stellar Mainnet until an audit is complete. See [`conduit-contracts/docs/security.md`](https://github.com/conduit-protocol/conduit-contracts/blob/main/docs/security.md) for the full threat model.
