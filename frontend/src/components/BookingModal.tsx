
import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import api from '../lib/api'
import './BookingModal.css'

type Charger = {
  id: string
  name: string
  location: string
  connector: string
  power: number
  price: number
}

type BookingModalProps = {
  charger: Charger
  onClose: () => void
  onSuccess: () => void
}

function toLocalDateTimeInput(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 16)
}

function getDefaultTimes() {
  const start = new Date(Date.now() + 60 * 60 * 1000)
  start.setMinutes(0, 0, 0)

  const end = new Date(start.getTime() + 60 * 60 * 1000)

  return {
    start: toLocalDateTimeInput(start),
    end: toLocalDateTimeInput(end),
  }
}

export default function BookingModal({
  charger,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const defaults = getDefaultTimes()
  const [startsAt, setStartsAt] = useState(defaults.start)
  const [endsAt, setEndsAt] = useState(defaults.end)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const start = new Date(startsAt)
    const end = new Date(endsAt)

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime())
    ) {
      setError('Please enter valid start and end times.')
      return
    }

    if (start.getTime() <= Date.now()) {
      setError('The booking must start in the future.')
      return
    }

    if (end.getTime() <= start.getTime()) {
      setError('The end time must be after the start time.')
      return
    }

    setLoading(true)

    try {
      await api.post('/api/v1/bookings', {
        charger_id: charger.id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      })

      setSuccess(true)
      onSuccess()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail

        if (err.response?.status === 401) {
          setError('Please log in again before requesting a booking.')
        } else if (err.response?.status === 403) {
          setError('Only driver accounts can request bookings.')
        } else if (err.response?.status === 409) {
          setError(
            typeof detail === 'string'
              ? detail
              : 'This charger has a conflicting booking for that time.',
          )
        } else {
          setError(
            typeof detail === 'string'
              ? detail
              : 'Could not create the booking. Please try again.',
          )
        }
      } else {
        setError('Could not connect to the server. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="booking-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose()
      }}
    >
      <section
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <button
          className="booking-modal-close"
          type="button"
          aria-label="Close booking form"
          disabled={loading}
          onClick={onClose}
        >
          ×
        </button>

        {success ? (
          <div className="booking-result">
            <span className="booking-result-icon">✓</span>
            <h2 id="booking-modal-title">Booking requested!</h2>
            <p>
              Your request for <strong>{charger.name}</strong> has been
              submitted. The booking is pending host approval.
            </p>
            <button className="button" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <span className="section-kicker">RESERVE YOUR CHARGE</span>
            <h2 id="booking-modal-title">Request a booking</h2>
            <p className="booking-modal-description">
              Choose when you would like to charge. The host must approve
              your request.
            </p>

            <div className="booking-charger-summary">
              <strong>{charger.name}</strong>
              <span>{charger.location}</span>
              <span>
                {charger.connector} · {charger.power.toFixed(1)} kW
              </span>
              <span>₹{charger.price.toFixed(2)} per kWh</span>
            </div>

            <form className="booking-form" onSubmit={handleSubmit}>
              <label>
                Start date and time
                <input
                  type="datetime-local"
                  required
                  min={toLocalDateTimeInput(new Date())}
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </label>

              <label>
                End date and time
                <input
                  type="datetime-local"
                  required
                  min={startsAt}
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </label>

              {error && (
                <div className="booking-form-error" role="alert">
                  {error}
                  {error.toLowerCase().includes('log in') && (
                    <a href="/login"> Go to login</a>
                  )}
                </div>
              )}

              <p className="booking-form-note">
                Times are submitted with your local timezone converted to
                UTC. No payment is collected when requesting a booking.
              </p>

              <button className="button booking-submit" disabled={loading}>
                {loading ? 'Submitting request...' : 'Request booking'}
                {!loading && <span aria-hidden="true">→</span>}
              </button>

              <button
                className="booking-cancel"
                type="button"
                disabled={loading}
                onClick={onClose}
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
