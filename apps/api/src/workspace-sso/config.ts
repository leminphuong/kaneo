/**
 * Single sign-on from JoyDigi Workspace.
 *
 * Workspace mints a random 256-bit code bound to one user and one application,
 * valid for 90 seconds and good for a single use, then puts it in the fragment
 * of the iframe URL. A fragment is never sent in an HTTP request, so the code
 * reaches this API only because the web app reads it out of `location.hash`
 * and posts it back. This module decides whether that exchange is configured.
 *
 * The feature stays off until an exchange URL is set, so an instance that has
 * never heard of Workspace exposes no extra way in.
 */

export type WorkspaceSsoConfig = {
  /** Workspace's server-to-server redemption endpoint. */
  exchangeUrl: string;
  /** Which application Workspace bound the code to. */
  appId: string;
  /**
   * Optional legacy hardening. Workspace treats the one-time code as the
   * credential and does not require this, but validates it when sent.
   */
  secret: string | undefined;
};

let warned = false;

function warnOnce(message: string) {
  // A misconfigured URL would otherwise turn the whole feature off silently,
  // which reads exactly like Workspace never sending a code.
  if (warned) return;
  warned = true;
  console.warn(`[workspace-sso] ${message} Single sign-on stays disabled.`);
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function getWorkspaceSsoConfig(): WorkspaceSsoConfig | null {
  const exchangeUrl = process.env.WORKSPACE_SSO_EXCHANGE_URL?.trim();
  if (!exchangeUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(exchangeUrl);
  } catch {
    warnOnce("WORKSPACE_SSO_EXCHANGE_URL is not a valid URL.");
    return null;
  }

  // The code is a bearer credential for somebody's account: refuse to carry it
  // over plaintext. Loopback is exempt so a local Workspace can be worked on.
  if (parsed.protocol !== "https:" && !isLoopback(parsed.hostname)) {
    warnOnce("WORKSPACE_SSO_EXCHANGE_URL must use https.");
    return null;
  }

  return {
    exchangeUrl: parsed.toString(),
    appId: process.env.WORKSPACE_SSO_APP_ID?.trim() || "task",
    secret: process.env.WORKSPACE_SSO_SECRET?.trim() || undefined,
  };
}
