import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EmailNotVerifiedPage from './EmailNotVerifiedPage'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('EmailNotVerifiedPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the resend button and login link', () => {
    render(<EmailNotVerifiedPage email="ava@example.com" />)

    expect(screen.getByRole('heading', { name: 'Email not verified' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend Verification Email' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Login' })).toHaveAttribute('href', '/login')
  })

  it('calls the resend endpoint and shows the fallback verification link when provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'If an unverified account exists for this email, a verification email has been sent.',
        verificationPreviewUrl: 'https://localsupply-api.vercel.app/api/auth/verify-email?token=preview',
      }),
    } as Response)

    render(<EmailNotVerifiedPage email="ava@example.com" />)

    fireEvent.click(screen.getByRole('button', { name: 'Resend Verification Email' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/resend-verification',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'ava@example.com' }),
        }),
      )
    })

    expect(screen.getByRole('link', { name: 'Open Verification Link' })).toHaveAttribute(
      'href',
      'https://localsupply-api.vercel.app/api/auth/verify-email?token=preview',
    )
  })
})
