const TOKEN_KEY = 'bnc.auth.token'

let unauthorizedHandler = null

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    return
  }

  localStorage.removeItem(TOKEN_KEY)
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

const readMessage = (payload, status) => {
  if (payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message
  }

  if (status === 401) {
    return 'Authentication required'
  }

  return 'The request could not be completed'
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let body = options.body

  if (body instanceof FormData) {
    headers.delete('Content-Type')
  } else if (body !== undefined && body !== null && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  } else if (typeof body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const baseUrl = import.meta.env.VITE_API_URL || ''
  let response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body,
    })
  } catch {
    throw new ApiError('The server could not be reached', 0)
  }

  const text = await response.text()
  let payload = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && unauthorizedHandler) {
      unauthorizedHandler()
    }

    throw new ApiError(readMessage(payload, response.status), response.status)
  }

  return payload
}
