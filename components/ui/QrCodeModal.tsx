'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

interface QrCodeModalProps {
  isOpen: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  errorCorrectionLevel?: ErrorCorrectionLevel;
}

export function QrCodeModal({
  isOpen,
  value,
  title = 'QR code',
  onClose,
  errorCorrectionLevel = 'H',
}: QrCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const levelLabel = useMemo(() => errorCorrectionLevel, [errorCorrectionLevel]);

  useEffect(() => {
    if (!isOpen || !value) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        errorCorrectionLevel,
        margin: 1,
        width: 240,
        color: {
          dark: '#111827',
          light: '#ffffff',
        },
      },
      (error) => {
        if (error) {
          console.error('QR code render failed', error);
          return;
        }

        if (!canvasRef.current) return;

        const dataUrl = canvasRef.current.toDataURL('image/png');
        setQrDataUrl(dataUrl);
      },
    );
  }, [isOpen, value, errorCorrectionLevel]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = 'streamfi-qr.png';
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <Modal title={title} onClose={onClose} size="max-w-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Correction: {levelLabel}</span>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" />
            Download PNG
          </button>
        </div>

        <div className="flex justify-center rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <canvas ref={canvasRef} className="h-56 w-56 rounded-lg bg-white" aria-label="QR code" />
        </div>

        <p className="break-all text-center text-[11px] text-gray-500 dark:text-gray-400">
          {value}
        </p>
      </div>
    </Modal>
  );
}
