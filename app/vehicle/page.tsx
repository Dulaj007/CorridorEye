import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import VehicleTracker from "@/components/VehicleTracker";

export default async function VehiclePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // Middleware already keeps non-vehicle users out of this route. This
  // check only covers the case where the page is rendered without going
  // through middleware first, and keeps the page safe to reason about on
  // its own.
  if (!session || session.role !== "vehicle") {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-neutral-950 px-4 py-12 text-white">
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <span>
          Logged in as{" "}
          <span className="font-semibold text-neutral-200">
            {session.username}
          </span>
        </span>
        <LogoutButton />
      </div>

      <VehicleTracker />
    </main>
  );
}
