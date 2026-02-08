/// <reference types="cypress" />

type ClerkOtpLoginOptions = {
  clerkOrigin: string;
  email: string;
  otp: string;
};

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

  // Some flows redirect to *.accounts.dev (no clerk. subdomain)
  const normalized = domain.replace(".clerk.accounts.dev", ".accounts.dev");
  return `https://${normalized}`;
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

  const opts: ClerkOtpLoginOptions = { clerkOrigin, email, otp };

  // Navigate to a dedicated sign-in route that renders Clerk SignIn top-level.
  // Cypress cannot reliably drive Clerk modal/iframe flows.
  cy.visit("/sign-in");

  const emailSelector =
    'input[type="email"], input[name="identifier"], input[autocomplete="email"]';
  const otpSelector =
    'input[autocomplete="one-time-code"], input[name*="code"], input[inputmode="numeric"]';
  const continueSelector = 'button[type="submit"], button';

  const fillEmailStep = (email: string) => {
    cy.get(emailSelector, { timeout: 20_000 })
      .first()
      .clear()
      .type(email, { delay: 10 });

    cy.get(continueSelector)
      .contains(/continue|sign in|send|next/i)
      .click({ force: true });
  };

  const fillOtpAndSubmit = (otp: string) => {
    cy.get(otpSelector, { timeout: 20_000 }).first().clear().type(otp, { delay: 10 });

    cy.get("body").then(($body) => {
      const hasSubmit = $body
        .find(continueSelector)
        .toArray()
        .some((el) => /verify|continue|sign in|confirm/i.test(el.textContent || ""));
      if (hasSubmit) {
        cy.get(continueSelector)
          .contains(/verify|continue|sign in|confirm/i)
          .click({ force: true });
      }
    });
  };

  // Clerk SignIn can start on our app origin and then redirect to Clerk-hosted UI.
  // We do email step first, then decide where the OTP step lives based on the *current* origin.
  fillEmailStep(opts.email);

  cy.location("origin", { timeout: 20_000 }).then((origin) => {
    const current = normalizeOrigin(origin);
    if (current === opts.clerkOrigin) {
      cy.origin(
        opts.clerkOrigin,
        { args: { otp: opts.otp } },
        ({ otp }) => {
          cy.get(
            'input[autocomplete="one-time-code"], input[name*="code"], input[inputmode="numeric"]',
            { timeout: 20_000 },
          )
            .first()
            .clear()
            .type(otp, { delay: 10 });

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
    } else {
      fillOtpAndSubmit(opts.otp);
    }
  });
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Logs in via the real Clerk SignIn page using deterministic OTP credentials.
       *
       * Optional env vars (CYPRESS_*):
       * - CLERK_ORIGIN (e.g. https://<subdomain>.accounts.dev)
       * - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (used to derive origin when CLERK_ORIGIN not set)
       * - CLERK_TEST_EMAIL (default: jane+clerk_test@example.com)
       * - CLERK_TEST_OTP (default: 424242)
       */
      loginWithClerkOtp(): Chainable<void>;
    }
  }
}

export {};
