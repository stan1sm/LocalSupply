/**
 * @module routes/chat/[conversationId]
 * Next.js route entry — resolves the dynamic conversationId param and renders ChatConversationPage.
 */

import ChatConversationPage from '../../../features/pages/chat/ChatConversationPage'

/**
 * Next.js page component — resolves the conversationId route segment and delegates to ChatConversationPage.
 * @param params - Promise resolving to the dynamic route params containing conversationId.
 */
export default async function Page({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  return <ChatConversationPage conversationId={conversationId} />
}
