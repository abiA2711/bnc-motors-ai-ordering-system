import { useRef, useState } from 'react'
import ErrorMessage from '../ui/ErrorMessage.jsx'

const MAX_PDF_BYTES = 10 * 1024 * 1024

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return ''
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const validatePdf = (file) => {
  if (!file) {
    return 'A PDF file is required'
  }

  const name = typeof file.name === 'string' ? file.name : ''
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : ''
  const pdfType = type === '' || type === 'application/pdf' || type === 'application/x-pdf'

  if (extension !== '.pdf' || !pdfType) {
    return 'Only PDF files are allowed'
  }

  if (file.size > MAX_PDF_BYTES) {
    return 'PDF must be 10 MB or smaller'
  }

  if (file.size <= 0) {
    return 'The PDF file is empty'
  }

  return ''
}

function PdfMark() {
  return (
    <svg className="po-upload-art" viewBox="0 0 88 88" aria-hidden="true">
      <path fill="#ffffff" stroke="#07182d" strokeWidth="2.2" strokeLinejoin="round" d="M22 12h30l16 16v48H22z" />
      <path fill="#e8f3fe" stroke="#0878e8" strokeWidth="2" strokeLinejoin="round" d="M52 12v16h16" />
      <rect x="32" y="38" width="28" height="14" rx="3" fill="#0878e8" />
      <text x="46" y="48.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700" fontFamily="Segoe UI, sans-serif">PDF</text>
      <path stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" d="M32 58h28M32 64h20" />
    </svg>
  )
}

export default function PurchaseOrderUpload({ busy, error, onSubmit, onClearError }) {
  const inputRef = useRef(null)
  const dragDepth = useRef(0)
  const [file, setFile] = useState(null)
  const [localError, setLocalError] = useState('')
  const [dragging, setDragging] = useState(false)

  const choose = (nextFile) => {
    if (busy || !nextFile) {
      return
    }

    const message = validatePdf(nextFile)
    setLocalError(message)

    if (message) {
      return
    }

    setFile(nextFile)
    if (onClearError) {
      onClearError()
    }
  }

  const removeFile = () => {
    if (busy) {
      return
    }

    setFile(null)
    setLocalError('')
    if (onClearError) {
      onClearError()
    }
  }

  const submit = async (event) => {
    event.preventDefault()

    if (busy) {
      return
    }

    const message = validatePdf(file)

    if (message) {
      setLocalError(message)
      return
    }

    setLocalError('')
    const uploaded = await onSubmit(file)

    if (uploaded) {
      setFile(null)
    }
  }

  const openPicker = () => {
    if (!busy) {
      inputRef.current?.click()
    }
  }

  return (
    <form className="po-upload-card" onSubmit={submit} aria-busy={busy}>
      <div
        className={dragging ? 'po-upload-drop is-active' : 'po-upload-drop'}
        onDragEnter={(event) => {
          event.preventDefault()
          if (busy) {
            return
          }
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!busy) {
            setDragging(true)
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) {
            setDragging(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          const nextFile = event.dataTransfer.files && event.dataTransfer.files[0]
          if (nextFile) {
            choose(nextFile)
          }
        }}
      >
        <span className="po-upload-halo" aria-hidden="true"><PdfMark /></span>
        {file ? (
          <div className="po-selected">
            <span className="po-selected-copy">
              <strong className="po-upload-name" title={file.name}>{file.name}</strong>
              <span>{formatFileSize(file.size)}</span>
            </span>
            <button type="button" className="po-upload-remove" onClick={removeFile} disabled={busy}>Remove</button>
          </div>
        ) : (
          <h2>Drag &amp; drop your Purchase Order (PDF) here</h2>
        )}
        <p className="po-upload-or">or</p>
        <button type="button" className="po-upload-choose" onClick={openPicker} disabled={busy}>Choose File</button>
        <p className="po-upload-help">Supports PDF • Maximum file size: 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          aria-label="Purchase order PDF"
          onChange={(event) => {
            const nextFile = event.target.files && event.target.files[0]
            if (nextFile) {
              choose(nextFile)
            }
            event.target.value = ''
          }}
        />
      </div>
      {file ? (
        <button type="submit" className="po-upload-submit" disabled={busy}>
          {busy ? 'Uploading purchase order…' : 'Upload Purchase Order'}
        </button>
      ) : null}
      {busy ? (
        <p className="po-upload-status" role="status">
          <span className="po-upload-bar" />
          Uploading and extracting items…
        </p>
      ) : null}
      <ErrorMessage message={localError || error} />
    </form>
  )
}
