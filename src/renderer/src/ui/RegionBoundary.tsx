// One UI region's error boundary (React UI spec §2): a throw logs once and shows the fallback; the region renders again
// when its reset key changes, so the other regions (and the menu strip's Leave) stay usable.
import { Component, type ReactNode } from 'react';

interface Props { name: string; resetKey: string; fallback: ReactNode; children: ReactNode }
interface State { failed: boolean; failedKey: string | null }

export class RegionBoundary extends Component<Props, State> {
  override state: State = { failed: false, failedKey: null };
  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }
  override componentDidCatch(error: unknown): void { console.error(`[ui] the ${this.props.name} region failed`, error); this.setState({ failedKey: this.props.resetKey }); }
  override componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey && this.state.failedKey !== this.props.resetKey) this.setState({ failed: false, failedKey: null });
  }
  override render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}
