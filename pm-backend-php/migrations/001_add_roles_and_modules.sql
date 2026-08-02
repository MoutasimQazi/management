-- ════════════════════════════════════════════════════════════
-- Migration 001: HR / Marketing / Employee logins + new modules
-- ────────────────────────────────────────────────────────────
-- Run this once against the movenetics_n8n database (phpMyAdmin,
-- or `mysql -u ... -p movenetics_n8n < 001_add_roles_and_modules.sql`).
--
-- Everything here is additive — no existing column is dropped and
-- no existing row's meaning changes, so the current Fireflies
-- Dispatch + Projects/Tasks/Questions flows keep working exactly
-- as they do today while this runs.
--
-- This version is SAFE TO RE-RUN: every ADD/DROP COLUMN, KEY, or
-- CONSTRAINT first checks current state and skips if there's nothing
-- to do, using small helper procedures dropped again at the end. Any
-- column that will hold a foreign key to managers.manager_id or
-- employees.employee_id is created/resized to match that column's
-- *exact* type (signedness, width, etc.) read live from
-- information_schema — MySQL/MariaDB reject a FOREIGN KEY whose two
-- sides don't match exactly, and guessing "INT" wasn't good enough.
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

-- MySQL/MariaDB refuse to MODIFY a column that's part of a foreign key,
-- even for a nullability-only change — this drops the FK first so that's
-- possible, and is a no-op if it's already gone.
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

-- Adds (or resizes, if it already exists) p_table.p_column so its type
-- exactly matches p_ref_table.p_ref_column — required before a FOREIGN
-- KEY between them will be accepted. p_after only matters when the
-- column doesn't exist yet (positions it after that column); pass NULL
-- when modifying an existing column.
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

-- ── 1. managers: add password + token columns, widen role ──
-- `role` is widened to VARCHAR so it can hold 'HR' and 'MARKETING'
-- in addition to the existing 'ADMIN' / 'MANAGER' values, whether
-- the column was originally VARCHAR or ENUM. MODIFY COLUMN is safe
-- to re-run on its own (it just redefines the column either way).
ALTER TABLE managers MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'MANAGER';

