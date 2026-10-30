import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getMyProfile, login, logout } from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import './Auth.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      const user: UserProfile = await getMyProfile()

      if (!user.is_active) {
        logout()
        setError('This account is inactive. Please contact support.')
        return
      }

      navigate('/', { replace: true })
    } catch (err: unknown) {
      logout()

      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail

        setError(
          typeof detail === 'string'
            ? detail
            : 'Login failed. Check your email, password, and backend connection.',
        )
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link to="/" className="auth-brand">
          <span className="auth-brand-mark">ϟ</span>
          Charge<span>Share</span>
        </Link>

        <div className="auth-heading">
          <span className="section-kicker">WELCOME BACK</span>
          <h1>Good to see you.</h1>
          <p>Log in to continue your ChargeShare journey.</p>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="button auth-submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="auth-switch">
          New to ChargeShare? <Link to="/register">Create an account</Link>
        </p>

        <Link className="auth-back" to="/">← Back to homepage</Link>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-content">
          <span className="section-kicker">CHARGE SMARTER</span>
          <h2>Your next journey starts with a charge.</h2>
          <p>Discover charging spots, request bookings, and keep your charging journey organized.</p>
          <div className="auth-aside-icon" aria-hidden="true">ϟ</div>
        </div>
      </aside>
    </main>
  )
}
