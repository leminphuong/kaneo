import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { UserToImport } from "@/fetchers/admin/import-users";
import useImportUsers from "@/hooks/mutations/admin/use-import-users";

const REQUIRED_FIELDS = [
  "ho_ten",
  "ten_dang_nhap",
  "email",
  "mat_khau_mac_dinh",
] as const;

type ParseResult =
  | { ok: true; users: UserToImport[] }
  | {
      ok: false;
      reason: "notJson" | "notArray" | "missingFields";
      at?: number;
    };

/**
 * Parsed here rather than on the server so a malformed file is rejected before
 * any password crosses the network, and the person is told which row is wrong.
 */
export function parseImportFile(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "notJson" };
  }

  // The export is a bare array; accept { users: [...] } too since that is what
  // the API itself takes and people paste it back.
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { users?: unknown })?.users)
      ? (parsed as { users: unknown[] }).users
      : null;

  if (!rows) return { ok: false, reason: "notArray" };

  const users: UserToImport[] = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object") {
      return { ok: false, reason: "missingFields", at: index + 1 };
    }
    const record = row as Record<string, unknown>;
    if (
      REQUIRED_FIELDS.some(
        (field) => typeof record[field] !== "string" || !record[field],
      )
    ) {
      return { ok: false, reason: "missingFields", at: index + 1 };
    }
    users.push({
      ho_ten: String(record.ho_ten),
      ten_dang_nhap: String(record.ten_dang_nhap),
      email: String(record.email),
      mat_khau_mac_dinh: String(record.mat_khau_mac_dinh),
    });
  }

  return { ok: true, users };
}

export function ImportUsersCard() {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [users, setUsers] = useState<UserToImport[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const importUsers = useImportUsers();

  const handleFile = async (file: File) => {
    importUsers.reset();
    setFileName(file.name);
    const result = parseImportFile(await file.text());

    if (!result.ok) {
      setUsers(null);
      setParseError(
        result.reason === "missingFields"
          ? t("settings:importUsers.errors.missingFields", { row: result.at })
          : t(`settings:importUsers.errors.${result.reason}`),
      );
      return;
    }

    setParseError(null);
    setUsers(result.users);
  };

  const result = importUsers.data;

  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h2 className="font-medium text-md">{t("settings:importUsers.title")}</h2>
      <p className="mt-1 text-muted-foreground text-xs">
        {t("settings:importUsers.description")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            // Let the same file be picked again after a failed attempt.
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {t("settings:importUsers.chooseFile")}
        </Button>

        {fileName && (
          <span className="text-muted-foreground text-xs">
            {users
              ? t("settings:importUsers.ready", {
                  file: fileName,
                  count: users.length,
                })
              : fileName}
          </span>
        )}

        {users && users.length > 0 && (
          <Button
            type="button"
            disabled={importUsers.isPending}
            onClick={() => importUsers.mutate(users)}
          >
            {importUsers.isPending
              ? t("settings:importUsers.importing")
              : t("settings:importUsers.import", { count: users.length })}
          </Button>
        )}
      </div>

      {parseError && (
        <p role="alert" className="mt-3 text-destructive text-sm">
          {parseError}
        </p>
      )}

      {importUsers.isError && (
        <p role="alert" className="mt-3 text-destructive text-sm">
          {t("settings:importUsers.errors.failed")}
        </p>
      )}

      {result && (
        <div className="mt-4">
          <p className="text-sm">
            {t("settings:importUsers.summary", {
              created: result.created,
              existing: result.existing,
              failed: result.failed,
            })}
          </p>

          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {result.results.map((row) => (
              <li
                key={row.email}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="truncate">{row.email}</span>
                <span
                  className={
                    row.status === "created"
                      ? "shrink-0 text-success-foreground"
                      : row.status === "error"
                        ? "shrink-0 text-destructive"
                        : "shrink-0 text-muted-foreground"
                  }
                >
                  {t(`settings:importUsers.status.${row.status}`)}
                  {row.message ? ` — ${row.message}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ImportUsersCard;
