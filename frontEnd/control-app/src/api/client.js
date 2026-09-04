const API_BASE = '/control/api'

function getToken() {
  return localStorage.getItem('control_token')
}

function getHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function request(method, path, body) {
  const opts = { method, headers: getHeaders() }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${API_BASE}${path}`, opts)
  const data = await res.json()

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('control_token')
      window.location.href = '/control/login'
      return
    }
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export const api = {
  get:    (path) => request('GET', path),
  post:   (path, body) => request('POST', path, body),
  put:    (path, body) => request('PUT', path, body),
  patch:  (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
}
