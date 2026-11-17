import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { uploadPurchaseOrder } from '../api/purchaseOrders.js'
import PurchaseOrderUpload from '../components/purchase-orders/PurchaseOrderUpload.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import '../styles/purchase-orders.css'

const STEPS = [
  {
    title: 'Upload PO (PDF)',
    copy: 'Upload your purchase order file.',
  },
  {
    title: 'AI Extracts Items',
    copy: 'We read and extract part details using AI.',
  },
  {
    title: 'Match with Catalogue',
    copy: 'Items are matched with our product catalogue.',
  },
  {
    title: 'Review & Confirm',
    copy: 'Verify matches, adjust if needed and place your order.',
  },
]

export default function UploadPurchaseOrder() {
  const navigate = useNavigate()
  const toast = useToast()
  const submitting = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const submitFile = async (file) => {
    if (submitting.current) {
      return false
    }

    submitting.current = true
    setUploading(true)
    setUploadError('')

    try {
      const result = await uploadPurchaseOrder(file)
      const purchaseOrder = result.purchaseOrder
      const id = purchaseOrder && purchaseOrder.id

      if (id === undefined || id === null || id === '') {
        setUploadError('The purchase order could not be uploaded')
        return false
      }

      toast.success(result.message || 'Purchase order uploaded', `po-upload:${id}`)
      navigate(`/purchase-orders/${id}`)
      return true
    } catch (requestError) {
      const message = requestError instanceof ApiError
        ? requestError.message
        : 'The purchase order could not be uploaded'
      setUploadError(message)
      toast.error(message, `po-upload:${message}`)
      return false
    } finally {
      submitting.current = false
      setUploading(false)
    }
  }

  return (
    <div className="po-upload-page">
      <header className="po-upload-heading">
        <Link className="po-upload-back" to="/purchase-orders">Back to My Purchase Orders</Link>
        <h1>Upload Purchase Order</h1>
        <p>Upload your PO (PDF) and we'll extract the items and match them with our catalogue.</p>
      </header>
      <div className="po-upload-layout">
        <PurchaseOrderUpload
          busy={uploading}
          error={uploadError}
          onSubmit={submitFile}
          onClearError={() => setUploadError('')}
        />
        <aside className="po-how" aria-labelledby="po-how-heading">
          <h2 id="po-how-heading">How it works</h2>
          <ol>
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
