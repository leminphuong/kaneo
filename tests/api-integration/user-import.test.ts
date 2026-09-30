import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";

const PASSWORD = "initial-password-123";

async function actingAs(role: "admin" | "user") {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name: "Importer",
      role,
    })
    .returning();
  mockAuthenticatedSession(user as never);
  return user;
}

function importRequest(users: unknown) {
  const { app } = createApp();
  return app.request("/api/import/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ users }),
  });
}

function row(email: string, password = PASSWORD) {
  return {
    ho_ten: "Le Minh Phuong",
    ten_dang_nhap: email.split("@")[0],
    email,
    mat_khau_mac_dinh: password,
  };
}

async function credentialHash(email: string) {
  const [user] = await db
    .select({ id: schema.userTable.id })
    .from(schema.userTable)
    .where(eq(schema.userTable.email, email));
  if (!user) return null;
  const [account] = await db
    .select({ password: schema.accountTable.password })
    .from(schema.accountTable)
    .where(eq(schema.accountTable.userId, user.id));
  return account?.password ?? null;
}

describe("importing user accounts", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses anyone who is not an instance administrator", async () => {
    await actingAs("user");

    const response = await importRequest([row("nobody@example.com")]);

    expect(response.status).toBe(403);
    const [existing] = await db
      .select({ id: schema.userTable.id })
      .from(schema.userTable)
      .where(eq(schema.userTable.email, "nobody@example.com"));
    expect(existing).toBeUndefined();
  });

  it("creates accounts that can sign in and that SSO can attach to", async () => {
    await actingAs("admin");

    const response = await importRequest([row("phuong@joydigi.net")]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      created: 1,
      existing: 0,
      failed: 0,
    });

    const [created] = await db
      .select()
      .from(schema.userTable)
      .where(eq(schema.userTable.email, "phuong@joydigi.net"));
    expect(created.name).toBe("Le Minh Phuong");
    // Account linking requires a verified local email, so an unverified
    // import would be unreachable by SSO with no way to fix it here.
    expect(created.emailVerified).toBe(true);

    const hash = await credentialHash("phuong@joydigi.net");
    expect(hash).toBeTruthy();
    expect(hash).not.toContain(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, hash as string)).toBe(true);
  });

  it("lower-cases the address so a second import cannot duplicate it", async () => {
    await actingAs("admin");

    await importRequest([row("Phuong@JoyDigi.net")]);
    const second = await importRequest([row("phuong@joydigi.net")]);

    expect(await second.json()).toMatchObject({ created: 0, existing: 1 });
  });

  it("never resets the password of an address that already exists", async () => {
    await actingAs("admin");

    await importRequest([row("staff@joydigi.net", "the-original-password")]);
    const before = await credentialHash("staff@joydigi.net");

    const again = await importRequest([
      row("staff@joydigi.net", "a-different-default"),
    ]);

    expect(await again.json()).toMatchObject({ created: 0, existing: 1 });
    expect(await credentialHash("staff@joydigi.net")).toBe(before);
    expect(
      await bcrypt.compare("the-original-password", before as string),
    ).toBe(true);
  });

  it("reports a row repeated inside one file rather than calling it existing", async () => {
    await actingAs("admin");

    const response = await importRequest([
      row("twice@joydigi.net"),
      row("twice@joydigi.net"),
    ]);

    const body = (await response.json()) as {
      created: number;
      failed: number;
      results: { status: string; message?: string }[];
    };
    expect(body).toMatchObject({ created: 1, failed: 1 });
    expect(body.results[1].message).toMatch(/file/i);
  });

  it("rejects a password too short to be usable", async () => {
    await actingAs("admin");

    const response = await importRequest([row("short@joydigi.net", "abc")]);

    expect(response.status).toBe(400);
  });
});
