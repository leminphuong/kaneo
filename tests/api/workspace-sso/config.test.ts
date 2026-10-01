import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceSsoConfig } from "../../../apps/api/src/workspace-sso/config";

const KEYS = [
  "WORKSPACE_SSO_EXCHANGE_URL",
  "WORKSPACE_SSO_APP_ID",
  "WORKSPACE_SSO_SECRET",
] as const;

const original = new Map(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  // The module warns once per process; silence it so a deliberately bad URL
  // does not look like a failing test.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Workspace SSO configuration", () => {
  it("is off when no exchange URL is set", () => {
    expect(getWorkspaceSsoConfig()).toBeNull();
  });

  it("defaults the application id to task", () => {
    process.env.WORKSPACE_SSO_EXCHANGE_URL =
      "https://workspace.joydigi.net/wp-json/joydigi-sso/v1/exchange";

    expect(getWorkspaceSsoConfig()).toMatchObject({
      appId: "task",
      secret: undefined,
    });
  });

  // The code is a bearer credential for somebody's account; sending it in
  // clear would hand it to anyone on the path.
  it("refuses a plaintext exchange URL", () => {
    process.env.WORKSPACE_SSO_EXCHANGE_URL = "http://workspace.joydigi.net/x";

    expect(getWorkspaceSsoConfig()).toBeNull();
  });

  it("still allows loopback over http, so a local Workspace can be used", () => {
    process.env.WORKSPACE_SSO_EXCHANGE_URL = "http://127.0.0.1:9777/exchange";

    expect(getWorkspaceSsoConfig()).not.toBeNull();
  });

  it("is off, rather than throwing, when the URL is malformed", () => {
    process.env.WORKSPACE_SSO_EXCHANGE_URL = "not a url";

    expect(getWorkspaceSsoConfig()).toBeNull();
  });

  it("carries the optional secret through when one is set", () => {
    process.env.WORKSPACE_SSO_EXCHANGE_URL = "https://workspace.joydigi.net/x";
    process.env.WORKSPACE_SSO_APP_ID = "task";
    process.env.WORKSPACE_SSO_SECRET = "shared";

    expect(getWorkspaceSsoConfig()).toMatchObject({ secret: "shared" });
  });
});
