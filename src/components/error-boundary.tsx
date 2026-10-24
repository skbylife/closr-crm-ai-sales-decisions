'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/20 bg-danger/10">
              <AlertTriangle className="h-6 w-6 text-danger" />
            </div>
            <p className="text-lg font-semibold text-foreground">
              页面出错了
            </p>
            <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-secondary">
              发生了意外错误，请刷新页面重试
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error?.message && (
              <p className="mt-3 max-w-[400px] rounded-lg border border-border bg-sidebar px-3 py-2 text-xs text-muted">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
