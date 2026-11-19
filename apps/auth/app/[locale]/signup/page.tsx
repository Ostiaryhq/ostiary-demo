import { AuthScreen } from "@/components/auth/auth-screen";
import { captchaConfig } from "@ostiary/core/lib/captcha";
import { SignupForm } from "@/components/auth/signup-form";
import { authScreenApp } from "@/lib/app-context";
import { appLinkOf, appShowsProvider, appSocialProviders } from "@/lib/app-links";
import { enabledSocialProviders, googleOneTap } from "@ostiary/core/lib/social-providers";
import { demoMode } from "@ostiary/core/lib/demo";
import { redirect } from "@/i18n/navigation";

// Providers enabled from the admin console are read at request time.
export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  // DEMO_MODE: sign-up is closed; the sign-in page lists the example accounts. Same query, so
  // an app's sign-in carries on there.
  if (demoMode()) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, v);
    }
    const qs = search.toString();
    redirect({ href: `/login${qs ? `?${qs}` : ""}`, locale });
  }
  const [app, providers] = await Promise.all([authScreenApp(query), enabledSocialProviders()]);
  // An app whose branding hides Google also gets no One Tap prompt.
  const oneTap = appShowsProvider(app, "google") ? await googleOneTap() : null;

  return (
    <AuthScreen locale={locale} app={app} appIntent="signUp">
      <SignupForm
        socialProviders={appSocialProviders(providers, app)}
        captcha={captchaConfig()}
        oneTap={oneTap}
        appLink={appLinkOf(app)}
      />
    </AuthScreen>
  );
}
