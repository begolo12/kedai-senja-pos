import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "../src/lib/db";
import { ensureCoreAccounts, seedIfEmpty } from "../src/lib/db/seed";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("Skipping prod migration: DATABASE_URL is not set.");
    return;
  }
  console.log("Running Drizzle migrations…");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedIfEmpty(db);
  await ensureCoreAccounts(db);
  console.log("Migrations complete.");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await closeDb();
  process.exit(1);
});
