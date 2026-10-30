import HostLocationPicker from '../components/HostLocationPicker'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '../lib/api'
import { getMyProfile, clearToken } from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import './HostChargers.css'

type ChargerCategory = 'home' | 'business'

type Charger = {
  id: string
  host_id: string
  title: string
  description: string | null
  location_name: string
  latitude: number | null
  longitude: number | null
  connector_type: string
  power_kw: number
  price_per_kwh: number
  charger_category: ChargerCategory
  is_active: boolean
}

type ChargerForm = {
  title: string
  description: string
  location_name: string
  latitude: string
  longitude: string
  connector_type: string
  power_kw: string
  price_per_kwh: string
  charger_category: ChargerCategory
}

const emptyForm: ChargerForm = {
  title: '',
  description: '',
  location_name: '',
  latitude: '',
  longitude: '',
  connector_type: 'Type 2',
  power_kw: '7.40',
  price_per_kwh: '13.00',
  charger_category: 'home',
}

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail

    if (typeof detail === 'string') return detail

    if (err.response?.status === 401) {
      return 'Your session has expired. Please log in again.'
    }

    if (err.response?.status === 403) {
      return 'Your account is not authorized to manage chargers.'
    }
  }

  return fallback
}

function chargerToForm(charger: Charger): ChargerForm {
  return {
    title: charger.title,
    description: charger.description ?? '',
    location_name: charger.location_name,
    latitude: charger.latitude == null ? '' : String(charger.latitude),
    longitude: charger.longitude == null ? '' : String(charger.longitude),
    connector_type: charger.connector_type,
    power_kw: String(charger.power_kw),
    price_per_kwh: String(charger.price_per_kwh),
    charger_category: charger.charger_category,
  }
}

export default function HostChargersPage() {
  const navigate = useNavigate()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [chargers, setChargers] = useState<Charger[]>([])
  const [form, setForm] = useState<ChargerForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [locationMessage, setLocationMessage] = useState('')

  const loadChargers = useCallback(async () => {
    const response = await api.get<Charger[]>('/api/v1/chargers/mine')
    setChargers(Array.isArray(response.data) ? response.data : [])
  }, [])

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        const profile = await getMyProfile()

        if (!profile.is_active) {
          clearToken()
          navigate('/login', { replace: true })
          return
        }

        if (profile.role !== 'host') {
          navigate('/dashboard', { replace: true })
          return
        }

        if (cancelled) return

        setUser(profile)

        const response = await api.get<Charger[]>('/api/v1/chargers/mine')

        if (!cancelled) {
          setChargers(Array.isArray(response.data) ? response.data : [])
        }
      } catch (err: unknown) {
        if (cancelled) return

        if (axios.isAxiosError(err) && err.response?.status === 401) {
          clearToken()
          navigate('/login', { replace: true })
          return
        }

        setError(
          getErrorMessage(err, 'Could not load your chargers. Please try again.'),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void initialize()

    return () => {
      cancelled = true
    }
  }, [navigate])

  function updateField<K extends keyof ChargerForm>(
    field: K,
    value: ChargerForm[K],
  ) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }


