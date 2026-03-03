import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CheckEmailPage from './CheckEmailPage'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('CheckEmailPage', () => {
  it('renders the verification instructions and navigation links', () => {
    render(<CheckEmailPage />)

    expect(screen.getByRole('heading', { name: 'Check email for verification' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Login' })).toHaveAttribute('href', '/login')
  })

  it('shows the fallback verification link when provided', () => {
    render(<CheckEmailPage verificationPreviewUrl="https://localsupply-api.vercel.app/api/auth/verify-email?token=preview" />)

    expect(screen.getByRole('link', { name: 'Open Verification Link' })).toHaveAttribute(
      'href',
      'https://localsupply-api.vercel.app/api/auth/verify-email?token=preview',
    )
  })
})
