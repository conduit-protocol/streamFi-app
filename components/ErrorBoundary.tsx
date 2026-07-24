'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

const MAX_ERROR_COUNT = 5;
const RESET_INTERVAL_MS = 30_000;

export class ErrorBoundary extends Component<Props, State> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  public state: State = {
    hasError: false,
    error: null,
    errorCount: 0,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorCount: 0 };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState((prev) => {
      const newCount = prev.errorCount + 1;
      if (newCount >= MAX_ERROR_COUNT) {
        console.error(
          `[ErrorBoundary] Circuit breaker triggered after ${newCount} errors. ` +
          'Suppressing further error displays for ' + (RESET_INTERVAL_MS / 1000) + 's.',
        );
        return { errorCount: newCount };
      }
      return { errorCount: newCount };
    });

    console.error('ErrorBoundary caught:', error.message, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    console.error('Unhandled promise rejection:', reason.message);
    this.props.onError?.(reason, { componentStack: '' });
  };

  public componentDidMount() {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, errorCount: 0 });
  };

  private scheduleReset = () => {
    if (!this.resetTimer) {
      this.resetTimer = setTimeout(() => {
        this.resetTimer = null;
        this.reset();
      }, RESET_INTERVAL_MS);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.state.errorCount >= MAX_ERROR_COUNT) {
        this.scheduleReset();
        return React.createElement('div', { className: 'flex items-center justify-center min-h-[200px]' },
          React.createElement('div', { className: 'text-center p-6 max-w-md' },
            React.createElement('h2', { className: 'text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2' }, 'Too many errors'),
            React.createElement('p', { className: 'text-sm text-gray-500 dark:text-gray-400' }, 'The application encountered repeated errors. Auto-recovering in a few seconds...'),
          ),
        );
      }

      if (this.props.fallback) {
        return this.props.fallback(this.state.error!, this.reset);
      }

      return React.createElement('div', { className: 'flex items-center justify-center min-h-[200px]' },
        React.createElement('div', { className: 'text-center p-6 max-w-md' },
          React.createElement('h2', { className: 'text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2' }, 'Something went wrong'),
          React.createElement('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mb-4' }, this.state.error?.message || 'An unexpected error occurred.'),
          React.createElement('button', {
            onClick: this.reset,
            className: 'px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded text-sm hover:opacity-80 transition-opacity',
          }, 'Try again'),
        ),
      );
    }

    return this.props.children;
  }
}
