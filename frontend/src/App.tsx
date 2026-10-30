import { useNavigate } from 'react-router-dom'
import { hasToken, getMyProfile } from './lib/auth'
import type { UserProfile } from './lib/auth'
import BookingModal from './components/BookingModal'
import { useEffect, useMemo, useState } from 'react'
import api from './lib/api'
import './App.css'
import ChargingStationMap from './components/ChargingStationMap'

type ChargerApiResponse = {
  id: string
  host_id: string
  title: string
  description: string | null
  location_name: string
  latitude: number | null
  longitude: number | null
  connector_type: string
  power_kw: string | number
  price_per_kwh: string | number
  charger_category: string
  is_active: boolean
}

type Charger = {
  id: string
  name: string
  location: string
  connector: string
  power: number
  price: number
  category: string
  initials: string
  latitude: number | null
  longitude: number | null
}

function isUsableCharger(charger: ChargerApiResponse): boolean {
  const isPlaceholder = (value: string | null | undefined) =>
    !value?.trim() || value.trim().toLowerCase() === 'string'

  return (
    charger.is_active &&
    !isPlaceholder(charger.title) &&
    !isPlaceholder(charger.location_name) &&
    !isPlaceholder(charger.connector_type) &&
    Number.isFinite(Number(charger.power_kw)) &&
    Number(charger.power_kw) > 0 &&
    Number.isFinite(Number(charger.price_per_kwh)) &&
    Number(charger.price_per_kwh) >= 0 &&
    Number.isFinite(charger.latitude) &&
    Number.isFinite(charger.longitude) &&
    charger.latitude !== null &&
    charger.longitude !== null &&
    charger.latitude >= -90 &&
    charger.latitude <= 90 &&
    charger.longitude >= -180 &&
    charger.longitude <= 180 &&
    !(charger.latitude === -90 && charger.longitude === -180)
  )
}

function mapCharger(charger: ChargerApiResponse): Charger {
  return {
    id: charger.id,
    name: charger.title,
    location: charger.location_name,
    connector: charger.connector_type,
    power: Number(charger.power_kw),
    price: Number(charger.price_per_kwh),
    latitude: charger.latitude,
    longitude: charger.longitude,
    category:
      charger.charger_category.charAt(0).toUpperCase() +
      charger.charger_category.slice(1),
    initials: charger.title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join(''),
  }
}


function getChargerDirectionsUrl(
  latitude: number | null,
  longitude: number | null,
  origin?: { lat: number; lng: number },
): string | null {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === -90 && longitude === -180)
  ) {
    return null
  }

  const params = new URLSearchParams({
    api: '1',
    destination: `${latitude},${longitude}`,
    travelmode: 'driving',
  })

  if (origin) {
    params.set('origin', `${origin.lat},${origin.lng}`)
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}


function getDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180

  const latDifference = toRadians(destination.lat - origin.lat)
  const lngDifference = toRadians(destination.lng - origin.lng)

  const a =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) *
      Math.cos(toRadians(destination.lat)) *
      Math.sin(lngDifference / 2) ** 2

  const safeA = Math.min(1, Math.max(0, a))

  return 6371 * 2 * Math.atan2(
    Math.sqrt(safeA),
    Math.sqrt(1 - safeA),
  )
}


function App() {
  const navigate = useNavigate()
  const [selectedCharger, setSelectedCharger] = useState<Charger | null>(null)
  const [highlightedChargerId, setHighlightedChargerId] =
  useState<string | null>(null)
  const [bookingNotice, setBookingNotice] = useState('')
  const [, setBookingRefresh] = useState(0)
  const isLoggedIn = hasToken()
  const [chargers, setChargers] = useState<Charger[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')
  const [location, setLocation] = useState('')
  const [driverLocation, setDriverLocation] = useState<{
  lat: number
  lng: number
} | null>(null)

function findDriverLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        setDriverLocation(current)
        resolve(current)
      },
      () => {
        resolve(driverLocation)
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      },
    )
  })
}

  const [connector, setConnector] = useState('All connectors')
  const [maxPrice, setMaxPrice] = useState('30')
  const [showAll, setShowAll] = useState(false)
  const [sortBy, setSortBy] = useState<
  'nearest' | 'price' | 'power'
