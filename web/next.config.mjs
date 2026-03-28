/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET ?? "http://api:3000"

    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/:path*`,
      },
    ]
  },
}

export default nextConfig
