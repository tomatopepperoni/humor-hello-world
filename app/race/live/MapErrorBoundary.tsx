"use client";

import { Component, type ReactNode } from "react";
import Fallback2D from "./Fallback2D";
import type { LiveRider } from "./scene";

/** Keeps a crash inside the map from reaching the page's error screen. */
export default class MapErrorBoundary extends Component<
  { riders: LiveRider[]; onClose?: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Live map crashed, showing the 2D map instead", error);
  }

  render() {
    if (this.state.failed) return <Fallback2D riders={this.props.riders} onClose={this.props.onClose} />;
    return this.props.children;
  }
}
