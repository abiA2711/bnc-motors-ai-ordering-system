import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons.jsx'

export default function AuthField({
  id,
  label,
  name,
  type = 'text',
  icon,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
  required = true,
  showRequired = false,
  maxLength,
  reveal = false,
  onBlur,
}) {
  const [visible, setVisible] = useState(false)
  const inputType = reveal && visible ? 'text' : type
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={`auth-field${error ? ' is-invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {showRequired ? <abbr title="required"> *</abbr> : null}
      </label>
      <div className="auth-control">
        <span className="auth-control-icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={errorId}
          onBlur={onBlur}
        />
        {reveal ? (
          <button
            type="button"
            className="auth-reveal"
            aria-label={visible ? `Hide ${label}` : `Show ${label}`}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>
      {error ? <small id={errorId} className="auth-field-error">{error}</small> : null}
    </div>
  )
}
