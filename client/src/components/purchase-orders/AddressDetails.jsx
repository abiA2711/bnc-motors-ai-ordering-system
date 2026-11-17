const emptyErrors = {}

const fields = [
  { name: 'line1', label: 'Address line 1', autoComplete: 'address-line1', required: true, wide: true },
  { name: 'line2', label: 'Address line 2', autoComplete: 'address-line2', required: false, wide: true },
  { name: 'city', label: 'City', autoComplete: 'address-level2', required: true },
  { name: 'state', label: 'State', autoComplete: 'address-level1', required: true },
  { name: 'postal_code', label: 'Postal code', autoComplete: 'postal-code', required: true },
  { name: 'country', label: 'Country', autoComplete: 'country-name', required: true },
]

function AddressFields({ legend, value, errors = emptyErrors, onChange }) {
  return (
    <fieldset className="address-fields">
      <legend>{legend}</legend>
      <div className="address-grid">
        {fields.map((field) => (
          <label key={field.name} className={field.wide ? 'field field-wide' : 'field'}>
            <span>{field.label}{field.required ? '' : ' (optional)'}</span>
            <input
              name={field.name}
              value={value[field.name]}
              onChange={onChange}
              autoComplete={field.autoComplete}
              aria-invalid={Boolean(errors[field.name])}
              required={field.required}
            />
            {errors[field.name] ? <small className="field-error">{errors[field.name]}</small> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function AddressDetails({
  shipping,
  billing,
  sameBilling,
  notes,
  fieldErrors,
  onShippingChange,
  onBillingChange,
  onSameBillingChange,
  onNotesChange,
}) {
  return (
    <div className="page-stack">
      <h2>Address details</h2>
      <AddressFields
        legend="Shipping address"
        value={shipping}
        errors={fieldErrors.shipping}
        onChange={onShippingChange}
      />
      <label className="check-row">
        <input
          type="checkbox"
          checked={sameBilling}
          onChange={(event) => onSameBillingChange(event.target.checked)}
        />
        Billing address is the same as shipping
      </label>
      {sameBilling ? null : (
        <AddressFields
          legend="Billing address"
          value={billing}
          errors={fieldErrors.billing}
          onChange={onBillingChange}
        />
      )}
      <label className="field">
        <span>Delivery notes (optional)</span>
        <textarea
          name="notes"
          maxLength={2000}
          value={notes}
          onChange={onNotesChange}
          placeholder="Optional delivery note"
          aria-invalid={Boolean(fieldErrors.notes)}
        />
        {fieldErrors.notes ? <small className="field-error">{fieldErrors.notes}</small> : null}
      </label>
    </div>
  )
}
