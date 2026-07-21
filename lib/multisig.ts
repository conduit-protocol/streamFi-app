// Scaffold for Multisig Transaction Coordination

/**
 * Serializes an XDR string and copies it to the clipboard, preventing broadcast.
 * @param xdr - The base64 transaction XDR
 */
export async function proposeTransaction(xdr: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(xdr);
    console.log("Transaction XDR copied to clipboard. Share this with your multisig co-signers.");
  } catch (error) {
    console.error("Failed to copy XDR:", error);
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = xdr;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
  }
}
