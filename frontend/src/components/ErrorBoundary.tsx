import React from "react"
import { getLastRequestId } from "../apiClient"

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{ feature?: string }>, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    // No source contents or stack traces are sent to users.
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <section role="alert" className="flex min-h-64 items-center justify-center bg-canvas p-8 text-ink">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 space-y-4">
        <h2 className="text-xl font-semibold">Something went wrong with {this.props.feature || "this view"}</h2>
        <p className="text-sm text-ink-secondary">Your saved projects remain on this server.</p>
        {getLastRequestId() && <p className="text-xs text-ink-secondary">Request ID: {getLastRequestId()}</p>}
        <button onClick={() => this.setState({ failed: false })} className="rounded-lg bg-brand px-4 py-2 text-white">Retry</button>
        <button onClick={() => { window.location.href = "/" }} className="ml-3 rounded-lg border border-line px-4 py-2">Return Home</button>
      </div>
    </section>
  }
}
