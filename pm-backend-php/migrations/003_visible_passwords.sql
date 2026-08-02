-- ════════════════════════════════════════════════════════════
-- Migration 003: ADMIN can view (not just one-time-see) the
-- current temporary password for any staff/employee login.
-- ────────────────────────────────────────────────────────────
-- Run the same way as 001/002 (phpMyAdmin → Import tab). Safe to
-- re-run.
--
-- Adds a `temp_password` column alongside `password_hash` on both
-- managers and employees, holding the plaintext of whatever
-- password is currently active. This is a deliberate tradeoff: it
-- means a DB compromise exposes live passwords, not just hashes —
-- acceptable here only because this is an internal tool with no
-- external users and no email-based reset flow to fall back on.
-- Only pm-managers-list.php / pm-employees-list.php (both already
-- gated so this value only ever reaches an ADMIN caller) return it.
-- ════════════════════════════════════════════════════════════

DELIMITER $$

DROP PROCEDURE IF EXISTS _mig_add_column_if_missing $$
CREATE PROCEDURE _mig_add_column_if_missing(
  IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_ddl VARCHAR(1000)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @mig_ddl = p_ddl;
    PREPARE mig_stmt FROM @mig_ddl;
    EXECUTE mig_stmt;
    DEALLOCATE PREPARE mig_stmt;
  END IF;
END $$

DELIMITER ;

CALL _mig_add_column_if_missing('managers', 'temp_password',
  'ALTER TABLE managers ADD COLUMN temp_password VARCHAR(20) NULL AFTER token');
CALL _mig_add_column_if_missing('employees', 'temp_password',
  'ALTER TABLE employees ADD COLUMN temp_password VARCHAR(20) NULL AFTER token');

DROP PROCEDURE IF EXISTS _mig_add_column_if_missing;
