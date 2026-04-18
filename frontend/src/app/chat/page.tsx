'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import ChatInboxPage from '../../features/pages/chat/ChatInboxPage'
import ChatConversationPage from '../../features/pages/chat/ChatConversationPage'

function ChatPageInner() {
  const searchParams = useSearchParams()
  const supplierId = searchParams?.get('supplierId') ?? ''

  if (supplierId) {
    return <ChatConversationPage supplierId={supplierId} />
  }

  return <ChatInboxPage />
}

export default function Page() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  )
}
