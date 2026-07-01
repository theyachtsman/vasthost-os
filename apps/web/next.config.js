/** @type {import('next').NextConfig} */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://api:8000';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@vasthost/ui', '@vasthost/shared-types'],
  // Same-origin proxy: the client only ever calls /api/... — never a hardcoded
  // host. This is what makes the dashboard work from any LAN browser.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
