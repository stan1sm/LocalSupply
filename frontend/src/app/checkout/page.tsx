/**
 * @module routes/checkout
 * Next.js route entry — renders CheckoutPage.
 */

import CheckoutPage from '../../features/pages/checkout/CheckoutPage'

/** Next.js page component — delegates rendering to CheckoutPage. */
export default function Page() {
  return <CheckoutPage />
}
