import { useEffect, useRef } from 'react'
import Button from '../ui/Button.jsx'
import ErrorMessage from '../ui/ErrorMessage.jsx'
import '../../styles/admin-product-dialog.css'

function useConfirmDialog(open, busy, onCancel) {
  const dialogRef = useRef(null)
  const busyRef = useRef(busy)
  const cancelRef = useRef(onCancel)

  useEffect(() => {
    busyRef.current = busy
    cancelRef.current = onCancel
  }, [busy, onCancel])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const dialog = dialogRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => (dialog ? [...dialog.querySelectorAll('button:not(:disabled)')] : [])
    const initial = focusable()

    if (initial[0]) {
      initial[0].focus()
    } else {
      dialog?.focus()
    }

    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          cancelRef.current()
        }
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const items = focusable()

      if (items.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open])

  return dialogRef
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v8" />
      <path d="M7.2 6.2a7 7 0 1 0 9.6 0" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l.8 12h6.4L16 7" />
    </svg>
  )
}

export default function DeactivateProductDialog({ product, activating = false, busy = false, error = '', onCancel, onConfirm }) {
  const dialogRef = useConfirmDialog(Boolean(product), busy, onCancel)

  if (!product) {
    return null
  }

  const title = activating ? 'Activate Product?' : 'Deactivate Product?'
  const confirmLabel = activating ? 'Activate Product' : 'Deactivate Product'

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="panel dialog admin-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-status-title"
        tabIndex={-1}
      >
        <div className={`admin-confirm-mark ${activating ? 'is-activate' : 'is-deactivate'}`}>
          <PowerIcon />
        </div>
        <h2 id="product-status-title">{title}</h2>
        <p>Are you sure you want to {activating ? 'activate' : 'deactivate'} “{product.name}”?</p>
        <p className="admin-confirm-note">
          {activating
            ? 'The product will be available for customers to order again. Existing orders stay unchanged.'
            : 'This product will be marked as inactive and will no longer be available for customers to order. You can activate it again later.'}
        </p>
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button className={activating ? 'admin-confirm-activate' : 'admin-confirm-deactivate'} onClick={onConfirm} disabled={busy}>
            <PowerIcon />
            {busy ? (activating ? 'Activating' : 'Deactivating') : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}

export function DeleteProductDialog({ product, busy = false, error = '', onCancel, onConfirm }) {
  const dialogRef = useConfirmDialog(Boolean(product), busy, onCancel)

  if (!product) {
    return null
  }

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="panel dialog admin-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-delete-title"
        tabIndex={-1}
      >
        <div className="admin-confirm-mark is-delete">
          <TrashIcon />
        </div>
        <h2 id="product-delete-title">Delete Product?</h2>
        <p>Are you sure you want to delete “{product.name}”?</p>
        <p className="admin-confirm-note">This is a soft delete. The product will be marked inactive and historical orders and references will be preserved.</p>
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button className="admin-confirm-delete" onClick={onConfirm} disabled={busy}>
            <TrashIcon />
            {busy ? 'Deleting' : 'Delete Product'}
          </Button>
        </div>
      </section>
    </div>
  )
}
