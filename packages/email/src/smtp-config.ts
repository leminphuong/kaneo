import type SMTPTransport from "nodemailer/lib/smtp-transport";

type SmtpEnv = Record<string, string | undefined>;

/**
 * Build the nodemailer transport options from the environment.
 *
 * `auth` is only included when both a user and a password are set. Passing an
 * `auth` object with undefined values makes nodemailer authenticate anyway,
 * which fails against relays that accept unauthenticated mail. The same goes
 * for `port`: leaving it out lets nodemailer pick the default for the chosen
 * security mode instead of receiving NaN.
 */
export function getSmtpTransportOptions(
  env: SmtpEnv = process.env,
): SMTPTransport.Options {
  if (env.SMTP_IGNORE_TLS === "true") {
    throw new Error(
      "SMTP_IGNORE_TLS=true is no longer supported: it disables STARTTLS, not certificate validation. Remove it and trust your SMTP CA using NODE_EXTRA_CA_CERTS. For an intentionally unencrypted local relay, set SMTP_SECURE=false and SMTP_REQUIRE_TLS=false explicitly.",
    );
  }

  const options: SMTPTransport.Options = {
    host: env.SMTP_HOST,
    secure: env.SMTP_SECURE !== "false",
    requireTLS: env.SMTP_REQUIRE_TLS !== "false",
    ignoreTLS: false,
  };

  if (env.SMTP_PORT) {
    options.port = Number(env.SMTP_PORT);
  }

  if (env.SMTP_USER && env.SMTP_PASSWORD) {
    options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASSWORD };
  }

  return options;
}

/**
 * Whether outgoing mail can be sent at all.
 *
 * Hard-wired to false: this instance never sends real email. Anything that
 * would have been emailed is delivered to the matching account as an in-app
 * notification instead (see notifyAccountByEmail in the API), and the flows
 * that cannot work that way - password reset, magic links, one-time codes -
 * are disabled rather than silently doing nothing.
 *
 * Returning false here is what makes that guarantee hold no matter which
 * SMTP_* variables are present in the environment: every send helper checks
 * this first and refuses. The transport options above are left in place for
 * the tests that cover them and for anyone re-enabling mail deliberately.
 */
export function isSmtpConfigured(_env: SmtpEnv = process.env): boolean {
  return false;
}
