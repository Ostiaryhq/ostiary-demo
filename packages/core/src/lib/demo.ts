import { env } from "@ostiary/core/lib/env";

/**
 * DEMO_MODE: a public demo instance. Anyone signs in with these example accounts, shown on the
 * sign-in page. The seed (db/seed-resources.ts) resets them on every deploy.
 *
 * - Their credentials and identity are locked (DEMO_LOCKED_PATHS), so the next visitor can
 *   still sign in with the same password.
 * - The admin account browses the whole console but changes nothing (demoAdminRefused).
 * - Self-service sign-up is closed: the only people on the instance are these accounts, so
 *   the public admin console shows nobody's personal data.
 * - IP addresses are not stored (storedIp): every visitor shares these accounts and could
 *   read each other's in the session list, the audit log and the sign-in events.
 *
 * `example.com` never receives mail (RFC 2606): nothing is sent to these addresses.
 */
export const DEMO_ACCOUNTS = [
  { kind: "user", email: "demo@example.com", password: "ostiary-demo", name: "Demo User", role: "user" },
  { kind: "admin", email: "admin@example.com", password: "ostiary-admin", name: "Demo Admin", role: "admin" },
] as const;

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
/** What the sign-in page shows: no role, nothing else. */
export type DemoCredential = Pick<DemoAccount, "kind" | "email" | "password">;

export function demoMode(): boolean {
  return env.DEMO_MODE === "true";
}

/** The demo account with this address, on a demo instance only. */
export function demoAccount(email: string | null | undefined): DemoAccount | null {
  if (!demoMode() || typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email === normalized) ?? null;
}

/** The demo admin: may look at everything, change nothing. */
export function isDemoAdmin(user: { email?: string | null } | null | undefined): boolean {
  return demoAccount(user?.email)?.kind === "admin";
}

/** The credentials for the sign-in page, or none outside demo mode. */
export function demoCredentials(): DemoCredential[] {
  if (!demoMode()) return [];
  return DEMO_ACCOUNTS.map(({ kind, email, password }) => ({ kind, email, password }));
}

/** An IP address as stored: none on a demo instance (see above). */
export function storedIp(ip: string | null | undefined): string | null {
  return demoMode() ? null : (ip ?? null);
}

/**
 * Better Auth endpoints a demo account may not call: what changes how it signs in or who it
 * is, deletes it, or signs other visitors out. Prefixes end with "/".
 */
const DEMO_LOCKED_PATHS = [
  "/change-password",
  "/set-password",
  "/change-email",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/update-user",
  "/delete-user",
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/link-social",
  "/unlink-account",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  "/passkey/update-passkey",
];

/**
 * Writes the demo admin may still make: signing in and out, switching account or workspace,
 * and the permission checks Better Auth answers on POST. Everything else that is not a GET is
 * refused, on top of the console's own checks (adminActor, adminJsonRoute).
 */
const DEMO_ADMIN_ALLOWED_PATHS = [
  "/sign-out",
  "/sign-in/",
  "/multi-session/",
  "/two-factor/verify-",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/organization/set-active",
  "/organization/has-permission",
  "/admin/has-permission",
  "/admin/stop-impersonating",
];

function matches(path: string, list: readonly string[]): boolean {
  return list.some((entry) => (entry.endsWith("/") || entry.endsWith("-") ? path.startsWith(entry) : path === entry));
}

/** Whether a demo account is refused this endpoint because it would change its credentials. */
export function demoLockedPath(path: string): boolean {
  return matches(path, DEMO_LOCKED_PATHS);
}

/** Whether the demo admin is refused this request: any write outside the allowed list. */
export function demoAdminRefused(path: string, method: string | undefined): boolean {
  if (method === "GET" || method === "HEAD") return false;
  return !matches(path, DEMO_ADMIN_ALLOWED_PATHS);
}

/**
 * Endpoints that email an address given in the body. For a demo address they answer as if
 * sent, without sending: nobody reads that inbox, and a reset link would change the password.
 */
export const DEMO_SILENT_EMAIL_PATHS: Readonly<Record<string, Record<string, unknown>>> = {
  "/request-password-reset": { status: true },
  "/forget-password/email-otp": { success: true },
  "/send-verification-email": { status: true },
  "/email-otp/send-verification-otp": { success: true },
  "/email-otp/request-password-reset": { success: true },
};
