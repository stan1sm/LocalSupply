/**
 * @module routes/suppliers/[supplierId]
 * Next.js route entry — renders SupplierProductsPage for the given supplier ID.
 */

import SupplierProductsPage from '../../../features/pages/supplier/SupplierProductsPage'

/** Next.js page component — delegates rendering to SupplierProductsPage. */
export default function Page() {
  return <SupplierProductsPage />
}

