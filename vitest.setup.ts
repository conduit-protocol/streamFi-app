import '@testing-library/jest-dom/vitest';

// React 18+ requires this flag so that act() works correctly in test
// environments and does not emit "testing environment is not configured
// to support act(...)" warnings that bury real failures (#447).
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
