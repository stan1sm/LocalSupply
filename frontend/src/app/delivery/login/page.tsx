/**
 * @module routes/delivery/login
 * Next.js route entry — renders DeliveryLoginPage wrapped in Suspense for useSearchParams.
 */

import { Suspense } from 'react'
import DeliveryLoginPage from '../../../features/pages/delivery/DeliveryLoginPage'

export default function Page() {
  return (
    <Suspense>
      <DeliveryLoginPage />
    </Suspense>
  )
}
