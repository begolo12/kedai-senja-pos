import { Pool } from "pg";

async function main() {
  if (process.env.CONFIRM_RESET !== "YES") {
    throw new Error("Set CONFIRM_RESET=YES untuk menghapus seluruh data.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL wajib.");

  const needsSsl =
    /sslmode=require/.test(connectionString) || /neon\.tech/.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query("drop schema if exists drizzle cascade");
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await pool.end();
  console.log("Database schemas reset.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
