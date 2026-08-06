-- ════════════════════════════════════════════════════════════
-- Migration 008: bugs assignable to staff, not just developers
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others (phpMyAdmin → Import tab).
-- Safe to re-run.
--
-- `bugs.assigned_to` is a foreign key into `employees`, so a bug could
-- only ever land on a developer. QA and designers live in `managers`, so
-- a defect that is really a test-coverage gap or a visual problem had
-- nowhere to go.
--
-- Rather than loosen assigned_to into an untyped integer and lose the
-- foreign key on both sides, a second nullable column points at managers.
-- At most one of the two is set, and which one is set is what says
-- whether the assignee is a developer or a staff account. The database
-- cannot enforce "at most one" without a trigger, so the endpoints do:
-- assigning to either clears the other, in the same UPDATE.
--
-- Nothing already assigned changes — existing rows keep assigned_to and
-- keep meaning exactly what they meant before.
-- ════════════════════════════════════════════════════════════

DELIMITER $$

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing $$
CREATE PROCEDURE _mig_add_constraint_if_missing(
  IN p_table VARCHAR(64), IN p_constraint VARCHAR(64), IN p_ddl VARCHAR(1000)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_constraint
  ) THEN
    SET @mig_ddl = p_ddl;
    PREPARE mig_stmt FROM @mig_ddl;
    EXECUTE mig_stmt;
    DEALLOCATE PREPARE mig_stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS _mig_sync_fk_column $$
CREATE PROCEDURE _mig_sync_fk_column(
  IN p_table VARCHAR(64), IN p_column VARCHAR(64),
  IN p_ref_table VARCHAR(64), IN p_ref_column VARCHAR(64),
  IN p_nullability VARCHAR(10), IN p_after VARCHAR(64)
)
BEGIN
  DECLARE ref_type VARCHAR(100);
  DECLARE col_exists INT;
  SET ref_type = (
    SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_ref_table AND COLUMN_NAME = p_ref_column
  );
  SET col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  );
  IF col_exists = 0 THEN
    SET @mig_ddl = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_column, ' ', ref_type, ' ', p_nullability,
      IF(p_after IS NOT NULL AND p_after <> '', CONCAT(' AFTER ', p_after), ''));
  ELSE
    SET @mig_ddl = CONCAT('ALTER TABLE ', p_table, ' MODIFY COLUMN ', p_column, ' ', ref_type, ' ', p_nullability);
  END IF;
  PREPARE mig_stmt FROM @mig_ddl;
  EXECUTE mig_stmt;
  DEALLOCATE PREPARE mig_stmt;
END $$

DELIMITER ;

CALL _mig_sync_fk_column('bugs', 'assigned_manager_id', 'managers', 'manager_id', 'NULL', 'assigned_to');
CALL _mig_add_constraint_if_missing('bugs', 'fk_bug_assignee_mgr',
  'ALTER TABLE bugs ADD CONSTRAINT fk_bug_assignee_mgr FOREIGN KEY (assigned_manager_id) REFERENCES managers(manager_id) ON DELETE SET NULL');

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
