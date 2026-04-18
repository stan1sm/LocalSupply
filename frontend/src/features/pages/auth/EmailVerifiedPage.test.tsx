import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmailVerifiedPage from './EmailVerifiedPage'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('EmailVerifiedPage', () => {
  it('shows the success state by default', () => {
    render(<EmailVerifiedPage />)

    expect(screen.getByRole('heading', { name: 'Email verified' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByText('Your email is confirmed. You can now sign in with the email and password you registered with.')).toBeInTheDocument()
  })

  it('shows an invalid-link state when requested', () => {
    render(<EmailVerifiedPage status="invalid" />)

    expect(screen.getByRole('heading', { name: 'Verification link unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register again' })).toHaveAttribute('href', '/register')
  })
})
