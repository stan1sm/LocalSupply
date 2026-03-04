import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarketplaceDashboardPage from './MarketplaceDashboardPage'

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

function mockProductResponse(items: Record<string, unknown>[] = [], total = 0) {
  return {
    ok: true,
    json: async () => ({
      items,
      page: 1,
      pageSize: 50,
      total,
    }),
  } as Response
}

describe('MarketplaceDashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('fetches products on initial load with the default "All" category', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockProductResponse(
        [
          {
            id: 'product_1',
            name: 'Organic Milk',
            description: 'Fresh norsk melk',
            price: 32.9,
            priceText: '32.90 kr',
            imageUrl: 'https://example.com/milk.jpg',
            store: 'MENY',
            unitInfo: '32.90 kr/l',
            brand: 'Fresh Farm',
            ean: null,
            category: 'Dairy',
            url: null,
          },
        ],
        100,
      ),
    )

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
      expect(screen.getByText('Organic Milk')).toBeInTheDocument()
      expect(screen.getByText('32.90 kr')).toBeInTheDocument()
    })

    const productFetchUrl = fetchSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/products') && !call[0].includes('/stores'),
    )?.[0] as string | undefined
    expect(productFetchUrl).toBeDefined()
    expect(productFetchUrl).not.toContain('category=')

    expect(screen.getByRole('heading', { name: 'Fresh grocery search across Norwegian stores' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Marketplace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /My Cart$/ })).toBeInTheDocument()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByText('100+ imported products available')).toBeInTheDocument()
  })

  it('shows Add to Cart button on product cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockProductResponse(
        [
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
        1,
      ),
    )

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Brunost')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeInTheDocument()
  })
})
