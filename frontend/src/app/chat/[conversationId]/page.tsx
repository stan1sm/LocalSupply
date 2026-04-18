import ChatConversationPage from '../../../features/pages/chat/ChatConversationPage'

export default async function Page({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  return <ChatConversationPage conversationId={conversationId} />
}
