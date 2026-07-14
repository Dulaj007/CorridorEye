// One-shot database setup script.
// Run with `npm run db:setup`. It applies sql/schema.sql (creating tables
// if they do not already exist) and then inserts the three demo accounts
// with bcrypt-hashed passwords.
//
// This script is intentionally separate from lib/db.ts: it needs to load
// environment variables from .env.local before anything reads
// process.env.DATABASE_URL, and it runs once from the command line rather
// than inside a Next.js request.

import { config } from "dotenv";
import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config(); // falls back to a plain .env file if .env.local is absent

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
  );
}

const sql = neon(process.env.DATABASE_URL);

const SEED_USERS = [
  { username: "admin1", password: "admin123", role: "system" },
  { username: "veh1", password: "veh123", role: "vehicle" },
  { username: "veh2", password: "veh123", role: "vehicle" },
] as const;

async function applySchema() {
  const schemaPath = path.join(process.cwd(), "sql", "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");

  // The Neon HTTP driver executes one statement per call, so a multi
  // statement file has to be split and run sequentially. This is safe here
  // because none of our CREATE TABLE statements contain a literal
  // semicolon inside a string.
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await sql.query(statement);
  }

  console.log(`Applied ${statements.length} schema statements.`);
}

async function seedUsers() {
  for (const user of SEED_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);

    // ON CONFLICT makes this script safe to re-run: it will not create
    // duplicate users or fail if the seed accounts already exist.
    await sql.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [user.username, passwordHash, user.role]
    );
  }

  console.log(`Seeded ${SEED_USERS.length} users.`);
}

async function main() {
  await applySchema();
  await seedUsers();
  console.log("Database setup complete.");
}

main().catch((err) => {
  console.error("Database setup failed:", err);
  process.exit(1);
});
