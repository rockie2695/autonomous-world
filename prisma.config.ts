// ============================================================================
// Prisma Configuration
// ============================================================================
// Prisma 7+ requires datasource configuration in this file instead of
// schema.prisma. The url is read from the DATABASE_URL environment variable.
// ============================================================================

import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
});
