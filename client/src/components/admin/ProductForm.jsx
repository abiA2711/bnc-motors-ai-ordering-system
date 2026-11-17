import { Link } from 'react-router-dom'
import ProductImage from '../products/ProductImage.jsx'
import '../../styles/admin-product-form.css'

const UNIT_OPTIONS = ['pcs', 'set', 'pair', 'box', 'litre', 'kg']

const requiredMark = <abbr title="required">*</abbr>

function optionsIncluding(current, options) {
  const values = options.filter(Boolean)
  if (current && !values.includes(current)) {
    return [current, ...values]
  }
  return values
}

export default function ProductForm({
  values,
  errors,
  formError,
  message,
  busy,
  categories = [],
  active = null,
  submitLabel = 'Save product',
  onChange,
  onSubmit,
  onCancel,
  onStatus,
  lockStock = false,
}) {
  const preview = {
    name: values.name,
    sku: values.sku,
    image_url: values.image_url,
  }
  const categoryOptions = optionsIncluding(values.category, categories)
  const unitOptions = optionsIncluding(values.unit, UNIT_OPTIONS)

  const focusImage = () => {
    document.getElementById('product-image-url')?.focus()
  }

  return (
    <form className="admin-product-form" onSubmit={onSubmit} noValidate>
      {message ? <p className="success-message" role="status">{message}</p> : null}
      {formError ? <p className="error-message" role="alert">{formError}</p> : null}
      <div className="admin-product-form-layout">
        <section className="admin-product-form-image">
          <h2>Product Image</h2>
          <ProductImage product={preview} className="admin-product-form-photo" />
          <button type="button" onClick={focusImage} disabled={busy}>Change image</button>
          <label>
            <span>Image URL</span>
            <input
              id="product-image-url"
              name="image_url"
              value={values.image_url}
              onChange={onChange}
              aria-invalid={Boolean(errors.image_url)}
              disabled={busy}
              placeholder="https://"
            />
            {errors.image_url ? <small role="alert">{errors.image_url}</small> : <small>Paste an image URL. File upload is not supported.</small>}
          </label>
        </section>
        <section className="admin-product-form-info">
          <h2>Product Information</h2>
          <div className="admin-product-form-grid">
            <label>
              <span>Product Name {requiredMark}</span>
              <input name="name" value={values.name} onChange={onChange} aria-invalid={Boolean(errors.name)} disabled={busy} />
              {errors.name ? <small role="alert">{errors.name}</small> : null}
            </label>
            <label>
              <span>Part Number (SKU) {requiredMark}</span>
              <input name="sku" value={values.sku} onChange={onChange} aria-invalid={Boolean(errors.sku)} disabled={busy} />
              {errors.sku ? <small role="alert">{errors.sku}</small> : null}
            </label>
            <label>
              <span>Category {requiredMark}</span>
              {categoryOptions.length > 0 ? (
                <select name="category" value={values.category} onChange={onChange} aria-invalid={Boolean(errors.category)} disabled={busy}>
                  <option value="">Select a category</option>
                  {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : (
                <input name="category" value={values.category} onChange={onChange} aria-invalid={Boolean(errors.category)} disabled={busy} />
              )}
              {errors.category ? <small role="alert">{errors.category}</small> : null}
            </label>
            <label>
              <span>Brand</span>
              <input name="brand" value={values.brand} onChange={onChange} aria-invalid={Boolean(errors.brand)} disabled={busy} />
              {errors.brand ? <small role="alert">{errors.brand}</small> : null}
            </label>
            <label>
              <span>Price (₹) {requiredMark}</span>
              <input name="price" value={values.price} onChange={onChange} inputMode="decimal" aria-invalid={Boolean(errors.price)} disabled={busy} />
              {errors.price ? <small role="alert">{errors.price}</small> : null}
            </label>
            <label>
              <span>{lockStock ? 'Current Stock' : <>Stock Quantity {requiredMark}</>}</span>
              <input
                name="stock_quantity"
                value={values.stock_quantity}
                onChange={lockStock ? undefined : onChange}
                inputMode="numeric"
                aria-invalid={Boolean(errors.stock_quantity)}
                aria-readonly={lockStock || undefined}
                readOnly={lockStock}
                disabled={busy && !lockStock}
              />
              {errors.stock_quantity ? <small role="alert">{errors.stock_quantity}</small> : null}
              {lockStock ? <small>Change this from <Link to="/admin/inventory">Inventory</Link>.</small> : null}
            </label>
            <label>
              <span>Reorder Level {requiredMark}</span>
              <input name="reorder_level" value={values.reorder_level} onChange={onChange} inputMode="numeric" aria-invalid={Boolean(errors.reorder_level)} disabled={busy} />
              {errors.reorder_level ? <small role="alert">{errors.reorder_level}</small> : null}
            </label>
            <label>
              <span>Unit {requiredMark}</span>
              <select name="unit" value={values.unit} onChange={onChange} aria-invalid={Boolean(errors.unit)} disabled={busy}>
                <option value="">Select a unit</option>
                {unitOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              {errors.unit ? <small role="alert">{errors.unit}</small> : null}
            </label>
            {active === null ? (
              <label>
                <span>Currency {requiredMark}</span>
                <input name="currency" value={values.currency} onChange={onChange} maxLength={3} aria-invalid={Boolean(errors.currency)} disabled={busy} />
                {errors.currency ? <small role="alert">{errors.currency}</small> : null}
              </label>
            ) : (
              <div className="admin-product-form-status">
                <span>Status</span>
                <button type="button" role="switch" aria-checked={active} onClick={onStatus} disabled={busy}>
                  <span />
                  {active ? 'Active' : 'Inactive'}
                </button>
              </div>
            )}
            <label className="is-wide">
              <span>Description</span>
              <textarea name="description" value={values.description} onChange={onChange} rows={4} aria-invalid={Boolean(errors.description)} disabled={busy} />
              {errors.description ? <small role="alert">{errors.description}</small> : null}
            </label>
          </div>
        </section>
      </div>
      <div className="admin-product-form-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? 'Saving' : submitLabel}</button>
      </div>
    </form>
  )
}