function useCurrentLocation() {
  setLocationMessage('')
  setError('')

  if (!navigator.geolocation) {
    setLocationMessage(
      'Your browser does not support location detection.',
    )
    return
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = position.coords.latitude
      const longitude = position.coords.longitude

      setForm((previous) => ({
        ...previous,
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
      }))

      setLocationMessage(
        'Location captured. Verify that this is where your charger is installed before saving.',
      )
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        setLocationMessage(
          'Location permission was denied. Allow location access in your browser settings and try again.',
        )
      } else {
        setLocationMessage(
          'Could not determine your location. Try again or enter coordinates manually.',
        )
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    },
  )
}


  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function startEditing(charger: Charger) {
    setForm(chargerToForm(charger))
    setEditingId(charger.id)
    setError('')
    setNotice('')

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    const latitude = form.latitude.trim()
    const longitude = form.longitude.trim()

    if (Boolean(latitude) !== Boolean(longitude)) {
      setError('Enter both latitude and longitude, or leave both blank.')
      return
    }

    if (latitude && !Number.isFinite(Number(latitude))) {
      setError('Latitude must be a valid number.')
      return
    }

    if (longitude && !Number.isFinite(Number(longitude))) {
      setError('Longitude must be a valid number.')
      return
    }

    const power = Number(form.power_kw)
    const price = Number(form.price_per_kwh)

    if (!Number.isFinite(power) || power <= 0) {
      setError('Charging power must be greater than zero.')
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setError('Price per kWh cannot be negative.')
      return
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location_name: form.location_name.trim(),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      connector_type: form.connector_type.trim(),
      power_kw: power,
      price_per_kwh: price,
      charger_category: form.charger_category,
    }

    setSaving(true)

    try {
      if (editingId) {
        await api.patch(`/api/v1/chargers/${editingId}`, payload)
        setNotice('Charger updated successfully.')
      } else {
        await api.post('/api/v1/chargers', payload)
        setNotice('Charger created successfully.')
      }

      resetForm()
      await loadChargers()
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, 'Could not save the charger. Please try again.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(charger: Charger) {
    const confirmed = window.confirm(
      `Deactivate "${charger.title}"? It will no longer appear in public charger listings.`,
    )

    if (!confirmed) return

    setError('')
    setNotice('')
    setDeactivatingId(charger.id)

    try {
      await api.delete(`/api/v1/chargers/${charger.id}`)
      setNotice(`"${charger.title}" has been deactivated.`)
      await loadChargers()
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          'Could not deactivate this charger. Please try again.',
        ),
      )
    } finally {
      setDeactivatingId(null)
    }
  }

  if (loading) {
    return (
      <main className="host-chargers-page">
        <p className="host-chargers-message" role="status">
          Loading your chargers...
        </p>
      </main>
    )
  }

  return (
    <main className="host-chargers-page">
      <header className="host-chargers-header">
        <Link className="dashboard-brand" to="/">
          <span className="dashboard-brand-mark">ϟ</span>
          Charge<span>Share</span>
        </Link>

        <nav className="host-chargers-nav">
          <Link to="/dashboard">Dashboard</Link>
          <span>{user?.full_name}</span>
        </nav>
      </header>

      <div className="host-chargers-content">
        <span className="section-kicker">HOST WORKSPACE</span>
        <h1>Manage your chargers.</h1>
        <p className="host-chargers-subtitle">
          Create listings, update pricing, and manage charger availability.
        </p>

        {error && (
          <div className="host-chargers-alert error" role="alert">
            {error}
            {error.toLowerCase().includes('log in again') && (
              <Link to="/login">Log in again</Link>
            )}
          </div>
        )}

        {notice && (
          <div className="host-chargers-alert success" role="status">
            {notice}
          </div>
        )}

        <section className="host-charger-form-panel">
          <div className="host-charger-section-heading">
            <div>
              <h2>{editingId ? 'Edit charger' : 'Add a charger'}</h2>
              <p>
                {editingId
                  ? 'Update the details for your existing listing.'
                  : 'List your charging point for drivers to discover.'}
              </p>
            </div>
          </div>

          <form className="host-charger-form" onSubmit={handleSubmit}>
            <label>
              Charger title *
              <input
                required
                minLength={3}
                maxLength={160}
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="e.g. Home Charger - College Road"
              />
            </label>

            <label>
              Location *
              <input
                required
                minLength={3}
                maxLength={255}
                value={form.location_name}
                onChange={(event) =>
                  updateField('location_name', event.target.value)
                }
                placeholder="Street, area, city"
              />
            </label>

            <label className="full-width">
              Description
              <textarea
                maxLength={2000}
                rows={3}
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
                placeholder="Access instructions, parking details, or other useful information"
              />
            </label>

            <label>
              Connector type *
              <input
                required
                minLength={2}
                maxLength={50}
                value={form.connector_type}
                onChange={(event) =>
                  updateField('connector_type', event.target.value)
                }
                placeholder="Type 2"
              />
            </label>

            <label>
              Charging power (kW) *
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.power_kw}
                onChange={(event) => updateField('power_kw', event.target.value)}
              />
            </label>

            <label>
              Price per kWh (₹) *
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.price_per_kwh}
                onChange={(event) =>
                  updateField('price_per_kwh', event.target.value)
                }
              />
            </label>

            <label>
              Charger category *
              <select
                required
                value={form.charger_category}
                onChange={(event) =>
                  updateField(
                    'charger_category',
                    event.target.value as ChargerCategory,
                  )
                }
              >
                <option value="home">Home</option>
                <option value="business">Business</option>
              </select>
            </label>

