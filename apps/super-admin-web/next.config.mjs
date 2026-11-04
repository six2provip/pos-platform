/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const controlUrl = process.env.NEXT_PUBLIC_CONTROL_BASE_URL || "http://127.0.0.1:18001";
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:18000";
    return [
      {
        source: "/control/:path*",
        destination: `${controlUrl}/control/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

