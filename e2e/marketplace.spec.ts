import { test, expect } from '@playwright/test'
import { mockApi, seedBuyerSession } from './helpers'

const PRODUCTS = [
  { id: 'p1', name: 'Økologisk melk', brand: 'TINE', category: 'dairy', price: 22.9, priceText: '22.90 kr', store: 'Meny', imageUrl: null, source: 'catalog', unitInfo: '1L', description: null, ean: null, url: null },
  { id: 'p2', name: 'Norvegia ost', brand: 'Tine', category: 'dairy', price: 49.9, priceText: '49.90 kr', store: 'Spar', imageUrl: null, source: 'catalog', unitInfo: '400g', description: null, ean: null, url: null },
]

test.describe('marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await seedBuyerSession(page)
  })

  test('shows search-first prompt when no category or query', async ({ page }) => {
    await page.goto('/marketplace/dashboard')
    await expect(page.getByText(/search or choose a category/i)).toBeVisible()
  })

  test('shows products after selecting a category', async ({ page }) => {
    await mockApi(page, 'GET', '/api/products/stores', [])
    await page.route('**/api/products**', (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: PRODUCTS, total: 2 }),
      })
    })
    await page.goto('/marketplace/dashboard')
    await page.getByRole('button', { name: /dairy/i }).click()
    await expect(page.getByText('Økologisk melk')).toBeVisible()
    await expect(page.getByText('Norvegia ost')).toBeVisible()
  })

  test('add to cart increments cart count', async ({ page }) => {
    await mockApi(page, 'GET', '/api/products/stores', [])
    await page.route('**/api/products**', (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: PRODUCTS, total: 2 }),
      })
    })
    await page.goto('/marketplace/dashboard')
    await page.getByRole('button', { name: /dairy/i }).click()
    await page.getByRole('button', { name: /add to cart/i }).first().click()
    await expect(page.getByText(/1 items in cart/i)).toBeVisible()
  })

  test('shows navigation sidebar with all key links', async ({ page }) => {
    await page.goto('/marketplace/dashboard')
    await expect(page.getByRole('link', { name: /marketplace/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /suppliers/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /chats/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /orders/i })).toBeVisible()
  })

  test('shows empty state when no products match search', async ({ page }) => {
    await mockApi(page, 'GET', '/api/products/stores', [])
    await page.route('**/api/products**', (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      })
    })
    await page.goto('/marketplace/dashboard')
    await page.getByPlaceholder(/search/i).fill('xyzxyzxyz')
    await expect(page.getByText(/no products matched/i)).toBeVisible()
  })
})
