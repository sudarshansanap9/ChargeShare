
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import RegisterPage from './RegisterPage'
import { register } from '../lib/auth'

vi.mock('../lib/auth', () => ({
  register: vi.fn(),
}))

function renderRegisterPage(initialPath = '/register') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/login"
          element={<h1>Login page</h1>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RegisterPage', () => {
  it('renders the registration form', () => {
    renderRegisterPage()

    expect(
      screen.getByRole('heading', {
        name: "Let's get you connected.",
      }),
    ).toBeInTheDocument()

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()

    expect(
      screen.getByRole('radio', { name: /find a charger/i }),
    ).toBeChecked()

    expect(
      screen.getByRole('radio', { name: /share my charger/i }),
    ).not.toBeChecked()
  })

  it('registers a new driver and navigates to login', async () => {
    const user = userEvent.setup()
    vi.mocked(register).mockResolvedValue({} as never)

    renderRegisterPage()

    await user.type(screen.getByLabelText(/full name/i), 'Test Driver')
    await user.type(
      screen.getByLabelText(/email address/i),
      'DRIVER@EXAMPLE.COM',
    )
    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    )

    expect(await screen.findByRole('heading', {
      name: 'Login page',
    })).toBeInTheDocument()

    expect(register).toHaveBeenCalledWith({
      full_name: 'Test Driver',
      email: 'driver@example.com',
      password: 'TestPassword123',
      role: 'driver',
    })
  })

  it('allows the user to select the host role', async () => {
    const user = userEvent.setup()
    vi.mocked(register).mockResolvedValue({} as never)

    renderRegisterPage()

    await user.type(screen.getByLabelText(/full name/i), 'Test Host')
    await user.type(
      screen.getByLabelText(/email address/i),
      'host@example.com',
    )
    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(
      screen.getByRole('radio', { name: /share my charger/i }),
    )

    expect(
      screen.getByRole('radio', { name: /share my charger/i }),
    ).toBeChecked()

    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    )

    await screen.findByRole('heading', { name: 'Login page' })

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'host',
      }),
    )
  })

  it('defaults to host role when role=host is in the URL', () => {
    renderRegisterPage('/register?role=host')

    expect(
      screen.getByRole('radio', { name: /share my charger/i }),
    ).toBeChecked()
  })

  it('rejects a full name shorter than two characters', async () => {
    const user = userEvent.setup()

    renderRegisterPage()

    await user.type(screen.getByLabelText(/full name/i), 'A')
    await user.type(
      screen.getByLabelText(/email address/i),
      'test@example.com',
    )
    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter your full name.',
    )

    expect(register).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than eight characters', async () => {
    const user = userEvent.setup()

    renderRegisterPage()

    await user.type(screen.getByLabelText(/full name/i), 'Test User')
    await user.type(
      screen.getByLabelText(/email address/i),
      'test@example.com',
    )
    await user.type(
      screen.getByLabelText(/^password$/i),
      'short',
    )

    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your password must contain at least 8 characters.',
    )

    expect(register).not.toHaveBeenCalled()
  })

  it('displays an API error when registration fails', async () => {
    const user = userEvent.setup()

    const error = Object.assign(new Error('Registration failed'), {
      isAxiosError: true,
      response: {
        data: { detail: 'Email already registered' },
      },
    })

    vi.mocked(register).mockRejectedValue(error)

    renderRegisterPage()

    await user.type(screen.getByLabelText(/full name/i), 'Test User')
    await user.type(
      screen.getByLabelText(/email address/i),
      'test@example.com',
    )
    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(
      screen.getByRole('button', { name: /create account/i }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email already registered',
    )
  })
})
