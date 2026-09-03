import * as React from 'react';

/**
 * Shared stub for lucide-react icons.
 *
 * Provides a minimal SVG stub for every icon imported by the app so that
 * adding or changing icons in components never breaks tests.
 */
function createIconStub(name: string) {
  return function IconStub(props: React.SVGProps<SVGSVGElement>) {
    return (
      <svg
        data-testid={`icon-${name}`}
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
        {...props}
      />
    );
  };
}

// ── Explicit stubs for every icon used in source ────────────────────────────

export const AlertCircle   = createIconStub('AlertCircle');
export const ArrowDownToLine = createIconStub('ArrowDownToLine');
export const ArrowLeft     = createIconStub('ArrowLeft');
export const ArrowRight    = createIconStub('ArrowRight');
export const Check         = createIconStub('Check');
export const CheckCircle   = createIconStub('CheckCircle');
export const Clock         = createIconStub('Clock');
export const Copy          = createIconStub('Copy');
export const Download      = createIconStub('Download');
export const Info          = createIconStub('Info');
export const LogOut        = createIconStub('LogOut');
export const Menu          = createIconStub('Menu');
export const Monitor       = createIconStub('Monitor');
export const Moon          = createIconStub('Moon');
export const Pause         = createIconStub('Pause');
export const Play          = createIconStub('Play');
export const Plus          = createIconStub('Plus');
export const RefreshCw     = createIconStub('RefreshCw');
export const RotateCcw     = createIconStub('RotateCcw');
export const Shield        = createIconStub('Shield');
export const Sun           = createIconStub('Sun');
export const UserX         = createIconStub('UserX');
export const WifiOff       = createIconStub('WifiOff');
export const X             = createIconStub('X');
export const Zap           = createIconStub('Zap');
