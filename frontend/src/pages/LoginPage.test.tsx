
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import LoginPage from './LoginPage'
import { getMyProfile, login, logout } from '../lib/auth'

vi.mock('../lib/auth', () => ({
  login: vi.fn(),
  getMyProfile: vi.fn(),
  logout: vi.fn(),
}))

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Home page</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

const activeUser = {
  id: 'test-user-id',
  full_name: 'Test User',
  email: 'driver@example.com',
  role: 'driver' as const,
  is_active: true,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('renders the login form', () => {
    renderLoginPage()

    expect(
      screen.getByRole('heading', { name: 'Good to see you.' }),
    ).toBeInTheDocument()

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /log in/i }),
    ).toBeInTheDocument()
  })

  it('logs in successfully and navigates to the home page', async () => {
    const user = userEvent.setup()

    vi.mocked(login).mockResolvedValue({
      access_token: 'test-token',
      token_type: 'bearer',
    })

    vi.mocked(getMyProfile).mockResolvedValue(activeUser)

    renderLoginPage()

    await user.type(
      screen.getByLabelText(/email address/i),
      'driver@example.com',
    )

    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('heading', {
      name: 'Home page',
    })).toBeInTheDocument()

    expect(login).toHaveBeenCalledWith(
      'driver@example.com',
      'TestPassword123',
    )

    expect(getMyProfile).toHaveBeenCalledOnce()
  })

  it('displays the backend error for incorrect credentials', async () => {
    const user = userEvent.setup()

    const error = Object.assign(new Error('Login failed'), {
      isAxiosError: true,
      response: {
        data: { detail: 'Incorrect email or password' },
      },
    })

    vi.mocked(login).mockRejectedValue(error)

    renderLoginPage()

    await user.type(
      screen.getByLabelText(/email address/i),
      'driver@example.com',
    )

    await user.type(
      screen.getByLabelText(/^password$/i),
      'WrongPassword123',
    )

    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password',
    )

    expect(logout).toHaveBeenCalled()
  })

  it('rejects an inactive account and logs it out', async () => {
    const user = userEvent.setup()

    vi.mocked(login).mockResolvedValue({
      access_token: 'test-token',
      token_type: 'bearer',
    })

    vi.mocked(getMyProfile).mockResolvedValue({
      ...activeUser,
      is_active: false,
    })

    renderLoginPage()

    await user.type(
      screen.getByLabelText(/email address/i),
      'driver@example.com',
    )

    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account is inactive. Please contact support.',
    )

    expect(logout).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Home page' }))
      .not.toBeInTheDocument()
  })

  it('displays a generic error when an unexpected error occurs', async () => {
    const user = userEvent.setup()

    vi.mocked(login).mockRejectedValue(new Error('Unexpected error'))

    renderLoginPage()

    await user.type(
      screen.getByLabelText(/email address/i),
      'driver@example.com',
    )

    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it('disables the login button while authentication is pending', async () => {
    const user = userEvent.setup()

    let resolveLogin!: (value: {
      access_token: string
      token_type: string
    }) => void

    vi.mocked(login).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        }),
    )

    vi.mocked(getMyProfile).mockResolvedValue(activeUser)

    renderLoginPage()

    await user.type(
      screen.getByLabelText(/email address/i),
      'driver@example.com',
    )

    await user.type(
      screen.getByLabelText(/^password$/i),
      'TestPassword123',
    )

    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(
      await screen.findByRole('button', { name: /logging in/i }),
    ).toBeDisabled()

    resolveLogin({
      access_token: 'test-token',
      token_type: 'bearer',
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Home page' }))
        .toBeInTheDocument()
    })
  })
})
