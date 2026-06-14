-- Trial-phase quota. The 60-minute-total default was too tight to even finish
-- one call with a few specialists, which crippled the "just try it" experience.
-- Bump the default to 300 (5 hours) and lift existing users who are still on
-- the old 60 default. Admins are effectively unlimited (dispatch exempts them).
-- Re-running is safe: SET DEFAULT is idempotent; the UPDATE only touches rows
-- still at exactly 60.
ALTER TABLE users ALTER COLUMN quota_minutes SET DEFAULT 300;
UPDATE users SET quota_minutes = 300 WHERE quota_minutes = 60;
