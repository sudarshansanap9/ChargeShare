
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '../lib/api'
import { clearToken, getMyProfile } from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import './Dashboard.css'

type BookingCharger = {
  id: string
  title: string
  location_name: string
  connector_type: string
  power_kw: number | string
  price_per_kwh: number | string
  charger_category: string
  is_active: boolean
}

type BookingDriver = {
  id: string
  full_name: string
  email: string
}

type Booking = {
  id: string
  status: string
  charger_id: string
  driver_id: string
  starts_at: string
  ends_at: string
  created_at: string
  charger: BookingCharger
  driver: BookingDriver
}

type MeterReading = {
  reading_type: 'start' | 'end'
  reading_kwh: number | string
  evidence_reference: string
  evidence_note: string | null
  submitted_at: string
}

type ChargingSession = {
  id: string
  booking_id: string
  status: 'active' | 'evidence_submitted' | 'completed' | 'disputed'
  started_at: string
  ended_at: string | null
  energy_kwh: number | string | null
  agreed_price_per_kwh: number | string
  final_amount: number | string | null
  meter_readings?: {
    start: MeterReading | null
    end: MeterReading | null
  }
}

type SessionResult = {
  session_id: string
  booking_id: string
  status: string
  measurement_source: string
  measurement_notice: string
  start_reading_kwh: string
  end_reading_kwh: string
  energy_consumed_kwh: string
  price_per_kwh_inr: string
  final_amount_inr: string
  payment_status: string
}

type MeterReadingPayload = {
  reading_type: 'start' | 'end'
  reading_kwh: string
  evidence_reference: string
  evidence_note: string | null
}

type MeterReadingResponse = {
  reading_type: 'start' | 'end'
  reading_kwh: number | string
  evidence_reference: string
  evidence_note: string | null
  submitted_at: string
  session_status: ChargingSession['status']
}

type DriverChargingHistory = {
  session_id: string
  booking_id: string
  status: 'active' | 'evidence_submitted' | 'completed' | 'disputed' | string
  started_at: string | null
  ended_at: string | null
  energy_kwh: number | string | null
  price_per_kwh_inr: number | string | null
  final_amount_inr: number | string | null
  measurement_notice: string
  charger: {
    id: string
    title: string
    location_name: string
    connector_type: string
    power_kw: number | string
  }
}

