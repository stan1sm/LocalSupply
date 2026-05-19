/**
 * @module routes/settings
 * Next.js route entry — renders BuyerSettingsPage.
 */

import BuyerSettingsPage from '../../features/pages/settings/BuyerSettingsPage'

/** Next.js page component — delegates rendering to BuyerSettingsPage. */
export default function Page() {
  return <BuyerSettingsPage />
}
