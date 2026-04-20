import { test, expect } from '@playwright/test'
import { mockApi, seedBuyerSession, seedSupplierSession } from './helpers'

const CONV_ID = 'conv-1'

const CONVERSATION = {
  id: CONV_ID,
  buyerId: 'buyer-1',
  supplierId: 'supplier-1',
  buyer: { id: 'buyer-1', firstName: 'Ava', lastName: 'Test', email: 'ava@example.com' },
  supplier: { id: 'supplier-1', businessName: 'Test Farm', email: 'farm@example.com' },
  messages: [{ content: 'Hello!', senderType: 'buyer', createdAt: new Date().toISOString() }],
  updatedAt: new Date().toISOString(),
}

test.describe('chat inbox - buyer', () => {
  test.beforeEach(async ({ page }) => {
    await seedBuyerSession(page)
  })

  test('shows conversations list', async ({ page }) => {
    await mockApi(page, 'GET', '/api/chat/conversations', [CONVERSATION])
    await page.goto('/chat')
    await expect(page.getByText(/Test Farm/i)).toBeVisible()
  })

  test('shows empty state when no conversations', async ({ page }) => {
    await mockApi(page, 'GET', '/api/chat/conversations', [])
    await page.goto('/chat')
    await expect(page.getByText(/no conversations yet/i)).toBeVisible()
  })

  test('shows last message preview', async ({ page }) => {
    await mockApi(page, 'GET', '/api/chat/conversations', [CONVERSATION])
    await page.goto('/chat')
    await expect(page.getByText('Hello!')).toBeVisible()
  })
})

test.describe('chat inbox - supplier', () => {
  test.beforeEach(async ({ page }) => {
    await seedSupplierSession(page)
  })

  test('shows conversations as supplier', async ({ page }) => {
    const supplierConv = {
      ...CONVERSATION,
      messages: [{ content: 'Do you have tomatoes?', senderType: 'buyer', createdAt: new Date().toISOString() }],
    }
    await mockApi(page, 'GET', '/api/chat/conversations', [supplierConv])
    await page.goto('/chat')
    await expect(page.getByText(/Ava Test/i)).toBeVisible()
  })
})

test.describe('chat conversation', () => {
  test.beforeEach(async ({ page }) => {
    await seedBuyerSession(page)
  })

  test('loads conversation messages', async ({ page }) => {
    await mockApi(page, 'GET', `/api/chat/conversations/${CONV_ID}`, {
      id: CONV_ID,
      buyerId: 'buyer-1',
      supplierId: 'supplier-1',
      buyer: { id: 'buyer-1', firstName: 'Ava', lastName: 'Test', email: 'ava@example.com' },
      supplier: { id: 'supplier-1', businessName: 'Test Farm', email: 'farm@example.com' },
    })
    await mockApi(page, 'GET', `/api/chat/conversations/${CONV_ID}/messages`, [
      { id: 'msg-1', conversationId: CONV_ID, senderType: 'buyer', senderId: 'buyer-1', content: 'Hello!', createdAt: new Date().toISOString() },
    ])
    await page.goto(`/chat/${CONV_ID}`)
    await expect(page.getByText('Hello!')).toBeVisible()
  })

  test('can type and send a message', async ({ page }) => {
    await mockApi(page, 'GET', `/api/chat/conversations/${CONV_ID}`, {
      id: CONV_ID,
      buyerId: 'buyer-1',
      supplierId: 'supplier-1',
      buyer: { id: 'buyer-1', firstName: 'Ava', lastName: 'Test', email: 'ava@example.com' },
      supplier: { id: 'supplier-1', businessName: 'Test Farm', email: 'farm@example.com' },
    })
    await mockApi(page, 'GET', `/api/chat/conversations/${CONV_ID}/messages`, [])
    await mockApi(page, 'POST', `/api/chat/conversations/${CONV_ID}/messages`, {
      id: 'msg-2', conversationId: CONV_ID, senderType: 'buyer', senderId: 'buyer-1', content: 'Do you have eggs?', createdAt: new Date().toISOString(),
    })
    await page.goto(`/chat/${CONV_ID}`)
    await page.getByPlaceholder(/type a message/i).fill('Do you have eggs?')
    await page.getByRole('button', { name: /send/i }).click()
    await expect(page.getByText('Do you have eggs?')).toBeVisible()
  })

  test('shows error when not signed in', async ({ page }) => {
    await page.goto('/chat')
    await expect(page.getByText(/sign in/i)).toBeVisible()
  })
})
