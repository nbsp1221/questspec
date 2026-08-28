import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createBrowserPreviewApi } from './api/client.ts';
import './styles.css';

interface ErrorBoundaryState {
  readonly failed: boolean;
}

class ErrorBoundary extends Component<{ readonly children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Preview UI failed', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Preview display failed</h1>
        <p>The read-only browser view encountered an unexpected error.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload preview
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) {
  throw new Error('Preview root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App api={createBrowserPreviewApi()} />
    </ErrorBoundary>
  </StrictMode>,
);
