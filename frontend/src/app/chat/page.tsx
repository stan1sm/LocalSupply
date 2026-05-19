/**
 * @module routes/chat
 * Next.js route entry — renders ChatConversationPage when a supplierId query param is present, otherwise ChatInboxPage.
 */

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

/** Next.js page component — wraps ChatPageInner in a Suspense boundary to support useSearchParams. */
export default function Page() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  )
}
