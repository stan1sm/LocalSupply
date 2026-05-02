/**
 * @module routes/
 * Next.js route entry — renders HomePage.
 */

import HomePage from '../features/pages/home/HomePage'

/** Next.js page component — delegates rendering to HomePage. */
export default function Page() {
  return <HomePage />
}
