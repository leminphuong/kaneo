import { describe, expect, it } from "vitest";
import { getSmtpTransportOptions, isSmtpConfigured } from "./smtp-config";

describe("getSmtpTransportOptions", () => {
  it("omits auth when no credentials are configured", () => {
    const options = getSmtpTransportOptions({
      SMTP_HOST: "relay.internal",
      SMTP_PORT: "25",
      SMTP_SECURE: "false",
    });

    expect(options.auth).toBeUndefined();
    expect("auth" in options).toBe(false);
    expect(options.host).toBe("relay.internal");
    expect(options.port).toBe(25);
    expect(options.secure).toBe(false);
  });

  it("omits auth when only one credential is configured", () => {
    expect(
      getSmtpTransportOptions({ SMTP_HOST: "relay.internal", SMTP_USER: "me" })
        .auth,
    ).toBeUndefined();
    expect(
      getSmtpTransportOptions({
        SMTP_HOST: "relay.internal",
        SMTP_PASSWORD: "s",
      }).auth,
    ).toBeUndefined();
  });

  it("includes auth when both credentials are configured", () => {
    const options = getSmtpTransportOptions({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "me",
      SMTP_PASSWORD: "secret",
    });

    expect(options.auth).toEqual({ user: "me", pass: "secret" });
  });

  it("leaves the port unset instead of NaN when SMTP_PORT is missing", () => {
    const options = getSmtpTransportOptions({ SMTP_HOST: "relay.internal" });

    expect(options.port).toBeUndefined();
  });

  it("defaults to encrypted delivery and keeps certificate validation enabled", () => {
    expect(getSmtpTransportOptions({ SMTP_HOST: "h" }).secure).toBe(true);
    const options = getSmtpTransportOptions({ SMTP_SECURE: "false" });
    expect(options.requireTLS).toBe(true);
    expect(options.ignoreTLS).toBe(false);
    expect(options.tls?.rejectUnauthorized).not.toBe(false);
  });

  it("rejects the formerly misleading flag instead of disabling STARTTLS", () => {
    for (const secure of ["true", "false"]) {
      expect(() =>
        getSmtpTransportOptions({
          SMTP_SECURE: secure,
          SMTP_IGNORE_TLS: "true",
        }),
      ).toThrow("SMTP_IGNORE_TLS=true is no longer supported");
    }
  });

  it("requires an explicit opt-out for relays without TLS", () => {
    const options = getSmtpTransportOptions({
      SMTP_SECURE: "false",
      SMTP_REQUIRE_TLS: "false",
      SMTP_IGNORE_TLS: "false",
    });
    expect(options.requireTLS).toBe(false);
    expect(options.ignoreTLS).toBe(false);
  });
});

describe("isSmtpConfigured", () => {
  // Hard-wired false: this instance sends no real email, and every send
  // helper checks this before touching a relay. Asserting it stays false
  // whatever the environment says is the point of the test.
  it("is false even when a complete relay is configured", () => {
    expect(
      isSmtpConfigured({
        SMTP_HOST: "relay.internal",
        SMTP_FROM: "noreply@example.com",
        SMTP_USER: "user",
        SMTP_PASSWORD: "pass",
      }),
    ).toBe(false);
  });

  it("is false when nothing is configured", () => {
    expect(isSmtpConfigured({})).toBe(false);
  });
});
