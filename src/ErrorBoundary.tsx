import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: "2rem", maxWidth: "600px", color: "#e2e8f0" }}>
          <h2 style={{ color: "#f87171", marginTop: 0 }}>Something went wrong</h2>
          <pre style={{ background: "#1e293b", padding: "1rem", borderRadius: 8, overflow: "auto", fontSize: "0.85rem" }}>
            {this.state.error.message}
          </pre>
          <p style={{ fontSize: "0.9rem", color: "#94a3b8" }}>Check the browser console for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
