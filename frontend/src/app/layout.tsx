/**
 * @module routes/layout
 * Root layout for the Next.js App Router — sets global metadata, favicon assets, and the HTML shell.
 */

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import CookieConsentBanner from '../features/components/CookieConsentBanner'
import { Manrope } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
})

/**
 * Global metadata applied to all routes.
 * Includes page title, description, and multi-resolution favicon assets.
 */
export const metadata: Metadata = {
  title: 'LocalSupply',
  description: 'LocalSupply marketplace',
  icons: {
    icon: [
      { url: '/icons/localsupply-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/localsupply-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/localsupply-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/localsupply-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: { url: '/icons/localsupply-180.png', sizes: '180x180', type: 'image/png' },
  },
}

/**
 * Root layout component wrapping all pages in an HTML document with a single `<body>`.
 * @param children - The active page content rendered inside the body.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  )
}
