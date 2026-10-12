import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface BoundaryProps {
  pathname: string;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
  pathname: string;
}

class PathErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, pathname: this.props.pathname };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): BoundaryState | null {
    return props.pathname === state.pathname ? null : { failed: false, pathname: props.pathname };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen stack">
        <p className="problem" role="alert">
          Couldn't load this screen
        </p>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}

export function ScreenErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PathErrorBoundary pathname={pathname}>{children}</PathErrorBoundary>;
}
