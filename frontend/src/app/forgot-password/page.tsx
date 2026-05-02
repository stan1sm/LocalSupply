/**
 * @module routes/forgot-password
 * Next.js route entry — renders ForgotPasswordPage.
 */

import ForgotPasswordPage from '../../features/pages/auth/ForgotPasswordPage'

/** Next.js page component — delegates rendering to ForgotPasswordPage. */
export default function Page() {
  return <ForgotPasswordPage />
}
