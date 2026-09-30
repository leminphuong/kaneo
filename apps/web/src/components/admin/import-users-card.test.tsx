import { describe, expect, it } from "vitest";
import { parseImportFile } from "./import-users-card";

const row = {
  ho_ten: "Le Minh Phuong",
  ten_dang_nhap: "phuong",
  email: "phuong@joydigi.net",
  mat_khau_mac_dinh: "initial-password",
};

describe("parsing the account import file", () => {
  it("accepts the bare array the Workspace export produces", () => {
    const result = parseImportFile(JSON.stringify([row]));

    expect(result).toEqual({ ok: true, users: [row] });
  });

  it("also accepts the { users: [...] } shape the API itself takes", () => {
    const result = parseImportFile(JSON.stringify({ users: [row] }));

    expect(result).toMatchObject({ ok: true });
  });

  it("names the offending row when a field is missing", () => {
    const result = parseImportFile(
      JSON.stringify([row, { ...row, email: undefined }]),
    );

    expect(result).toEqual({ ok: false, reason: "missingFields", at: 2 });
  });

  it("treats an empty string as missing rather than importing a blank name", () => {
    const result = parseImportFile(JSON.stringify([{ ...row, ho_ten: "" }]));

    expect(result).toEqual({ ok: false, reason: "missingFields", at: 1 });
  });

  it("reports a file that is not JSON", () => {
    expect(parseImportFile("not json at all")).toEqual({
      ok: false,
      reason: "notJson",
    });
  });

  it("reports JSON that is not a list of accounts", () => {
    expect(parseImportFile(JSON.stringify({ total: 17 }))).toEqual({
      ok: false,
      reason: "notArray",
    });
  });

  // The file carries plaintext passwords; the parser must hand them through
  // untouched but must never be the thing that widens their exposure.
  it("keeps the password on the parsed row and adds nothing else", () => {
    const result = parseImportFile(JSON.stringify([row]));

    expect(result.ok && Object.keys(result.users[0]).sort()).toEqual([
      "email",
      "ho_ten",
      "mat_khau_mac_dinh",
      "ten_dang_nhap",
    ]);
  });
});
