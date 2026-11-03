import { Component, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface BoundaryProps {
  locationKey: string;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
  locationKey: string;
}

class PathErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, locationKey: this.props.locationKey };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): BoundaryState | null {
    return props.locationKey === state.locationKey ? null : { failed: false, locationKey: props.locationKey };
  }

  render() {
    return this.state.failed ? <ScreenLoadProblem /> : this.props.children;
  }
}

export function ScreenLoadProblem() {
  return (
    <main className="screen stack">
      <h1 className="title">Something went wrong</h1>
      <p className="problem" role="alert">
        Couldn't load this screen
      </p>
      <button className="button primary" type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
      <Link className="button" to="/">
        Go to Train
      </Link>
    </main>
  );
}

export function ScreenErrorBoundary({ children }: { children: ReactNode }) {
  const { key: locationKey } = useLocation();
  return <PathErrorBoundary locationKey={locationKey}>{children}</PathErrorBoundary>;
}
