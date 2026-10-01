import { Component, type ReactNode } from "react";

/** If WebGL is unavailable or a scene crashes, the page simply renders without the 3D layer. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn("3D scene disabled:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

let webgl: boolean | undefined;
export function canUseWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}
