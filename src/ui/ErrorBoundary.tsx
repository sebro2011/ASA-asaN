import React from 'react';

/**
 * A minimal error boundary.
 *
 * The hero planet, the Leaflet map and the WebGL globe are all optional
 * embellishments: if one of them fails on a particular GPU or driver, the page
 * must keep working with its static fallback instead of unmounting the app.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode; onError?: (error: Error) => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}

export default ErrorBoundary;
