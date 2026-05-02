/**
 * @module routes/login
 * Next.js route entry — renders LoginPage.
 */

import LoginPage from '../../features/pages/auth/LoginPage'

/** Next.js page component — delegates rendering to LoginPage. */
export default function Page() {
  return <LoginPage />
}
