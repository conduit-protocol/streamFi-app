"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { Modal } from "@/components/ui/Modal";

interface QrCodeModalProps {
  /** The address encoded into the QR code. */
  address: string;
  onClose: () => void;
}

/** Cell size in SVG user units — kept small since the <svg> itself scales via CSS. */
const CELL_SIZE = 4;

/**
 * Renders a scannable QR code for a Stellar address in a modal (#550).
 *
 * Builds the code with `qrcode-generator` (zero dependencies, ~16 KB) and
 * draws it as plain inline SVG rects rather than using the library's
 * `createSvgTag` HTML-string output, so it needs no `dangerouslySetInnerHTML`
 * and can follow the app's light/dark theme.
 */
export function QrCodeModal({ address, onClose }: QrCodeModalProps) {
  const modules = useMemo(() => {
    // Type number 0 = auto-select the smallest size that fits the data.
    const qr = qrcode(0, "M");
    qr.addData(address);
    qr.make();
    const count = qr.getModuleCount();
    const cells: boolean[][] = [];
    for (let row = 0; row < count; row++) {
      const line: boolean[] = [];
      for (let col = 0; col < count; col++) {
        line.push(qr.isDark(row, col));
      }
      cells.push(line);
    }
    return cells;
  }, [address]);

  const size = modules.length * CELL_SIZE;

  return (
    <Modal title="Scan address" onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div className="p-3 bg-white rounded">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size * 4}
            height={size * 4}
            role="img"
            aria-label={`QR code for address ${address}`}
            className="block"
          >
            <rect x={0} y={0} width={size} height={size} fill="#fff" />
            {modules.map((line, row) =>
              line.map((dark, col) =>
                dark ? (
                  <rect
                    key={`${row}-${col}`}
                    x={col * CELL_SIZE}
                    y={row * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="#000"
                  />
                ) : null,
              ),
            )}
          </svg>
        </div>
        <p className="font-mono text-xs text-center break-all text-gray-500 dark:text-gray-400">
          {address}
        </p>
      </div>
    </Modal>
  );
}
