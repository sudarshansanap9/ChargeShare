
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import App from './App'
import api from './lib/api'
import { getMyProfile, hasToken } from './lib/auth'

vi.mock('./lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('./lib/auth', () => ({
  hasToken: vi.fn(),
  getMyProfile: vi.fn(),
}))

vi.mock('./components/ChargingStationMap', () => ({
  default: () => <div data-testid="charging-map">Mock charging map</div>,
}))

vi.mock('./components/BookingModal', () => ({
  default: ({
    charger,
    onClose,
    onSuccess,
  }: {
    charger: { name: string }
    onClose: () => void
    onSuccess: () => void
  }) => (
    <div role="dialog" aria-label="Booking modal">
      <h2>Booking {charger.name}</h2>
      <button onClick={onSuccess}>Complete mock booking</button>
      <button onClick={onClose}>Close booking</button>
    </div>
  ),
}))

const chargers = [
  {
    id: 'charger-1',
    host_id: 'host-1',
    title: 'Nashik Fast Charger',
    description: 'Fast charging station',
    location_name: 'College Road',
    latitude: 20.0059,
    longitude: 73.7622,
    connector_type: 'Type 2',
    power_kw: 22,
    price_per_kwh: 15,
    charger_category: 'public',
    is_active: true,
  },
  {
    id: 'charger-2',
    host_id: 'host-2',
    title: 'Gangapur Road Charger',
    description: 'Home charging station',
    location_name: 'Gangapur Road',
    latitude: 20.0100,
    longitude: 73.7500,
    connector_type: 'Type 2',
    power_kw: 7.4,
    price_per_kwh: 10,
    charger_category: 'home',
    is_active: true,
  },
  {
    id: 'charger-3',
    host_id: 'host-3',
    title: 'Mumbai Naka Charger',
    description: 'Public charging station',
    location_name: 'Mumbai Naka',
    latitude: 19.9975,
    longitude: 73.7898,
    connector_type: 'Type 2',
    power_kw: 50,
    price_per_kwh: 20,
    charger_category: 'public',
    is_active: true,
  },
  {
    id: 'charger-4',
    host_id: 'host-4',
    title: 'Panchavati Charger',
    description: 'Public charging station',
    location_name: 'Panchavati',
    latitude: 20.0063,
    longitude: 73.7900,
    connector_type: 'Type 2',
    power_kw: 11,
    price_per_kwh: 12,
    charger_category: 'public',
    is_active: true,
  },
]

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function chargerCards() {
  return document.querySelectorAll<HTMLElement>('.charger-card')
}
async function loadChargers(data = chargers) {
  vi.mocked(api.get).mockResolvedValue({
    data,
  } as never)

  renderApp()

  await screen.findByRole('heading', {
    name: 'Nashik Fast Charger',
  })
}

