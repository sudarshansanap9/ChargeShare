
import api from './api'

export type UserRole = 'driver' | 'host'

export type UserProfile = {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
}

export type RegisterData = {
  full_name: string
  email: string
  password: string
  role: UserRole
}

const TOKEN_KEY = 'chargeshare_access_token'

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function hasToken() {
  return Boolean(localStorage.getItem(TOKEN_KEY))
}

export async function login(email: string, password: string) {
  const form = new URLSearchParams()
  form.set('username', email.trim().toLowerCase())
  form.set('password', password)

  const response = await api.post<{ access_token: string; token_type: string }>(
    '/api/v1/auth/login',
    form,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )

  saveToken(response.data.access_token)
  return response.data
}

export async function register(data: RegisterData) {
  const response = await api.post<UserProfile>(
    '/api/v1/auth/register',
    {
      ...data,
      full_name: data.full_name.trim(),
      email: data.email.trim().toLowerCase(),
    },
  )

  return response.data
}

export async function getMyProfile() {
  const response = await api.get<UserProfile>('/api/v1/auth/me')
  return response.data
}

export async function logout() {
  clearToken()
}
