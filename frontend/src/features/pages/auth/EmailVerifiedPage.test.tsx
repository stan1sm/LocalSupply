import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmailVerifiedPage from './EmailVerifiedPage'

const getMockStatus = vi.fn<(key: string) => string | null>(() => null)

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: getMockStatus,
  }),
}))

describe('EmailVerifiedPage', () => {
  it('shows the success state by default', () => {
    getMockStatus.mockReturnValue(null)

    render(<EmailVerifiedPage />)

    expect(screen.getByRole('heading', { name: 'Email verified' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue to Login' })).toHaveAttribute('href', '/login')
    expect(screen.getByText('Email verified, continue to login.')).toBeInTheDocument()
  })

  it('shows an invalid-link state when requested', () => {
    getMockStatus.mockReturnValue('invalid')

    render(<EmailVerifiedPage />)

    expect(screen.getByRole('heading', { name: 'Verification link unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register Again' })).toHaveAttribute('href', '/register')
  })
})
