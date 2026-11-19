"use client"
import { useTranslations } from "next-intl"

import { Button } from "@ostiary/core/components/ui/button"
import type { DemoCredential } from "@ostiary/core/lib/demo"

/**
 * DEMO_MODE: the example accounts, above the sign-in form. "Use" fills the form; the person
 * still presses Sign in, so they see the real flow.
 */
export function DemoAccounts({
  accounts,
  disabled,
  onUse,
}: {
  accounts: DemoCredential[]
  disabled?: boolean
  onUse: (account: DemoCredential) => void
}) {
  const t = useTranslations("auth.login.demo")
  if (accounts.length === 0) return null
  return (
    <section
      aria-labelledby="demo-accounts-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="space-y-1">
        <h2 id="demo-accounts-title" className="font-medium">
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {accounts.map((account) => (
          <li key={account.email} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{t(account.kind === "admin" ? "admin" : "user")}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {account.email} · {account.password}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onUse(account)}
              aria-label={t("useLabel", { email: account.email })}
            >
              {t("use")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
