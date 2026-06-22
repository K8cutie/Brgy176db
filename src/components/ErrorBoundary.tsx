import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Catches render-time exceptions anywhere below it so a single bad
// page doesn't white-screen the whole app for a non-technical user.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console for support; the app keeps its data intact
    // in localStorage so a reload recovers.
    console.error('ChurchOS crashed:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FAF8F3',
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 440, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#3D3A36', marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: '#8C8374', marginBottom: 20, lineHeight: 1.6 }}>
              The page hit an unexpected error. Your parish data is safe — it is
              stored on this computer and was not lost. Reloading usually fixes it.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                height: 44,
                padding: '0 24px',
                borderRadius: 8,
                backgroundColor: '#C9963B',
                color: '#fff',
                fontSize: 15,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reload ChurchOS
            </button>
            {this.state.error && (
              <p style={{ marginTop: 16, fontSize: 12, color: '#B8322F', fontFamily: 'monospace' }}>
                {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
