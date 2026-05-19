/**
 * @module routes/privacy-policy
 * Next.js route entry — renders PrivacyPolicyPage.
 */

import PrivacyPolicyPage from '../../features/pages/legal/PrivacyPolicyPage'

export const metadata = { title: 'Privacy Policy — LocalSupply' }

/** Next.js page component — delegates rendering to PrivacyPolicyPage. */
export default function Page() {
  return <PrivacyPolicyPage />
}
