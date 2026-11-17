import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, login as loginRequest, register as registerRequest } from '../api/auth.js'
import { ApiError, getToken, setToken, setUnauthorizedHandler } from '../api/client.js'

const AuthContext = createContext(null)

const readUser = (payload) => {
  const user = payload && payload.data && payload.data.user

  if (!user || !user.role) {
    return null
  }

  return user
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'anonymous'))
  const [sessionError, setSessionError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    setSessionError('')
    setStatus('anonymous')
  }, [])

  const login = useCallback(async (credentials) => {
    const payload = await loginRequest(credentials)
    const token = payload && payload.data && payload.data.token
    const nextUser = readUser(payload)

    if (!token || !nextUser) {
      throw new ApiError('Login did not return a session', 500)
    }

    setToken(token)
    setUser(nextUser)
    setSessionError('')
    setStatus('authenticated')
    return nextUser
  }, [])

  const register = useCallback(async (account) => {
    return registerRequest(account)
  }, [])

  const retrySession = useCallback(() => {
    setSessionError('')
    setStatus('loading')
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    let active = true

    setUnauthorizedHandler(() => {
      if (!active) {
        return
      }

      setToken(null)
      setUser(null)
      setSessionError('')
      setStatus('anonymous')
    })

    if (getToken()) {
      getCurrentUser()
        .then((payload) => {
          if (!active) {
            return
          }

          const currentUser = readUser(payload)

          if (!currentUser) {
            setToken(null)
            setUser(null)
            setSessionError('')
            setStatus('anonymous')
            return
          }

          setUser(currentUser)
          setSessionError('')
          setStatus('authenticated')
        })
        .catch((error) => {
          if (!active) {
            return
          }

          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setToken(null)
            setUser(null)
            setSessionError('')
            setStatus('anonymous')
            return
          }

          setSessionError(error instanceof Error ? error.message : 'The session could not be checked')
          setStatus('error')
        })
    }

    return () => {
      active = false
      setUnauthorizedHandler(null)
    }
  }, [attempt])

  const value = useMemo(() => {
    return {
      user,
      status,
      sessionError,
      login,
      register,
      logout: clearSession,
      retrySession,
    }
  }, [user, status, sessionError, login, register, clearSession, retrySession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook shares this provider's context. Fast refresh still updates AuthProvider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
