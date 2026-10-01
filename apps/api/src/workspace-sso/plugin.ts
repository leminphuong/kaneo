import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import * as z from "zod";
import type { WorkspaceSsoConfig } from "./config";
import { exchangeWorkspaceCode } from "./exchange-code";

/**
 * Sign a Workspace user in to this instance.
 *
 * A Better Auth plugin rather than a Hono route because issuing a session is
 * Better Auth's job: `setSessionCookie` needs its endpoint context, and going
 * around it would mean minting session cookies by hand.
 *
 * Two rules this endpoint will not bend:
 *
 * 1. It never creates an account. Workspace knowing somebody is not this
 *    instance deciding they belong here; an admin adds them, by import or by
 *    hand. Workspace's own OKR integration takes the same line.
 * 2. It only matches an account whose email is already verified. Without that,
 *    anyone who signs up here with a colleague's address owns the account that
 *    colleague lands in when they arrive through Workspace. Imported and
 *    seeded accounts are created verified, so staff accounts are unaffected.
 */
export function workspaceSso(config: WorkspaceSsoConfig): BetterAuthPlugin {
  return {
    id: "workspace-sso",
    endpoints: {
      workspaceSsoLogin: createAuthEndpoint(
        "/workspace-sso/login",
        {
          method: "POST",
          body: z.object({
            // Workspace mints 64 hex characters. The bounds only keep an
            // absurd value from reaching the exchange.
            code: z.string().min(16).max(512),
          }),
        },
        async (ctx) => {
          const exchange = await exchangeWorkspaceCode(config, ctx.body.code);

          if (!exchange.ok) {
            throw new APIError(
              exchange.reason === "INVALID_CODE"
                ? "UNAUTHORIZED"
                : "SERVICE_UNAVAILABLE",
              {
                message:
                  exchange.reason === "INVALID_CODE"
                    ? "The Workspace sign-in code is invalid, expired or already used."
                    : "Workspace could not be reached to verify the sign-in.",
                code: exchange.reason,
              },
            );
          }

          // Exact email, lower-cased on both sides. Deliberately no fallback to
          // username or display name: a looser rule decides which human an
          // account belongs to by guessing, and guessing wrong hands somebody
          // another person's workspace.
          const email = exchange.profile.email.toLowerCase();
          const match =
            await ctx.context.internalAdapter.findUserByEmail(email);

          if (!match) {
            throw new APIError("UNAUTHORIZED", {
              message: `No account on this instance uses ${email}. Ask an administrator to add it.`,
              code: "NO_MATCHING_ACCOUNT",
            });
          }

          const user = match.user as typeof match.user & {
            banned?: boolean | null;
            emailVerified?: boolean | null;
          };

          if (user.banned) {
            throw new APIError("FORBIDDEN", {
              message: "This account is suspended.",
              code: "ACCOUNT_BANNED",
            });
          }

          if (!user.emailVerified) {
            throw new APIError("FORBIDDEN", {
              message:
                "This account's email was never verified, so it cannot be claimed through Workspace. An administrator should import it instead.",
              code: "ACCOUNT_NOT_VERIFIED",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user: match.user });

          return ctx.json({ ok: true as const });
        },
      ),
    },
    rateLimit: [
      {
        // Unauthenticated, and each call costs an outbound request to
        // Workspace. A real hand-off happens once per sign-in.
        pathMatcher: (path) => path === "/workspace-sso/login",
        window: 60,
        max: 20,
      },
    ],
  };
}
