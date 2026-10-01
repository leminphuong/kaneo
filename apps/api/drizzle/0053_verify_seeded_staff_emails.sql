-- Marks the seeded staff addresses as verified where an account already
-- existed before 0052 ran.
--
-- 0052 inserts the staff accounts but, on purpose, leaves an address that
-- already has an account completely untouched - including its email_verified
-- flag. An account somebody registered for themselves on this instance before
-- the seed ran therefore stays unverified, and this instance sends no mail that
-- could ever verify it. Workspace single sign-on refuses to attach to an
-- unverified account (ACCOUNT_NOT_VERIFIED), so exactly the people who set the
-- instance up - who registered first - are the ones Workspace cannot sign in.
--
-- The administrator supplied these addresses as the staff list. The import
-- feature already treats that list as the authority that verifies an address,
-- and this extends the same authority to accounts that predate the seed. The
-- trade-off is the one the verified-email rule exists for: if a stranger had
-- registered here with a staff address before the seed, this would verify
-- their account. The directory is small enough for an administrator to read,
-- and the list below is fixed, so the exposure is reviewable rather than open.
--
-- Same test-database guard as 0052; see there for why.
UPDATE "user"
SET "email_verified" = true,
    "updated_at" = timezone('utc', now())
WHERE right(current_database(), 5) <> '_test'
  AND "email_verified" IS NOT TRUE
  AND "is_anonymous" IS NOT TRUE
  AND lower("email") IN (
    'baonghi30@gmail.com',
    'cuongca83886@gmail.com',
    'damvuong9xx@gmail.com',
    'info.joydigi@gmail.com',
    'maytjnh01@gmail.com',
    'namnguyenpluss@gmail.com',
    'ngtrungdoan2205@gmail.com',
    'nguyenhuutinh590@gmail.com',
    'nmtcuoi@gmail.com',
    'ntung251001@gmail.com',
    'phamthihonghanh2304@gmail.com',
    'phuonghole121201@gmail.com',
    'quangphucpham66@gmail.com',
    'tiensang131220@gmail.com',
    'tinh06092003@gmail.com',
    'vancuonggnt0207@gmail.com',
    'vudampro@gmail.com'
  );
