import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSsoConfig } from "../../../apps/api/src/workspace-sso/config";
import { exchangeWorkspaceCode } from "../../../apps/api/src/workspace-sso/exchange-code";

const config: WorkspaceSsoConfig = {
  exchangeUrl: "https://workspace.joydigi.net/wp-json/joydigi-sso/v1/exchange",
  appId: "task",
  secret: undefined,
};

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(impl: (url: string, init: RequestInit) => Response) {
  const spy = vi.fn(async (url: unknown, init: unknown) =>
    impl(String(url), (init ?? {}) as RequestInit),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const okBody = {
  ok: true,
  user: {
    id: 12,
    email: "Phuong@JoyDigi.net",
    display_name: "Lê Minh Phương",
    login: "phuong",
    roles: ["subscriber"],
    avatar_url: "https://example.test/a.png",
  },
};

describe("redeeming a Workspace one-time code", () => {
  it("posts the app id and code as form fields, the shape Workspace documents", async () => {
    const spy = stubFetch(() => respond(200, okBody));

    await exchangeWorkspaceCode(config, "a".repeat(64));

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(config.exchangeUrl);
    expect(init.method).toBe("POST");
    const body = String(init.body);
    expect(body).toContain("app=task");
    expect(body).toContain(`code=${"a".repeat(64)}`);
  });

  it("returns the profile Workspace vouched for", async () => {
    stubFetch(() => respond(200, okBody));

    const result = await exchangeWorkspaceCode(config, "a".repeat(64));

    expect(result).toEqual({
      ok: true,
      profile: {
        email: "Phuong@JoyDigi.net",
        displayName: "Lê Minh Phương",
        login: "phuong",
      },
    });
  });

  it("omits the secret unless one is configured", async () => {
    const spy = stubFetch(() => respond(200, okBody));

    await exchangeWorkspaceCode(config, "a".repeat(64));
    expect(
      String((spy.mock.calls[0] as [string, RequestInit])[1].body),
    ).not.toContain("secret");

    await exchangeWorkspaceCode(
      { ...config, secret: "s3cret" },
      "a".repeat(64),
    );
    expect(
      String((spy.mock.calls[1] as [string, RequestInit])[1].body),
    ).toContain("secret=s3cret");
  });

  // An expired, spent or wrong-app code is a rejected sign-in, not an outage,
  // and the two must not be reported the same way.
  it.each([401, 403])("treats %i as a bad code", async (status) => {
    stubFetch(() => respond(status, { code: "joydigi_sso_invalid_code" }));

    expect(await exchangeWorkspaceCode(config, "a".repeat(64))).toEqual({
      ok: false,
      reason: "INVALID_CODE",
    });
  });

  it.each([500, 502, 404])(
    "treats %i as Workspace being unavailable",
    async (status) => {
      stubFetch(() => respond(status, ""));

      expect(await exchangeWorkspaceCode(config, "a".repeat(64))).toEqual({
        ok: false,
        reason: "UNAVAILABLE",
      });
    },
  );

  it("rejects a 200 that is not valid JSON", async () => {
    stubFetch(() => respond(200, "<html>WAF block page</html>"));

    expect(await exchangeWorkspaceCode(config, "a".repeat(64))).toEqual({
      ok: false,
      reason: "UNAVAILABLE",
    });
  });

  // ok:false with HTTP 200 is the shape a half-working proxy can produce.
  it("rejects a 200 whose body does not say ok", async () => {
    stubFetch(() => respond(200, { ok: false, user: { email: "x@y.z" } }));

    expect(await exchangeWorkspaceCode(config, "a".repeat(64))).toEqual({
      ok: false,
      reason: "INVALID_CODE",
    });
  });

  it("rejects a profile with no email, since email is what we act on", async () => {
    stubFetch(() =>
      respond(200, { ok: true, user: { id: 1, display_name: "No Mail" } }),
    );

    expect(await exchangeWorkspaceCode(config, "a".repeat(64))).toEqual({
      ok: false,
      reason: "INVALID_CODE",
    });
  });

  it("reports a network failure as unavailable rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    expect(await exchangeWorkspaceCode(config, "a".repeat(64))).toEqual({
      ok: false,
      reason: "UNAVAILABLE",
    });
  });

  // A redirect to another host would carry the code off to that host.
  it("does not follow redirects", async () => {
    const spy = stubFetch(() => respond(200, okBody));

    await exchangeWorkspaceCode(config, "a".repeat(64));

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("error");
  });
});
