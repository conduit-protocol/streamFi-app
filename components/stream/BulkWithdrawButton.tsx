import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { withdraw } from '@/lib/stream';
import { Button } from '@/components/ui/Button';

export function BulkWithdrawButton({ activeStreams, onComplete }: { activeStreams: any[], onComplete?: (count: number) => void }) {
  const { publicKey, signTx } = useWallet();
  const mounted = useRef(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  const handleBulkWithdraw = async () => {
    if (!publicKey) return;
    setIsProcessing(true);
    let successCount = 0;
    
    try {
      for (const stream of activeStreams) {
        if (stream.info.withdrawable > 0n) {
          // Process withdrawal for each stream sequentially to avoid nonce collisions
          await withdraw(publicKey, stream.id, stream.info.withdrawable, signTx);
          successCount++;
          // A small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (error) {
      console.error("Failed during bulk withdrawal execution", error);
    } finally {
      if (!mounted.current) return;
      setIsProcessing(false);
      if (successCount > 0 && onComplete) {
        onComplete(successCount);
      }
    }
  };

  const totalAvailable = activeStreams.reduce(
    (sum, s) => sum + (s.info.withdrawable || 0n), 
    0n
  );

  return (
    <Button 
      onClick={handleBulkWithdraw} 
      disabled={isProcessing || totalAvailable === 0n}
      className="w-full mt-4"
    >
      {isProcessing ? 'Processing...' : 'Withdraw All Available'}
    </Button>
  );
}
