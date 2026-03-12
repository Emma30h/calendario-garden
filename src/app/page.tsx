import { redirect } from "next/navigation";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";

export default async function Home() {
  const session = await getSessionViewFromServerCookies();
  if (session.authenticated && session.user?.role === "ADMIN") {
    redirect("/anual");
  }

  if (session.authenticated && session.user?.role === "CLIENTE") {
    redirect("/api/auth/logout?next=/auth/login?next=/anual");
  }

  redirect("/auth/login?next=/anual");
}
