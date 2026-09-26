import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 啟用 React Compiler — 自動優化元件渲染
  // Enable React Compiler — automatically optimizes component rendering
  reactCompiler: true,

  // Docker 部署需要 standalone 輸出模式
  // Docker deployment requires standalone output mode
  output: 'standalone',

  // 將 ADMIN_EMAIL 內聯到客戶端 bundle（game 頁面 checkAdmin 在瀏覽器比對管理員身份）
  // Inline ADMIN_EMAIL into the client bundle (game page checkAdmin compares admin identity in the browser)
  env: {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  },
};

export default nextConfig;
