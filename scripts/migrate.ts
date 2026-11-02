import "dotenv/config";
import { closeDb, db, dbDriver } from "@/lib/db/client";

// Applies drizzle/ SQL migrations to DATABASE_URL, or to embedded PGlite when DATABASE_URL is empty.
// (The app also does this lazily on first request; this script is for CI / explicit setup.)
async function main() {
  await db();
  console.log(`✓ migrations applied (${await dbDriver()})`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
