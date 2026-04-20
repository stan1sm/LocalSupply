import { test, expect } from '@playwright/test'
import { API, mockApi } from './helpers'

test.describe('supplier registration', () => {
  test('page loads with brreg lookup field', async ({ page }) => {
    await page.goto('/supplier/register')
    await expect(page.getByText(/organisation number/i)).toBeVisible()
  })

  test('brreg lookup shows verified state for active business', async ({ page }) => {
    await mockApi(page, 'GET', '/api/suppliers/verify/123456789', {
      ok: true,
      name: 'Test Farm AS',
      address: 'Storgata 1, Oslo',
      isActive: true,
      inBankruptcy: false,
      inLiquidation: false,
    })
    await page.goto('/supplier/register')
    await page.getByPlaceholder(/9.digit/i).fill('123456789')
    await page.getByRole('button', { name: /verify/i }).click()
    await expect(page.getByText(/Test Farm AS/i)).toBeVisible()
  })

  test('blocks registration when business is in bankruptcy', async ({ page }) => {
    await mockApi(page, 'GET', '/api/suppliers/verify/999999999', {
      ok: true,
      name: 'Bad Corp AS',
      isActive: false,
      inBankruptcy: true,
      inLiquidation: false,
    })
    await page.goto('/supplier/register')
    await page.getByPlaceholder(/9.digit/i).fill('999999999')
    await page.getByRole('button', { name: /verify/i }).click()
    await expect(page.getByText(/bankruptcy/i)).toBeVisible()
  })

  test('successful registration redirects to supplier dashboard', async ({ page }) => {
    await mockApi(page, 'POST', '/api/suppliers/register', {
      message: 'Supplier account created.',
      token: 'fake-supplier-token',
      supplier: { id: 'sup-1', businessName: 'Test Farm', email: 'farm@example.com', address: 'Oslo', isVerified: true },
    })
    await page.goto('/supplier/register')
    await page.getByPlaceholder(/business name/i).fill('Test Farm')
    await page.getByPlaceholder(/contact name|your name/i).fill('Ole Hansen')
    await page.getByPlaceholder(/phone/i).fill('12345678')
    await page.getByPlaceholder(/you@email.com|email/i).fill('farm@example.com')
    await page.getByPlaceholder(/address/i).fill('Storgata 1, Oslo')
    // password fields
    const pwFields = page.getByPlaceholder(/password/i)
    await pwFields.nth(0).fill('Abcd!1234')
    await pwFields.nth(1).fill('Abcd!1234')
    await page.getByRole('button', { name: /create.*account/i }).click()
    await expect(page).toHaveURL(/supplier\/dashboard|supplier$/)
  })
})

test.describe('supplier login', () => {
  test('shows error for wrong credentials', async ({ page }) => {
    await mockApi(page, 'POST', '/api/suppliers/login', { message: 'Invalid email or password.' }, 401)
    await page.goto('/supplier/login')
    await page.getByPlaceholder(/you@email.com|email/i).fill('wrong@example.com')
    await page.getByPlaceholder(/password/i).fill('wrongpass')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })

  test('successful login redirects to supplier dashboard', async ({ page }) => {
    await mockApi(page, 'POST', '/api/suppliers/login', {
      message: 'Signed in successfully.',
      token: 'fake-supplier-token',
      supplier: { id: 'sup-1', businessName: 'Test Farm', email: 'farm@example.com', address: 'Oslo', isVerified: true },
    })
    await page.goto('/supplier/login')
    await page.getByPlaceholder(/you@email.com|email/i).fill('farm@example.com')
    await page.getByPlaceholder(/password/i).fill('Abcd!1234')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/supplier/)
  })
})
