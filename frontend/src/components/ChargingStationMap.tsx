
import { useEffect, useMemo, useRef, useState } from 'react'

type MapCharger = {
  id: string
  name: string
  location: string
  connector: string
  power: number
  price: number
  latitude: number
  longitude: number
}

type LatLng = { lat: number; lng: number }

type GoogleMap = {
  setCenter: (center: LatLng) => void
  setZoom: (zoom: number) => void
  fitBounds: (bounds: unknown, padding?: number) => void
}
type GooglePolyline = {
  setMap: (map: GoogleMap | null) => void
}

type RouteResult = {
  distanceKm: number
  durationMinutes: number
  coordinates: LatLng[]
}
type GoogleMarker = {
  addListener: (event: string, callback: () => void) => void
  setMap: (map: GoogleMap | null) => void
  setPosition: (position: LatLng) => void
  getPosition: () => { lat: () => number; lng: () => number } | null
  setAnimation: (animation: unknown) => void
  setZIndex: (zIndex: number) => void
}

type GoogleMapsApi = {
  maps: {
    Polyline: new (options: Record<string, unknown>) => GooglePolyline
    Animation: {
        BOUNCE: unknown
    }
    Map: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => GoogleMap
    Marker: new (options: Record<string, unknown>) => GoogleMarker
    InfoWindow: new (options: Record<string, unknown>) => {
      open: (options: Record<string, unknown>) => void
    }
    LatLngBounds: new () => { extend: (point: LatLng) => void }
  }
}

declare global {
  interface Window {
    google?: GoogleMapsApi
  }
}

type Props = {
  chargers: MapCharger[]
  onBook: (chargerId: string) => void
  selectedChargerId: string | null
  onSelectCharger: (chargerId: string) => void
}

const DEFAULT_CENTER: LatLng = { lat: 19.9975, lng: 73.7898 }
const SCRIPT_ID = 'chargeshare-google-maps-script'

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google?.maps) {
    return Promise.resolve(window.google)
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null

    if (existing) {
      existing.addEventListener(
        'load',
        () => {
          if (window.google) resolve(window.google)
          else reject(new Error('Google Maps API did not initialize.'))
        },
        { once: true },
      )

      existing.addEventListener(
        'error',
        () => reject(new Error('Google Maps failed to load. Check your key and API access.')),
        { once: true },
      )

      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.defer = true

    script.onload = () => {
      if (window.google) resolve(window.google)
      else reject(new Error('Google Maps loaded without its Maps API.'))
    }

    script.onerror = () =>
      reject(new Error('Google Maps failed to load. Check your demo key and API access.'))

    document.head.appendChild(script)
  })
}

function distanceKm(from: LatLng, to: LatLng): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = radians(to.lat - from.lat)
  const dLng = radians(to.lng - from.lng)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(dLng / 2) ** 2

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
async function fetchDrivingRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
    `?overview=full&geometries=geojson`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Unable to calculate driving route.')
  }

  const data = await response.json()

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No driving route found for this charger.')
  }

  const route = data.routes[0]

  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    coordinates: route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng }),
    ),
  }
}

function directionsUrl(destination: LatLng, origin?: LatLng): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  })

  if (origin) {
    params.set('origin', `${origin.lat},${origin.lng}`)
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character,
  )
}

