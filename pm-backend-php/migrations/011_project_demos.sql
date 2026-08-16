-- ════════════════════════════════════════════════════════════
-- Migration 011: demo dates on a project
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others. Safe to re-run.
--
-- A project can have several demos — an internal run-through, then the
-- client one, sometimes a dry run before either — so this is a table and
-- not a column on `projects`. Each carries its own date, type and notes.
--
-- Everyone working on the project can see them: the business analyst who
-- owns it, the developers holding tasks on it, and the QA and designers
-- assigned to it. Who counts as "on the project" is decided by
-- projectInvolvementScope() in auth.php, in one place, because leave
-- clash warnings have to use exactly the same answer as the demo list.
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

CREATE TABLE IF NOT EXISTS project_demos (
  demo_id     INT AUTO_INCREMENT PRIMARY KEY,
  project_id  INT NOT NULL,
  demo_type   VARCHAR(16) NOT NULL DEFAULT 'INTERNAL',  -- INTERNAL, CLIENT, STAKEHOLDER, DRY_RUN, OTHER
  title       VARCHAR(190) NULL,
  demo_date   DATE NOT NULL,
  demo_time   TIME NULL,                                 -- optional; a date alone is a valid plan
  notes       TEXT NULL,
  status      VARCHAR(12) NOT NULL DEFAULT 'PLANNED',    -- PLANNED, DONE, CANCELLED
  created_by  INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _mig_sync_fk_column('project_demos', 'project_id', 'projects', 'project_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('project_demos', 'created_by', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('project_demos', 'fk_demo_project',
  'ALTER TABLE project_demos ADD CONSTRAINT fk_demo_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE');
CALL _mig_add_constraint_if_missing('project_demos', 'fk_demo_author',
  'ALTER TABLE project_demos ADD CONSTRAINT fk_demo_author FOREIGN KEY (created_by) REFERENCES managers(manager_id)');

-- The two questions asked of this table: "what is coming up on my
-- projects" and "does this leave land on a demo".
CALL _mig_add_index_if_missing('project_demos', 'idx_demo_date',
  'ALTER TABLE project_demos ADD INDEX idx_demo_date (demo_date, status)');
CALL _mig_add_index_if_missing('project_demos', 'idx_demo_project_date',
  'ALTER TABLE project_demos ADD INDEX idx_demo_project_date (project_id, demo_date)');

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_index_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
