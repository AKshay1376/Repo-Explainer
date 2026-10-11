import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import "@xyflow/react/dist/style.css"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { ToastProvider } from "./components/ui/Toasts"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider><ErrorBoundary><App /></ErrorBoundary></ToastProvider>
  </React.StrictMode>,
)
