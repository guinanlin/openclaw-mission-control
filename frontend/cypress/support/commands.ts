/// <reference types="cypress" />

function getEnv(name: string, fallback?: string): string {
  const value = Cypress.env(name) as string | undefined;
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(
    `Missing Cypress env var ${name}. ` +
      `Set it via CYPRESS_${name}=... in CI/local before running Clerk login tests.`,
  );
}

function clerkOriginFromPublishableKey(): string {
  const key = getEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

  // pk_test_<base64(domain$)> OR pk_live_<...>
  const m = /^pk_(?:test|live)_(.+)$/.exec(key);
  if (!m) throw new Error(`Unexpected Clerk publishable key format: ${key}`);

  const decoded = atob(m[1]); // e.g. beloved-ghost-73.clerk.accounts.dev$
  const domain = decoded.replace(/\$$/, "");
  return `https://${domain}`;
}

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return value.replace(/\/$/, "");
  }
}

Cypress.Commands.add("loginWithClerkOtp", () => {
  const clerkOrigin = normalizeOrigin(
    getEnv("CLERK_ORIGIN", clerkOriginFromPublishableKey()),
  );
  const email = getEnv("CLERK_TEST_EMAIL", "jane+clerk_test@example.com");
  const otp = getEnv("CLERK_TEST_OTP", "424242");

  // Navigate to a dedicated sign-in route that renders Clerk SignIn top-level.
  // Cypress cannot reliably drive Clerk modal/iframe flows.
  cy.visit("/sign-in");

  cy.origin(
    clerkOrigin,
    { args: { email, otp } },
    ({ email: e, otp: o }) => {
      cy.get('input[type="email"], input[name="identifier"], input[autocomplete="email"]', {
        timeout: 20_000,
      })
        .first()
        .clear()
        .type(e, { delay: 10 });

      cy.get('button[type="submit"], button')
        .contains(/continue|sign in|send|next/i)
        .click({ force: true });

      cy.get(
        'input[autocomplete="one-time-code"], input[name*="code"], input[inputmode="numeric"]',
        { timeout: 20_000 },
      )
        .first()
        .clear()
        .type(o, { delay: 10 });

      // Final submit (some flows auto-submit)
      cy.get("body").then(($body) => {
        const hasSubmit = $body
          .find('button[type="submit"], button')
          .toArray()
          .some((el) => /verify|continue|sign in|confirm/i.test(el.textContent || ""));
        if (hasSubmit) {
          cy.get('button[type="submit"], button')
            .contains(/verify|continue|sign in|confirm/i)
            .click({ force: true });
        }
      });
    },
  );
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Logs in via real Clerk using deterministic OTP credentials.
       * Defaults (non-secret): jane+clerk_test@example.com / 424242.
       */
      loginWithClerkOtp(): Chainable<void>;
    }
  }
}

export {};
