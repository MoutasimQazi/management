-- ════════════════════════════════════════════════════════════
-- Migration 005: QA / software-tester module
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others (phpMyAdmin → Import tab).
-- Safe to re-run.
--
-- Adds the QA role's data:
--   qa_assignments  which projects a QA account may see. QA is scoped
--                   to assigned projects only; ADMIN sees everything.
--   test_cases      reusable checks defined per project
--   test_runs       the result of executing a case on a given day
--   bugs            defects, optionally raised from a failed test run
--
-- `managers.role` is already VARCHAR(20), so 'QA' needs no schema change
-- — it just becomes another accepted value.
--
-- Every FK column is synced to the exact type of what it references
-- before the constraint is added (managers/projects/tasks/employees all
-- use int(10) unsigned here), because MySQL rejects a FK whose two sides
-- differ even slightly.
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

-- ── 1. Which projects each QA account can see ──
CREATE TABLE IF NOT EXISTS qa_assignments (
  qa_id      INT NOT NULL,
  project_id INT NOT NULL,
  PRIMARY KEY (qa_id, project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('qa_assignments', 'qa_id', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('qa_assignments', 'project_id', 'projects', 'project_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('qa_assignments', 'fk_qaa_manager',
  'ALTER TABLE qa_assignments ADD CONSTRAINT fk_qaa_manager FOREIGN KEY (qa_id) REFERENCES managers(manager_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('qa_assignments', 'fk_qaa_project',
  'ALTER TABLE qa_assignments ADD CONSTRAINT fk_qaa_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE');

-- ── 2. Test cases ──
CREATE TABLE IF NOT EXISTS test_cases (
  case_id     INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  title       VARCHAR(190) NOT NULL,
  steps       TEXT NULL,
  expected    TEXT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('test_cases', 'project_id', 'projects', 'project_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('test_cases', 'created_by', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('test_cases', 'fk_tc_project',
  'ALTER TABLE test_cases ADD CONSTRAINT fk_tc_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('test_cases', 'fk_tc_author',
  'ALTER TABLE test_cases ADD CONSTRAINT fk_tc_author FOREIGN KEY (created_by) REFERENCES managers(manager_id)');

-- ── 3. Test runs — one row per execution of a case ──
CREATE TABLE IF NOT EXISTS test_runs (
  run_id   INT AUTO_INCREMENT PRIMARY KEY,
  case_id  INT NOT NULL,
  result   VARCHAR(12) NOT NULL DEFAULT 'PASS',   -- PASS, FAIL, BLOCKED, SKIPPED
  notes    TEXT NULL,
  run_by   INT NOT NULL,
  run_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('test_runs', 'run_by', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('test_runs', 'fk_tr_case',
  'ALTER TABLE test_runs ADD CONSTRAINT fk_tr_case FOREIGN KEY (case_id) REFERENCES test_cases(case_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('test_runs', 'fk_tr_author',
  'ALTER TABLE test_runs ADD CONSTRAINT fk_tr_author FOREIGN KEY (run_by) REFERENCES managers(manager_id)');

-- ── 4. Bugs ──
-- task_id and case_id are optional: a bug can be filed straight against a
-- project, against a specific task, or raised from a failed test case.
CREATE TABLE IF NOT EXISTS bugs (
  bug_id      INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  task_id     INT NULL,
  case_id     INT NULL,
  title       VARCHAR(190) NOT NULL,
  steps       TEXT NULL,
  severity    VARCHAR(12) NOT NULL DEFAULT 'MEDIUM',  -- LOW, MEDIUM, HIGH, CRITICAL
  status      VARCHAR(14) NOT NULL DEFAULT 'OPEN',    -- OPEN, IN_PROGRESS, FIXED, VERIFIED, CLOSED, REOPENED
  reported_by INT NOT NULL,
  assigned_to INT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('bugs', 'project_id',  'projects',  'project_id',  'NOT NULL', NULL);
CALL _mig_sync_fk_column('bugs', 'task_id',     'tasks',     'task_id',     'NULL', NULL);
CALL _mig_sync_fk_column('bugs', 'reported_by', 'managers',  'manager_id',  'NOT NULL', NULL);
CALL _mig_sync_fk_column('bugs', 'assigned_to', 'employees', 'employee_id', 'NULL', NULL);
CALL _mig_add_constraint_if_missing('bugs', 'fk_bug_project',
  'ALTER TABLE bugs ADD CONSTRAINT fk_bug_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('bugs', 'fk_bug_task',
  'ALTER TABLE bugs ADD CONSTRAINT fk_bug_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL');
CALL _mig_add_constraint_if_missing('bugs', 'fk_bug_case',
  'ALTER TABLE bugs ADD CONSTRAINT fk_bug_case FOREIGN KEY (case_id) REFERENCES test_cases(case_id) ON DELETE SET NULL');
CALL _mig_add_constraint_if_missing('bugs', 'fk_bug_reporter',
  'ALTER TABLE bugs ADD CONSTRAINT fk_bug_reporter FOREIGN KEY (reported_by) REFERENCES managers(manager_id)');
CALL _mig_add_constraint_if_missing('bugs', 'fk_bug_assignee',
  'ALTER TABLE bugs ADD CONSTRAINT fk_bug_assignee FOREIGN KEY (assigned_to) REFERENCES employees(employee_id) ON DELETE SET NULL');

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
