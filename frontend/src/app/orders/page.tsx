/**
 * @module routes/orders
 * Next.js route entry — renders BuyerOrdersPage.
 */

import BuyerOrdersPage from '../../features/pages/orders/BuyerOrdersPage'

/** Next.js page component — delegates rendering to BuyerOrdersPage. */
export default function Page() {
  return <BuyerOrdersPage />
}

