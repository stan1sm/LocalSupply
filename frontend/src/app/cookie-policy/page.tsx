/**
 * @module routes/cookie-policy
 * Next.js route entry — renders CookiePolicyPage.
 */

import CookiePolicyPage from '../../features/pages/legal/CookiePolicyPage'

export const metadata = { title: 'Cookie Policy — LocalSupply' }

/** Next.js page component — delegates rendering to CookiePolicyPage. */
export default function Page() {
  return <CookiePolicyPage />
}
