import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "../src/lib/db";
import { seedIfEmpty } from "../src/lib/db/seed";

async function main() {
  const target = process.env.DATABASE_URL ? "DATABASE_URL" : "local PGlite";
  console.log(`Migrating ${target}…`);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedIfEmpty(db);
  console.log("Database ready.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
