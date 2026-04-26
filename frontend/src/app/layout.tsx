import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
