import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  // 静态导出不支持 headers 配置，这些 headers 需要在 Electron 主进程中配置
};

export default nextConfig;