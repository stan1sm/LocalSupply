/**
 * @module routes/reset-password
 * Next.js route entry — renders ResetPasswordPage wrapped in a Suspense boundary.
 */

import { Suspense } from 'react'
import ResetPasswordPage from '../../features/pages/auth/ResetPasswordPage'

/** Next.js page component — wraps ResetPasswordPage in a Suspense boundary to support useSearchParams. */
export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  )
}
