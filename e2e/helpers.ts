import type { Page } from '@playwright/test'

export const API = 'http://localhost:3001'

export async function mockApi(
  page: Page,
  method: string,
  path: string,
  body: unknown,
  status = 200,
) {
  await page.route(`${API}${path}`, (route) => {
    if (route.request().method() !== method) return route.continue()
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

// Seed localStorage with a buyer session so auth-gated pages load
export async function seedBuyerSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('localsupply-token', 'fake-buyer-token')
    localStorage.setItem(
      'localsupply-user',
      JSON.stringify({ id: 'buyer-1', firstName: 'Ava', lastName: 'Test', email: 'ava@example.com' }),
    )
  })
}

// Seed localStorage with a supplier session
export async function seedSupplierSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('localsupply-supplier-token', 'fake-supplier-token')
    localStorage.setItem(
      'localsupply-supplier',
      JSON.stringify({ id: 'supplier-1', businessName: 'Test Farm', email: 'farm@example.com', address: 'Oslo' }),
    )
  })
}
