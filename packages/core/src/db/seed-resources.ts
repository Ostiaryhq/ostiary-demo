/**
 * Registers the OAuth protected resources (`oauth_resource` rows) before the app starts.
 * The auth app's build runs it right after the migrations.
 *
 * Better Auth seeds these rows itself on first use, but on a fresh database the build's
 * parallel workers (and concurrent cold starts) race on the insert. The library means to
 * ignore the losing duplicate-key error, yet Drizzle wraps it ("Failed query: …") so it
 * surfaces as a failed request instead. With the rows already present, the library finds
 * them and never inserts.
 *
 * Existing rows are left untouched, like the library's default `insertOnly` seed mode, so
 * edits made from the admin console survive redeploys.
 *
 * With DEMO_MODE, it also creates the example accounts (lib/demo.ts), or resets them to their
 * demo state: their password, verified address and role, and nothing else to sign in with.
 */
import { randomBytes } from "node:crypto";
import net from "node:net";
import { config } from "dotenv";
import pg from "pg";

// Same lookup as drizzle.config.ts: a local env file if present, otherwise the auth app's.
// Vercel builds get the variables from the environment directly.
for (const path of [".env.local", ".env", "../../apps/auth/.env.local"]) {
  config({ path, quiet: true });
}

/** Better Auth's default id format: 32 alphanumeric characters. */
function generateId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(32), (byte) => alphabet[byte % alphabet.length]).join("");
}

// Node gives each resolved address 250 ms by default, too short while a serverless database
// (Neon) wakes up: every address times out and the build fails.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_000);

/** Connects with a few retries, for the same cold-start reason. */
async function connect(connectionString: string): Promise<pg.Client> {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt >= 5) throw error;
      console.warn(`Database connection failed (attempt ${attempt} of 5), retrying.`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
}

/**
 * Creates or resets the DEMO_MODE example accounts. Written as SQL like the rest of this
 * script, so Better Auth's hooks do not run: the account joins the Public organization here.
 */
async function resetDemoAccounts(client: pg.Client) {
  const { DEMO_ACCOUNTS } = await import("@ostiary/core/lib/demo");
  const { PUBLIC_ORGANIZATION_ID } = await import("@ostiary/core/lib/organization-public");
  const { hashPassword } = await import("better-auth/crypto");
  for (const account of DEMO_ACCOUNTS) {
    const password = await hashPassword(account.password);
    await client.query("begin");
    try {
      const { rows } = await client.query<{ id: string }>(
        `insert into "user" (id, name, email, email_verified, role, banned, two_factor_enabled, created_at, updated_at)
         values ($1, $2, $3, true, $4, false, false, now(), now())
         on conflict (email) do update set
           name = excluded.name, email_verified = true, role = excluded.role, image = null,
           username = null, display_username = null, banned = false, ban_reason = null,
           ban_expires = null, two_factor_enabled = false, updated_at = now()
         returning id`,
        [generateId(), account.name, account.email, account.role],
      );
      const userId = rows[0].id;
      // Only the demo password signs in: no other method, and no session from before.
      await client.query(`delete from account where user_id = $1 and provider_id <> 'credential'`, [userId]);
      await client.query(`delete from two_factor where user_id = $1`, [userId]);
      await client.query(`delete from passkey where user_id = $1`, [userId]);
      await client.query(`delete from session where user_id = $1`, [userId]);
      const updated = await client.query(
        `update account set password = $2, updated_at = now() where user_id = $1 and provider_id = 'credential'`,
        [userId, password],
      );
      if (updated.rowCount === 0) {
        await client.query(
          `insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
           values ($1, $2, 'credential', $2, $3, now(), now())`,
          [generateId(), userId, password],
        );
      }
      await client.query(
        `insert into member (id, organization_id, user_id, role, created_at)
         values ($1, $2, $3, 'member', now())
         on conflict (user_id, organization_id) do nothing`,
        [generateId(), PUBLIC_ORGANIZATION_ID, userId],
      );
      await client.query("commit");
      console.log(`demo account ${account.email}: ready`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
}

async function main() {
  // Imported after dotenv so the env schema sees the loaded variables.
  const { env } = await import("@ostiary/core/lib/env");
  const { getBaseURL } = await import("@ostiary/core/lib/url");
  const { oauthResourceIdentifiers } = await import("@ostiary/core/lib/oauth-resources");

  // The canonical auth URL, as in apps/auth/lib/auth.ts.
  const identifiers = oauthResourceIdentifiers(env.AUTH_APP_URL ?? getBaseURL());

  const client = await connect(env.DATABASE_URL);
  try {
    const { rows } = await client.query(`select to_regclass('public.oauth_resource') as table`);
    if (!rows[0]?.table) {
      // Migrations not applied yet (e.g. a preview database): Better Auth seeds on first use.
      console.warn("oauth_resource table not found: run the migrations first. Skipping the seed.");
      return;
    }
    for (const identifier of identifiers) {
      const { rowCount } = await client.query(
        `insert into oauth_resource (id, identifier, name, dpop_bound_access_tokens_required, disabled, policy_version, created_at, updated_at)
         values ($1, $2, $2, false, false, 1, now(), now())
         on conflict (identifier) do nothing`,
        [generateId(), identifier],
      );
      console.log(`oauth_resource ${identifier}: ${rowCount ? "registered" : "already registered"}`);
    }
    if (env.DEMO_MODE === "true") await resetDemoAccounts(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
