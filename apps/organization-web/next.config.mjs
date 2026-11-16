/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:18000";
    const rules = [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];

    if (process.env.ENABLE_SUPER_ADMIN === "true") {
      const controlUrl =
        process.env.NEXT_PUBLIC_CONTROL_BASE_URL || "http://127.0.0.1:18001";
      rules.push({
        source: "/control/:path*",
        destination: `${controlUrl}/control/:path*`,
      });
    }

    return rules;
  },
};

export default nextConfig;
