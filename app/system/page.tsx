import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import SystemDashboard from "@/components/SystemDashboard";

export default async function SystemPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // Middleware already keeps non-system users out of this route. This
  // check only covers the case where the page is rendered without going
  // through middleware first, and keeps the page safe to reason about on
  // its own.
  if (!session || session.role !== "system") {
    redirect("/");
  }

  return <SystemDashboard username={session.username} />;
}
