import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomePage from './HomePage'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('HomePage', () => {
  it('renders LocalSupply branding and key sections', () => {
    render(<HomePage />)

    expect(screen.getAllByText('LocalSupply').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'How LocalSupply Works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Popular Shopping Lists' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })
})
