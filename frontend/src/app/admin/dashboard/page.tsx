/**
 * @module routes/admin/dashboard
 * Next.js route entry — renders AdminDashboardPage.
 */

import AdminDashboardPage from '../../../features/pages/admin/AdminDashboardPage'

export const metadata = { title: 'Admin Dashboard — LocalSupply' }

/** Next.js page component — delegates rendering to AdminDashboardPage. */
export default function Page() {
  return <AdminDashboardPage />
}
