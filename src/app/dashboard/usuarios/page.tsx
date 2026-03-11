import { redirect } from "next/navigation";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";

export default async function DashboardUsersPage() {
  const session = await getSessionViewFromServerCookies();
  if (!session.authenticated) {
    redirect("/auth/login?next=/dashboard");
  }

  if (session.user?.role !== "ADMIN") {
    redirect("/anual");
  }

  redirect("/dashboard");
}
