import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import HomePage from './HomePage'

describe('HomePage', () => {
  it('renders LocalSupply branding and key sections', () => {
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    )

    expect(screen.getAllByText('LocalSupply').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'How LocalSupply Works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Popular Shopping Lists' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/register')
  })
})
