import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    devtoolSegmentExplorer: false,
  },
  outputFileTracingRoot: path.join(process.cwd(), '..'),
}

export default nextConfig
