-- Seeds the JoyDigi staff accounts so a fresh deployment has them without a
-- manual import step.
--
-- Only bcrypt hashes are stored here, never the initial passwords themselves:
-- this file lives in git forever, and a plaintext password committed once is
-- compromised for good. The hashes use the same cost factor as sign-up
-- (bcrypt, 10), so these accounts verify exactly like any other.
--
-- Never seeds a test database. The integration harness requires a database
-- whose name ends in "_test" and asserts that on startup, so the suffix is a
-- reliable marker. Without the guard these rows become the earliest users in
-- every test run and break the first-user-becomes-administrator tests - which
-- is the very behaviour the final statement here has to work around.
--
-- email_verified is true because an administrator supplying a staff list is
-- the authority for those addresses, and this instance sends no verification
-- mail that could establish it later. Linking an SSO identity requires a
-- verified local email, so leaving it false would make every seeded account
-- unreachable by SSO.
--
-- Idempotent by address: ON CONFLICT DO NOTHING means an address that already
-- has an account keeps its own password. This never resets anybody. An
-- account with no credential row (SSO-only) is likewise left untouched,
-- because silently attaching a password to it would be a new way in.
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'fas04uuf4sqwz4fzxu06ni00', 'Đỗ Văn Nghị', 'baonghi30@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'zkstho6bq7b07dqmlq2w3y4e', "id", 'credential', "id", '$2b$10$OXj0hASglPwm5XlioQuF8OvevxxQBknOd1x98hjvqXqYOqxMaBqBG', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'v7xtwsa2tu2roz7ypivwr7jv', 'Nguyễn Huy Cường', 'cuongca83886@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'afkgrdsy7yw731id9j06jxqv', "id", 'credential', "id", '$2b$10$MqPBwGOn9sK.PZKDKec42ufiCo3gApaSBDRBhrYb.yrj7K5u2qDga', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'ewc4e59oa07osbwdx96gg8ua', 'Đàm Văn Vương', 'damvuong9xx@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'd9zpdpvg044mxvgpoidemg2i', "id", 'credential', "id", '$2b$10$JRNAiUDzuBt/TpREAAsh5eo8SQVF4CUK/TIUqHyvNQXctoONBVewW', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'yeorbsikdz4scq72zcet14v6', 'ADMIN JOYDIGI', 'info.joydigi@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'elimrnvbn2z4upzsgd15jman', "id", 'credential', "id", '$2b$10$8yHetZOyuXRUIe5e3tJvkuFL/vUL4zxlshafLiQUXh1QYwaz2U7yq', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'pf4g8bzs6bjh8nxmimjtocnz', 'Lê Đức Thọ', 'maytjnh01@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'ptw2xq8ez18rqlegfzr0wsrr', "id", 'credential', "id", '$2b$10$ynGnF0Zq/bopCJtBWE/hgOiSChnXGF7Lp1qWY76E9EVGaFirR2Bqy', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'nmt6ywrihdnmlte7jeu941kf', 'Nguyễn Văn Nam', 'namnguyenpluss@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'w0w6pkfld23nqf7nglutx6d3', "id", 'credential', "id", '$2b$10$xkysjvPOePvgSuY1RKkgr.cjvykju735GaioUXQW.gfGkuyhaGEEm', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'lobgl7p9ovp57vsjlya8k6nq', 'Nguyễn Minh Tân', 'nmtcuoi@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'jclvxrqnzj1csbq4qz7a3x6n', "id", 'credential', "id", '$2b$10$sV2/ufLKLualyoeOhYQyEuGBX2oo3KCswRWNG1b/b6ml36swnR8aC', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'hwhry5e45q2uul6bznw59pr8', 'Trần Ngọc Tùng', 'ntung251001@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'xgr3mxzseiu5c2u8wgbzeegc', "id", 'credential', "id", '$2b$10$OUFpL2LttF2OtENoutoIF.nkSPl1Q.ecwed/HFTTY46TlZe7e9STe', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'f1yyxuvvj0y247w0d4g65y5c', 'Nguyễn Trung Đoàn', 'ngtrungdoan2205@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'm7733xb6qkyh61u4odvv4nge', "id", 'credential', "id", '$2b$10$E5CfMq/m8mlqLyytB8u.lueQn5XuwV1F8wQLRTvM55OmrBG2J0Y62', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'yz4zlm3it1sf5eb6i5upk8t5', 'Nguyễn Hữu Tình', 'nguyenhuutinh590@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'y1u27e2z30o9hfpp4cdqusf9', "id", 'credential', "id", '$2b$10$oQO.zi1cXncLwC2oMYlCq./XC9lj482vPt5zCRASlnMixUmXo22nq', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'c0x88qt122m2rdlvj68fkaue', 'Phạm Thị Hồng Hạnh', 'phamthihonghanh2304@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'tg8m0k4cv0ph3odlbr0vl6vq', "id", 'credential', "id", '$2b$10$CgeWNi4V9slk5PKZP9IQnOQzLcrTE/FcldS6rQR75cAeyxzmWrqu6', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'hhi2m248z194smtmk2as52b6', 'Lê Minh Phương', 'phuonghole121201@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'j9yfzwwthx7nij6lp6681jmy', "id", 'credential', "id", '$2b$10$zHkmrBc9j06r91MjstFYcedVH16OKHtaNaTQtDB1ZXuzMLwJOLwKy', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'n0e38dhp3m2d4slba78hdz66', 'Phạm Quang Phúc', 'quangphucpham66@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'n7mm7e2qhe0k25g9akl1zs9z', "id", 'credential', "id", '$2b$10$xrHUf9HiGJ4Ro1RyV4YntuMqeKf7AvW8k82I8bPtfUscyOokJXm5a', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'tia7r3y0bqtptwr1pgk7iwjo', 'Nguyễn Tiến Sáng', 'tiensang131220@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'rsn30k34ord3a03brbt9oufq', "id", 'credential', "id", '$2b$10$vbbaSpEpwLJ5oxnonZ6GJ.KbnCVUJOa1WJTWGD4pDbBPsIwV5C/JG', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'zhenxkrt3sj621se0vaodsqy', 'Nguuyễn Hữu Tính', 'tinh06092003@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'lyl61ffuk0x2h8wd7i7rdpd7', "id", 'credential', "id", '$2b$10$ug3xuaG8ZIhZMBbT/1iLn.6tAMWDrIyLtKxYROCweCjXuMktI0NFG', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'z88e4feueghk00et7k43hnlg', 'Nguyễn Văn Cường', 'vancuonggnt0207@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'wqhtr2frc3jz10m0ev0ngq71', "id", 'credential', "id", '$2b$10$VleRMxHMfUiM1fPMJEM.Ue6lxOPTkiNeCPp1lEz38gjMSEFKSf5Ny', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
  SELECT 'xf59ll439quj3tya46dckcpr', 'Đàm Văn Vũ', 'vudampro@gmail.com', true, timezone('utc', now()), timezone('utc', now())
  WHERE right(current_database(), 5) <> '_test'
  ON CONFLICT ("email") DO NOTHING
  RETURNING "id"
)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'hnvrqqlt53txuzygnhl63hw7', "id", 'credential', "id", '$2b$10$8SW3OG/VGYirihv4qY0kAefhMfiOu.Pt4Qg0inz89Pf5L1KSEdudS', timezone('utc', now()), timezone('utc', now())
FROM inserted;
--> statement-breakpoint
-- promoteInitialAdministrator() only ever elects the EARLIEST registered user,
-- and returns without promoting anybody when that user is not the one signing
-- up. Seeding therefore consumes the initial-administrator slot: on an
-- instance that has no administrator yet, no later signup could ever be
-- promoted and the instance would be left permanently without one. Claim the
-- slot for the account the export itself names as the administrator, and only
-- when no administrator exists, so an instance that already has one is never
-- altered.
UPDATE "user"
SET "role" = 'admin'
WHERE "email" = 'info.joydigi@gmail.com'
  AND right(current_database(), 5) <> '_test'
  AND NOT EXISTS (
    SELECT 1 FROM "user" AS existing
    WHERE existing."role" = 'admin' AND existing."is_anonymous" IS NOT TRUE
  );