CALL _mig_add_column_if_missing('managers', 'password_hash',
  'ALTER TABLE managers ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
CALL _mig_add_column_if_missing('managers', 'token',
  'ALTER TABLE managers ADD COLUMN token VARCHAR(64) NULL AFTER password_hash');
CALL _mig_add_index_if_missing('managers', 'uniq_managers_token',
  'ALTER TABLE managers ADD UNIQUE KEY uniq_managers_token (token)');

-- Backfill the 6 existing managers' tokens with the exact values
-- already hardcoded in auth.php / the n8n "Check Credentials1" node,
-- so their Fireflies Dispatch access (which n8n validates against
-- its own copy of these same values) is completely unaffected.
UPDATE managers SET token = 'tok_yusuf_7d1c277c49791954'   WHERE email = 'yusuf.shaikh@moveneticsdigital.com';
UPDATE managers SET token = 'tok_akruti_1203f0abfeea57ea'  WHERE email = 'akruti.patel@moveneticsdigital.com';
UPDATE managers SET token = 'tok_binson_831812f4fc9ec934'  WHERE email = 'binson.abraham@moveneticsdigital.com';
UPDATE managers SET token = 'tok_sapna_45a4494a4bb99fff'   WHERE email = 'sapna.kaintu@moveneticsdigital.com';
UPDATE managers SET token = 'tok_noor_3673c02679e15c15'    WHERE email = 'noor.beskar@moveneticsdigital.com';
UPDATE managers SET token = 'tok_asad_18d02455c601d090'    WHERE email = 'asad.dongri@moveneticsdigital.com';

-- ── 2. employees: give employees an optional login of their own ──
-- All three columns are nullable — an employee row with no email
-- is just a roster entry (as today) and can't log in.
CALL _mig_add_column_if_missing('employees', 'email',
  'ALTER TABLE employees ADD COLUMN email VARCHAR(190) NULL AFTER name');
CALL _mig_add_column_if_missing('employees', 'password_hash',
  'ALTER TABLE employees ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
CALL _mig_add_column_if_missing('employees', 'token',
  'ALTER TABLE employees ADD COLUMN token VARCHAR(64) NULL AFTER password_hash');
CALL _mig_add_index_if_missing('employees', 'uniq_employees_email',
  'ALTER TABLE employees ADD UNIQUE KEY uniq_employees_email (email)');
CALL _mig_add_index_if_missing('employees', 'uniq_employees_token',
  'ALTER TABLE employees ADD UNIQUE KEY uniq_employees_token (token)');

-- ── 3. tasks: ETA switches from a due-date to an hours estimate ──
-- The old `eta` DATE column is left in place (untouched, just no
-- longer read/written by the app) so no data is destroyed.
CALL _mig_add_column_if_missing('tasks', 'eta_hours',
  'ALTER TABLE tasks ADD COLUMN eta_hours DECIMAL(6,1) NULL AFTER eta');

-- ── 4. questions: allow an employee (not just a manager) to ask ──
-- manager_id already has an FK (fk_question_manager) — drop it, sync
-- the column to managers.manager_id's exact type (now nullable), then
-- put the same FK back. employee_id is new, added matching
-- employees.employee_id's exact type so its own FK attaches cleanly.
CALL _mig_drop_constraint_if_exists('questions', 'fk_question_manager');
CALL _mig_sync_fk_column('questions', 'manager_id', 'managers', 'manager_id', 'NULL', NULL);
CALL _mig_add_constraint_if_missing('questions', 'fk_question_manager',
  'ALTER TABLE questions ADD CONSTRAINT fk_question_manager FOREIGN KEY (manager_id) REFERENCES managers(manager_id)');

CALL _mig_sync_fk_column('questions', 'employee_id', 'employees', 'employee_id', 'NULL', 'manager_id');
CALL _mig_add_constraint_if_missing('questions', 'fk_questions_employee',
  'ALTER TABLE questions ADD CONSTRAINT fk_questions_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)');

-- ── 5. HR: recruitment pipeline ──
CREATE TABLE IF NOT EXISTS job_openings (
  opening_id  INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(190) NOT NULL,
  department  VARCHAR(120) NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',   -- OPEN, ON_HOLD, CLOSED
  notes       TEXT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL _mig_sync_fk_column('job_openings', 'created_by', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('job_openings', 'fk_openings_manager',
  'ALTER TABLE job_openings ADD CONSTRAINT fk_openings_manager FOREIGN KEY (created_by) REFERENCES managers(manager_id)');

-- opening_id here references job_openings.opening_id, which this same
-- script just defined above — both sides are guaranteed to match, no
-- type-sync needed.
CREATE TABLE IF NOT EXISTS candidates (
  candidate_id INT AUTO_INCREMENT PRIMARY KEY,
  opening_id   INT NOT NULL,
  name         VARCHAR(190) NOT NULL,
  email        VARCHAR(190) NULL,
  phone        VARCHAR(40) NULL,
  stage        VARCHAR(20) NOT NULL DEFAULT 'APPLIED', -- APPLIED, SCREENING, INTERVIEW, OFFER, HIRED, REJECTED
  notes        TEXT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (opening_id) REFERENCES job_openings(opening_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. HR: leave requests (employee-filed, HR-reviewed) ──
-- Visible to every logged-in user (any role) so "who's on leave"
-- is transparent org-wide; only HR/ADMIN can approve or reject.
CREATE TABLE IF NOT EXISTS leave_requests (
  leave_id     INT AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       VARCHAR(500) NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, CANCELLED
  reviewed_by  INT NULL,
  reviewed_at  TIMESTAMP NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL _mig_sync_fk_column('leave_requests', 'employee_id', 'employees', 'employee_id', 'NOT NULL', NULL);
CALL _mig_sync_fk_column('leave_requests', 'reviewed_by', 'managers', 'manager_id', 'NULL', NULL);
CALL _mig_add_constraint_if_missing('leave_requests', 'fk_leave_employee',
  'ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)');
CALL _mig_add_constraint_if_missing('leave_requests', 'fk_leave_reviewer',
  'ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_reviewer FOREIGN KEY (reviewed_by) REFERENCES managers(manager_id)');

-- ── 7. Marketing: campaign / content calendar ──
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id     INT AUTO_INCREMENT PRIMARY KEY,
  manager_id      INT NOT NULL,   -- owner (the marketing account that created it)
  title           VARCHAR(190) NOT NULL,
  channel         VARCHAR(80) NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'IDEA', -- IDEA, PLANNED, IN_PROGRESS, PUBLISHED, CANCELLED
  scheduled_date  DATE NULL,
  notes           TEXT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL _mig_sync_fk_column('campaigns', 'manager_id', 'managers', 'manager_id', 'NOT NULL', NULL);
CALL _mig_add_constraint_if_missing('campaigns', 'fk_campaigns_manager',
  'ALTER TABLE campaigns ADD CONSTRAINT fk_campaigns_manager FOREIGN KEY (manager_id) REFERENCES managers(manager_id)');

-- ── cleanup: drop the helper procedures, they're only needed here ──
DROP PROCEDURE IF EXISTS _mig_add_column_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_index_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_drop_constraint_if_exists;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