>('nearest')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadChargers() {
      setLoading(true)
      setApiError('')

      try {
        const response = await api.get<ChargerApiResponse[]>(
          '/api/v1/chargers',
        )

        if (!Array.isArray(response.data)) {
          throw new Error('Unexpected charger API response')
        }

        const usableChargers = response.data
          .filter(isUsableCharger)
          .map(mapCharger)

        if (!cancelled) {
          setChargers(usableChargers)
        }
      } catch {
        if (!cancelled) {
          setApiError(
            'Could not load chargers. Check that the backend is running and try again.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadChargers()

    return () => {
      cancelled = true
    }
  }, [retryCount])

  const filteredChargers = useMemo(() => {
    return chargers.filter((charger) => {
      const query = location.trim().toLowerCase()

      const matchesLocation =
        !query ||
        `${charger.location} ${charger.name}`
          .toLowerCase()
          .includes(query)

      const matchesConnector =
        connector === 'All connectors' ||
        charger.connector === connector

      const matchesPrice = charger.price <= Number(maxPrice)

      return matchesLocation && matchesConnector && matchesPrice
    })
  }, [chargers, location, connector, maxPrice])
const nearbyChargers = useMemo(() => {
  const items = [...filteredChargers]

  if (sortBy === 'price') {
    return items.sort((a, b) => a.price - b.price)
  }

  if (sortBy === 'power') {
    return items.sort((a, b) => b.power - a.power)
  }

  if (!driverLocation) {
    return items
  }

  return items.sort((a, b) => {
    const distanceA =
      a.latitude !== null && a.longitude !== null
        ? getDistanceKm(driverLocation, {
            lat: a.latitude,
            lng: a.longitude,
          })
        : Number.POSITIVE_INFINITY

    const distanceB =
      b.latitude !== null && b.longitude !== null
        ? getDistanceKm(driverLocation, {
            lat: b.latitude,
            lng: b.longitude,
          })
        : Number.POSITIVE_INFINITY

    return distanceA - distanceB
  })
}, [filteredChargers, driverLocation, sortBy])


const visibleChargers = showAll
  ? nearbyChargers
  : nearbyChargers.slice(0, 3)


  function clearFilters() {
    setLocation('')
    setConnector('All connectors')
    setMaxPrice('30')
    setShowAll(false)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#home" aria-label="ChargeShare home">
          <span className="brand-mark">ϟ</span>
          <span>
            Charge<span className="brand-accent">Share</span>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a href="#chargers">Find a charger</a>
          <a href="#how-it-works">How it works</a>
          <a href="#become-host">Become a host</a>
        </nav>


<div className="header-actions">
  {isLoggedIn ? (
    <>
      <a className="login-link" href="/dashboard">
        Dashboard
      </a>
      <a className="button button-small" href="/dashboard">
        Open dashboard <span aria-hidden="true">↗</span>
      </a>
    </>
  ) : (
    <>
      <a className="login-link" href="/login">
        Log in
      </a>
      <a className="button button-small" href="/register">
        Get started <span aria-hidden="true">↗</span>
      </a>
    </>
  )}
</div>

      </header>

      <main>
        <section className="hero-section" id="home">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              A smarter way to charge
            </div>

            <h1>
              Your next charge.
              <br />
              <span>Closer than ever.</span>
            </h1>

            <p className="hero-description">
              Discover EV chargers near you, book a convenient slot, and pay
              for the energy you use. Charging made simple, together.
            </p>

            <div className="hero-actions">
              <a className="button" href="#chargers">
                Find a charger <span aria-hidden="true">→</span>
              </a>
              <a className="text-link" href="#how-it-works">
                See how it works <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="hero-trust">
              <div className="trust-avatars" aria-hidden="true">
                <span>S</span>
                <span>R</span>
                <span>A</span>
              </div>
              <div>
                <strong>Charge closer. Drive further.</strong>
                <p>Connecting EV drivers and charger hosts.</p>
              </div>
            </div>
          </div>

          <div
            className="hero-visual"
            aria-label="Electric vehicle charging illustration"
          >
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />

            <div className="floating-label label-top">
              <span className="status-dot" />
              Find your next charge
            </div>

            <div className="charging-art">
              <div className="art-sun" />
              <div className="art-hill hill-back" />
              <div className="art-hill hill-front" />

              <div className="charging-station">
                <div className="station-screen">
                  <span className="station-light" />
                  <span className="station-number">EV</span>
                  <span className="station-line" />
                  <span className="station-line short" />
                </div>
                <div className="station-base" />
                <div className="charging-cable" />
                <div className="charging-plug">
                  <span />
                </div>
              </div>

              <div className="electric-car">
                <div className="car-roof" />
                <div className="car-body">
                  <div className="car-window" />
                  <div className="car-window second" />
                  <div className="car-light" />
                </div>
                <div className="car-wheel wheel-one" />
                <div className="car-wheel wheel-two" />
              </div>

              <div className="art-leaf leaf-one" />
              <div className="art-leaf leaf-two" />
            </div>

            <div className="floating-label label-bottom">
              <span className="bolt-mark">ϟ</span>
              Pay for what you use
            </div>
          </div>

          <div className="hero-bottom-note">
            <span>01 /</span> A new way to power your journey
          </div>
        </section>

        <section className="search-section" id="chargers">
          <div className="section-heading">
            <div>
              <span className="section-kicker">CHARGING, SIMPLIFIED</span>
              <h2>Find your perfect charge.</h2>
              <p>Search charging options that fit your journey.</p>
            </div>
            <span className="location-pill">
              <span className="location-dot" />
              Explore Nashik
            </span>
          </div>

          <div className="search-panel">
            <label className="search-field">
              <span className="field-icon" aria-hidden="true">⌖</span>
              <span className="field-content">
                <span className="field-label">LOCATION</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Area, road or charger name"
                  aria-label="Search by location or charger name"
                />
              </span>
            </label>

            <label className="search-field">
              <span className="field-icon" aria-hidden="true">ϟ</span>
              <span className="field-content">
                <span className="field-label">CONNECTOR TYPE</span>
                <select
                  value={connector}
                  onChange={(event) => setConnector(event.target.value)}
                  aria-label="Filter by connector type"
                >
                  <option>All connectors</option>
                  <option>Type 2</option>
                </select>
              </span>
            </label>

            <label className="search-field price-field">
              <span className="field-icon" aria-hidden="true">₹</span>
              <span className="field-content">
                <span className="field-label">MAXIMUM PRICE</span>
                <select
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  aria-label="Maximum price per kWh"
                >
                  <option value="10">₹10 / kWh</option>
                  <option value="12">₹12 / kWh</option>
                  <option value="15">₹15 / kWh</option>
                  <option value="20">₹20 / kWh</option>
                  <option value="30">Any price</option>
                </select>
              </span>
            </label>

            <button
              className="button search-button"
              type="button"
              onClick={() => {
                document
                  .getElementById('charger-results')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Search <span aria-hidden="true">→</span>
            </button>
          </div>


<div className="nearby-search-action">
  <button
    className="button button-outline"
    type="button"
    onClick={async () => {
      const current = await findDriverLocation()

      if (!current) {
        setBookingNotice(
          'Could not detect your location. Allow location access or try again.',
        )
        return
      }

      setBookingNotice('')
      setShowAll(true)
    }}
  >
    Find chargers near me
  </button>

  {driverLocation && (
    <span role="status">
      Your location is ready. Distances will be shown in the charger list.
    </span>
  )}
</div>


          <p className="demo-notice">
            Charger listings are loaded from your ChargeShare backend.
            Booking availability is not checked by this search.
          </p>
        </section>
<section className="map-section" aria-label="Map of available chargers">
  <ChargingStationMap
    chargers={filteredChargers
.filter(
  (charger) =>
    charger.latitude !== null &&
    charger.longitude !== null &&
    Number.isFinite(charger.latitude) &&
    Number.isFinite(charger.longitude) &&
    charger.latitude >= -90 &&
    charger.latitude <= 90 &&
    charger.longitude >= -180 &&
    charger.longitude <= 180 &&
    !(charger.latitude === -90 && charger.longitude === -180),
)

      .map((charger) => ({
        id: charger.id,
        name: charger.name,
        location: charger.location,
        connector: charger.connector,
        power: charger.power,
        price: charger.price,
        latitude: Number(charger.latitude),
        longitude: Number(charger.longitude),
      }))}
      selectedChargerId={highlightedChargerId}
      onSelectCharger={setHighlightedChargerId}
      onBook={(chargerId) => {
      const charger = filteredChargers.find(
        (item) => item.id === chargerId,
      )

      if (!charger) return

      setBookingNotice('')

      if (!hasToken()) {
        navigate('/login')
        return
      }

      void getMyProfile()
        .then((user) => {
          if (user.role !== 'driver') {
            setBookingNotice(
              'Only driver accounts can request bookings.',
            )
            return
          }

          setSelectedCharger(charger)
        })
        .catch(() => {
          navigate('/login')
        })
    }}
  />
</section>



        <section className="chargers-section" id="charger-results">
          <div className="section-heading charger-heading">
            <div>
              <span className="section-kicker">CHARGING NEAR YOU</span>
              <h2>Worth plugging into.</h2>
              <p>Explore charging options around Nashik.</p>
            </div>

            <span className="results-count">
              {loading
                ? 'Loading...'
                : `${filteredChargers.length} ${
                    filteredChargers.length === 1 ? 'charger' : 'chargers'
                  }`}
            </span>
          </div>


<div className="sort-controls">
  <label htmlFor="charger-sort">Sort by</label>
  <select
    id="charger-sort"
    value={sortBy}
    onChange={(event) =>
      setSortBy(event.target.value as 'nearest' | 'price' | 'power')
    }
  >
    <option value="nearest">Nearest first</option>
    <option value="price">Lowest price first</option>
    <option value="power">Highest power first</option>
  </select>

  {sortBy === 'nearest' && !driverLocation && (
    <small>Use “Find chargers near me” to sort by distance.</small>
  )}
</div>


          {loading ? (
            <div className="empty-state" role="status">
              <span className="empty-icon">ϟ</span>
              <h3>Finding your charging spots</h3>
              <p>Loading charger listings from the server...</p>
            </div>
          ) : apiError ? (
            <div className="empty-state" role="alert">
              <span className="empty-icon">!</span>
              <h3>Chargers could not be loaded</h3>
              <p>{apiError}</p>
              <button
                className="button button-outline"
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
              >
                Try again
              </button>
            </div>
          ) : visibleChargers.length > 0 ? (
            <div className="charger-grid">
              {visibleChargers.map((charger, index) => (
                <article
  className={`charger-card ${
    highlightedChargerId === charger.id ? 'charger-card-selected' : ''
  }`}
  key={charger.id}
  onClick={() => setHighlightedChargerId(charger.id)}
>
                  <div
                    className={`charger-card-art art-${(index % 3) + 1}`}
                  >
                    <span className="charger-category">
                      {charger.category}
                    </span>

                    <div
                      className="charger-illustration"
                      aria-hidden="true"
                    >
                      <span className="illustration-bolt">ϟ</span>
                      <span className="illustration-port" />
                    </div>
                  </div>

                  <div className="charger-card-content">
                    <div className="charger-title-row">
                      <div>
                        <h3>{charger.name}</h3>
                        <p className="charger-location">
                          <span aria-hidden="true">⌖</span>{' '}
                          {charger.location}
                        </p>
                        {driverLocation &&
  charger.latitude !== null &&
  charger.longitude !== null && (
    <p className="charger-distance">
      {getDistanceKm(driverLocation, {
        lat: charger.latitude,
        lng: charger.longitude,
      }).toFixed(1)}{' '}
      km away
    </p>
  )}
                      </div>
                      <span className="charger-initials">
                        {charger.initials}
                      </span>
                    </div>

                    <div className="charger-specs">
                      <span>{charger.connector}</span>
                      <span>{charger.power.toFixed(1)} kW</span>
                    </div>

                    <div className="charger-card-footer">
  <div className="price">
    <strong>₹{charger.price.toFixed(2)}</strong>
    <span>/ kWh</span>
  </div>


<a
  className="button button-small button-outline"
  href={
    getChargerDirectionsUrl(
      charger.latitude,
      charger.longitude,
      driverLocation ?? undefined,
    ) ?? undefined
  }
  target="_blank"
  rel="noopener noreferrer"
onClickCapture={(event) => event.stopPropagation()}
onClick={async (event) => {
    event.preventDefault()

    const url = getChargerDirectionsUrl(
      charger.latitude,
      charger.longitude,
      await findDriverLocation() ?? undefined,
    )

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      setBookingNotice('This charger does not have valid coordinates yet.')
    }
  }}
>
  Get Directions ↗
</a>

  <button
  className="button button-small"
  type="button"
  onClick={async () => {
      setBookingNotice('')

      if (!hasToken()) {
        navigate('/login')
        return
      }

      try {
        const user: UserProfile = await getMyProfile()

        if (user.role !== 'driver') {
          setBookingNotice('Only driver accounts can request bookings.')
          return
        }

        setSelectedCharger(charger)
      } catch {
        navigate('/login')
      }
    }}
  >
    Book this charger <span aria-hidden="true">→</span>
  </button>
</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">⌕</span>
              <h3>
                {chargers.length === 0
                  ? 'No usable chargers available'
                  : 'No chargers match your search'}
              </h3>
              <p>
                {chargers.length === 0
                  ? 'There are no active, valid charger listings to display.'
                  : 'Try another location or increase your maximum price.'}
              </p>
              <button
                className="button button-outline"
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          )}

          {!loading &&
            !apiError &&
            filteredChargers.length > 3 && (
              <button
                className="button button-outline view-all-button"
                type="button"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? 'Show fewer' : 'View all chargers'}
                <span aria-hidden="true">{showAll ? '↑' : '→'}</span>
              </button>
            )}
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-intro">
            <span className="section-kicker">EASY AS 1, 2, CHARGE</span>
            <h2>
              Less searching.
              <br />
              More exploring.
            </h2>
            <p>
              Your charging experience should be as effortless as the drive
              itself.
            </p>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">01</span>
              <span className="step-icon">⌖</span>
              <h3>Discover</h3>
              <p>
                Find charging spots that work for your route, connector, and
                budget.
              </p>
            </article>

            <article className="step-card">
              <span className="step-number">02</span>
              <span className="step-icon">▣</span>
              <h3>Book</h3>
              <p>
                Request a convenient charging slot and wait for host approval.
              </p>
            </article>

            <article className="step-card">
              <span className="step-number">03</span>
              <span className="step-icon">ϟ</span>
              <h3>Charge &amp; go</h3>
              <p>
                Record the meter readings and calculate your charge from
                energy used.
              </p>
            </article>
          </div>
        </section>

        <section className="host-banner" id="become-host">
          <div>
            <span className="section-kicker">POWER YOUR COMMUNITY</span>
            <h2>
              Have a charger?
              <br />
              Share the charge.
            </h2>
            <p>
              Help EV drivers find a place to charge. Turn your charging point
              into a useful community resource.
            </p>
          </div>

          <a className="button host-button" href="/register?role=host">
            Become a host <span aria-hidden="true">↗</span>
          </a>

          <div className="host-decoration" aria-hidden="true">
            ϟ
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark">ϟ</span>
          <span>
            Charge<span className="brand-accent">Share</span>
          </span>
        </a>

        <p>Better charging, shared together.</p>

        <span className="footer-copyright">
          © 2026 ChargeShare · Portfolio demo
        </span>
      </footer>

      <div className="demo-banner" role="status">
        <span className="demo-banner-dot" />
        Charger data is live from the API; booking and payment flows are not
        connected to these buttons yet.
      </div>
      {bookingNotice && (
  <div className="demo-banner" role="status">
    {bookingNotice}
  </div>
)}

{selectedCharger && (
  <BookingModal
    charger={selectedCharger}
    onClose={() => setSelectedCharger(null)}
    onSuccess={() => {
      setBookingNotice('Booking requested successfully. Check your dashboard for its status.')
      setBookingRefresh((count) => count + 1)
    }}
  />
)}
    </div>
  )
}

export default App
