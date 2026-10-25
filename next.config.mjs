/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // cheerio は Route Handler（サーバー側）だけで使う
  experimental: { serverComponentsExternalPackages: ['cheerio'] },
};

export default nextConfig;
