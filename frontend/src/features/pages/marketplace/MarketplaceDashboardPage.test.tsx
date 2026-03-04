import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarketplaceDashboardPage from './MarketplaceDashboardPage'

describe('MarketplaceDashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('fetches dairy products by default on initial load', async () => {
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

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
      expect(screen.getByText('Organic Milk')).toBeInTheDocument()
      expect(screen.getByText('32.90 kr')).toBeInTheDocument()
    })

    const fetchUrl = fetchSpy.mock.calls[0][0] as string
    expect(fetchUrl).toContain('category=dairy')

    expect(screen.getByRole('heading', { name: 'Fresh grocery search across Norwegian stores' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Marketplace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /My Cart$/ })).toBeInTheDocument()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByText('100+ imported products available')).toBeInTheDocument()
    expect(screen.getByText('Showing the first 1 loaded results')).toBeInTheDocument()
  })

  it('shows Add to Cart button on product cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'product_2',
            name: 'Brunost',
            price: 59.9,
            priceText: '59.90 kr',
            imageUrl: null,
            store: 'KIWI',
            unitInfo: null,
            brand: null,
            ean: null,
            category: 'Dairy',
            url: null,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      }),
    } as Response)

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Brunost')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeInTheDocument()
  })
})
