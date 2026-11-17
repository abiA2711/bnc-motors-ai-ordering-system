import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)
const VARIANTS = new Set(['success', 'error', 'warning', 'info'])
const EXIT_MS = 200
const VISIBLE_MS = 3000
const DUPLICATE_MS = 1000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const recent = useRef(new Map())
  const nextId = useRef(0)

  const removeToast = useCallback((id) => {
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const dismiss = useCallback((id) => {
    const record = timers.current.get(id)

    if (!record || record.leaving) {
      return
    }

    clearTimeout(record.hide)
    record.leaving = true
    setToasts((current) => current.map((toast) => (
      toast.id === id ? { ...toast, leaving: true } : toast
    )))
    record.remove = setTimeout(() => removeToast(id), EXIT_MS)
  }, [removeToast])

  const push = useCallback((variant, message, dedupeKey) => {
    const text = typeof message === 'string' ? message.trim() : ''
    const tone = VARIANTS.has(variant) ? variant : 'info'

    if (!text) {
      return
    }

    const key = `${tone}:${dedupeKey || text}`
    const now = Date.now()
    recent.current.forEach((time, storedKey) => {
      if (now - time >= DUPLICATE_MS) {
        recent.current.delete(storedKey)
      }
    })
    const previous = recent.current.get(key)

    if (previous && now - previous < DUPLICATE_MS) {
      return
    }

    recent.current.set(key, now)
    const id = nextId.current + 1
    nextId.current = id
    const hide = setTimeout(() => dismiss(id), VISIBLE_MS)
    timers.current.set(id, { hide, leaving: false })
    setToasts((current) => [{ id, variant: tone, message: text, leaving: false }, ...current])
  }, [dismiss])

  useEffect(() => () => {
    timers.current.forEach((record) => {
      clearTimeout(record.hide)
      clearTimeout(record.remove)
    })
    timers.current.clear()
  }, [])

  const value = useMemo(() => ({
    success: (message, dedupeKey) => push('success', message, dedupeKey),
    error: (message, dedupeKey) => push('error', message, dedupeKey),
    warning: (message, dedupeKey) => push('warning', message, dedupeKey),
    info: (message, dedupeKey) => push('info', message, dedupeKey),
    dismiss,
  }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 ? (
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={`toast toast-${toast.variant}${toast.leaving ? ' is-leaving' : ''}`}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
          >
            <p>{toast.message}</p>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </article>
        ))}
      </div>
      ) : null}
    </ToastContext.Provider>
  )
}

// The hook shares this provider's context. Fast refresh still updates ToastProvider.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }

  return context
}
