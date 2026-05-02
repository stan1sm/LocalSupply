/**
 * @module routes/register
 * Next.js route entry — renders RegisterPage.
 */

import RegisterPage from '../../features/pages/auth/RegisterPage'

/** Next.js page component — delegates rendering to RegisterPage. */
export default function Page() {
  return <RegisterPage />
}
