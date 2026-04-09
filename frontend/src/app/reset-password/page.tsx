import { Suspense } from 'react'
import ResetPasswordPage from '../../features/pages/auth/ResetPasswordPage'

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  )
}
