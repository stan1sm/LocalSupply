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
    expect(screen.getByRole('link', { name: 'Continue to Login' })).toHaveAttribute('href', '/login')
    expect(screen.getByText('Email verified, continue to login.')).toBeInTheDocument()
  })

  it('shows an invalid-link state when requested', () => {
    render(<EmailVerifiedPage status="invalid" />)

    expect(screen.getByRole('heading', { name: 'Verification link unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register Again' })).toHaveAttribute('href', '/register')
  })
})
