import { redirect } from "next/navigation";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";

export default async function Home() {
  const session = await getSessionViewFromServerCookies();
  if (session.authenticated) {
    redirect("/anual");
  }

  redirect("/auth/login?next=/anual");
}
