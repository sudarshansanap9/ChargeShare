
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { register } from '../lib/auth'
import type { UserRole } from '../lib/auth'
import './Auth.css'
export default function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedRole = searchParams.get('role')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(
    requestedRole === 'host' ? 'host' : 'driver',
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (fullName.trim().length < 2) {
      setError('Please enter your full name.')
      return
    }

    if (password.length < 8) {
      setError('Your password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      })

      navigate('/login', {
        replace: true,
        state: { message: 'Account created successfully. Please log in.' },
      })
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail

        setError(
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((item: { msg?: string }) => item.msg || 'Invalid input').join(' ')
              : 'Registration failed. Check your details and try again.',
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
          <span className="section-kicker">JOIN THE COMMUNITY</span>
          <h1>Let's get you connected.</h1>
          <p>Create an account to discover or share EV charging.</p>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Full name
            <input
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Your full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>

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
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <fieldset className="role-fieldset">
            <legend>I want to...</legend>

            <div className="role-options">
              <label className={`role-option ${role === 'driver' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="driver"
                  checked={role === 'driver'}
                  onChange={() => setRole('driver')}
                />
                <span className="role-option-icon">↗</span>
                <span>
                  <strong>Find a charger</strong>
                  <small>I'm an EV driver</small>
                </span>
              </label>

              <label className={`role-option ${role === 'host' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="host"
                  checked={role === 'host'}
                  onChange={() => setRole('host')}
                />
                <span className="role-option-icon">ϟ</span>
                <span>
                  <strong>Share my charger</strong>
                  <small>I'm a charger host</small>
                </span>
              </label>
            </div>
          </fieldset>

          <button className="button auth-submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/login">Log in</Link>
        </p>

        <Link className="auth-back" to="/">← Back to homepage</Link>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-content">
          <span className="section-kicker">POWERED BY COMMUNITY</span>
          <h2>A better charging network starts with us.</h2>
          <p>Join drivers and hosts making EV charging more accessible, one connection at a time.</p>
          <div className="auth-aside-icon" aria-hidden="true">ϟ</div>
        </div>
      </aside>
    </main>
  )
}
