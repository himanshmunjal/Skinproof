import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Only used for `npm run db:generate` (SQL migration generation). Migrations are applied by scripts/migrate.ts,
// which works for both postgres-js and embedded PGlite.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
