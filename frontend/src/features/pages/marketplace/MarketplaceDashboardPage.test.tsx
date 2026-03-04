import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarketplaceDashboardPage from './MarketplaceDashboardPage'

describe('MarketplaceDashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('stays idle until the user searches or chooses a category', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<MarketplaceDashboardPage />)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Search or choose a category to start browsing')).toBeInTheDocument()
    expect(screen.getByText('Choose a category or search to begin')).toBeInTheDocument()
  })

  it('renders fetched marketplace products and shopping list totals', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'product_1',
            name: 'Organic Milk',
            description: 'Fresh norsk melk',
            price: 32.9,
            priceText: '32.90 kr',
            imageUrl: null,
            store: 'MENY',
            unitInfo: '32.90 kr/l',
            brand: 'Fresh Farm',
            ean: null,
            category: 'Dairy',
            url: null,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 100,
      }),
    } as Response)

    render(<MarketplaceDashboardPage />)

    expect(screen.getByRole('heading', { name: 'Fresh grocery search across Norwegian stores' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dairy & Eggs' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
      expect(screen.getByText('Organic Milk')).toBeInTheDocument()
      expect(screen.getByText('32.90 kr')).toBeInTheDocument()
    })

    expect(screen.getByRole('navigation', { name: 'Marketplace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My List$/ })).toBeInTheDocument()
    expect(screen.getByText('Your list is empty')).toBeInTheDocument()
    expect(screen.getByText('100+ imported products available')).toBeInTheDocument()
    expect(screen.getByText('Showing the first 1 loaded results')).toBeInTheDocument()
    expect(screen.queryByText('Fresh norsk melk')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load more products/ })).not.toBeInTheDocument()
  })
})
