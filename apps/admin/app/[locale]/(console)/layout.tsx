import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AdminShell } from "@/components/admin/admin-shell";
import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@ostiary/core/components/ui/alert";
import { adminAccess } from "@ostiary/core/lib/admin/admin-access";
import { isDemoAdmin } from "@ostiary/core/lib/demo";
import { env } from "@ostiary/core/lib/env";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const sessionUser = session?.user;
  const access = adminAccess(sessionUser);
  if (!sessionUser || access === "signed_out") {
    // Sign-in happens on the auth app. Come back here once the session exists.
    const back = `${env.ADMIN_APP_URL}/${locale}`;
    redirect(
      `${env.AUTH_APP_URL}/${locale}/login?callbackURL=${encodeURIComponent(back)}`,
    );
  }

  if (access === "not_admin") {
    redirect(`${env.AUTH_APP_URL}/${locale}/dashboard`);
  }

  // Admins must turn on two-factor authentication first (REQUIRE_ADMIN_2FA), on the auth app.
  if (access === "needs_2fa") {
    redirect(`${env.AUTH_APP_URL}/${locale}/dashboard/security#two-factor`);
  }

  const t = await getTranslations({ locale, namespace: "admin.shell" });

  return (
    <AdminShell
      user={{
        name: sessionUser.name ?? t("userFallbackName"),
        email: sessionUser.email,
        avatar: sessionUser.image ?? undefined,
      }}
    >
      {isDemoAdmin(sessionUser) ? (
        // DEMO_MODE: every change is refused on the server (adminActor, adminJsonRoute, auth hooks).
        <Alert className="mb-6">
          <FlaskConical aria-hidden />
          <AlertTitle>{t("demo.title")}</AlertTitle>
          <AlertDescription>{t("demo.body")}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </AdminShell>
  );
}
