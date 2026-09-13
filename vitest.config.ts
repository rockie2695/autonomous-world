import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 測試環境設定 / Test environment configuration
    environment: 'node',
    
    // 全域設定檔案 / Global setup file
    globals: true,
    
    // 包含的測試檔案模式 / Test file patterns to include
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', '__tests__/**/*.test.ts'],
    
    // 排除的檔案 / Files to exclude
    exclude: ['node_modules', '.next', 'dist'],
    
    // 覆蓋率設定 / Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'server/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'server/**/*.test.ts', '**/*.d.ts'],
    },
    
    // 測試超時時間 / Test timeout
    testTimeout: 10000,
    
    // 模組解析 / Module resolution
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // 路徑解析設定 / Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
