export function homePath(user) {
  if (user && user.role === 'admin') {
    return '/admin'
  }

  if (user && user.role === 'customer') {
    return '/'
  }

  return '/login'
}
