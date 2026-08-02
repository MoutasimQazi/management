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
-- ════════════════════════════════════════════════════════════

-- ── 1. managers: add password + token columns, widen role ──
-- `role` is widened to VARCHAR so it can hold 'HR' and 'MARKETING'
-- in addition to the existing 'ADMIN' / 'MANAGER' values, whether
-- the column was originally VARCHAR or ENUM.
ALTER TABLE managers
  MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'MANAGER',
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER email,
  ADD COLUMN token VARCHAR(64) NULL AFTER password_hash;

ALTER TABLE managers ADD UNIQUE KEY uniq_managers_token (token);

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
ALTER TABLE employees
  ADD COLUMN email VARCHAR(190) NULL AFTER name,
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER email,
  ADD COLUMN token VARCHAR(64) NULL AFTER password_hash;

ALTER TABLE employees ADD UNIQUE KEY uniq_employees_email (email);
ALTER TABLE employees ADD UNIQUE KEY uniq_employees_token (token);

-- ── 3. tasks: ETA switches from a due-date to an hours estimate ──
-- The old `eta` DATE column is left in place (untouched, just no
-- longer read/written by the app) so no data is destroyed.
ALTER TABLE tasks ADD COLUMN eta_hours DECIMAL(6,1) NULL AFTER eta;

-- ── 4. questions: allow an employee (not just a manager) to ask ──
ALTER TABLE questions
  MODIFY COLUMN manager_id INT NULL,
  ADD COLUMN employee_id INT NULL AFTER manager_id;

ALTER TABLE questions
  ADD CONSTRAINT fk_questions_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id);

-- ── 5. HR: recruitment pipeline ──
CREATE TABLE IF NOT EXISTS job_openings (
  opening_id  INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(190) NOT NULL,
  department  VARCHAR(120) NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',   -- OPEN, ON_HOLD, CLOSED
  notes       TEXT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES managers(manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (reviewed_by) REFERENCES managers(manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id) REFERENCES managers(manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
