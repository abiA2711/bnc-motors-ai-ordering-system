import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client.js'
import { fetchPurchaseOrderPdf } from '../../api/purchaseOrders.js'
import ErrorMessage from '../ui/ErrorMessage.jsx'
import { useToast } from '../ui/ToastProvider.jsx'

export default function PurchaseOrderPdf({ purchaseOrderId, fileName }) {
  const toast = useToast()
  const previewUrl = useRef('')
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(() => () => {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current)
    }
  }, [])

  useEffect(() => {
    if (!preview) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return
      }

      URL.revokeObjectURL(preview.url)
      previewUrl.current = ''
      setPreview(null)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [preview])

  const closePreview = () => {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = ''
    }

    setPreview(null)
  }

  const openPreview = async () => {
    if (opening) {
      return
    }

    setOpening(true)
    setError('')

    try {
      const blob = await fetchPurchaseOrderPdf(purchaseOrderId)
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))

      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current)
      }

      previewUrl.current = url
      setPreview({ url, name: fileName || 'Original purchase order' })
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'The original PDF is unavailable'
      setError(message)
      toast.error(message)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="po-pdf-action">
      <button type="button" className="po-review-pdf" onClick={openPreview} disabled={opening}>
        {opening ? 'Opening PDF…' : 'View Original PDF'}
      </button>
      <ErrorMessage message={error} />
      {preview ? (
        <div className="po-pdf" role="dialog" aria-modal="true" aria-labelledby="po-pdf-title">
          <div className="po-pdf-card">
            <header>
              <div>
                <h2 id="po-pdf-title">Original purchase order</h2>
                <p>{preview.name}</p>
              </div>
              <div>
                <a href={preview.url} target="_blank" rel="noreferrer">Open in new tab</a>
                <button type="button" onClick={closePreview}>Close</button>
              </div>
            </header>
            <iframe title={preview.name} src={preview.url} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
