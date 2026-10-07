import { Component } from 'react';

/**
 * Last line of defence. A render crash in one screen should show a recovery
 * card, not a white page - especially on an installed PWA where there is no
 * visible browser reload button.
 *
 * Must stay a class component: React has no hook equivalent of
 * componentDidCatch.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // TODO(phase 2): forward to the audit_logs endpoint / an error tracker.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink-50 px-6 text-center">
        <h1 className="text-title text-ink-900">Something went wrong</h1>
        <p className="max-w-md text-sm text-ink-500">
          The app hit an unexpected error. Your savings are unaffected - nothing is stored in this
          screen.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="inline-flex h-11 items-center justify-center rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
        >
          Reload DigiBank
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-full overflow-x-auto rounded-card bg-ink-900 p-4 text-left text-xs text-ink-100">
            {String(this.state.error?.stack ?? this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
