import Link from "next/link";
import { redirect } from "next/navigation";
import AnnualBirthdaysSettings from "@/components/AnnualBirthdaysSettings";
import AdminUsersManager from "@/components/AdminUsersManager";
import ChangePasswordSection from "@/components/ChangePasswordSection";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import UserNavbar from "@/components/UserNavbar";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";

export default async function DashboardPage() {
  const session = await getSessionViewFromServerCookies();

  if (!session.authenticated) {
    redirect("/auth/login?next=/dashboard");
  }

  if (session.user?.role === "CLIENTE") {
    redirect("/anual");
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="relative z-30 rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -bottom-28 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBreadcrumb
                items={[
                  { label: "Calendario anual", href: "/anual" },
                  { label: "Dashboard" },
                ]}
                className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
              />
              <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-200/85">
                Accesos de gestion para cargar eventos, revisar personal y administrar e-mails.
              </p>
            </div>

            <div className="order-first z-50 flex flex-wrap items-center gap-2 self-end sm:order-none sm:self-auto">
              <UserNavbar
                className="z-50"
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

        <section className="rounded-3xl border border-white/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.62)_0%,rgba(15,23,42,0.38)_100%)] p-6 shadow-[0_18px_36px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
          <h2 className="text-xl font-bold text-slate-100">Acciones</h2>
          <p className="mt-1 text-sm text-slate-300/80">
            Usa estos botones para ir directo a las tareas principales.
          </p>

          <div className="mt-5">
            <AnnualBirthdaysSettings />
          </div>

          <div className="mt-5 rounded-2xl border border-white/15 bg-white/8 p-4">
            <h3 className="text-base font-bold text-slate-100">Acceso cliente</h3>
            <p className="mt-1 text-sm text-slate-300/80">
              Administra el link y QR fijo para acceso limitado de cliente.
            </p>
            <div className="mt-3">
              <Link
                href="/dashboard/acceso-cliente"
                className="inline-flex h-11 items-center justify-center rounded-full border border-sky-300/35 bg-sky-400/22 px-5 text-sm font-semibold text-sky-100 shadow-sm transition duration-300 ease-out hover:bg-sky-400/30"
              >
                Ver link/QR cliente
              </Link>
            </div>
          </div>

          <div className="mt-5">
            <AdminUsersManager />
          </div>

          <ChangePasswordSection />
        </section>
      </div>
    </main>
  );
}

