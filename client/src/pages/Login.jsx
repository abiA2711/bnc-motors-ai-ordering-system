import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { homePath } from '../auth/paths.js'
import AuthField from '../components/auth/AuthField.jsx'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { ArrowIcon, CartIcon, DocumentIcon, LockIcon, MailIcon, ShieldIcon, TruckIcon, UserPlusIcon } from '../components/auth/icons.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import Loading from '../components/ui/Loading.jsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const features = [
  { label: 'Wide Range of Spare Parts', icon: <CartIcon /> },
  { label: 'AI-Powered PO Processing', icon: <DocumentIcon /> },
  { label: 'Fast & Reliable Fulfilment', icon: <TruckIcon /> },
  { label: 'Secure & Business Ready', icon: <ShieldIcon /> },
]

const destinationFor = (user, location) => {
  const requested = location.state && location.state.from && location.state.from.pathname

  if (requested === '/' && user.role === 'customer') {
    return '/'
  }

  if (requested === '/admin' && user.role === 'admin') {
    return '/admin'
  }

  return homePath(user)
}

const fieldErrors = (email, password) => {
  const errors = {}

  if (!email.trim()) {
    errors.email = 'Email is required'
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'A valid email address is required'
  }

  if (!password) {
    errors.password = 'Password is required'
  }

  return errors
}

export default function Login() {
  const { user, status, login } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const presetEmail = location.state && typeof location.state.email === 'string' ? location.state.email : ''
  const [email, setEmail] = useState(presetEmail)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (status === 'loading') {
    return (
      <div className="gate">
        <Loading label="Checking your session" />
      </div>
    )
  }

  if (user && (user.role === 'customer' || user.role === 'admin')) {
    return <Navigate to={destinationFor(user, location)} replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = fieldErrors(email, password)
    setErrors(nextErrors)
    setError('')

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)

    try {
      await login({ email, password })
      toast.success('Signed in', 'auth-login')
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Sign in failed'
      setError(message)
      toast.error(message, 'auth-login')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      kicker="Welcome to"
      title="BNC Motors"
      description="Your trusted destination for automotive spare parts and business ordering."
      features={features}
    >
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-card-copy">
          <h2>Sign in to your account</h2>
          <p>Access your orders, purchase orders and business account.</p>
        </div>
        <ErrorMessage message={error} />
        <div className="auth-fields">
          <AuthField
            id="login-email"
            label="Email"
            name="email"
            type="email"
            icon={<MailIcon />}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((current) => ({ ...current, email: '' }))
            }}
            error={errors.email}
            autoComplete="email"
            placeholder="Enter your email address"
          />
          <AuthField
            id="login-password"
            label="Password"
            name="password"
            type="password"
            icon={<LockIcon />}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setErrors((current) => ({ ...current, password: '' }))
            }}
            error={errors.password}
            autoComplete="current-password"
            placeholder="Enter your password"
            reveal
          />
        </div>
        <Button className="auth-submit" type="submit" disabled={submitting}>
          <ArrowIcon />
          {submitting ? 'Signing in' : 'Sign In'}
        </Button>
        <div className="auth-foot">
          <p className="auth-switch">New to BNC Motors?</p>
          <Link className="auth-alt" to="/register">
            <UserPlusIcon />
            Create an account
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