export default function ChargingStationMap({
  chargers,
  onBook,
  selectedChargerId,
  onSelectCharger,
}: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const markersRef = useRef<GoogleMarker[]>([])
  const userMarkerRef = useRef<GoogleMarker | null>(null)
  const routeLineRef = useRef<GooglePolyline | null>(null)

  const onSelectChargerRef = useRef(onSelectCharger)

useEffect(() => {
  onSelectChargerRef.current = onSelectCharger
}, [onSelectCharger])

  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
const [routeLoading, setRouteLoading] = useState(false)
const [routeError, setRouteError] = useState('')

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  const missingKeyMessage =
  'Google Maps key is missing. Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env.local and restart Vite.'

const displayedMapError = !apiKey ? missingKeyMessage : mapError

  const validChargers = useMemo(
    () =>
      chargers.filter(
        (charger) =>
          Number.isFinite(charger.latitude) &&
          Number.isFinite(charger.longitude) &&
          charger.latitude >= -90 &&
          charger.latitude <= 90 &&
          charger.longitude >= -180 &&
          charger.longitude <= 180 &&
          !(charger.latitude === -90 && charger.longitude === -180),
      ),
    [chargers],
  )

  useEffect(() => {
    let cancelled = false

    if (!apiKey) {
  return
}

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !mapElement.current) return

        const map = new google.maps.Map(mapElement.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        })

        mapRef.current = map
        setMapReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(
            error instanceof Error
              ? error.message
              : 'Google Maps could not be loaded.',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [apiKey])

  useEffect(() => {
    const map = mapRef.current
    const google = window.google

    if (!map || !google?.maps || !mapReady) return

    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    const bounds = new google.maps.LatLngBounds()

    validChargers.forEach((charger) => {
      const position = {
        lat: charger.latitude,
        lng: charger.longitude,
      }

      bounds.extend(position)

      const marker = new google.maps.Marker({
  map,
  position,
  title: charger.name,

})

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="font-family:Arial,sans-serif;max-width:220px;padding:4px">
            <strong>${escapeHtml(charger.name)}</strong>
            <p style="margin:6px 0;color:#58635b">${escapeHtml(charger.location)}</p>
            <p style="margin:4px 0">${escapeHtml(charger.connector)} · ${charger.power.toFixed(1)} kW</p>
            <p style="margin:4px 0">₹${charger.price.toFixed(2)} / kWh</p>
            <a href="${directionsUrl(position)}" target="_blank" rel="noopener noreferrer">Get directions ↗</a>
          </div>
        `,
      })

      marker.addListener('click', () => {
  onSelectChargerRef.current(charger.id)
  map.setCenter(position)
  map.setZoom(15)
  infoWindow.open({ map, anchor: marker })
})

      markersRef.current.push(marker)
    })

    if (validChargers.length === 1) {
      map.setCenter({
        lat: validChargers[0].latitude,
        lng: validChargers[0].longitude,
      })
      map.setZoom(14)
    } else if (validChargers.length > 1) {
      map.fitBounds(bounds, 48)
    } else {
      map.setCenter(userLocation ?? DEFAULT_CENTER)
      map.setZoom(12)
    }
  }, [validChargers, mapReady, userLocation])
useEffect(() => {
  const mapInstance = mapRef.current
const mapsApi = window.google?.maps

if (!mapInstance || !mapsApi || !mapReady) return

const activeMap = mapInstance
const activeMapsApi = mapsApi

  // Remove the previous route.
  routeLineRef.current?.setMap(null)
  routeLineRef.current = null

  setRouteResult(null)
  setRouteError('')

  if (!userLocation || !selectedChargerId) return

  const charger = validChargers.find(
    (item) => item.id === selectedChargerId,
  )

  if (!charger) return

  const origin = userLocation
  const destination = {
    lat: charger.latitude,
    lng: charger.longitude,
  }

  let cancelled = false

  async function calculateRoute() {
    setRouteLoading(true)

    try {
      const result = await fetchDrivingRoute(origin, destination)

      if (cancelled) return

      setRouteResult(result)

      routeLineRef.current = new activeMapsApi.Polyline({
  map: activeMap,
        path: result.coordinates,
        strokeColor: '#2563eb',
        strokeOpacity: 0.9,
        strokeWeight: 5,
      })

      const bounds = new activeMapsApi.LatLngBounds()
result.coordinates.forEach((point) => bounds.extend(point))
activeMap.fitBounds(bounds, 60)
    } catch (error) {
      if (!cancelled) {
        setRouteError(
          error instanceof Error
            ? error.message
            : 'Could not calculate driving route.',
        )
      }
    } finally {
      if (!cancelled) setRouteLoading(false)
    }
  }

  void calculateRoute()

  return () => {
    cancelled = true
  }
}, [userLocation, selectedChargerId, validChargers, mapReady])
useEffect(() => {
  if (!mapReady) return

  markersRef.current.forEach((marker) => {
    marker.setAnimation(null)
  })

  if (!selectedChargerId) return

  const selectedCharger = validChargers.find(
    (charger) => charger.id === selectedChargerId,
  )

  if (!selectedCharger || !window.google?.maps) return

  const selectedMarkerIndex = validChargers.findIndex(
    (charger) => charger.id === selectedChargerId,
  )

  const selectedMarker = markersRef.current[selectedMarkerIndex]

  if (!selectedMarker) return

  selectedMarker.setAnimation(window.google.maps.Animation.BOUNCE)
  selectedMarker.setZIndex(1000)
}, [selectedChargerId, validChargers, mapReady])


useEffect(() => {
  if (!selectedChargerId || !mapReady || !mapRef.current) {
    return
  }

  const charger = validChargers.find(
    (item) => item.id === selectedChargerId,
  )

  if (!charger) return

  mapRef.current.setCenter({
    lat: charger.latitude,
    lng: charger.longitude,
  })

  mapRef.current.setZoom(15)
}, [selectedChargerId, validChargers, mapReady])


  function findMyLocation() {
    setLocationMessage('')

    if (!navigator.geolocation) {
      setLocationMessage('Location is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        setUserLocation(current)
        mapRef.current?.setCenter(current)

        if (window.google?.maps && mapRef.current) {
          userMarkerRef.current?.setMap(null)

          userMarkerRef.current = new window.google.maps.Marker({
            map: mapRef.current,
            position: current,
            title: 'Your current location',
            label: 'You',
          })
        }

        mapRef.current?.setZoom(13)
        setLocationMessage(
          'Showing your current location. ChargeShare does not store your location.',
        )
      },
      () => {
        setLocationMessage(
          'Location permission was denied or your position could not be determined.',
        )
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      },
    )
  }

  return (
    <section className="map-panel" aria-label="Charging station map">
      <div className="map-panel-heading">
        <div>
          <span className="section-kicker">EXPLORE THE MAP</span>
          <h3>Chargers around you</h3>
          <p>Choose a marker to view charger details and directions.</p>
        </div>

        <button
          className="button button-outline map-location-button"
          type="button"
          onClick={findMyLocation}
        >
          ◎ Use my location
        </button>
      </div>

      {displayedMapError ? (
        <div className="map-message map-error" role="alert">
          <strong>Map unavailable</strong>
          <p>{displayedMapError}</p>
          <small>
            Check that your demo key supports Maps JavaScript API and that your
            site origin is permitted.
          </small>
        </div>
      ) : (
        <div className="map-canvas-wrap">
          {!mapReady && (
            <div className="map-loading" role="status">
              Loading Google Maps…
            </div>
          )}
          <div
            className="map-canvas"
            ref={mapElement}
            aria-label="Interactive Google Map with charger markers"
          />
        </div>
      )}

      {locationMessage && (
        <p className="map-status" role="status">
          {locationMessage}
        </p>
      )}
      {routeLoading && (
  <p className="map-status" role="status">
    Calculating driving route...
  </p>
)}

{routeError && (
  <p className="map-status map-error" role="alert">
    {routeError}
  </p>
)}

{routeResult && (
  <div className="map-nearby-list">
    <strong>Driving route to selected charger</strong>

    <div className="map-nearby-row">
      <div>
        <strong>{routeResult.distanceKm.toFixed(1)} km</strong>
        <span>Estimated road distance</span>
      </div>

      <div>
        <strong>
          {Math.round(routeResult.durationMinutes)} min
        </strong>
        <span>Estimated driving time</span>
      </div>
    </div>
    <a
  href={directionsUrl(
    {
      lat: validChargers.find(
        (charger) => charger.id === selectedChargerId,
      )!.latitude,
      lng: validChargers.find(
        (charger) => charger.id === selectedChargerId,
      )!.longitude,
    },
    userLocation ?? undefined,
  )}
  target="_blank"
  rel="noopener noreferrer"
  className="button button-outline"
>
  Open in Google Maps ↗
</a>
  </div>
)}

      {mapReady && validChargers.length === 0 && (
        <p className="map-status">
          No chargers with valid coordinates are available to pin yet.
        </p>
      )}

      {userLocation && validChargers.length > 0 && (
        <div className="map-nearby-list">
          <strong>Nearest listed chargers (straight-line distance)</strong>

          {validChargers
            .map((charger) => ({
              ...charger,
              distance: distanceKm(userLocation, {
                lat: charger.latitude,
                lng: charger.longitude,
              }),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3)
            .map((charger) => (
              <div className="map-nearby-row" key={charger.id}>
                <div>
                  <strong>{charger.name}</strong>
                  <span>
                    {charger.distance.toFixed(1)} km away · {charger.location}
                  </span>
                </div>

                <div className="map-nearby-actions">
                  <a
                    href={directionsUrl(
                      {
                        lat: charger.latitude,
                        lng: charger.longitude,
                      },
                      userLocation,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions ↗
                  </a>
                  <button type="button" onClick={() => onBook(charger.id)}>
                    Book
                  </button>
                </div>
              </div>
            ))}

          <small>Distances are straight-line estimates, not driving distances.</small>
        </div>
      )}
    </section>
  )
}
