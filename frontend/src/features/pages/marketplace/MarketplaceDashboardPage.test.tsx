import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarketplaceDashboardPage from './MarketplaceDashboardPage'

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

const CART_STORAGE_KEY = 'localsupply-marketplace-cart'

function makeProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'product_1',
    name: 'Organic Milk',
    description: null,
    price: 32.9,
    priceText: '32.90 kr',
    imageUrl: null,
    store: 'MENY',
    unitInfo: '1 l',
    brand: null,
    ean: null,
    category: 'Dairy',
    url: null,
    ...overrides,
  }
}

function mockFetch(items: Record<string, unknown>[] = [], total = 0) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const urlStr = typeof url === 'string' ? url : (url as URL).toString()
    if (urlStr.includes('/stores')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    if (urlStr.includes('/substitutions')) {
      return Promise.resolve({ ok: true, json: async () => ({ suggestions: [] }) } as Response)
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ items, page: 1, pageSize: 50, total }),
    } as Response)
  })
}

describe('MarketplaceDashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  // ── Initial load ────────────────────────────────────────────────────────────

  it('fetches products on initial load with the default "All" category', async () => {
    const fetchSpy = mockFetch([makeProduct()], 100)

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
    expect(screen.getByRole('navigation', { name: 'Buyer navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /My Cart$/ })).toBeInTheDocument()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByText('100+ imported products available')).toBeInTheDocument()
  })

  it('shows Add to Cart button on product cards', async () => {
    mockFetch([makeProduct({ id: 'p2', name: 'Brunost', price: 59.9, priceText: '59.90 kr' })], 1)

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Brunost')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeInTheDocument()
  })

  // ── Category filtering ──────────────────────────────────────────────────────

  it('sends category param in URL when a non-All category is selected', async () => {
    const fetchSpy = mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Dairy' }))

    await waitFor(() => {
      const categoryFetch = fetchSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('category=dairy'),
      )
      expect(categoryFetch).toBeDefined()
    })
  })

  it('highlights the active category button', async () => {
    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Dairy' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Dairy' }))

    const dairyButton = screen.getByRole('button', { name: 'Dairy' })
    expect(dairyButton.className).toContain('bg-[#2f9f4f]')

    const allButton = screen.getByRole('button', { name: 'All' })
    expect(allButton.className).not.toContain('bg-[#2f9f4f]')
  })

  it('hides the store filter when "Local suppliers" category is selected', async () => {
    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Local suppliers' })).toBeInTheDocument())

    expect(screen.getByText('Store')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Local suppliers' }))

    expect(screen.queryByText('Store')).not.toBeInTheDocument()
  })

  it('shows store-specific product count label when local-suppliers is active', async () => {
    mockFetch(
      [makeProduct({ id: 'sup_1', name: 'Farm Eggs', source: 'supplier', supplierId: 'sup-abc' })],
      1,
    )
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Local suppliers' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Local suppliers' }))

    await waitFor(() => {
      expect(screen.getByText(/product from local suppliers/)).toBeInTheDocument()
    })
  })

  // ── Cart interactions ───────────────────────────────────────────────────────

  it('clicking Add to Cart shows the quantity stepper with count 1', async () => {
    mockFetch([makeProduct()], 1)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Add to Cart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

    expect(screen.queryByRole('button', { name: 'Add to Cart' })).not.toBeInTheDocument()
    const article = screen.getByRole('article')
    expect(within(article).getByText('1')).toBeInTheDocument()
  })

  it('+ button increments the cart quantity', async () => {
    mockFetch([makeProduct()], 1)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Add to Cart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

    const article = screen.getByRole('article')
    fireEvent.click(within(article).getByRole('button', { name: '+' }))

    expect(within(article).getByText('2')).toBeInTheDocument()
  })

  it('decrementing to 0 removes item and restores Add to Cart button', async () => {
    mockFetch([makeProduct()], 1)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Add to Cart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

    const article = screen.getByRole('article')
    fireEvent.click(within(article).getByRole('button', { name: '-' }))

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeInTheDocument()
  })

  it('Add to Cart shows success toast', async () => {
    mockFetch([makeProduct()], 1)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Add to Cart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

    await waitFor(() => {
      expect(screen.getByText('Organic Milk added to cart')).toBeInTheDocument()
    })
  })

  it('product with no price has a disabled Add to Cart button', async () => {
    mockFetch([makeProduct({ price: null, priceText: null })], 1)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Add to Cart' }))
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeDisabled()
  })

  it('supplier products show "View supplier" and "Buy item" links instead of cart controls', async () => {
    mockFetch(
      [makeProduct({ source: 'supplier', supplierId: 'sup-xyz', price: 50, priceText: '50.00 kr' })],
      1,
    )
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByRole('link', { name: 'View supplier' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Buy item' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to Cart' })).not.toBeInTheDocument()
  })

  // ── Cart persistence ────────────────────────────────────────────────────────

  it('loads pre-existing cart items from localStorage on mount', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { id: 'stored_1', name: 'Saved Bread', price: 25.0, quantity: 2, store: 'KIWI', imageUrl: null, unitInfo: null },
      ]),
    )

    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Saved Bread')).toBeInTheDocument()
    })
    expect(screen.getByText('2 items in cart')).toBeInTheDocument()
  })

  // ── Cart totals ─────────────────────────────────────────────────────────────

  it('shows correct subtotal (price × qty), 49 kr delivery, and grand total', async () => {
    // Use two items so subtotal (160) differs from each item line (120, 40)
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { id: 'c1', name: 'Gouda', price: 60.0, quantity: 2, store: 'MENY', imageUrl: null, unitInfo: null },
        { id: 'c2', name: 'Bread', price: 40.0, quantity: 1, store: 'KIWI', imageUrl: null, unitInfo: null },
      ]),
    )

    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByText('Gouda')).toBeInTheDocument())

    // subtotal = 60*2 + 40*1 = 160; delivery = 49; total = 209 — all unique
    expect(screen.getByText('160.00 kr')).toBeInTheDocument()
    expect(screen.getByText('49.00 kr')).toBeInTheDocument()
    expect(screen.getByText('209.00 kr')).toBeInTheDocument()
  })

  it('shows 0 kr delivery when cart is empty', async () => {
    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Proceed to Checkout' })).toBeInTheDocument())

    // With an empty cart, subtotal, delivery, and total are all 0.00 kr
    const zeros = screen.getAllByText('0.00 kr')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  // ── Checkout ────────────────────────────────────────────────────────────────

  it('"Proceed to Checkout" is disabled when cart is empty', async () => {
    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Proceed to Checkout' })).toBeDisabled()
    })
  })

  it('"Proceed to Checkout" is enabled when cart has items', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { id: 'x1', name: 'Butter', price: 30.0, quantity: 1, store: 'REMA', imageUrl: null, unitInfo: null },
      ]),
    )

    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Proceed to Checkout' })).not.toBeDisabled()
    })
  })

  // ── Error and empty states ──────────────────────────────────────────────────

  it('shows error message when product fetch returns a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString()
      if (urlStr.includes('/stores')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response)
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ message: 'Service unavailable' }),
      } as Response)
    })

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument()
    })
  })

  it('shows "No products matched" when fetch returns an empty items array', async () => {
    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('No products matched this combination')).toBeInTheDocument()
    })
  })

  // ── Sorting ─────────────────────────────────────────────────────────────────

  it('sorts products by price ascending when selected from the dropdown', async () => {
    const fetchSpy = mockFetch(
      [
        makeProduct({ id: 'p_expensive', name: 'Premium Cheese', price: 99.9, priceText: '99.90 kr' }),
        makeProduct({ id: 'p_cheap', name: 'Budget Bread', price: 15.0, priceText: '15.00 kr' }),
      ],
      2,
    )

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
      expect(screen.getByText('Premium Cheese')).toBeInTheDocument()
      expect(screen.getByText('Budget Bread')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('Recommended'), { target: { value: 'price-asc' } })

    await waitFor(() => {
      const cards = document.querySelectorAll('article h3')
      expect(cards[0]?.textContent).toBe('Budget Bread')
      expect(cards[1]?.textContent).toBe('Premium Cheese')
    })
  })

  it('sorts products by price descending when selected', async () => {
    mockFetch(
      [
        makeProduct({ id: 'p_mid', name: 'Regular Yogurt', price: 29.9, priceText: '29.90 kr' }),
        makeProduct({ id: 'p_hi', name: 'Luxury Salmon', price: 189.9, priceText: '189.90 kr' }),
      ],
      2,
    )

    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByText('Luxury Salmon')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Recommended'), { target: { value: 'price-desc' } })

    await waitFor(() => {
      const cards = document.querySelectorAll('article h3')
      expect(cards[0]?.textContent).toBe('Luxury Salmon')
      expect(cards[1]?.textContent).toBe('Regular Yogurt')
    })
  })

  it('sorts products alphabetically by name when Name: A-Z is selected', async () => {
    mockFetch(
      [
        makeProduct({ id: 'p_z', name: 'Zucchini', price: 20, priceText: '20.00 kr' }),
        makeProduct({ id: 'p_a', name: 'Apple Juice', price: 35, priceText: '35.00 kr' }),
      ],
      2,
    )

    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByText('Zucchini')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Recommended'), { target: { value: 'name-asc' } })

    await waitFor(() => {
      const cards = document.querySelectorAll('article h3')
      expect(cards[0]?.textContent).toBe('Apple Juice')
      expect(cards[1]?.textContent).toBe('Zucchini')
    })
  })

  // ── Substitutions ───────────────────────────────────────────────────────────

  it('"Find cheaper alternatives" button fetches the substitutions endpoint', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { id: 'prod_abc', name: 'Organic Eggs', price: 45.0, quantity: 1, store: 'MENY', imageUrl: null, unitInfo: null },
      ]),
    )

    const fetchSpy = mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByText('Organic Eggs')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Find cheaper alternatives' }))

    await waitFor(() => {
      const subsFetch = fetchSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/substitutions'),
      )
      expect(subsFetch).toBeDefined()
    })
  })

  it('shows "No cheaper alternatives found" when substitutions endpoint returns empty', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { id: 'prod_xyz', name: 'Fancy Juice', price: 55.0, quantity: 1, store: 'KIWI', imageUrl: null, unitInfo: null },
      ]),
    )

    mockFetch([], 0)
    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByText('Fancy Juice')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Find cheaper alternatives' }))

    await waitFor(() => {
      expect(screen.getByText('No cheaper alternatives found')).toBeInTheDocument()
    })
  })

  it('swapping a substitution updates the cart item name', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { id: 'orig_id', name: 'Expensive Brand', price: 100.0, quantity: 1, store: 'MENY', imageUrl: null, unitInfo: null },
      ]),
    )

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString()
      if (urlStr.includes('/stores')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response)
      }
      if (urlStr.includes('/substitutions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            suggestions: [
              {
                priceId: 'cheaper_id',
                name: 'Budget Brand',
                brand: null,
                imageUrl: null,
                unit: '1 kg',
                storeName: 'KIWI',
                price: 49.9,
                savingsAmount: 50.1,
                savingsPercentage: 50,
                reason: 'Same category, lower price',
              },
            ],
          }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [], page: 1, pageSize: 50, total: 0 }),
      } as Response)
    })

    render(<MarketplaceDashboardPage />)

    await waitFor(() => expect(screen.getByText('Expensive Brand')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Find cheaper alternatives' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Swap' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Swap' }))

    await waitFor(() => {
      expect(screen.getByText('Budget Brand')).toBeInTheDocument()
      expect(screen.queryByText('Expensive Brand')).not.toBeInTheDocument()
    })
  })

  // ── Store filter ────────────────────────────────────────────────────────────

  it('sends store param when a specific store is selected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString()
      if (urlStr.includes('/stores')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { code: 'MENY', name: 'MENY' },
            { code: 'KIWI', name: 'KIWI' },
          ],
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [], page: 1, pageSize: 50, total: 0 }),
      } as Response)
    })

    render(<MarketplaceDashboardPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('All stores')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'KIWI' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('All stores'), { target: { value: 'KIWI' } })

    await waitFor(() => {
      const storeFetch = fetchSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('store=KIWI'),
      )
      expect(storeFetch).toBeDefined()
    })
  })
})
