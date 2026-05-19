/**
 * @module routes/admin/login
 * Next.js route entry — renders AdminLoginPage.
 */

import AdminLoginPage from '../../../features/pages/admin/AdminLoginPage'

export const metadata = { title: 'Admin Login — LocalSupply' }

/** Next.js page component — delegates rendering to AdminLoginPage. */
export default function Page() {
  return <AdminLoginPage />
}
