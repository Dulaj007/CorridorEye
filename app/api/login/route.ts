import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByUsername } from "@/lib/users";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role;

  if (!username || !password || (role !== "system" && role !== "vehicle")) {
    return NextResponse.json(
      { error: "Username, password, and account type are required." },
      { status: 400 }
    );
  }

  const user = await findUserByUsername(username);

  // The same generic message is used whether the username does not exist
  // or the password is wrong. Returning different messages for each case
  // would let a caller work out which usernames are valid by testing
  // random passwords against them.
  const invalidCredentialsResponse = NextResponse.json(
    { error: "Invalid username or password." },
    { status: 401 }
  );

  if (!user) {
    return invalidCredentialsResponse;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return invalidCredentialsResponse;
  }

  if (user.role !== role) {
    return NextResponse.json(
      { error: `This account is registered as "${user.role}", not "${role}".` },
      { status: 401 }
    );
  }

  const token = await signSession({
    sub: String(user.id),
    username: user.username,
    role: user.role,
  });

  const response = NextResponse.json({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days, matches the JWT expiry in lib/auth.ts
  });

  return response;
}
