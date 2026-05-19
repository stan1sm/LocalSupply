/**
 * @module routes/about
 * Next.js route entry — renders AboutPage.
 */

import AboutPage from '../../features/pages/legal/AboutPage'

export const metadata = { title: 'About — LocalSupply' }

/** Next.js page component — delegates rendering to AboutPage. */
export default function Page() {
  return <AboutPage />
}
