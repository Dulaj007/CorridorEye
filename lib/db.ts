import { neon } from "@neondatabase/serverless";

// The Neon serverless driver talks to Postgres over HTTP instead of a
// persistent TCP connection. That makes it a good fit for Vercel's
// serverless functions, which are short-lived and would otherwise exhaust
// a normal connection pool.
//
// `sql` is a tagged-template function: call it as sql`SELECT * FROM users
// WHERE id = ${id}`. Values passed this way are parameterized automatically,
// so this is safe against SQL injection as long as you always use the
// template literal form and never build query strings by concatenation.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const sql = neon(process.env.DATABASE_URL);
