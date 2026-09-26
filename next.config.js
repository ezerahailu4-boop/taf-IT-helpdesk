/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Telegram Mini Apps must be framed inside Telegram
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors https://web.telegram.org https://k.web.telegram.org https://z.web.telegram.org;" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
