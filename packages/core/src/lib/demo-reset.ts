import { randomBytes } from "node:crypto";
import type pg from "pg";
import { hashPassword } from "better-auth/crypto";

import { DEMO_ACCOUNTS } from "@ostiary/core/lib/demo";
import { PUBLIC_ORGANIZATION_ID } from "@ostiary/core/lib/organization-public";

/*
 * DEMO_MODE: puts the demo back in its starting state. Run by the deploy seed
 * (db/seed-resources.ts) and every night by the cron route (app/api/cron/webhooks), so what
 * visitors create (organizations, API keys, connected apps) does not pile up.
 *
 * Written as SQL in one transaction, so Better Auth's hooks do not run: the accounts join the
 * Public organization here.
 */

/** Better Auth's default id format: 32 alphanumeric characters. */
export function generateId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(32), (byte) => alphabet[byte % alphabet.length]).join("");
}

type Client = Pick<pg.ClientBase, "query">;

export type DemoResetCounts = Record<string, number>;

/**
 * Deletes what visitors created. Only the demo accounts and the Public organization stay;
 * what the console configures (OAuth clients, APIs, providers, branding, settings) is not
 * touched, since the demo admin is read-only and cannot change it.
 */
async function wipeVisitorData(client: Client): Promise<DemoResetCounts> {
  const emails = DEMO_ACCOUNTS.map((account) => account.email);
  const run = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rowCount ?? 0;
  return {
    // Sign-up is closed, but an account created any other way goes too (cascades to its rows).
    users: await run(`delete from "user" where lower(email) <> all($1::text[])`, [emails]),
    // Cascades to their members, invitations and API keys.
    organizations: await run(`delete from organization where id <> $1`, [PUBLIC_ORGANIZATION_ID]),
    apiKeys: await run(`delete from apikey`),
    // Connected apps: the consents and the tokens issued with them.
    consents: await run(`delete from oauth_consent`),
    accessTokens: await run(`delete from oauth_access_token`),
    refreshTokens: await run(`delete from oauth_refresh_token`),
    deviceCodes: await run(`delete from device_code`),
    invitations: await run(`delete from invitation`),
  };
}

/** Creates the example accounts, or resets them: password, verified address, role, nothing else to sign in with. */
async function resetAccounts(client: Client) {
  for (const account of DEMO_ACCOUNTS) {
    const password = await hashPassword(account.password);
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
  }
}

/** Wipes visitor data and resets the example accounts, all or nothing. */
export async function resetDemo(client: Client): Promise<DemoResetCounts> {
  await client.query("begin");
  try {
    const counts = await wipeVisitorData(client);
    await resetAccounts(client);
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
