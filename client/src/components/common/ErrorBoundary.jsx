import { Component } from 'react';
import { RotateCcw } from 'lucide-react';
import { StateScreen } from './StateScreen';

/** Last line of defence: a friendly screen instead of a stack trace. */
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app-shell bg-canvas">
        <StateScreen
          icon={RotateCcw}
          title="Something went wrong"
          description="The app hit an unexpected problem. Reloading usually fixes it."
          action={{ label: 'Reload', onClick: () => window.location.reload() }}
        />
      </div>
    );
  }
}
