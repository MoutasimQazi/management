-- ════════════════════════════════════════════════════════════
-- Migration 004: leave requests are addressed to one or MORE
-- managers — any one of them (or an ADMIN) approves/rejects.
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others (phpMyAdmin → Import tab).
-- Safe to re-run.
--
-- Junction table leave_approvers(leave_id, manager_id): the
-- requester picks the approvers when filing. HR keeps read
-- access for tracking but no longer approves. Rows from before
-- this migration have no approvers listed and fall back to
-- ADMIN-only review.
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

-- Created without FKs first, then columns are synced to the exact types
-- of what they reference, then the FKs attach — same dance as 001, since
-- managers.manager_id's exact type differs per install.
CREATE TABLE IF NOT EXISTS leave_approvers (
  leave_id   INT NOT NULL,
  manager_id INT NOT NULL,
  PRIMARY KEY (leave_id, manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('leave_approvers', 'leave_id', 'leave_requests', 'leave_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('leave_approvers', 'manager_id', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('leave_approvers', 'fk_lapp_leave',
  'ALTER TABLE leave_approvers ADD CONSTRAINT fk_lapp_leave FOREIGN KEY (leave_id) REFERENCES leave_requests(leave_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('leave_approvers', 'fk_lapp_manager',
  'ALTER TABLE leave_approvers ADD CONSTRAINT fk_lapp_manager FOREIGN KEY (manager_id) REFERENCES managers(manager_id)');

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
