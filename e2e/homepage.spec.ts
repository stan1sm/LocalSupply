import { test, expect } from '@playwright/test'

test('homepage loads and shows key sections', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/LocalSupply/i)
  await expect(page.getByRole('heading', { name: /LocalSupply/i }).first()).toBeVisible()
})

test('homepage has links to login and register', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /register/i }).first()).toBeVisible()
})
