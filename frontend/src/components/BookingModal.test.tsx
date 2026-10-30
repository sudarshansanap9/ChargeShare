
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'

import BookingModal from './BookingModal'
import api from '../lib/api'

vi.mock('../lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

const charger = {
  id: 'charger-123',
  name: 'Test Home Charger',
  location: 'Nashik',
  connector: 'Type 2',
  power: 7.4,
  price: 12.5,
}

function renderBookingModal() {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  render(
    <BookingModal
      charger={charger}
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  )

  return { onClose, onSuccess }
}

function futureDateTime(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
  date.setSeconds(0, 0)

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000,
  )

  return localDate.toISOString().slice(0, 16)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BookingModal', () => {
  it('renders charger details and booking form', () => {
    renderBookingModal()

    expect(
      screen.getByRole('heading', { name: 'Request a booking' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Test Home Charger')).toBeInTheDocument()
    expect(screen.getByText('Nashik')).toBeInTheDocument()
    expect(screen.getByText(/Type 2/)).toBeInTheDocument()

    expect(
      screen.getByLabelText(/start date and time/i),
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText(/end date and time/i),
    ).toBeInTheDocument()
  })

  it('submits a booking successfully', async () => {
    const user = userEvent.setup()
    const { onSuccess } = renderBookingModal()

    vi.mocked(api.post).mockResolvedValue({ data: { id: 'booking-123' } })

    await user.click(
      screen.getByRole('button', { name: /request booking/i }),
    )

    expect(await screen.findByRole('heading', {
      name: 'Booking requested!',
    })).toBeInTheDocument()

    expect(api.post).toHaveBeenCalledOnce()
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/bookings',
      expect.objectContaining({
        charger_id: 'charger-123',
      }),
    )

    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('rejects a booking that starts in the past', async () => {
    const { onSuccess } = renderBookingModal()

    const startInput = screen.getByLabelText(/start date and time/i)
    const endInput = screen.getByLabelText(/end date and time/i)

    fireEvent.change(startInput, {
      target: { value: '2020-01-01T10:00' },
    })

    fireEvent.change(endInput, {
      target: { value: '2020-01-01T11:00' },
    })

    fireEvent.submit(startInput.closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The booking must start in the future.',
    )

    expect(api.post).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('rejects an end time earlier than the start time', async () => {
    renderBookingModal()

    const start = futureDateTime(5)
    const end = futureDateTime(4)

    fireEvent.change(screen.getByLabelText(/start date and time/i), {
      target: { value: start },
    })

    fireEvent.change(screen.getByLabelText(/end date and time/i), {
      target: { value: end },
    })

    fireEvent.submit(
      screen.getByLabelText(/start date and time/i).closest('form')!,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The end time must be after the start time.',
    )

    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows a conflict error when the charger is already booked', async () => {
    const user = userEvent.setup()

    const conflictError = {
      response: {
        status: 409,
        data: { detail: 'This charger is already booked.' },
      },
    }

    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true)
    vi.mocked(api.post).mockRejectedValue(conflictError)

    renderBookingModal()

    await user.click(
      screen.getByRole('button', { name: /request booking/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This charger is already booked.',
    )
  })

  it('shows an authentication error for an expired session', async () => {
    const user = userEvent.setup()

    const authError = {
      response: {
        status: 401,
        data: { detail: 'Unauthorized' },
      },
    }

    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true)
    vi.mocked(api.post).mockRejectedValue(authError)

    renderBookingModal()

    await user.click(
      screen.getByRole('button', { name: /request booking/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please log in again before requesting a booking.',
    )

    expect(screen.getByRole('link', { name: /go to login/i }))
      .toHaveAttribute('href', '/login')
  })

  it('closes the booking modal when the cancel button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderBookingModal()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