describe('App homepage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: chargers,
    } as never)

    vi.mocked(hasToken).mockReturnValue(false)

    vi.mocked(getMyProfile).mockResolvedValue({
      id: 'user-1',
      full_name: 'Test User',
      email: 'test@example.com',
      role: 'driver',
      is_active: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the homepage and navigation', async () => {
    await loadChargers()

    expect(
      screen.getByRole('link', { name: /chargeShare home/i }),
    ).toBeInTheDocument()

    expect(
  screen.getAllByRole('link', { name: /find a charger/i }),
).toHaveLength(2)
    expect(
      screen.getByRole('link', { name: 'Log in' }),
    ).toBeInTheDocument()

    expect(screen.getByTestId('charging-map')).toBeInTheDocument()
  })

  it('loads and displays charger listings from the API', async () => {
    await loadChargers()

    expect(api.get).toHaveBeenCalledWith('/api/v1/chargers')

    expect(
      screen.getByRole('heading', { name: 'Nashik Fast Charger' }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: 'Gangapur Road Charger' }),
    ).toBeInTheDocument()

    expect(chargerCards()).toHaveLength(3)
  })

  it('shows an error and retries when the charger API fails', async () => {
    const user = userEvent.setup()

    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce({ data: chargers } as never)

    renderApp()

    expect(
      await screen.findByRole('heading', {
        name: 'Chargers could not be loaded',
      }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(
      await screen.findByRole('heading', {
        name: 'Nashik Fast Charger',
      }),
    ).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('filters chargers by location or charger name', async () => {
    const user = userEvent.setup()

    await loadChargers()

    await user.type(
      screen.getByRole('textbox', {
        name: /search by location or charger name/i,
      }),
      'Gangapur',
    )

    expect(
      screen.getByRole('heading', {
        name: 'Gangapur Road Charger',
      }),
    ).toBeInTheDocument()

    expect(chargerCards()).toHaveLength(1)

    expect(
      screen.queryByRole('heading', {
        name: 'Nashik Fast Charger',
      }),
    ).not.toBeInTheDocument()
  })

  it('filters chargers using the maximum price', async () => {
    const user = userEvent.setup()

    await loadChargers()

    await user.selectOptions(
      screen.getByRole('combobox', {
        name: /maximum price per kwh/i,
      }),
      '12',
    )

    expect(chargerCards()).toHaveLength(2)

    expect(
      screen.getByRole('heading', {
        name: 'Gangapur Road Charger',
      }),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('heading', {
        name: 'Mumbai Naka Charger',
      }),
    ).not.toBeInTheDocument()
  })

  it('sorts chargers by lowest price first', async () => {
    const user = userEvent.setup()

    await loadChargers()

    await user.selectOptions(
      screen.getByRole('combobox', { name: /sort by/i }),
      'price',
    )

    const cards = Array.from(chargerCards())

    expect(cards).toHaveLength(3)

    expect(
      within(cards[0]).getByRole('heading').textContent,
    ).toBe('Gangapur Road Charger')

    expect(
      within(cards[1]).getByRole('heading').textContent,
    ).toBe('Panchavati Charger')

    expect(
      within(cards[2]).getByRole('heading').textContent,
    ).toBe('Nashik Fast Charger')
  })

  it('sorts chargers by highest charging power first', async () => {
    const user = userEvent.setup()

    await loadChargers()

    await user.selectOptions(
      screen.getByRole('combobox', { name: /sort by/i }),
      'power',
    )

    const cards = Array.from(chargerCards())

    expect(
      within(cards[0]).getByRole('heading').textContent,
    ).toBe('Mumbai Naka Charger')

    expect(
      within(cards[1]).getByRole('heading').textContent,
    ).toBe('Nashik Fast Charger')
  })

  it('displays only three chargers initially and supports viewing all', async () => {
    const user = userEvent.setup()

    await loadChargers()

    expect(chargerCards()).toHaveLength(3)

    await user.click(
      screen.getByRole('button', { name: /view all chargers/i }),
    )

    expect(chargerCards()).toHaveLength(4)

    await user.click(
      screen.getByRole('button', { name: /show fewer/i }),
    )

    expect(chargerCards()).toHaveLength(3)
  })

  it('excludes inactive and invalid chargers', async () => {
    const invalidChargers = [
      ...chargers,
      {
        ...chargers[0],
        id: 'charger-inactive',
        title: 'Inactive Charger',
        is_active: false,
      },
      {
        ...chargers[0],
        id: 'charger-invalid',
        title: 'Invalid Charger',
        latitude: 200,
      },
    ]

    await loadChargers(invalidChargers)

    expect(chargerCards()).toHaveLength(3)

    expect(
      screen.queryByRole('heading', {
        name: 'Inactive Charger',
      }),
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('heading', {
        name: 'Invalid Charger',
      }),
    ).not.toBeInTheDocument()
  })

  it('navigates unauthenticated users to login when booking', async () => {
    const user = userEvent.setup()

    vi.mocked(hasToken).mockReturnValue(false)

    await loadChargers()

    await user.click(
      screen.getAllByRole('button', {
        name: /book this charger/i,
      })[0],
    )

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(getMyProfile).not.toHaveBeenCalled()
  })

  it('prevents host accounts from requesting bookings', async () => {
    const user = userEvent.setup()

    vi.mocked(hasToken).mockReturnValue(true)

    vi.mocked(getMyProfile).mockResolvedValue({
      id: 'host-1',
      full_name: 'Test Host',
      email: 'host@example.com',
      role: 'host',
      is_active: true,
    })

    await loadChargers()

    await user.click(
      screen.getAllByRole('button', {
        name: /book this charger/i,
      })[0],
    )

    expect(
      await screen.findByText(
        'Only driver accounts can request bookings.',
      ),
    ).toBeInTheDocument()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the booking modal for an authenticated driver', async () => {
    const user = userEvent.setup()

    vi.mocked(hasToken).mockReturnValue(true)

    await loadChargers()

    await user.click(
      screen.getAllByRole('button', {
        name: /book this charger/i,
      })[0],
    )

    expect(
      await screen.findByRole('dialog', {
        name: 'Booking modal',
      }),
    ).toBeInTheDocument()

    expect(
      screen.getByText('Booking Nashik Fast Charger'),
    ).toBeInTheDocument()
  })

  it('shows the booking success notification after successful booking', async () => {
    const user = userEvent.setup()

    vi.mocked(hasToken).mockReturnValue(true)

    await loadChargers()

    await user.click(
      screen.getAllByRole('button', {
        name: /book this charger/i,
      })[0],
    )

    await user.click(
      await screen.findByRole('button', {
        name: /complete mock booking/i,
      }),
    )

    expect(
      screen.getByText(
        'Booking requested successfully. Check your dashboard for its status.',
      ),
    ).toBeInTheDocument()
  })
})
