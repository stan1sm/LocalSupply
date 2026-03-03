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

  it('shows live format guidance for invalid email and weak password input', () => {
    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'ava' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your secure password'), { target: { value: 'abc' } })

    expect(screen.getByText('Use a valid email format like name@example.com.')).toBeInTheDocument()
    expect(screen.getByText('At least 8 characters')).toHaveClass('text-[#6b7280]')
    expect(screen.getByText('At least one uppercase letter')).toHaveClass('text-[#6b7280]')
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
    fireEvent.change(screen.getByPlaceholderText('Enter your secure password'), { target: { value: 'Abcd!123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

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
})
