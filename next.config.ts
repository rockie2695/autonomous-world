import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 啟用 React Compiler — 自動優化元件渲染
  // Enable React Compiler — automatically optimizes component rendering
  reactCompiler: true,

  // Docker 部署需要 standalone 輸出模式
  // Docker deployment requires standalone output mode
  output: 'standalone',
};

export default nextConfig;
