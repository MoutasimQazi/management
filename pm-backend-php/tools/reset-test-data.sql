-- ════════════════════════════════════════════════════════════
-- RESET TEST DATA — clears the workspace back to an empty one
-- ────────────────────────────────────────────────────────────
-- Deletes the data you entered while testing: leave, tasks, projects,
-- bugs, test cases, design work, demos, questions, campaigns, openings,
-- candidates, developers and staff accounts. The schema is untouched —
-- nothing is dropped, only emptied.
--
-- ── Why this is NOT numbered 013 ────────────────────────────
-- The files in ../migrations are safe to re-run and are imported in
-- order, so anyone setting up a database runs the whole set. A wipe
-- inside that sequence would destroy live data the next time somebody
-- did that. This is a tool you reach for deliberately, once, so it
-- lives outside the sequence and cannot be run by accident.
--
-- ── How to run it ───────────────────────────────────────────
--   1. Take a backup first. phpMyAdmin → Export → Go. This script has
--      no undo, and "I thought it was the test database" is the usual
--      way that lesson gets learnt.
--   2. Edit the ARM line below: change '' to 'RESET'.
--   3. phpMyAdmin → your database → Import → choose this file → Go.
--      Leave "Ignore errors" UNTICKED, or the safety checks below
--      cannot stop anything.
--
-- Unedited, it stops on the first statement and changes nothing.
-- ════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
--  ARM  ·  type RESET between the quotes to allow the delete
-- ─────────────────────────────────────────────────────────────
SET @ARM = '';


-- ── Options ──────────────────────────────────────────────────
-- Keep every ADMIN login. Leave this at 1 unless you have another way
-- into the database: deleting the last admin locks you out of the app
-- and no screen inside it can undo that. The check below refuses to
-- leave you with zero admins either way.
SET @KEEP_ADMINS = 1;

-- The rate cards (design_estimates, which holds the DEV rows too) are
-- company policy you typed in, not test data, so they are kept by
-- default. Set to 1 to clear them and re-import migrations 009 and 010
-- to get the original figures back.
SET @WIPE_RATE_CARD = 0;


DELIMITER $$

-- Refuses to go on unless the ARM line was edited. This runs before
-- anything destructive, so an unedited file is a no-op.
DROP PROCEDURE IF EXISTS _reset_check $$
CREATE PROCEDURE _reset_check()
BEGIN
  DECLARE v_admins INT DEFAULT 0;

  IF NOT (@ARM <=> 'RESET') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Nothing was deleted. Open this file, set @ARM = ''RESET'' near the top, and import it again.';
  END IF;

  -- Locking yourself out is not recoverable from inside the app, so it
  -- is refused here rather than explained afterwards.
  SELECT COUNT(*) INTO v_admins
    FROM managers WHERE role = 'ADMIN' AND is_active = 1;

  IF v_admins = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Nothing was deleted: there is no active ADMIN account, so this would leave nobody able to sign in.';
  END IF;

  IF @KEEP_ADMINS <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Nothing was deleted: @KEEP_ADMINS is not 1, which would delete every admin login and lock you out.';
  END IF;
END $$

-- Empties one table, if this database has it. A workspace that has not
-- imported every migration is missing some of these entirely, and a
-- reset should not depend on which ones.
DROP PROCEDURE IF EXISTS _reset_wipe $$
CREATE PROCEDURE _reset_wipe(IN p_table VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
  ) THEN
    SET @rst = CONCAT('DELETE FROM `', p_table, '`');
    PREPARE rst_stmt FROM @rst; EXECUTE rst_stmt; DEALLOCATE PREPARE rst_stmt;

    -- Start ids at 1 again, so a fresh workspace looks fresh. Skipped
    -- for the join tables (leave_approvers, qa_assignments,
    -- design_assignments), which have composite keys and no counter —
    -- ALTER ... AUTO_INCREMENT would error on those.
    IF EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
        AND EXTRA LIKE '%auto_increment%'
    ) THEN
      SET @rst = CONCAT('ALTER TABLE `', p_table, '` AUTO_INCREMENT = 1');
      PREPARE rst_stmt FROM @rst; EXECUTE rst_stmt; DEALLOCATE PREPARE rst_stmt;
    END IF;
  END IF;
END $$

