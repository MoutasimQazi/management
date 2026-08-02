-- ════════════════════════════════════════════════════════════
-- Migration 002: Managers/Admins (and HR/Marketing) can file
-- their own leave requests, not just on behalf of an employee.
-- ────────────────────────────────────────────────────────────
-- Run this the same way as 001 (phpMyAdmin → Import tab, since it
-- also uses temporary stored procedures via DELIMITER). Safe to
-- re-run — same idempotent pattern as 001.
--
-- leave_requests gains a nullable `manager_id` sibling to the
-- existing `employee_id` (also now nullable) — exactly one of the
-- two is set per row, enforced by pm-leave-create.php, not the DB.
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

DROP PROCEDURE IF EXISTS _mig_drop_constraint_if_exists $$
CREATE PROCEDURE _mig_drop_constraint_if_exists(
  IN p_table VARCHAR(64), IN p_constraint VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_constraint
  ) THEN
    SET @mig_ddl = CONCAT('ALTER TABLE ', p_table, ' DROP FOREIGN KEY ', p_constraint);
    PREPARE mig_stmt FROM @mig_ddl;
    EXECUTE mig_stmt;
    DEALLOCATE PREPARE mig_stmt;
  END IF;
END $$

-- Same helper as 001 — adds/resizes p_table.p_column to match
-- p_ref_table.p_ref_column's exact type, required for the FK to attach.
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

-- employee_id already has fk_leave_employee — drop it so its
-- nullability can change, then put it back.
CALL _mig_drop_constraint_if_exists('leave_requests', 'fk_leave_employee');
CALL _mig_sync_fk_column('leave_requests', 'employee_id', 'employees', 'employee_id', 'NULL', NULL);
CALL _mig_add_constraint_if_missing('leave_requests', 'fk_leave_employee',
  'ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)');

-- manager_id is new — a staff member (Manager/Admin/HR/Marketing)
-- filing leave for themselves.
CALL _mig_sync_fk_column('leave_requests', 'manager_id', 'managers', 'manager_id', 'NULL', 'employee_id');
CALL _mig_add_constraint_if_missing('leave_requests', 'fk_leave_manager',
  'ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_manager FOREIGN KEY (manager_id) REFERENCES managers(manager_id)');

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_drop_constraint_if_exists;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
