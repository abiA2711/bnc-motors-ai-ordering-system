import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { homePath } from '../auth/paths.js'
import AuthField from '../components/auth/AuthField.jsx'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import CountryFlag from '../components/auth/CountryFlag.jsx'
import LocationSelect from '../components/auth/LocationSelect.jsx'
import {
  BuildingIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  UserIcon,
  UserPlusIcon,
} from '../components/auth/icons.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import Loading from '../components/ui/Loading.jsx'
import {
  getCountries,
  getCountryByCode,
  getSubdivisionChildren,
  getSubdivisions,
  searchCountries,
} from '../location/geography.js'
import { internationalPhone, phoneError } from '../location/phone.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const features = [
  { label: 'Quick Registration', icon: <CheckIcon /> },
  { label: 'Place Orders & Upload POs', icon: <CheckIcon /> },
  { label: 'Track Order Status', icon: <CheckIcon /> },
  { label: 'Secure & Reliable', icon: <CheckIcon /> },
]

const fieldIds = {
  name: 'register-name',
  company_name: 'register-company',
  email: 'register-email',
  country: 'register-country',
  state: 'register-state',
  district: 'register-district',
  phone: 'register-phone',
  password: 'register-password',
  confirmPassword: 'register-confirm',
}

const sortCountries = (list) => list.slice().sort((left, right) => left.name.localeCompare(right.name))

const validate = ({
  account,
  confirmPassword,
  country,
  stateName,
  districtName,
  nationalPhone,
  states,
  districts,
  statesStatus,
  districtsStatus,
}) => {
  const errors = {}
  const name = account.name.trim()
  const company = account.company_name.trim()
  const email = account.email.trim()

  if (!name) {
    errors.name = 'Full name is required'
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer'
  }

  if (!company) {
    errors.company_name = 'Company name is required'
  } else if (company.length > 150) {
    errors.company_name = 'Company name must be 150 characters or fewer'
  }

  if (!email) {
    errors.email = 'Email is required'
  } else if (email.length > 150 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'A valid email address is required'
  }

  if (!country) {
    errors.country = 'Country is required'
  }

  if (statesStatus === 'loading') {
    errors.state = 'States are still loading'
  } else if (statesStatus === 'error') {
    errors.state = 'States could not be loaded'
  } else if (states.length === 0) {
    errors.state = 'No states are available for this country'
  } else if (!stateName || !states.some((item) => item.name === stateName)) {
    errors.state = 'Select a state for this country'
  }

  if (stateName && districtsStatus === 'loading') {
    errors.district = 'Districts are still loading'
  } else if (districtsStatus === 'error') {
    errors.district = 'Districts could not be loaded'
  } else if (districts.length > 0 && (!districtName || !districts.some((item) => item.name === districtName))) {
    errors.district = 'Select a district for this state'
  }

  const mobileError = phoneError(nationalPhone, country)
  if (mobileError) {
    errors.phone = mobileError
  }

  if (!account.password) {
    errors.password = 'Password is required'
  } else if (account.password.length < 8 || account.password.length > 72) {
    errors.password = 'Password must be between 8 and 72 characters'
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Confirm your password'
  } else if (confirmPassword !== account.password) {
    errors.confirmPassword = 'Passwords do not match'
  }

  return errors
}

