import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// The session token is a signed JWT stored in an httpOnly cookie. "Signed"
// means anyone can read its contents if they get the cookie, but nobody can
// forge or alter one without JWT_SECRET, because verifySession checks the
// signature. It is not encrypted, so never put a password or anything
// secret in the payload -- only the id, username, and role, which are not
// sensitive.
//
// jose is used instead of the more common jsonwebtoken package because
// Next.js middleware runs on the Edge runtime, which does not have Node's
// crypto/Buffer APIs that jsonwebtoken depends on. jose works in both the
// Edge runtime (middleware) and the normal Node runtime (API routes), so
// one library covers both places a session token needs to be handled.

export type SessionRole = "system" | "vehicle";

export interface SessionPayload {
  sub: string; // user id, as a string (JWT convention for the "subject" claim)
  username: string;
  role: SessionRole;
}

export const SESSION_COOKIE_NAME = "corridoreye_session";
const SESSION_DURATION = "7d";

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

// Returns null for any invalid, expired, or tampered token instead of
// throwing, so callers (middleware, API routes) can treat "no valid
// session" as a single, simple case.
export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());

    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "system" && payload.role !== "vehicle")
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

// Every API route that requires a logged-in user reads the same cookie and
// verifies it the same way, so that logic lives here once instead of being
// copied into each route.ts file.
export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySession(token) : null;
}