-- Counts what is left, for the report at the end.
DROP PROCEDURE IF EXISTS _reset_count $$
CREATE PROCEDURE _reset_count(IN p_table VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
  ) THEN
    SET @rst = CONCAT(
      'INSERT INTO _reset_report (table_name, rows_left) ',
      'SELECT ''', p_table, ''', COUNT(*) FROM `', p_table, '`');
    PREPARE rst_stmt FROM @rst; EXECUTE rst_stmt; DEALLOCATE PREPARE rst_stmt;
  ELSE
    INSERT INTO _reset_report (table_name, rows_left)
    VALUES (p_table, NULL);          -- table not in this database
  END IF;
END $$

-- The rate cards, only when asked. A procedure because plain SQL has no
-- IF outside one, and every procedure in this file is defined here so
-- the DELIMITER is switched exactly once.
DROP PROCEDURE IF EXISTS _reset_rates $$
CREATE PROCEDURE _reset_rates()
BEGIN
  IF @WIPE_RATE_CARD = 1 THEN
    CALL _reset_wipe('design_estimates');
  END IF;
END $$

DELIMITER ;


-- ════════════════════════════════════════════════════════════
--  Stop here unless armed.
-- ════════════════════════════════════════════════════════════
CALL _reset_check();


-- Child rows are deleted before their parents below, but the checks are
-- lifted anyway: a full wipe cannot orphan anything, and a table this
-- file has mis-ordered should not abort the run half-done.
SET FOREIGN_KEY_CHECKS = 0;

-- ── QA ───────────────────────────────────────────────────────
CALL _reset_wipe('test_runs');          -- results of a test case
CALL _reset_wipe('bugs');
CALL _reset_wipe('test_cases');
CALL _reset_wipe('qa_assignments');     -- which QA sees which project

-- ── Design ───────────────────────────────────────────────────
CALL _reset_wipe('design_tasks');
CALL _reset_wipe('design_assignments'); -- which designer sees which project

-- ── Dates and audit trail ────────────────────────────────────
CALL _reset_wipe('due_extensions');     -- every deadline that moved
CALL _reset_wipe('project_demos');

-- ── Leave ────────────────────────────────────────────────────
CALL _reset_wipe('leave_approvers');    -- who each request was sent to
CALL _reset_wipe('leave_requests');

-- ── Project work ─────────────────────────────────────────────
CALL _reset_wipe('questions');
CALL _reset_wipe('tasks');
CALL _reset_wipe('projects');

-- ── Marketing and HR ─────────────────────────────────────────
CALL _reset_wipe('campaigns');
CALL _reset_wipe('candidates');
CALL _reset_wipe('job_openings');

-- ── People ───────────────────────────────────────────────────
-- The developer roster goes entirely.
CALL _reset_wipe('employees');

-- Staff logins: everyone except the admins. Not _reset_wipe, because
-- this is the one table that keeps rows — see @KEEP_ADMINS above.
DELETE FROM managers WHERE role <> 'ADMIN';

-- ── Rate cards ───────────────────────────────────────────────
-- Off by default; see @WIPE_RATE_CARD at the top.
CALL _reset_rates();

SET FOREIGN_KEY_CHECKS = 1;


-- ════════════════════════════════════════════════════════════
--  What is left
-- ════════════════════════════════════════════════════════════
-- A real table rather than a TEMPORARY one: this is filled by a
-- prepared INSERT inside _reset_count, and temporary tables driven that
-- way from a stored routine are the one construct here I cannot test
-- without a MySQL to run it against. It is dropped again below.
DROP TABLE IF EXISTS _reset_report;
CREATE TABLE _reset_report (
  table_name VARCHAR(64),
  rows_left  INT NULL            -- NULL = table not in this database
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL _reset_count('managers');
CALL _reset_count('employees');
CALL _reset_count('projects');
CALL _reset_count('tasks');
CALL _reset_count('questions');
CALL _reset_count('leave_requests');
CALL _reset_count('leave_approvers');
CALL _reset_count('bugs');
CALL _reset_count('test_cases');
CALL _reset_count('test_runs');
CALL _reset_count('qa_assignments');
CALL _reset_count('design_tasks');
CALL _reset_count('design_assignments');
CALL _reset_count('design_estimates');
CALL _reset_count('project_demos');
CALL _reset_count('due_extensions');
CALL _reset_count('campaigns');
CALL _reset_count('job_openings');
CALL _reset_count('candidates');

SELECT
  table_name AS `Table`,
  CASE
    WHEN rows_left IS NULL THEN 'not in this database'
    WHEN rows_left = 0     THEN 'empty'
    ELSE CONCAT(rows_left, ' row(s) kept')
  END AS `Result`
FROM _reset_report
ORDER BY (rows_left IS NULL), (rows_left = 0), table_name;

DROP TABLE IF EXISTS _reset_report;


-- ── Tidy up ──────────────────────────────────────────────────
-- The helpers are not left behind; re-importing recreates them.
DROP PROCEDURE IF EXISTS _reset_check;
DROP PROCEDURE IF EXISTS _reset_wipe;
DROP PROCEDURE IF EXISTS _reset_count;
DROP PROCEDURE IF EXISTS _reset_rates;

-- Disarm, so the same session cannot run it again by accident.
SET @ARM = '';
