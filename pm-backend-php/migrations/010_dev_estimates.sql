-- ════════════════════════════════════════════════════════════
-- Migration 010: developer estimates on the same rate card
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others. Safe to re-run, and re-running never
-- overwrites an edit — the seed is INSERT IGNORE against a unique key.
--
-- Requires migration 009 (it extends the table 009 creates).
--
-- ── One table, two disciplines ──
-- Developer work needs exactly what design work needed: a deliverable, a
-- complexity, four rates, a unit. Rather than a second table and a second
-- copy of every endpoint, `design_estimates` gains a `discipline` column
-- and holds both. The table keeps its name — renaming it would move a
-- foreign key that design_tasks already depends on, for cosmetics.
--
-- The unique key has to widen with it: "Bug Fixing / EASY" could
-- legitimately exist for both disciplines and mean different hours.
--
-- ⚠ THE DEVELOPER RATES BELOW ARE A STARTING POINT, NOT YOUR NUMBERS.
--   The design card came from a real sheet; this one is inferred from
--   ordinary industry shapes so the feature has something to work with
--   on day one. Go through Projects › Rate card and correct them — that
--   screen exists precisely so these are not stuck as someone's guess.
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

DROP PROCEDURE IF EXISTS _mig_drop_index_if_present $$
CREATE PROCEDURE _mig_drop_index_if_present(IN p_table VARCHAR(64), IN p_index VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @mig_ddl = CONCAT('ALTER TABLE ', p_table, ' DROP INDEX ', p_index);
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

-- ── 1. The rate card learns which discipline a row belongs to ──
-- Default DESIGN, so every row migration 009 seeded stays what it was.
CALL _mig_add_column_if_missing('design_estimates', 'discipline',
  "ALTER TABLE design_estimates ADD COLUMN discipline VARCHAR(12) NOT NULL DEFAULT 'DESIGN' AFTER estimate_id");

CALL _mig_drop_index_if_present('design_estimates', 'uq_deliverable_complexity');
CALL _mig_add_index_if_missing('design_estimates', 'uq_discipline_deliverable_complexity',
  'ALTER TABLE design_estimates ADD UNIQUE KEY uq_discipline_deliverable_complexity (discipline, deliverable, complexity)');

-- ── 2. What a developer task borrows from it ──
-- `tasks` already has eta_hours, which is where the estimate lands: it is
-- the same number, and every screen that already reads eta_hours keeps
-- working without knowing an estimate produced it. The columns here are
-- the provenance — what was chosen to arrive at that figure.
CALL _mig_add_column_if_missing('tasks', 'quantity',
  'ALTER TABLE tasks ADD COLUMN quantity DECIMAL(8,2) NOT NULL DEFAULT 1');
CALL _mig_add_column_if_missing('tasks', 'has_frd',
  'ALTER TABLE tasks ADD COLUMN has_frd TINYINT(1) NOT NULL DEFAULT 1');
CALL _mig_add_column_if_missing('tasks', 'estimate_case',
  "ALTER TABLE tasks ADD COLUMN estimate_case VARCHAR(8) NOT NULL DEFAULT 'BEST'");
CALL _mig_add_column_if_missing('tasks', 'start_date',
  'ALTER TABLE tasks ADD COLUMN start_date DATE NULL');
CALL _mig_add_column_if_missing('tasks', 'due_date',
  'ALTER TABLE tasks ADD COLUMN due_date DATE NULL');

CALL _mig_sync_fk_column('tasks', 'estimate_id', 'design_estimates', 'estimate_id', 'NULL', NULL);
CALL _mig_add_constraint_if_missing('tasks', 'fk_task_estimate',
  'ALTER TABLE tasks ADD CONSTRAINT fk_task_estimate FOREIGN KEY (estimate_id) REFERENCES design_estimates(estimate_id) ON DELETE SET NULL');

-- ── 3. Seed the developer card ──
-- ⚠ Placeholders. Correct them in Projects › Rate card.
-- Columns: FRD-best, FRD-worst, no-FRD-best, no-FRD-worst — hours for ONE unit.
INSERT IGNORE INTO design_estimates
  (discipline, deliverable, complexity, definition, unit, frd_best, frd_worst, nofrd_best, nofrd_worst, sort_order) VALUES

('DEV', 'API Integration', 'EASY',     'REST endpoint, simple payload',                'API',      2.000,  4.000,  4.000,   6.000, 10),
('DEV', 'API Integration', 'MODERATE', 'Auth, pagination, error states',               'API',      4.000,  8.000,  8.000,  12.000, 11),
('DEV', 'API Integration', 'COMPLEX',  'Third-party SDK, webhooks, retries',           'API',      8.000, 16.000, 16.000,  24.000, 12),

('DEV', 'Authentication Flow', 'EASY',     'Email + password',                         'Module',   8.000, 12.000, 12.000,  16.000, 20),
('DEV', 'Authentication Flow', 'MODERATE', 'OTP, social login, refresh tokens',        'Module',  16.000, 24.000, 24.000,  32.000, 21),
('DEV', 'Authentication Flow', 'COMPLEX',  'SSO, MFA, role-based access',              'Module',  24.000, 40.000, 40.000,  56.000, 22),

('DEV', 'Subscription & Payments Flow', 'EASY',     'Single plan, one gateway, no proration',        'Module', 16.000, 24.000, 24.000,  32.000, 30),
('DEV', 'Subscription & Payments Flow', 'MODERATE', 'Multiple plans, upgrades, invoices, receipts',  'Module', 32.000, 48.000, 48.000,  64.000, 31),
('DEV', 'Subscription & Payments Flow', 'COMPLEX',  'Proration, trials, dunning, gateway webhooks',  'Module', 56.000, 80.000, 80.000, 120.000, 32),

('DEV', 'Screen Build - App', 'EASY',     'Static screen from a ready design',         'Screen',   2.000,  4.000,  4.000,   6.000, 40),
('DEV', 'Screen Build - App', 'MODERATE', 'Forms, validation, local state',            'Screen',   4.000,  8.000,  8.000,  12.000, 41),
('DEV', 'Screen Build - App', 'COMPLEX',  'Maps, real-time, multi-step flow',          'Screen',   8.000, 16.000, 16.000,  24.000, 42),

('DEV', 'Screen Build - Web', 'EASY',     'Static page from a ready design',           'Page',     2.000,  4.000,  4.000,   6.000, 50),
('DEV', 'Screen Build - Web', 'MODERATE', 'Forms, filters, tables',                    'Page',     4.000,  8.000,  8.000,  12.000, 51),
('DEV', 'Screen Build - Web', 'COMPLEX',  'Dashboards, charts, live data',             'Page',     8.000, 16.000, 16.000,  24.000, 52),

('DEV', 'Admin CRUD Module', 'EASY',     'List, create, edit',                         'Module',   4.000,  8.000,  8.000,  12.000, 60),
('DEV', 'Admin CRUD Module', 'MODERATE', 'Filters, bulk actions, exports',             'Module',   8.000, 16.000, 16.000,  24.000, 61),
('DEV', 'Admin CRUD Module', 'COMPLEX',  'Roles, audit trail, dynamic forms',          'Module',  16.000, 32.000, 32.000,  48.000, 62),

('DEV', 'Database & Schema', 'EASY',     'A few tables, no migration',                 'Module',   2.000,  4.000,  4.000,   6.000, 70),
('DEV', 'Database & Schema', 'MODERATE', 'Relations, indexes, forward migration',      'Module',   4.000,  8.000,  8.000,  12.000, 71),
('DEV', 'Database & Schema', 'COMPLEX',  'Restructure with live data migration',       'Module',   8.000, 16.000, 16.000,  32.000, 72),

('DEV', 'Push Notifications', 'EASY',     'One provider, basic send',                  'Module',   4.000,  8.000,  8.000,  12.000, 80),
('DEV', 'Push Notifications', 'MODERATE', 'Segments, deep links',                      'Module',   8.000, 16.000, 16.000,  24.000, 81),
('DEV', 'Push Notifications', 'COMPLEX',  'Scheduling, analytics, multi-platform',     'Module',  16.000, 24.000, 24.000,  40.000, 82),

('DEV', 'Third-party Integration', 'EASY',     'Documented SDK, happy path',           'Module',   4.000,  8.000,  8.000,  12.000, 90),
('DEV', 'Third-party Integration', 'MODERATE', 'Auth plus real error handling',        'Module',   8.000, 16.000, 16.000,  24.000, 91),
('DEV', 'Third-party Integration', 'COMPLEX',  'Undocumented API, sync jobs',          'Module',  16.000, 32.000, 32.000,  48.000, 92),

('DEV', 'Bug Fixing', 'EASY',     'Reproducible and isolated',                         'Bug',      1.000,  2.000,  2.000,   3.000, 100),
('DEV', 'Bug Fixing', 'MODERATE', 'Cross-module, state-dependent',                     'Bug',      2.000,  4.000,  4.000,   8.000, 101),
('DEV', 'Bug Fixing', 'COMPLEX',  'Race conditions, data corruption',                  'Bug',      4.000,  8.000,  8.000,  16.000, 102),

('DEV', 'Testing', 'EASY',     'Unit tests for core logic',                            'App',      4.000,  8.000,  8.000,  12.000, 110),
('DEV', 'Testing', 'MODERATE', 'Integration tests plus the fixes they find',           'App',      8.000, 16.000, 16.000,  24.000, 111),
('DEV', 'Testing', 'COMPLEX',  'End-to-end suite',                                     'App',     16.000, 32.000, 32.000,  48.000, 112),

('DEV', 'Deployment & Release', 'EASY',     'Existing pipeline',                       'App',      2.000,  4.000,  4.000,   6.000, 120),
('DEV', 'Deployment & Release', 'MODERATE', 'New environment, CI setup',               'App',      8.000, 16.000, 16.000,  24.000, 121),
('DEV', 'Deployment & Release', 'COMPLEX',  'Zero-downtime, migrations, rollback',     'App',     16.000, 24.000, 24.000,  40.000, 122);

DROP PROCEDURE IF EXISTS _mig_add_column_if_missing;
DROP PROCEDURE IF EXISTS _mig_drop_index_if_present;
DROP PROCEDURE IF EXISTS _mig_add_index_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
