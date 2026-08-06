-- ════════════════════════════════════════════════════════════
-- Migration 007: evidence links on bugs and test cases
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others (phpMyAdmin → Import tab).
-- Safe to re-run.
--
-- Adds `link` to bugs and test_cases, the same column the design module
-- already has: a pointer to where the real thing lives, never the thing
-- itself. For a bug that is the screenshot or the screen recording of it
-- happening; for a test case, the spec or sheet it came from.
--
-- Nothing is stored but the URL, so nothing here has to be kept in step
-- with Drive, Loom or wherever the file actually sits.
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

CALL _mig_add_column_if_missing('bugs', 'link',
  'ALTER TABLE bugs ADD COLUMN link VARCHAR(500) NULL AFTER steps');

CALL _mig_add_column_if_missing('test_cases', 'link',
  'ALTER TABLE test_cases ADD COLUMN link VARCHAR(500) NULL AFTER expected');

DROP PROCEDURE IF EXISTS _mig_add_column_if_missing;