type BookingDecision = 'approve' | 'reject'

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatPrice(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 'Not available'

  const price = Number(value)

  if (!Number.isFinite(price)) return 'Not available'

  return `₹${price.toFixed(2)}`
}

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail

    if (typeof detail === 'string') return detail

    if (err.response?.status === 401) {
      return 'Your session has expired. Please log in again.'
    }

    if (err.response?.status === 403) {
      return 'You are not authorized to perform this action.'
    }

    if (!err.response) {
      return 'Could not connect to the server. Check that the backend is running.'
    }
  }

  return fallback
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [chargingHistory, setChargingHistory] = useState<DriverChargingHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [sessions, setSessions] = useState<Record<string, ChargingSession>>({})
  const [sessionResults, setSessionResults] = useState<Record<string, SessionResult>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null)
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(null)

  const [readingValues, setReadingValues] = useState<Record<string, string>>({})
  const [evidenceReferences, setEvidenceReferences] = useState<Record<string, string>>({})
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({})

  const loadBookings = useCallback(async (role: UserProfile['role']) => {
    const endpoint =
      role === 'host'
        ? '/api/v1/bookings/host'
        : '/api/v1/bookings/my'

    const response = await api.get<Booking[]>(endpoint)
    setBookings(Array.isArray(response.data) ? response.data : [])
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        const profile = await getMyProfile()

        if (!profile.is_active) {
          clearToken()
          navigate('/login', { replace: true })
          return
        }

        if (cancelled) return

        setUser(profile)

        const endpoint =
          profile.role === 'host'
            ? '/api/v1/bookings/host'
            : '/api/v1/bookings/my'

        const response = await api.get<Booking[]>(endpoint)

        if (!cancelled) {
          setBookings(Array.isArray(response.data) ? response.data : [])
        }

        if (profile.role === 'host') {
          try {
            const sessionsResponse = await api.get<ChargingSession[]>(
              '/api/v1/charging-sessions/host',
            )

            if (!cancelled) {
              const sessionsByBooking: Record<string, ChargingSession> = {}

              for (const session of Array.isArray(sessionsResponse.data)
                ? sessionsResponse.data
                : []) {
                sessionsByBooking[session.booking_id] = session
              }

              setSessions(sessionsByBooking)
            }
          } catch (sessionsErr: unknown) {
            if (!cancelled) {
              setSessions({})
              setError(
                getErrorMessage(
                  sessionsErr,
                  'Could not load your charging sessions.',
                ),
              )
            }
          }
        } else if (!cancelled) {
          setSessions({})
        }

        if (profile.role === 'driver') {
          setHistoryLoading(true)
          setHistoryError('')
          try {
            const historyResponse = await api.get<DriverChargingHistory[]>(
              '/api/v1/charging-sessions/my',
            )
            if (!cancelled) {
              setChargingHistory(
                Array.isArray(historyResponse.data) ? historyResponse.data : [],
              )
            }
          } catch (historyErr: unknown) {
            // Keep the bookings dashboard usable if charging history cannot load.
            if (!cancelled) {
              setChargingHistory([])
              setHistoryError(
                getErrorMessage(historyErr, 'Could not load your charging history.'),
              )
            }
          } finally {
            if (!cancelled) setHistoryLoading(false)
          }
        } else if (!cancelled) {
          setChargingHistory([])
          setHistoryError('')
          setHistoryLoading(false)
        }
      } catch (err: unknown) {
        if (cancelled) return

        if (axios.isAxiosError(err) && err.response?.status === 401) {
          clearToken()
          navigate('/login', { replace: true })
          return
        }

        setError(
          getErrorMessage(
            err,
            'Could not load your dashboard. Please try again.',
          ),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      cancelled = true
    }
  }, [navigate])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  async function refreshBookings() {
    if (user) await loadBookings(user.role)
  }

  async function handleBookingDecision(
    booking: Booking,
    decision: BookingDecision,
  ) {
    const confirmed = window.confirm(
      `Are you sure you want to ${decision} booking ${booking.id.slice(0, 8)}?`,
    )

    if (!confirmed) return

    setProcessingBookingId(booking.id)
    setError('')
    setNotice('')

    try {
      await api.patch(
        `/api/v1/bookings/${booking.id}/decision`,
        null,
        { params: { decision } },
      )

      setNotice(`Booking was ${decision === 'approve' ? 'approved' : 'rejected'}.`)
      await refreshBookings()
    } catch (err: unknown) {
      setError(getErrorMessage(err, `Could not ${decision} this booking.`))
    } finally {
      setProcessingBookingId(null)
    }
  }

  async function handleCancelBooking(booking: Booking) {
    if (!window.confirm(`Cancel the booking for ${booking.charger.title}?`)) return

    setProcessingBookingId(booking.id)
    setError('')
    setNotice('')

    try {
      await api.patch(`/api/v1/bookings/${booking.id}/cancel`)
      setNotice('Booking cancelled successfully.')
      await refreshBookings()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not cancel this booking.'))
    } finally {
      setProcessingBookingId(null)
    }
  }

  async function handleStartSession(booking: Booking) {
    setProcessingSessionId(booking.id)
    setError('')
    setNotice('')

    try {
      const response = await api.post<ChargingSession>(
        '/api/v1/charging-sessions/start',
        { booking_id: booking.id },
      )

      setSessions((current) => ({
        ...current,
        [booking.id]: response.data,
      }))

      setNotice('Charging session started successfully.')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not start the charging session.'))
    } finally {
      setProcessingSessionId(null)
    }
  }

  async function handleSubmitReading(
    booking: Booking,
    session: ChargingSession,
    readingType: 'start' | 'end',
  ) {
    const readingValue = readingValues[`${session.id}-${readingType}`]?.trim()
    const evidenceReference = evidenceReferences[`${session.id}-${readingType}`]?.trim()
    const evidenceNote = evidenceNotes[`${session.id}-${readingType}`]?.trim() || null

    if (!readingValue || !Number.isFinite(Number(readingValue)) || Number(readingValue) < 0) {
      setError('Enter a valid non-negative meter reading in kWh.')
      return
    }

    if (!evidenceReference) {
      setError('Enter an evidence reference for the meter reading.')
      return
    }

    setProcessingSessionId(booking.id)
    setError('')
    setNotice('')

    const payload: MeterReadingPayload = {
      reading_type: readingType,
      reading_kwh: readingValue,
      evidence_reference: evidenceReference,
      evidence_note: evidenceNote,
    }

    try {
      const response = await api.post<MeterReadingResponse>(
        `/api/v1/charging-sessions/${session.id}/meter-readings`,
        payload,
      )

      const savedReading: MeterReading = {
        reading_type: response.data.reading_type,
        reading_kwh: response.data.reading_kwh,
        evidence_reference: response.data.evidence_reference,
        evidence_note: response.data.evidence_note,
        submitted_at: response.data.submitted_at,
      }

      setSessions((current) => {
        const currentSession = current[booking.id] ?? session
        const currentReadings = currentSession.meter_readings ?? { start: null, end: null }

        return {
          ...current,
          [booking.id]: {
            ...currentSession,
            status: response.data.session_status,
            meter_readings: {
              ...currentReadings,
              [readingType]: savedReading,
            },
          },
        }
      })

      setNotice(`${readingType === 'start' ? 'Start' : 'End'} meter reading submitted.`)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not submit the meter reading.'))
    } finally {
      setProcessingSessionId(null)
    }
  }

  async function handleCompleteSession(booking: Booking, session: ChargingSession) {
    if (!window.confirm('Complete this session and calculate the final charging cost?')) return

    setProcessingSessionId(booking.id)
    setError('')
    setNotice('')

    try {
      const response = await api.post<SessionResult>(
        `/api/v1/charging-sessions/${session.id}/complete`,
      )

      setSessionResults((current) => ({
        ...current,
        [booking.id]: response.data,
      }))

      setSessions((current) => ({
        ...current,
        [booking.id]: { ...session, status: 'completed' },
      }))

      setNotice('Charging session completed. Final cost calculated.')
      await refreshBookings()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not complete the charging session.'))
    } finally {
      setProcessingSessionId(null)
    }
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-message" role="status">
          Loading your ChargeShare dashboard...
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-message" role="alert">
          <h1>Dashboard unavailable</h1>
          <p>{error || 'Please log in to continue.'}</p>
          <Link className="button" to="/login">Go to login</Link>
        </div>
      </main>
    )
  }

  const isHost = user.role === 'host'
  const pendingCount = bookings.filter((booking) => booking.status.toLowerCase() === 'pending').length
  const approvedCount = bookings.filter((booking) => booking.status.toLowerCase() === 'approved').length

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/">
          <span className="dashboard-brand-mark">ϟ</span>
          Charge<span>Share</span>
        </Link>

        <nav className="dashboard-nav">
          <Link to="/">Home</Link>
          <span className="dashboard-user">{user.full_name}</span>
          <button className="button button-outline" type="button" onClick={handleLogout}>
            Log out
          </button>
        </nav>
      </header>

      <section className="dashboard-content">
        <span className="section-kicker">{isHost ? 'HOST WORKSPACE' : 'DRIVER WORKSPACE'}</span>
        <h1>{isHost ? 'Your charging network.' : 'Your charging journey.'}</h1>

        <p className="dashboard-subtitle">
          Welcome back, {user.full_name}.{' '}
          {isHost
            ? 'Manage your chargers, bookings, and charging sessions.'
            : 'Track your charging reservations and their status.'}
        </p>

        {error && <div className="dashboard-error" role="alert">{error}</div>}
        {notice && <div className="dashboard-notice" role="status">{notice}</div>}

        <div className="dashboard-stats">
          <article className="dashboard-stat">
            <span>{isHost ? 'Total bookings' : 'Your bookings'}</span>
            <strong>{bookings.length}</strong>
            <small>{isHost ? 'Across your chargers' : 'Reservations on your account'}</small>
          </article>
          <article className="dashboard-stat">
            <span>Pending</span>
            <strong>{pendingCount}</strong>
            <small>{isHost ? 'Awaiting your decision' : 'Awaiting host response'}</small>
          </article>
          <article className="dashboard-stat">
            <span>Approved</span>
            <strong>{approvedCount}</strong>
            <small>Approved reservations</small>
          </article>
        </div>

        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <h2>{isHost ? 'Booking requests and charging sessions' : 'Your bookings'}</h2>
              <p>{isHost ? 'Review bookings and manage charging sessions.' : 'View charger details and booking status.'}</p>
            </div>
            {!isHost && <Link className="button" to="/#chargers">Find a charger →</Link>}
          </div>

          {bookings.length === 0 ? (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon">ϟ</span>
              <h3>{isHost ? 'No booking requests yet' : 'No bookings yet'}</h3>
              <p>{isHost ? 'Requests for your chargers will appear here.' : 'Your charging reservations will appear here.'}</p>
              {!isHost && <Link className="button button-outline" to="/#chargers">Explore chargers</Link>}
            </div>
          ) : (
            <div className="booking-list">
              {bookings.map((booking) => {
                const status = booking.status.toLowerCase()
                const isPending = status === 'pending'
                const canCancel = !isHost && (status === 'pending' || status === 'approved')
                const isProcessing = processingBookingId === booking.id
                const isSessionProcessing = processingSessionId === booking.id
                const charger = booking.charger
                const driver = booking.driver
                const session = sessions[booking.id]
                const result = sessionResults[booking.id]

                return (
                  <article className="booking-row" key={booking.id}>
                    <div className="booking-row-details">
                      <strong>{charger?.title || 'Charger details unavailable'}</strong>
                      <span>{charger?.location_name || 'Location unavailable'}</span>
                      <span className="booking-id">Booking ID: {booking.id.slice(0, 8)}</span>

                      {isHost && driver && (
                        <>
                          <span><strong>Driver:</strong> {driver.full_name}</span>
                          <span><strong>Email:</strong> {driver.email}</span>
                        </>
                      )}

                      {charger && (
                        <>
                          <span><strong>Connector:</strong> {charger.connector_type}</span>
                          <span><strong>Power:</strong> {charger.power_kw} kW</span>
                          <span><strong>Price:</strong> {formatPrice(charger.price_per_kwh)} / kWh</span>
                        </>
                      )}

                      <span><strong>Starts:</strong> {formatDateTime(booking.starts_at)}</span>
                      <span><strong>Ends:</strong> {formatDateTime(booking.ends_at)}</span>
                    </div>

                    <div className="booking-row-actions">
                      <span className={`booking-status status-${status}`}>{status}</span>

                      {isHost && isPending && (
                        <div className="booking-decision-actions">
                          <button className="button" type="button" disabled={processingBookingId !== null} onClick={() => void handleBookingDecision(booking, 'approve')}>
                            {isProcessing ? 'Processing...' : 'Approve'}
                          </button>
                          <button className="button button-outline" type="button" disabled={processingBookingId !== null} onClick={() => void handleBookingDecision(booking, 'reject')}>
                            Reject
                          </button>
                        </div>
                      )}

                      {canCancel && (
                        <button className="button button-outline" type="button" disabled={processingBookingId !== null} onClick={() => void handleCancelBooking(booking)}>
                          {isProcessing ? 'Processing...' : 'Cancel booking'}
                        </button>
                      )}

                      {isHost && status === 'approved' && !session && (
                        <button className="button" type="button" disabled={processingSessionId !== null} onClick={() => void handleStartSession(booking)}>
                          {isSessionProcessing ? 'Starting...' : 'Start charging'}
                        </button>
                      )}

                      {isHost && session && (
                        <section className="charging-session-panel">
                          <h3>Charging session</h3>
                          <p><strong>Status:</strong> {session.status.replace('_', ' ')}</p>
                          <p><strong>Agreed rate:</strong> {formatPrice(session.agreed_price_per_kwh)} / kWh</p>
                          <p className="session-notice">Meter readings are host-reported and not independently verified.</p>

                          {(['start', 'end'] as const).map((readingType) => {
                            const savedReading = session.meter_readings?.[readingType] ?? null
                            const startReadingSaved = Boolean(session.meter_readings?.start)

                            if (savedReading) {
                              return (
                                <div key={readingType} className="meter-reading-form">
                                  <h4>{readingType === 'start' ? 'Start meter reading' : 'End meter reading'} — submitted</h4>
                                  <p><strong>Reading:</strong> {Number(savedReading.reading_kwh).toFixed(4)} kWh</p>
                                  <p><strong>Evidence reference:</strong> {savedReading.evidence_reference}</p>
                                  {savedReading.evidence_note && (
                                    <p><strong>Evidence note:</strong> {savedReading.evidence_note}</p>
                                  )}
                                  <p className="session-notice">Submitted: {formatDateTime(savedReading.submitted_at)}</p>
                                </div>
                              )
                            }

                            if (session.status !== 'active' || (readingType === 'end' && !startReadingSaved)) {
                              return null
                            }

                            return (
                              <div key={readingType} className="meter-reading-form">
                                <h4>{readingType === 'start' ? 'Start meter reading' : 'End meter reading'}</h4>
                                <label>
                                  Reading (kWh)
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={readingValues[`${session.id}-${readingType}`] || ''}
                                    onChange={(event) => setReadingValues((current) => ({ ...current, [`${session.id}-${readingType}`]: event.target.value }))}
                                    placeholder="e.g. 120.5000"
                                  />
                                </label>
                                <label>
                                  Evidence reference
                                  <input
                                    type="text"
                                    maxLength={500}
                                    value={evidenceReferences[`${session.id}-${readingType}`] || ''}
                                    onChange={(event) => setEvidenceReferences((current) => ({ ...current, [`${session.id}-${readingType}`]: event.target.value }))}
                                    placeholder="Photo reference or evidence ID"
                                  />
                                </label>
                                <label>
                                  Evidence note (optional)
                                  <textarea
                                    maxLength={2000}
                                    value={evidenceNotes[`${session.id}-${readingType}`] || ''}
                                    onChange={(event) => setEvidenceNotes((current) => ({ ...current, [`${session.id}-${readingType}`]: event.target.value }))}
                                    placeholder="Optional meter reading notes"
                                  />
                                </label>
                                <button
                                  className="button button-outline"
                                  type="button"
                                  disabled={processingSessionId !== null}
                                  onClick={() => void handleSubmitReading(booking, session, readingType)}
                                >
                                  {isSessionProcessing ? 'Submitting...' : `Submit ${readingType} reading`}
                                </button>
                              </div>
                            )
                          })}

                          {session.status === 'evidence_submitted' && (
                            <button className="button" type="button" disabled={processingSessionId !== null} onClick={() => void handleCompleteSession(booking, session)}>
                              {isSessionProcessing ? 'Completing...' : 'Complete session'}
                            </button>
                          )}

                          {result && (
                            <div className="session-result">
                              <h4>Session summary</h4>
                              <p><strong>Energy consumed:</strong> {result.energy_consumed_kwh} kWh</p>
                              <p><strong>Price per kWh:</strong> ₹{result.price_per_kwh_inr}</p>
                              <p><strong>Final amount:</strong> ₹{result.final_amount_inr}</p>
                              <p><strong>Payment:</strong> {result.payment_status.replaceAll('_', ' ')}</p>
                              <p>{result.measurement_notice}</p>
                            </div>
                          )}

                          {session.status === 'completed' && !result && (
                            <div className="session-result">
                              <h4>Session summary</h4>
                              <p>
                                <strong>Energy consumed:</strong>{' '}
                                {session.energy_kwh === null || session.energy_kwh === undefined
                                  ? 'Not available'
                                  : `${Number(session.energy_kwh).toFixed(2)} kWh`}
                              </p>
                              <p>
                                <strong>Price per kWh:</strong>{' '}
                                {formatPrice(session.agreed_price_per_kwh)}
                              </p>
                              <p>
                                <strong>Final amount:</strong>{' '}
                                {formatPrice(session.final_amount)}
                              </p>
                              <p><strong>Payment:</strong> pending simulated payment</p>
                              <p className="session-notice">
                                Meter readings are host-reported and not independently verified.
                              </p>
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {!isHost && (
          <section className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <h2>My Charging History</h2>
                <p>Review your charging sessions, energy usage, and calculated costs.</p>
              </div>
            </div>

            {historyError && (
              <div className="dashboard-error" role="alert">{historyError}</div>
            )}

            {historyLoading ? (
              <div className="dashboard-empty">
                <p>Loading your charging history...</p>
              </div>
            ) : chargingHistory.length === 0 ? (
              <div className="dashboard-empty">
                <span className="dashboard-empty-icon">ϟ</span>
                <h3>No charging sessions yet</h3>
                <p>Your charging history will appear here after a host starts a session for one of your approved bookings.</p>
                <Link className="button button-outline" to="/#chargers">Find a charger</Link>
              </div>
            ) : (
              <div className="booking-list">
                {chargingHistory.map((item) => {
                  const status = item.status.toLowerCase()
                  const energy = item.energy_kwh
                  const finalAmount = item.final_amount_inr

                  return (
                    <article className="booking-row" key={item.session_id}>
                      <div className="booking-row-details">
                        <strong>{item.charger?.title || 'Charger details unavailable'}</strong>
                        <span>{item.charger?.location_name || 'Location unavailable'}</span>
                        <span className="booking-id">Session ID: {item.session_id.slice(0, 8)}</span>
                        <span><strong>Connector:</strong> {item.charger?.connector_type || 'Not available'}</span>
                        <span><strong>Power:</strong> {item.charger?.power_kw ?? 'Not available'} kW</span>
                        <span><strong>Started:</strong> {formatDateTime(item.started_at)}</span>
                        <span><strong>Ended:</strong> {formatDateTime(item.ended_at)}</span>
                        <span><strong>Energy consumed:</strong> {energy === null || energy === undefined ? 'Pending' : `${Number(energy).toFixed(2)} kWh`}</span>
                        <span><strong>Agreed rate:</strong> {formatPrice(item.price_per_kwh_inr)} / kWh</span>
                        <span><strong>Final amount:</strong> {finalAmount === null || finalAmount === undefined ? 'Not calculated yet' : formatPrice(finalAmount)}</span>
                      </div>

                      <div className="booking-row-actions">
                        <span className={`booking-status status-${status}`}>{status.replaceAll('_', ' ')}</span>
                        <p className="session-notice">{item.measurement_notice}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {isHost && (
          <div className="dashboard-tip">
            <span className="dashboard-tip-icon">ϟ</span>
            <div>
              <strong>Manage your charging network</strong>
              <p>Add chargers, update pricing and specifications, or deactivate listings that are no longer available.</p>
              <Link className="button" to="/host/chargers">Manage my chargers →</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
