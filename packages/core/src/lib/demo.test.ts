import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@ostiary/core/lib/env", () => ({ env: { DEMO_MODE: "true" } }));

import { env } from "@ostiary/core/lib/env";
import {
  demoAccount,
  demoAdminRefused,
  demoCredentials,
  demoLockedPath,
  isDemoAdmin,
  storedIp,
} from "@ostiary/core/lib/demo";

const mutableEnv = env as { DEMO_MODE?: string };

afterEach(() => {
  mutableEnv.DEMO_MODE = "true";
});

describe("demo accounts", () => {
  it("recognizes the example addresses, whatever their case", () => {
    expect(demoAccount(" Demo@Example.com ")?.kind).toBe("user");
    expect(isDemoAdmin({ email: "admin@example.com" })).toBe(true);
    expect(isDemoAdmin({ email: "demo@example.com" })).toBe(false);
    expect(demoAccount("someone@example.com")).toBeNull();
  });

  it("is off without DEMO_MODE: no accounts, no credentials, IPs kept", () => {
    mutableEnv.DEMO_MODE = undefined;
    expect(demoAccount("admin@example.com")).toBeNull();
    expect(isDemoAdmin({ email: "admin@example.com" })).toBe(false);
    expect(demoCredentials()).toEqual([]);
    expect(storedIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("stores no IP address in demo mode", () => {
    expect(storedIp("203.0.113.7")).toBeNull();
  });

  it("shows credentials without roles", () => {
    expect(demoCredentials()).toEqual([
      { kind: "user", email: "demo@example.com", password: "ostiary-demo" },
      { kind: "admin", email: "admin@example.com", password: "ostiary-admin" },
    ]);
  });
});

describe("demo rules", () => {
  it("locks what changes how a demo account signs in", () => {
    for (const path of ["/change-password", "/change-email", "/delete-user", "/two-factor/enable", "/passkey/verify-registration", "/revoke-sessions", "/update-user"]) {
      expect(demoLockedPath(path), path).toBe(true);
    }
    for (const path of ["/sign-in/email", "/sign-out", "/api-key/create", "/passkey/verify-authentication", "/two-factor/verify-totp"]) {
      expect(demoLockedPath(path), path).toBe(false);
    }
  });

  it("lets the demo admin read and sign in or out, nothing else", () => {
    expect(demoAdminRefused("/admin/list-users", "GET")).toBe(false);
    expect(demoAdminRefused("/sign-out", "POST")).toBe(false);
    expect(demoAdminRefused("/multi-session/set-active", "POST")).toBe(false);
    expect(demoAdminRefused("/two-factor/verify-totp", "POST")).toBe(false);
    expect(demoAdminRefused("/admin/ban-user", "POST")).toBe(true);
    expect(demoAdminRefused("/admin/impersonate-user", "POST")).toBe(true);
    expect(demoAdminRefused("/sso/register", "POST")).toBe(true);
    expect(demoAdminRefused("/api-key/create", "POST")).toBe(true);
  });
});
