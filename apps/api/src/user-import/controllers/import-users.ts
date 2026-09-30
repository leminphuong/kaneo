import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import db from "../../database";
import { accountTable, userTable } from "../../database/schema";

export type ImportUserRow = {
  ho_ten: string;
  ten_dang_nhap: string;
  email: string;
  mat_khau_mac_dinh: string;
};

export type ImportUserOutcome = {
  email: string;
  status: "created" | "exists" | "error";
  /** Never contains the password. Safe to show in the UI and to log. */
  message?: string;
};

export type ImportUsersResult = {
  created: number;
  existing: number;
  failed: number;
  results: ImportUserOutcome[];
};

// Matches the cost factor auth.ts uses for password hashing, so an imported
// account verifies exactly like one created through sign-up.
const BCRYPT_ROUNDS = 10;

async function importUsers(rows: ImportUserRow[]): Promise<ImportUsersResult> {
  const results: ImportUserOutcome[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const name = row.ho_ten.trim();

    // A file that lists the same address twice would otherwise report the
    // second one as "already existed", which reads like it was already in the
    // database rather than a duplicate line in the file.
    if (seen.has(email)) {
      results.push({
        email,
        status: "error",
        message: "Duplicated in the uploaded file",
      });
      continue;
    }
    seen.add(email);

    try {
      const existing = await db.query.userTable.findFirst({
        where: sql`lower(${userTable.email}) = ${email}`,
        columns: { id: true },
      });

      if (existing) {
        // Never touch an existing account: its password is the person's own by
        // now, and the default in this file must not reset it.
        results.push({ email, status: "exists" });
        continue;
      }

      const passwordHash = await bcrypt.hash(
        row.mat_khau_mac_dinh,
        BCRYPT_ROUNDS,
      );

      await db.transaction(async (tx) => {
        const userId = createId();

        await tx.insert(userTable).values({
          id: userId,
          name,
          email,
          // An administrator uploading a staff list is the authority for these
          // addresses, and account linking requires a verified local email
          // before an SSO identity can attach to it. Leaving this false would
          // make every imported account unreachable by SSO, and this instance
          // sends no verification email to fix it afterwards.
          emailVerified: true,
        });

        await tx.insert(accountTable).values({
          id: createId(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        });
      });

      results.push({ email, status: "created" });
    } catch (error) {
      results.push({
        email,
        status: "error",
        // The row carries a password, so only the error text is surfaced.
        message: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  return {
    created: results.filter((r) => r.status === "created").length,
    existing: results.filter((r) => r.status === "exists").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  };
}

export default importUsers;
