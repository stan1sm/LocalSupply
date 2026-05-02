/**
 * @module routes/cart
 * Next.js route entry — renders MyCartPage.
 */

import MyCartPage from '../../features/pages/cart/MyCartPage'

/** Next.js page component — delegates rendering to MyCartPage. */
export default function Page() {
  return <MyCartPage />
}
