# ============================================================================
# Dockerfile — 自治世界 / Autonomous World
# ============================================================================
# 多階段建置，優化映像大小。
# Multi-stage build to optimize image size.
# ============================================================================

# ─── 階段 1：依賴安裝 / Stage 1: Dependencies ────────────────────────────────

FROM node:20-alpine AS deps

# 安裝 pnpm / Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 複製套件管理檔案 / Copy package manager files
COPY package.json pnpm-lock.yaml ./

# 安裝依賴 / Install dependencies
RUN pnpm install --frozen-lockfile

# ─── 階段 2：建置 / Stage 2: Build ──────────────────────────────────────────

FROM node:20-alpine AS builder

# 安裝 pnpm / Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 複製依賴 / Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# 複製原始碼 / Copy source code
COPY . .

# 產生 Prisma Client / Generate Prisma Client
RUN npx prisma generate

# 建置應用程式 / Build application
RUN pnpm build

# ─── 階段 3：執行 / Stage 3: Run ────────────────────────────────────────────

FROM node:20-alpine AS runner

# 安裝 pnpm / Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 設定生產環境 / Set production environment
ENV NODE_ENV=production

# 建立非 root 使用者 / Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 複製建置產物 / Copy build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 複製 Prisma 產物 / Copy Prisma artifacts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# 設定所有權 / Set ownership
RUN chown -R nextjs:nodejs /app

# 切換到非 root 使用家目錄 / Switch to non-root user home directory
USER nextjs

# 暴露埠 / Expose port
EXPOSE 3000

# 設定環境變數 / Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 啟動應用程式 / Start application
CMD ["node", "server.js"]
