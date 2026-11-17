import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { createProduct, getProduct, listProductCategories, updateProduct, updateProductStatus } from '../../api/products.js'
import DeactivateProductDialog from '../../components/admin/DeactivateProductDialog.jsx'
import ProductForm from '../../components/admin/ProductForm.jsx'
import Button from '../../components/ui/Button.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import { emptyProductForm, productFormPayload, productToForm, validateProductForm } from './productFormState.js'
import '../../styles/admin-product-form.css'

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6 9 12l6 6" />
    </svg>
  )
}

export default function AdminProductEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editing = Boolean(id)
  const [values, setValues] = useState(emptyProductForm)
  const [product, setProduct] = useState(null)
  const [categories, setCategories] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loadedId, setLoadedId] = useState(editing ? null : 'new')
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const submitLock = useRef(false)
  const statusLock = useRef(false)

  useEffect(() => {
    let active = true

    listProductCategories({ status: 'all' })
      .then((nextCategories) => {
        if (active) {
          setCategories(nextCategories)
        }
      })
      .catch(() => {
        if (active) {
          setCategories([])
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!editing) {
      return undefined
    }

    let active = true

    getProduct(id)
      .then((nextProduct) => {
        if (!active) {
          return
        }

        setProduct(nextProduct)
        setValues(productToForm(nextProduct))
        setLoadError('')
        setLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setProduct(null)
        setLoadError(requestError instanceof ApiError ? requestError.message : requestError.message)
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [editing, id, attempt])

  const onChange = (event) => {
    const { name, value } = event.target

    if (editing && name === 'stock_quantity') {
      return
    }

    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const onSubmit = (event) => {
    event.preventDefault()

    if (submitLock.current) {
      return
    }

    const errors = validateProductForm(values, { lockStock: editing })
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      setFormError('Check the highlighted fields and try again.')
      return
    }

    submitLock.current = true
    setBusy(true)
    setFormError('')
    const payload = productFormPayload(values, { includeStock: !editing })
    const request = editing ? updateProduct(id, payload) : createProduct(payload)

    request
      .then((result) => {
        const nextMessage = result.message || (editing ? 'Product updated' : 'Product created')
        toast.success(nextMessage, `product-save:${editing ? id : 'new'}`)
        navigate(`/admin/products/${result.product.id}`)
      })
      .catch((requestError) => {
        const nextMessage = requestError instanceof ApiError ? requestError.message : requestError.message

        if (requestError instanceof ApiError && requestError.status === 409) {
          setFieldErrors((current) => ({ ...current, sku: nextMessage }))
        }

        setFormError(nextMessage)
        toast.error(nextMessage, `product-save:${editing ? id : 'new'}`)
        setBusy(false)
        submitLock.current = false
      })
  }

  const confirmStatus = () => {
    if (!product || statusLock.current) {
      return
    }

    const nextActive = !product.is_active
    statusLock.current = true
    setUpdatingStatus(true)
    setStatusError('')

    updateProductStatus(product.id, nextActive)
      .then((result) => {
        const nextMessage = result.message || (nextActive ? `${product.name} was activated.` : `${product.name} was deactivated.`)
        setProduct(result.product)
        setPendingStatus(false)
        toast.success(nextMessage, `product-status:${product.id}:${nextActive}`)
      })
      .catch((requestError) => {
        const nextMessage = requestError instanceof ApiError ? requestError.message : requestError.message
        setStatusError(nextMessage)
        toast.error(nextMessage, `product-status:${product.id}:${nextActive}`)
      })
      .finally(() => {
        statusLock.current = false
        setUpdatingStatus(false)
      })
  }

  const loading = editing && loadedId !== id
  const backTo = editing ? `/admin/products/${id}` : '/admin/products'

  return (
    <div className="admin-product-editor">
      <header className="admin-product-editor-head">
        <Link to={backTo} aria-label={editing ? 'Back to product details' : 'Back to products'}>
          <ArrowIcon />
        </Link>
        <div>
          <h1>{editing ? 'Edit Product' : 'Add Product'}</h1>
          <p>{editing ? 'Update the product information and keep the catalogue up to date.' : 'Add a part to the catalogue. New products start as active.'}</p>
        </div>
      </header>
      {loading ? (
        <div className="admin-product-editor-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : null}
      {!loading && loadError ? (
        <section className="admin-product-editor-state">
          <h2>Product unavailable</h2>
          <ErrorMessage message={loadError} />
          <Button onClick={() => {
            setLoadError('')
            setLoadedId(null)
            setAttempt((current) => current + 1)
          }}
          >
            Try again
          </Button>
        </section>
      ) : null}
      {!loading && !loadError ? (
        <ProductForm
          values={values}
          errors={fieldErrors}
          formError={formError}
          busy={busy || updatingStatus}
          categories={categories}
          active={product ? Boolean(product.is_active) : null}
          submitLabel={editing ? 'Update Product' : 'Add Product'}
          onChange={onChange}
          onSubmit={onSubmit}
          lockStock={editing}
          onCancel={() => navigate(backTo)}
          onStatus={() => {
            setStatusError('')
            setPendingStatus(true)
          }}
        />
      ) : null}
      <DeactivateProductDialog
        product={pendingStatus && product ? product : null}
        activating={Boolean(product && !product.is_active)}
        busy={updatingStatus}
        error={statusError}
        onCancel={() => {
          if (!statusLock.current) {
            setPendingStatus(false)
            setStatusError('')
          }
        }}
        onConfirm={confirmStatus}
      />
    </div>
  )
}
