import { test, expect } from '@playwright/test'
import { mockApi, seedSupplierSession } from './helpers'

const SUPPLIER_ID = 'supplier-1'

test.describe('supplier dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await seedSupplierSession(page)
  })

  test('overview loads with business name', async ({ page }) => {
    await mockApi(page, 'GET', `/api/orders/supplier/${SUPPLIER_ID}`, [])
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}/products`, [])
    await page.goto('/supplier')
    await expect(page.getByText(/Test Farm/i)).toBeVisible()
  })

  test('navigation always shows store settings link', async ({ page }) => {
    await mockApi(page, 'GET', `/api/orders/supplier/${SUPPLIER_ID}`, [])
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}/products`, [])
    await page.goto('/supplier')
    await expect(page.getByRole('link', { name: /store settings/i })).toBeVisible()
  })

  test('navigation shows chats link', async ({ page }) => {
    await mockApi(page, 'GET', `/api/orders/supplier/${SUPPLIER_ID}`, [])
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}/products`, [])
    await page.goto('/supplier')
    await expect(page.getByRole('link', { name: /chats/i })).toBeVisible()
  })

  test('add product form appears on products page', async ({ page }) => {
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}/products`, [])
    await page.goto('/supplier/products')
    await expect(page.getByRole('heading', { name: /add.*product|new product/i })).toBeVisible()
  })

  test('add product shows validation for missing fields', async ({ page }) => {
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}/products`, [])
    await page.goto('/supplier/products')
    await page.getByRole('button', { name: /add product|save product/i }).first().click()
    await expect(page.getByText(/required|enter a/i).first()).toBeVisible()
  })

  test('products page lists existing products', async ({ page }) => {
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}/products`, [
      { id: 'prod-1', name: 'Fresh Tomatoes', description: 'Locally grown', unit: 'per kg', price: 35, stockQty: 100, isActive: true },
    ])
    await page.goto('/supplier/products')
    await expect(page.getByText(/Fresh Tomatoes/i)).toBeVisible()
  })

  test('orders page shows empty state when no orders', async ({ page }) => {
    await mockApi(page, 'GET', `/api/orders/supplier/${SUPPLIER_ID}`, [])
    await page.goto('/supplier/orders')
    await expect(page.getByText(/no orders|no incoming/i)).toBeVisible()
  })

  test('store settings page loads', async ({ page }) => {
    await mockApi(page, 'GET', `/api/suppliers/${SUPPLIER_ID}`, {
      id: SUPPLIER_ID,
      businessName: 'Test Farm',
      contactName: 'Ole Hansen',
      email: 'farm@example.com',
      address: 'Oslo',
      phone: '12345678',
      tagline: null,
      openingHours: null,
    })
    await page.goto('/supplier/settings')
    await expect(page.getByText(/business name|store settings/i)).toBeVisible()
  })
})
