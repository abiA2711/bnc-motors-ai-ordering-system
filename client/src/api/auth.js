import { request } from './client.js'

export function login(credentials) {
  return request('/api/auth/login', {
    method: 'POST',
    body: {
      email: credentials.email,
      password: credentials.password,
    },
  })
}

export function register(account) {
  return request('/api/auth/register', {
    method: 'POST',
    body: {
      name: account.name,
      email: account.email,
      password: account.password,
      phone: account.phone,
      company_name: account.company_name,
      country: account.country,
      country_code: account.country_code,
      state: account.state,
      district: account.district,
    },
  })
}

export function getCurrentUser() {
  return request('/api/auth/me')
}
