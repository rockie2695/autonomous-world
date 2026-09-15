// ============================================================================
// Prisma Configuration
// ============================================================================
// Prisma 7+ requires datasource configuration in this file instead of
// schema.prisma. The url is read from the DATABASE_URL environment variable.
// ============================================================================

import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
});
