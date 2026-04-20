import { test, expect } from '@playwright/test'
import { API, mockApi } from './helpers'

test.describe('buyer registration', () => {
  test('shows validation errors for empty submit', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/required|enter your/i).first()).toBeVisible()
  })

  test('shows password checklist as user types', async ({ page }) => {
    await page.goto('/register')
    await page.getByPlaceholder(/create a strong password/i).fill('abc')
    // weak password — at least one requirement should show as unmet
    await expect(page.getByText(/characters/i).first()).toBeVisible()
  })

  test('shows mismatch error when passwords differ', async ({ page }) => {
    await page.goto('/register')
    await page.getByPlaceholder(/create a strong password/i).fill('Abcd!1234')
    await page.getByPlaceholder(/repeat your password/i).fill('Different1!')
    await expect(page.getByText(/passwords don't match/i)).toBeVisible()
  })

  test('successful registration redirects to check-email', async ({ page }) => {
    await mockApi(page, 'POST', '/api/auth/register', {
      message: 'Account created. Check your email.',
      deliveryMode: 'sent',
    })
    await page.goto('/register')
    await page.getByPlaceholder(/first name/i).fill('Ava')
    await page.getByPlaceholder(/last name/i).fill('Test')
    await page.getByPlaceholder(/you@email.com/i).fill('ava@example.com')
    await page.getByPlaceholder(/create a strong password/i).fill('Abcd!1234')
    await page.getByPlaceholder(/repeat your password/i).fill('Abcd!1234')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page).toHaveURL(/check-email/)
  })
})

test.describe('buyer login', () => {
  test('shows error for wrong credentials', async ({ page }) => {
    await mockApi(page, 'POST', '/api/auth/login', { message: 'Invalid email or password.' }, 401)
    await page.goto('/login')
    await page.getByPlaceholder(/you@email.com/i).fill('wrong@example.com')
    await page.getByPlaceholder(/enter your password/i).fill('wrongpass')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })

  test('redirects unverified users to email-not-verified page', async ({ page }) => {
    await mockApi(page, 'POST', '/api/auth/login', {
      message: 'Please verify your email before signing in.',
      email: 'ava@example.com',
    }, 403)
    await page.goto('/login')
    await page.getByPlaceholder(/you@email.com/i).fill('ava@example.com')
    await page.getByPlaceholder(/enter your password/i).fill('Abcd!1234')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/email-not-verified/)
  })

  test('successful login redirects to marketplace', async ({ page }) => {
    await mockApi(page, 'POST', '/api/auth/login', {
      message: 'Signed in successfully.',
      token: 'fake-token',
      user: { id: 'user-1', firstName: 'Ava', lastName: 'Test', email: 'ava@example.com' },
    })
    await page.goto('/login')
    await page.getByPlaceholder(/you@email.com/i).fill('ava@example.com')
    await page.getByPlaceholder(/enter your password/i).fill('Abcd!1234')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/marketplace\/dashboard/)
  })
})

test.describe('forgot password', () => {
  test('shows success state after submitting email', async ({ page }) => {
    await mockApi(page, 'POST', '/api/auth/forgot-password', { message: 'Reset link sent.' })
    await page.goto('/forgot-password')
    await page.getByPlaceholder(/you@email.com/i).fill('ava@example.com')
    await page.getByRole('button', { name: /send reset link/i }).click()
    await expect(page.getByText(/reset link sent|check your inbox/i)).toBeVisible()
  })
})
