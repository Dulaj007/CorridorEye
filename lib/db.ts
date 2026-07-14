import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// The Neon serverless driver talks to Postgres over HTTP instead of a
// persistent TCP connection. That makes it a good fit for Vercel's
// serverless functions, which are short-lived and would otherwise exhaust
// a normal connection pool.
//
// `sql` is a tagged-template function: call it as sql`SELECT * FROM users
// WHERE id = ${id}`. Values passed this way are parameterized automatically,
// so this is safe against SQL injection as long as you always use the
// template literal form and never build query strings by concatenation.

type SqlClient = NeonQueryFunction<false, false>;

let client: SqlClient | undefined;

function getClient(): SqlClient {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

// neon() reads and validates DATABASE_URL as soon as it's called, so
// creating the client used to happen at module-import time. That broke
// Vercel's build step: Next.js imports every API route file during its
// "collecting page data" step just to statically analyze it, with no
// DATABASE_URL available in that build environment, which crashed the
// entire build instead of only the requests that actually touch the
// database. Routing every call through this Proxy defers both the env var
// check and the neon() call to the first real query, at request time.
export const sql: SqlClient = new Proxy((() => {}) as unknown as SqlClient, {
  apply(_target, _thisArg, args) {
    const fn = getClient() as unknown as (...a: unknown[]) => unknown;
    return fn(...args);
  },
  get(_target, prop) {
    const value = (getClient() as unknown as Record<PropertyKey, unknown>)[
      prop
    ];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
