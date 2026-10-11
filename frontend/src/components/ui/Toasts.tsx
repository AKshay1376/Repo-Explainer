import React, { createContext, useContext, useState } from "react"

type Toast = { id: number; message: string }
const ToastContext = createContext<(message: string) => void>(() => undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = (message: string) => {
    const id = Date.now() + Math.random()
    setToasts(previous => previous.concat({ id, message }).slice(-3))
    window.setTimeout(() => setToasts(previous => previous.filter(item => item.id !== id)), 4000)
  }
  return <ToastContext.Provider value={notify}>
    {children}
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[120] max-w-sm space-y-2">
      {toasts.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-float"><span>{item.message}</span><button onClick={() => setToasts(previous => previous.filter(entry => entry.id !== item.id))} aria-label="Dismiss notification" className="text-ink-secondary">×</button></div>)}
    </div>
  </ToastContext.Provider>
}

export function useToast() { return useContext(ToastContext) }
