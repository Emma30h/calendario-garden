import { redirect } from "next/navigation";
import ClientAccessLinkManager from "@/components/ClientAccessLinkManager";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import UserNavbar from "@/components/UserNavbar";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";

export default async function DashboardClientAccessPage() {
  const session = await getSessionViewFromServerCookies();
  if (!session.authenticated) {
    redirect("/auth/login?next=/dashboard/acceso-cliente");
  }

  if (session.user?.role !== "ADMIN") {
    redirect("/anual");
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="gc-panel relative z-40 !overflow-visible !p-6 sm:!p-8">
          <div className="relative z-[150] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBreadcrumb
                items={[
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Acceso cliente" },
                ]}
                className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
              />
              <h1 className="mt-2 text-3xl font-bold text-slate-100 sm:text-4xl">
                Acceso cliente
              </h1>
              <div className="gc-divider-gold mt-2" />
              <p className="mt-2 text-sm text-slate-300/90">
                Comparte el link y QR fijo para ingreso con permisos limitados.
              </p>
            </div>

            <div className="order-first flex flex-wrap items-center gap-2 self-end sm:order-none sm:self-auto">
              <UserNavbar
                className="z-[170]"
                email={session.user?.email}
                role={session.user?.role}
                firstName={session.user?.firstName}
                lastName={session.user?.lastName}
                hierarchy={session.user?.hierarchy}
                personalType={session.user?.personalType}
                showInlineIdentity
              />
            </div>
          </div>
        </header>

        <ClientAccessLinkManager />
      </div>
    </main>
  );
}

