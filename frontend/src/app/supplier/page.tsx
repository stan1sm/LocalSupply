/**
 * @module routes/supplier
 * Next.js route entry — renders SupplierOverviewPage.
 */

import SupplierOverviewPage from '../../features/pages/supplier/SupplierOverviewPage'

/** Next.js page component — delegates rendering to SupplierOverviewPage. */
export default function Page() {
  return <SupplierOverviewPage />
}

