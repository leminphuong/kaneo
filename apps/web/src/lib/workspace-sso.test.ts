import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeWorkspaceSsoCode,
  takeWorkspaceSsoFailure,
  WORKSPACE_SSO_ERROR_KEY,
} from "./workspace-sso";

const CODE = "f".repeat(64);

function visit(hash: string, search = "") {
  window.history.replaceState(null, "", `/${search}${hash}`);
}

beforeEach(() => {
  visit("");
});

describe("taking the Workspace sign-in code out of the URL", () => {
  it("returns the code Workspace put in the fragment", () => {
    visit(`#joydigi_sso_code=${CODE}&joydigi_sso_app=task`);

    expect(consumeWorkspaceSsoCode()).toBe(CODE);
  });

  // The code is live for 90 seconds. Leaving it in the address bar leaves it
  // in history and in the Referer of anything the page loads next.
  it("strips the code from the address bar", () => {
    visit(`#joydigi_sso_code=${CODE}&joydigi_sso_app=task`);

    consumeWorkspaceSsoCode();

    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(CODE);
  });

  it("yields the code only once", () => {
    visit(`#joydigi_sso_code=${CODE}&joydigi_sso_app=task`);

    expect(consumeWorkspaceSsoCode()).toBe(CODE);
    expect(consumeWorkspaceSsoCode()).toBeNull();
  });

  // Workspace parks the fragment it displaced so a deep link survives.
  it("puts back the fragment the hand-off displaced", () => {
    visit(
      `#joydigi_sso_return_fragment=%2Fboard%2F7&joydigi_sso_code=${CODE}&joydigi_sso_app=task`,
    );

    consumeWorkspaceSsoCode();

    expect(window.location.hash).toBe("#/board/7");
  });

  it("keeps the query string intact", () => {
    visit(`#joydigi_sso_code=${CODE}`, "?invite=abc");

    consumeWorkspaceSsoCode();

    expect(window.location.search).toBe("?invite=abc");
  });

  it("does nothing to an ordinary page load", () => {
    visit("#/settings");

    expect(consumeWorkspaceSsoCode()).toBeNull();
    expect(window.location.hash).toBe("#/settings");
  });

  it("returns null when the key is present but empty", () => {
    visit("#joydigi_sso_code=&joydigi_sso_app=task");

    expect(consumeWorkspaceSsoCode()).toBeNull();
  });
});

describe("telling the sign-in page why a hand-off failed", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("hands the recorded reason over exactly once", () => {
    sessionStorage.setItem(WORKSPACE_SSO_ERROR_KEY, "NO_MATCHING_ACCOUNT");

    expect(takeWorkspaceSsoFailure()).toBe("NO_MATCHING_ACCOUNT");
    expect(takeWorkspaceSsoFailure()).toBeNull();
  });

  // A reason the server grows later must not become a missing i18n key.
  it("collapses an unknown reason to generic", () => {
    sessionStorage.setItem(WORKSPACE_SSO_ERROR_KEY, "SOMETHING_NEW");

    expect(takeWorkspaceSsoFailure()).toBe("generic");
  });

  it("is silent when no hand-off happened", () => {
    expect(takeWorkspaceSsoFailure()).toBeNull();
  });
});
