-- ════════════════════════════════════════════════════════════
-- Migration 012: audited due-date extensions
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others. Safe to re-run.
--
-- Work slips. Moving the date is fine; moving it silently is not. A due
-- date can now be pushed, but only with a reason, and every push is kept.
--
-- ── One table for all three kinds of work ──
-- A developer task, a design task and a QA bug all slip for the same
-- reasons and the admin wants one list, so this is (work_type, work_id)
-- rather than three parallel tables. That costs a real foreign key —
-- there is no way to point one column at three tables — so the id is
-- validated by the endpoint before anything is written, and the row is
-- deliberately never the source of truth: the current due date lives on
-- the work item as it always did. This is the history of how it got
-- there, and history with a dangling id is still readable.
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

DROP PROCEDURE IF EXISTS _mig_add_index_if_missing $$
CREATE PROCEDURE _mig_add_index_if_missing(
  IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_ddl VARCHAR(1000)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @mig_ddl = p_ddl;
    PREPARE mig_stmt FROM @mig_ddl;
    EXECUTE mig_stmt;
    DEALLOCATE PREPARE mig_stmt;
  END IF;
END $$

DELIMITER ;

-- Bugs never had a due date. Tasks got one in 010 and design tasks in
-- 009, so this is the last of the three — and a bug you have promised to
-- fix by Friday is exactly the kind of date that slips quietly.
CALL _mig_add_column_if_missing('bugs', 'due_date',
  'ALTER TABLE bugs ADD COLUMN due_date DATE NULL AFTER status');

CREATE TABLE IF NOT EXISTS due_extensions (
  extension_id INT AUTO_INCREMENT PRIMARY KEY,
  work_type    VARCHAR(12) NOT NULL,      -- TASK, DESIGN, BUG
  work_id      INT NOT NULL,
  project_id   INT NULL,                  -- denormalised, so the admin list needs no fan-out
  old_due      DATE NULL,                 -- NULL when a date is being set for the first time
  new_due      DATE NOT NULL,
  days_moved   INT NULL,                  -- NULL when there was no old date to move from
  reason       TEXT NOT NULL,
  extended_by  INT NOT NULL,              -- managers.manager_id
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The three questions asked of this table: everything recently, one
-- item's history, and one project's slippage.
CALL _mig_add_index_if_missing('due_extensions', 'idx_ext_recent',
  'ALTER TABLE due_extensions ADD INDEX idx_ext_recent (created_at)');
CALL _mig_add_index_if_missing('due_extensions', 'idx_ext_work',
  'ALTER TABLE due_extensions ADD INDEX idx_ext_work (work_type, work_id)');
CALL _mig_add_index_if_missing('due_extensions', 'idx_ext_project',
  'ALTER TABLE due_extensions ADD INDEX idx_ext_project (project_id, created_at)');

DROP PROCEDURE IF EXISTS _mig_add_column_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_index_if_missing;
