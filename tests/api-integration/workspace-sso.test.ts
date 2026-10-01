import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// auth.ts decides at import time whether the plugin exists at all, so the
// configuration has to be in place before the app module is pulled in.
const EXCHANGE_URL = "https://workspace.test/wp-json/joydigi-sso/v1/exchange";
process.env.WORKSPACE_SSO_EXCHANGE_URL = EXCHANGE_URL;

const { createApp } = await import("../../apps/api/src/index");
const databaseModule = await import("../../apps/api/src/database");
const { resetTestDatabase } = await import("./helpers/database");

const db = databaseModule.default;
const { schema } = databaseModule;

const CODE = "c".repeat(64);
const ORIGIN = "http://localhost:5173";

function workspaceReplies(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

function profileFor(email: string) {
  return {
    ok: true,
    user: {
      id: 7,
      email,
      display_name: "Lê Minh Phương",
      login: "phuong",
      roles: ["subscriber"],
    },
  };
}

function signIn(code = CODE) {
  return createApp().app.request("/api/auth/workspace-sso/login", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ code }),
  });
}

async function seedAccount(
  email: string,
  overrides: { emailVerified?: boolean; banned?: boolean } = {},
) {
  const id = `user-${randomUUID()}`;
  await db.insert(schema.userTable).values({
    id,
    email,
    name: "Seeded Staff",
    emailVerified: overrides.emailVerified ?? true,
    banned: overrides.banned ?? false,
  });
  return id;
}

function countUsers() {
  return db.select().from(schema.userTable);
}

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("signing in through JoyDigi Workspace", () => {
  it("issues a working session for an existing account", async () => {
    const email = "phuong@joydigi.net";
    const userId = await seedAccount(email);
    workspaceReplies(profileFor(email));

    const response = await signIn();
    expect(response.status).toBe(200);

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    // The cookie is the whole point: prove it authenticates a later request.
    const session = await createApp().app.request("/api/auth/get-session", {
      headers: { cookie: (cookie as string).split(";")[0], Origin: ORIGIN },
    });
    expect(session.status).toBe(200);
    const body = (await session.json()) as { user?: { id?: string } } | null;
    expect(body?.user?.id).toBe(userId);
  });

  // Workspace knowing somebody is not this instance deciding they belong here.
  it("never creates an account for an address it has not seen", async () => {
    workspaceReplies(profileFor("stranger@joydigi.net"));

    const response = await signIn();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "NO_MATCHING_ACCOUNT",
    });
    expect(await countUsers()).toHaveLength(0);
  });

  // Otherwise anyone who signs up here with a colleague's address owns the
  // account that colleague lands in when they arrive through Workspace.
  it("refuses an account whose email was never verified", async () => {
    const email = "unverified@joydigi.net";
    await seedAccount(email, { emailVerified: false });
    workspaceReplies(profileFor(email));

    const response = await signIn();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "ACCOUNT_NOT_VERIFIED",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a suspended account", async () => {
    const email = "banned@joydigi.net";
    await seedAccount(email, { banned: true });
    workspaceReplies(profileFor(email));

    const response = await signIn();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACCOUNT_BANNED" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("matches the address regardless of case", async () => {
    const userId = await seedAccount("mixed@joydigi.net");
    workspaceReplies(profileFor("Mixed@JoyDigi.NET"));

    const response = await signIn();

    expect(response.status).toBe(200);
    const cookie = (response.headers.get("set-cookie") as string).split(";")[0];
    const session = await createApp().app.request("/api/auth/get-session", {
      headers: { cookie, Origin: ORIGIN },
    });
    const body = (await session.json()) as { user?: { id?: string } } | null;
    expect(body?.user?.id).toBe(userId);
  });

  it("passes a rejected code through as a failed sign-in", async () => {
    await seedAccount("phuong@joydigi.net");
    workspaceReplies({ code: "joydigi_sso_invalid_code" }, 401);

    const response = await signIn();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "INVALID_CODE" });
  });

  it("reports Workspace being down separately from a bad code", async () => {
    await seedAccount("phuong@joydigi.net");
    workspaceReplies("gateway timeout", 504);

    const response = await signIn();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "UNAVAILABLE" });
  });

  it("rejects a body with no code without calling Workspace", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    const response = await createApp().app.request(
      "/api/auth/workspace-sso/login",
      {
        method: "POST",
        headers: { "content-type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
