'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { copyToClipboard } from '@/lib/clipboard';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

interface QrCodeModalProps {
  isOpen?: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  errorCorrectionLevel?: ErrorCorrectionLevel;
}

/** Shorten a URL for display: keep origin + last path segment. */
function shortlink(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    return `${u.origin}/…/${last}`;
  } catch {
    return url.length > 60 ? `${url.slice(0, 57)}…` : url;
  }
}

export function QrCodeModal({
  isOpen = true,
  value,
  title = 'QR code',
  onClose,
  errorCorrectionLevel = 'H',
}: QrCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const levelLabel = useMemo(() => errorCorrectionLevel, [errorCorrectionLevel]);
  const displayLink = useMemo(() => shortlink(value), [value]);

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

  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy link');
    }
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

        {/* #723 — shortlink + one-click copy */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
          <Link2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <p className="flex-1 truncate text-xs font-mono text-gray-600 dark:text-gray-300">
            {displayLink}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded bg-black dark:bg-white px-2.5 py-1 text-xs font-medium text-white dark:text-black hover:opacity-80 transition-opacity"
            aria-label="Copy share link"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
