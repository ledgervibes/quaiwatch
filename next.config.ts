import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export → Cloudflare Pages (nol compute, gratis permanen)
  output: "export",
  images: {
    // static export gak support Image Optimization server-side
    unoptimized: true,
  },
  // trailingSlash bikin routing static lebih aman di Pages
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