<div className="full-width">
  <button
    className="button button-outline"
    type="button"
    onClick={useCurrentLocation}
    disabled={saving}
  >
    Use my current location
  </button>

  {locationMessage && (
    <p role="status" aria-live="polite">
      {locationMessage}
    </p>
  )}
</div>
<HostLocationPicker
  latitude={form.latitude}
  longitude={form.longitude}
  onLocationChange={(location) => {
    updateField('latitude', String(location.latitude))
    updateField('longitude', String(location.longitude))
  }}
/>
            <label>
              Latitude (optional)
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                value={form.latitude}
                onChange={(event) => updateField('latitude', event.target.value)}
                placeholder="19.9975"
              />
            </label>

            <label>
              Longitude (optional)
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                value={form.longitude}
                onChange={(event) =>
                  updateField('longitude', event.target.value)
                }
                placeholder="73.7898"
              />
            </label>

            <div className="host-charger-form-actions full-width">
              <button className="button" type="submit" disabled={saving}>
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save changes'
                    : 'Create charger'}
              </button>

              {editingId && (
                <button
                  className="button button-outline"
                  type="button"
                  disabled={saving}
                  onClick={resetForm}
                >
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="host-charger-list-section">
          <div className="host-charger-section-heading">
            <div>
              <h2>My chargers ({chargers.length})</h2>
              <p>Your active and inactive charger listings.</p>
            </div>

            <button
              className="button button-outline"
              type="button"
              onClick={() => {
                setError('')
                void loadChargers().catch((err: unknown) => {
                  setError(
                    getErrorMessage(err, 'Could not refresh your chargers.'),
                  )
                })
              }}
            >
              Refresh
            </button>
          </div>

          {chargers.length === 0 ? (
            <div className="host-chargers-empty">
              <span className="dashboard-empty-icon">ϟ</span>
              <h3>No chargers listed yet</h3>
              <p>Create your first charger using the form above.</p>
            </div>
          ) : (
            <div className="host-charger-grid">
              {chargers.map((charger) => (
                <article className="host-charger-card" key={charger.id}>
                  <div className="host-charger-card-top">
                    <span className="host-charger-category">
                      {charger.charger_category}
                    </span>
                    <span
                      className={`host-charger-active ${
                        charger.is_active ? 'active' : 'inactive'
                      }`}
                    >
                      {charger.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <h3>{charger.title}</h3>
                  <p className="host-charger-location">
                    {charger.location_name}
                  </p>

                  {charger.description && (
                    <p className="host-charger-description">
                      {charger.description}
                    </p>
                  )}

                  <div className="host-charger-specs">
                    <span>{charger.connector_type}</span>
                    <span>{Number(charger.power_kw).toFixed(2)} kW</span>
                  </div>

                  <p className="host-charger-price">
                    ₹{Number(charger.price_per_kwh).toFixed(2)}
                    <span> / kWh</span>
                  </p>

                  <div className="host-charger-card-actions">
                    {charger.is_active && (
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={() => startEditing(charger)}
                      >
                        Edit
                      </button>
                    )}

                    {charger.is_active && (
                      <button
                        className="button host-deactivate-button"
                        type="button"
                        disabled={deactivatingId !== null}
                        onClick={() => void handleDeactivate(charger)}
                      >
                        {deactivatingId === charger.id
                          ? 'Deactivating...'
                          : 'Deactivate'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
