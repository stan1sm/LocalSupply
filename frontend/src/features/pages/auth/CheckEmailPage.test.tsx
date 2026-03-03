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
    expect(screen.getByRole('link', { name: 'Register Again' })).toHaveAttribute('href', '/register')
  })
})
