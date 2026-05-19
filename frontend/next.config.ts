import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    devtoolSegmentExplorer: false,
  },
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

export default nextConfig
