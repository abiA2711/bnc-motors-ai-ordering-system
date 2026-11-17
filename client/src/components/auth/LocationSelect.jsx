import { useEffect, useId, useMemo, useRef, useState } from 'react'
import CountryFlag from './CountryFlag.jsx'

export default function LocationSelect({
  id,
  label,
  value,
  options,
  onChange,
  onBlur,
  error,
  disabled = false,
  loading = false,
  placeholder = 'Select',
  emptyMessage = 'No matches',
  showRequired = false,
  search,
  hideSelectedDetail = false,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = options.find((option) => option.value === value) || null
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()

    if (!term) {
      return options
    }

    if (search) {
      const matches = new Set(search(query).map((item) => item.value))
      return options.filter((option) => matches.has(option.value))
    }

    return options.filter((option) => {
      const labelText = option.label.toLowerCase()
      const detail = option.detail ? option.detail.toLowerCase() : ''
      return labelText.includes(term) || detail.includes(term) || option.value.toLowerCase().includes(term)
    })
  }, [options, query, search])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const close = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
        setQuery('')
        if (onBlur) {
          onBlur()
        }
      }
    }

    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open, onBlur])

  const choose = (option) => {
    onChange(option.value)
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  const onKeyDown = (event) => {
    if (disabled || loading) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)))
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => Math.max(current - 1, 0))
    }

    if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = filtered[activeIndex]
      if (option) {
        choose(option)
      }
    }

    if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className={`auth-field${error ? ' is-invalid' : ''}`} ref={rootRef}>
      <label htmlFor={id}>
        {label}
        {showRequired ? <abbr title="required"> *</abbr> : null}
      </label>
      <div className="auth-select">
        <button
          id={id}
          type="button"
          className="auth-select-button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled || loading}
          onClick={() => {
            setOpen((current) => !current)
            setActiveIndex(0)
          }}
          onBlur={(event) => {
            if (rootRef.current && event.relatedTarget && rootRef.current.contains(event.relatedTarget)) {
              return
            }
            if (onBlur) {
              onBlur()
            }
          }}
          onKeyDown={onKeyDown}
        >
          {loading ? 'Loading' : selected ? (
            <span className="auth-select-value">
              {selected.flagCode ? <CountryFlag code={selected.flagCode} /> : null}
              <span>{selected.label}</span>
              {selected.detail && !hideSelectedDetail ? <small>{selected.detail}</small> : null}
            </span>
          ) : placeholder}
        </button>
        {open ? (
          <div className="auth-select-panel">
            <input
              type="search"
              value={query}
              placeholder={`Search ${label.toLowerCase()}`}
              aria-label={`Search ${label}`}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={onKeyDown}
            />
            <ul id={listId} role="listbox" aria-label={label}>
              {filtered.length === 0 ? <li className="auth-select-empty">{emptyMessage}</li> : null}
              {filtered.map((option, index) => (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={index === activeIndex ? 'is-active' : ''}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                  >
                    {option.flagCode ? <CountryFlag code={option.flagCode} /> : null}
                    <span>{option.label}</span>
                    {option.detail ? <small>{option.detail}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {error ? <small id={`${id}-error`} className="auth-field-error">{error}</small> : null}
    </div>
  )
}