export default function Register() {
  const { user, status, register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const submittingLock = useRef(false)
  const countries = useMemo(() => {
    try {
      return sortCountries(getCountries())
    } catch {
      return []
    }
  }, [])
  const india = useMemo(() => {
    try {
      return getCountryByCode('IN')
    } catch {
      return null
    }
  }, [])
  const [account, setAccount] = useState({
    name: '',
    company_name: '',
    email: '',
    password: '',
  })
  const [countryCode, setCountryCode] = useState(india ? india.isoCode : '')
  const [stateName, setStateName] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [nationalPhone, setNationalPhone] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [statesStatus, setStatesStatus] = useState(india ? 'loading' : 'ready')
  const [districtsStatus, setDistrictsStatus] = useState('ready')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const country = countries.find((item) => item.isoCode === countryCode) || null

  useEffect(() => {
    if (!countryCode) {
      return undefined
    }

    let active = true

    getSubdivisions(countryCode)
      .then((list) => {
        if (!active) {
          return
        }

        setStates(Array.isArray(list) ? list : [])
        setStatesStatus('ready')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setStates([])
        setStatesStatus('error')
      })

    return () => {
      active = false
    }
  }, [countryCode])

  useEffect(() => {
    if (!countryCode || !stateName) {
      return undefined
    }

    let active = true

    getSubdivisionChildren(countryCode, stateName)
      .then((list) => {
        if (!active) {
          return
        }

        setDistricts(Array.isArray(list) ? list : [])
        setDistrictsStatus('ready')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setDistricts([])
        setDistrictsStatus('error')
      })

    return () => {
      active = false
    }
  }, [countryCode, stateName])

  if (status === 'loading') {
    return (
      <div className="gate">
        <Loading label="Checking your session" />
      </div>
    )
  }

  if (user && (user.role === 'customer' || user.role === 'admin')) {
    return <Navigate to={homePath(user)} replace />
  }

  const currentErrors = () => validate({
    account,
    confirmPassword,
    country,
    stateName,
    districtName,
    nationalPhone,
    states,
    districts,
    statesStatus,
    districtsStatus,
  })

  const showError = (key) => {
    const next = currentErrors()
    setErrors((current) => ({ ...current, [key]: next[key] || '' }))
  }

  const updateAccount = (event) => {
    const { name, value } = event.target
    setAccount((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
  }

  const changeCountry = (nextCode) => {
    setCountryCode(nextCode)
    setStateName('')
    setDistrictName('')
    setStates([])
    setDistricts([])
    setStatesStatus('loading')
    setDistrictsStatus('ready')
    setErrors((current) => ({ ...current, country: '', state: '', district: '', phone: '' }))
  }

  const changeState = (nextState) => {
    setStateName(nextState)
    setDistrictName('')
    setDistricts([])
    setDistrictsStatus('loading')
    setErrors((current) => ({ ...current, state: '', district: '' }))
  }

  const submit = async (event) => {
    event.preventDefault()

    if (submittingLock.current) {
      return
    }

    const nextErrors = currentErrors()
    setErrors(nextErrors)
    setError('')
    const firstInvalid = Object.keys(fieldIds).find((key) => nextErrors[key])

    if (firstInvalid) {
      const field = document.getElementById(fieldIds[firstInvalid])
      if (field) {
        field.focus()
      }
      return
    }

    submittingLock.current = true
    setSubmitting(true)

    try {
      await register({
        name: account.name.trim(),
        company_name: account.company_name.trim(),
        email: account.email.trim(),
        phone: internationalPhone(country, nationalPhone),
        country: country.name,
        country_code: country.isoCode,
        state: stateName,
        district: districts.length > 0 ? districtName : null,
        password: account.password,
      })
      toast.success('Account created successfully. Please sign in.', 'auth-register')
      navigate('/login', { replace: true, state: { email: account.email.trim() } })
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Registration failed'
      setError(message)
      toast.error(message, 'auth-register')
      submittingLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      kicker="Create your"
      title="BNC Motors account"
      description="Register as a customer to browse products, place orders and upload purchase orders."
      features={features}
    >
      <form className="auth-card auth-card-wide" onSubmit={submit} noValidate>
        <div className="auth-card-head">
          <span className="auth-card-badge" aria-hidden="true">
            <UserPlusIcon />
          </span>
          <div className="auth-card-copy">
            <h2>Create your account</h2>
            <p>Join BNC Motors and start ordering automotive spare parts today.</p>
          </div>
        </div>
        <ErrorMessage message={error} />
        <div className="auth-fields">
          <AuthField
            id="register-name"
            label="Full Name"
            name="name"
            icon={<UserIcon />}
            value={account.name}
            onChange={updateAccount}
            onBlur={() => showError('name')}
            error={errors.name}
            autoComplete="name"
            placeholder="Enter your full name"
            showRequired
            maxLength={100}
          />
          <AuthField
            id="register-company"
            label="Company Name"
            name="company_name"
            icon={<BuildingIcon />}
            value={account.company_name}
            onChange={updateAccount}
            onBlur={() => showError('company_name')}
            error={errors.company_name}
            autoComplete="organization"
            placeholder="Enter your company name"
            showRequired
            maxLength={150}
          />
          <AuthField
            id="register-email"
            label="Email Address"
            name="email"
            type="email"
            icon={<MailIcon />}
            value={account.email}
            onChange={updateAccount}
            onBlur={() => showError('email')}
            error={errors.email}
            autoComplete="email"
            placeholder="Enter email address"
            showRequired
            maxLength={150}
          />
          <LocationSelect
            id="register-country"
            label="Country"
            value={countryCode}
            showRequired
            options={countries.map((item) => ({
              value: item.isoCode,
              label: item.name,
              flagCode: item.isoCode,
              detail: item.phoneCode,
            }))}
            hideSelectedDetail
            onChange={changeCountry}
            onBlur={() => showError('country')}
            error={errors.country || (countries.length === 0 ? 'Countries could not be loaded' : '')}
            placeholder="Select a country"
            emptyMessage="No countries match that search"
            search={(term) => searchCountries(term).map((item) => ({ value: item.isoCode }))}
          />
          <LocationSelect
            id="register-state"
            label="State / Province"
            value={stateName}
            showRequired
            loading={statesStatus === 'loading'}
            disabled={!country}
            options={states.map((item) => ({ value: item.name, label: item.name }))}
            onChange={changeState}
            onBlur={() => showError('state')}
            error={errors.state}
            placeholder="Select a state"
            emptyMessage={states.length === 0 ? 'No states are available for this country' : 'No states match that search'}
          />
          <LocationSelect
            id="register-district"
            label="District"
            value={districtName}
            showRequired={districts.length > 0}
            loading={districtsStatus === 'loading'}
            disabled={!stateName}
            options={districts.map((item) => ({ value: item.name, label: item.name }))}
            onChange={(nextDistrict) => {
              setDistrictName(nextDistrict)
              setErrors((current) => ({ ...current, district: '' }))
            }}
            onBlur={() => showError('district')}
            error={errors.district}
            placeholder={stateName ? 'Select a district' : 'Select a state first'}
            emptyMessage={stateName && districtsStatus === 'ready' && districts.length === 0
              ? 'No districts are available for this state'
              : 'No districts match that search'}
          />
          <div className={`auth-field${errors.phone ? ' is-invalid' : ''}`}>
            <label htmlFor="register-phone">
              Mobile Number
              <abbr title="required"> *</abbr>
            </label>
            <div className="auth-phone">
              <span className="auth-phone-code" id="register-phone-code">
                <CountryFlag code={country ? country.isoCode : 'IN'} />
                <span>{country ? country.phoneCode : '+91'}</span>
              </span>
              <input
                id="register-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="Enter mobile number"
                value={nationalPhone}
                aria-invalid={errors.phone ? 'true' : 'false'}
                aria-describedby={errors.phone ? 'register-phone-code register-phone-error' : 'register-phone-code'}
                onChange={(event) => {
                  setNationalPhone(event.target.value)
                  setErrors((current) => ({ ...current, phone: '' }))
                }}
                onBlur={() => showError('phone')}
              />
            </div>
            {errors.phone ? <small id="register-phone-error" className="auth-field-error">{errors.phone}</small> : null}
          </div>
          <AuthField
            id="register-password"
            label="Password"
            name="password"
            type="password"
            icon={<LockIcon />}
            value={account.password}
            onChange={updateAccount}
            onBlur={() => showError('password')}
            error={errors.password}
            autoComplete="new-password"
            placeholder="Create a password"
            showRequired
            maxLength={72}
            reveal
          />
          <AuthField
            id="register-confirm"
            label="Confirm Password"
            name="confirmPassword"
            type="password"
            icon={<LockIcon />}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value)
              setErrors((current) => ({ ...current, confirmPassword: '' }))
            }}
            onBlur={() => showError('confirmPassword')}
            error={errors.confirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            showRequired
            maxLength={72}
            reveal
          />
        </div>
        <Button className="auth-submit" type="submit" disabled={submitting}>
          <UserPlusIcon />
          {submitting ? 'Creating account' : 'Create Account'}
        </Button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
