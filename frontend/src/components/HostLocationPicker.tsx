
import { useEffect, useRef } from 'react'

type Coordinates = {
  latitude: number
  longitude: number
}

type Props = {
  latitude: string
  longitude: string
  onLocationChange: (location: Coordinates) => void
}

type MapPoint = {
  lat: number
  lng: number
}

type PickerMap = {
  setCenter: (center: MapPoint) => void
  setZoom: (zoom: number) => void
}

type PickerMarker = {
  setPosition: (position: MapPoint) => void
  addListener: (event: string, callback: () => void) => void
  getPosition: () => { lat: () => number; lng: () => number } | null
}





const DEFAULT_LOCATION = { lat: 19.9975, lng: 73.7898 }


function loadHostGoogleMaps(): Promise<void> {
  if (window.google?.maps) {
    return Promise.resolve()
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()

  if (!apiKey) {
    return Promise.reject(
      new Error('Google Maps API key is missing from frontend/.env.local'),
    )
  }

  const scriptId = 'chargeshare-google-maps-script'
  const existingScript = document.getElementById(scriptId)

  if (existingScript) {
    return new Promise((resolve, reject) => {
      const checkLoaded = () => {
        if (window.google?.maps) {
          resolve()
        } else {
          reject(new Error('Google Maps script exists but has not loaded.'))
        }
      }

      existingScript.addEventListener('load', checkLoaded, { once: true })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Google Maps failed to load.')),
        { once: true },
      )
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = scriptId
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.defer = true

    script.onload = () => {
      if (window.google?.maps) {
        resolve()
      } else {
        reject(new Error('Google Maps API did not initialize.'))
      }
    }

    script.onerror = () => {
      reject(new Error('Google Maps failed to load. Check your API key.'))
    }

    document.head.appendChild(script)
  })
}


export default function HostLocationPicker({
  latitude,
  longitude,
  onLocationChange,
}: Props) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<PickerMap | null>(null)
  const markerRef = useRef<PickerMarker | null>(null)
  const onLocationChangeRef = useRef(onLocationChange)

  const coordinatesRef = useRef({ latitude, longitude })

useEffect(() => {
  coordinatesRef.current = { latitude, longitude }
}, [latitude, longitude])

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange
  }, [onLocationChange])

  useEffect(() => {
    let cancelled = false

    function initializeMap() {
      const google = window.google

if (!google?.maps || !mapElement.current) {
  return
}
const { latitude: currentLatitude, longitude: currentLongitude } =
  coordinatesRef.current

const initialLat = Number(currentLatitude)
const initialLng = Number(currentLongitude)

      const initial =
        currentLatitude.trim() !== '' &&
currentLongitude.trim() !== '' &&
        Number.isFinite(initialLat) &&
        Number.isFinite(initialLng) &&
        initialLat >= -90 &&
        initialLat <= 90 &&
        initialLng >= -180 &&
        initialLng <= 180 &&
        !(initialLat === -90 && initialLng === -180)
          ? { lat: initialLat, lng: initialLng }
          : DEFAULT_LOCATION

      const map = new google.maps.Map(mapElement.current, {
        center: initial,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })

      const marker = new google.maps.Marker({
        map,
        position: initial,
        draggable: true,
        title: 'Drag to set your charger location',
      })

      marker.addListener('dragend', () => {
        const position = marker.getPosition()

        if (!position) return

        onLocationChangeRef.current({
          latitude: Number(position.lat().toFixed(6)),
          longitude: Number(position.lng().toFixed(6)),
        })
      })

      mapRef.current = map
      markerRef.current = marker
    }

    loadHostGoogleMaps()
  .then(() => {
    if (!cancelled) {
      initializeMap()
    }
  })
  .catch((error: unknown) => {
    console.error('Host map initialization failed:', error)
  })

    return () => {
      cancelled = true



      if (cancelled) {
        markerRef.current = null
        mapRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const lat = Number(latitude)
    const lng = Number(longitude)

    if (
      latitude.trim() === '' ||
      longitude.trim() === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180 ||
      (lat === -90 && lng === -180)
    ) {
      return
    }

    const position = { lat, lng }

    markerRef.current?.setPosition(position)
    mapRef.current?.setCenter(position)
  }, [latitude, longitude])

  return (
    <div className="full-width">
      <p>Drag the map pin to select the exact charger location.</p>
      <div
        ref={mapElement}
        aria-label="Map to select charger location"
        style={{
          width: '100%',
          height: '320px',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
