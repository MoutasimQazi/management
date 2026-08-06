-- ════════════════════════════════════════════════════════════
-- Migration 006: Designer / UI-UX module
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others (phpMyAdmin → Import tab).
-- Safe to re-run.
--
-- Adds the DESIGNER role's data:
--   design_assignments  which projects a designer account may see.
--                       Designers are scoped to assigned projects only,
--                       exactly as QA is; ADMIN sees everything.
--   design_tasks        a piece of design work on a project — a screen,
--                       a flow, a logo — with a brief, a link to the
--                       deliverable, and a review state.
--
-- `managers.role` is VARCHAR(20), so 'DESIGNER' needs no schema change
-- — it just becomes another accepted value, the same way 'QA' did.
--
-- Why designers sit in `managers` and not `employees`: a designer works
-- across whole projects rather than being handed items off one project's
-- task list, which is the same shape QA has. The trade is that they
-- cannot be the assignee of a row in `tasks` (that column points at
-- employees), so design work is tracked here instead.
--
-- Every FK column is synced to the exact type of what it references
-- before the constraint is added, because MySQL rejects a FK whose two
-- sides differ even slightly.
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

-- A plain index is not a constraint, so it does not appear in
-- TABLE_CONSTRAINTS — checking there would re-add it on every run and
-- fail with "Duplicate key name". Indexes live in STATISTICS.
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

-- ── 1. Which projects each designer account can see ──
CREATE TABLE IF NOT EXISTS design_assignments (
  designer_id INT NOT NULL,
  project_id  INT NOT NULL,
  PRIMARY KEY (designer_id, project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('design_assignments', 'designer_id', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('design_assignments', 'project_id', 'projects', 'project_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('design_assignments', 'fk_da_manager',
  'ALTER TABLE design_assignments ADD CONSTRAINT fk_da_manager FOREIGN KEY (designer_id) REFERENCES managers(manager_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('design_assignments', 'fk_da_project',
  'ALTER TABLE design_assignments ADD CONSTRAINT fk_da_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE');

-- ── 2. Design tasks ──
-- `link` is where the actual work lives (Figma, Drive, wherever). The
-- deliverable is never stored here — only a pointer to it, so nothing in
-- this database has to be kept in step with a design tool.
--
-- `assigned_to` is nullable so a manager can queue work up before there
-- is a designer free to take it.
CREATE TABLE IF NOT EXISTS design_tasks (
  design_id   INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  title       VARCHAR(190) NOT NULL,
  brief       TEXT NULL,
  kind        VARCHAR(16) NOT NULL DEFAULT 'UI',      -- UI, UX, BRANDING, ILLUSTRATION, OTHER
  status      VARCHAR(14) NOT NULL DEFAULT 'TODO',    -- TODO, IN_PROGRESS, IN_REVIEW, CHANGES, APPROVED
  link        VARCHAR(500) NULL,
  due_date    DATE NULL,
  assigned_to INT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('design_tasks', 'project_id',  'projects', 'project_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('design_tasks', 'assigned_to', 'managers', 'manager_id', 'NULL', NULL);
CALL _mig_sync_fk_column('design_tasks', 'created_by',  'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('design_tasks', 'fk_dt_project',
  'ALTER TABLE design_tasks ADD CONSTRAINT fk_dt_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('design_tasks', 'fk_dt_assignee',
  'ALTER TABLE design_tasks ADD CONSTRAINT fk_dt_assignee FOREIGN KEY (assigned_to) REFERENCES managers(manager_id) ON DELETE SET NULL');
CALL _mig_add_constraint_if_missing('design_tasks', 'fk_dt_author',
  'ALTER TABLE design_tasks ADD CONSTRAINT fk_dt_author FOREIGN KEY (created_by) REFERENCES managers(manager_id)');

-- The board is read per project and per assignee far more often than by
-- id, and "my open work" is the first query the designer page runs.
CALL _mig_add_index_if_missing('design_tasks', 'idx_dt_project_status',
  'ALTER TABLE design_tasks ADD INDEX idx_dt_project_status (project_id, status)');
CALL _mig_add_index_if_missing('design_tasks', 'idx_dt_assignee',
  'ALTER TABLE design_tasks ADD INDEX idx_dt_assignee (assigned_to, status)');

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_index_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
