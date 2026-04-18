import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

const pushMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.restoreAllMocks()
  })

  it('shows live format guidance for invalid email input', () => {
    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'ava' } })
    expect(screen.getByText('Use a valid email format like name@example.com.')).toBeInTheDocument()
  })

  it('submits normalized credentials and redirects on success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Signed in successfully.',
      }),
    } as Response)

    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: ' AVA@EXAMPLE.COM ' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Abcd!123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'ava@example.com',
            password: 'Abcd!123',
          }),
        }),
      )
    })

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/marketplace/dashboard')
    })
  })

  it('redirects unverified users to the dedicated verification page', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message: 'Please verify your email before signing in.',
        email: 'ava@example.com',
      }),
    } as Response)

    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'ava@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Abcd!123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      expect(pushMock).toHaveBeenCalledWith('/email-not-verified?email=ava%40example.com')
    })
  })
})
