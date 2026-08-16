-- ════════════════════════════════════════════════════════════
-- Migration 009: design estimation rate card
-- ────────────────────────────────────────────────────────────
-- Run the same way as the others (phpMyAdmin → Import tab).
-- Safe to re-run — and re-running will NOT overwrite edits an admin
-- has made, because the seed uses INSERT IGNORE against a unique key.
--
-- The rate card says how long a piece of design work takes: a
-- deliverable at a complexity, under four conditions (with or without a
-- proper FRD, best or worst case). A design task points at a row, says
-- how many screens / pages / apps it covers, and gets an estimate and a
-- target date out of it.
--
-- ── Why the rates are stored as hours-per-unit ──
-- The source sheet writes them two ways round: "2 Screens / Hour" and
-- "1 Screen / 2 Hours". Those are the same axis read from opposite ends,
-- and neither can be multiplied by a quantity as written. Both are
-- stored as hours per one unit — 0.5 and 2.0 — which is the only form
-- arithmetic works on. The familiar phrasing is rebuilt for display:
-- under an hour reads as "N per hour", over it as "1 per N hours".
--
-- Three decimals because "3 Pages / Hour" is a third of an hour each.
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

-- ── 1. The rate card ──
CREATE TABLE IF NOT EXISTS design_estimates (
  estimate_id  INT AUTO_INCREMENT PRIMARY KEY,
  deliverable  VARCHAR(120) NOT NULL,
  complexity   VARCHAR(12)  NOT NULL,           -- EASY, MODERATE, COMPLEX
  definition   VARCHAR(255) NULL,
  unit         VARCHAR(16)  NOT NULL DEFAULT 'Screen',   -- Screen, Page, App, Project
  frd_best     DECIMAL(7,3) NOT NULL,           -- hours for one unit
  frd_worst    DECIMAL(7,3) NOT NULL,
  nofrd_best   DECIMAL(7,3) NOT NULL,
  nofrd_worst  DECIMAL(7,3) NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_deliverable_complexity (deliverable, complexity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. What a design task borrows from it ──
-- estimate_id is nullable: work that predates the card, or that nothing
-- on the card describes, still exists and simply has no estimate.
CALL _mig_add_column_if_missing('design_tasks', 'quantity',
  'ALTER TABLE design_tasks ADD COLUMN quantity DECIMAL(8,2) NOT NULL DEFAULT 1 AFTER kind');
CALL _mig_add_column_if_missing('design_tasks', 'has_frd',
  'ALTER TABLE design_tasks ADD COLUMN has_frd TINYINT(1) NOT NULL DEFAULT 1 AFTER quantity');
CALL _mig_add_column_if_missing('design_tasks', 'estimate_case',
  "ALTER TABLE design_tasks ADD COLUMN estimate_case VARCHAR(8) NOT NULL DEFAULT 'BEST' AFTER has_frd");
CALL _mig_add_column_if_missing('design_tasks', 'estimated_hours',
  'ALTER TABLE design_tasks ADD COLUMN estimated_hours DECIMAL(9,2) NULL AFTER estimate_case');
CALL _mig_add_column_if_missing('design_tasks', 'start_date',
  'ALTER TABLE design_tasks ADD COLUMN start_date DATE NULL AFTER estimated_hours');

CALL _mig_sync_fk_column('design_tasks', 'estimate_id', 'design_estimates', 'estimate_id', 'NULL', 'project_id');
CALL _mig_add_constraint_if_missing('design_tasks', 'fk_dt_estimate',
  'ALTER TABLE design_tasks ADD CONSTRAINT fk_dt_estimate FOREIGN KEY (estimate_id) REFERENCES design_estimates(estimate_id) ON DELETE SET NULL');

-- ── 3. Seed ──
-- INSERT IGNORE against the unique key: importing this a second time
-- leaves every row exactly as the admin last edited it, and only fills
-- in rows that are genuinely absent.
--
-- Read the four rate columns as: FRD-best, FRD-worst, no-FRD-best,
-- no-FRD-worst — all in hours for a single unit.
INSERT IGNORE INTO design_estimates
  (deliverable, complexity, definition, unit, frd_best, frd_worst, nofrd_best, nofrd_worst, sort_order) VALUES

('UI Color Change - App', 'EASY',     'Color, font, icon, spacing changes only',        'Screen', 0.500,  1.000,  1.000,  2.000, 10),
('UI Color Change - App', 'MODERATE', 'Multiple components, cards, buttons, layouts',   'Screen', 1.000,  2.000,  2.000,  3.000, 11),
('UI Color Change - App', 'COMPLEX',  'Theme redesign, reusable component updates',     'Screen', 2.000,  3.000,  4.000,  6.000, 12),

('UI Color Change - Website', 'EASY',     'Colors, typography, buttons, icons',         'Page',   0.333,  0.500,  1.000,  2.000, 20),
('UI Color Change - Website', 'MODERATE', 'Header, footer, multiple sections',          'Page',   1.000,  2.000,  3.000,  4.000, 21),
('UI Color Change - Website', 'COMPLEX',  'Design system/theme update across pages',    'Page',   3.000,  4.000,  6.000,  8.000, 22),

('UI Color Change - Admin Panel', 'EASY',     'Basic screens, tables, forms',           'Screen', 0.500,  1.000,  1.000,  2.000, 30),
('UI Color Change - Admin Panel', 'MODERATE', 'Multiple widgets, filters, charts',      'Screen', 1.000,  2.000,  3.000,  4.000, 31),
('UI Color Change - Admin Panel', 'COMPLEX',  'Complete admin theme update',            'Screen', 2.000,  4.000,  4.000,  6.000, 32),

('Mobile Screen Design', 'EASY',     'Login, OTP, Profile, Static Pages',               'Screen', 1.000,  2.000,  2.000,  3.000, 40),
('Mobile Screen Design', 'MODERATE', 'Dashboard, Listing, Forms, Cart',                 'Screen', 2.000,  4.000,  4.000,  6.000, 41),
('Mobile Screen Design', 'COMPLEX',  'Maps, Booking, Checkout, Multi-step Flow',        'Screen', 4.000,  8.000,  8.000, 12.000, 42),

-- "Admin Panel Design" appears twice in the source sheet with identical
-- numbers and slightly different wording. Merged into one row per
-- complexity, keeping the fuller of the two definitions.
('Admin Panel Design', 'EASY',     'CRUD Screens, Tables, Forms, Lists',                          'Screen', 1.000,  2.000,  2.000,  3.000, 50),
('Admin Panel Design', 'MODERATE', 'Filters, Reports, Charts',                                    'Screen', 2.000,  4.000,  4.000,  6.000, 51),
('Admin Panel Design', 'COMPLEX',  'Analytics Dashboard, Role Management, Dynamic Forms',         'Screen', 4.000,  8.000,  8.000, 12.000, 52),

('Website Page Design', 'EASY',     'About, Contact, FAQ',                              'Page',   4.000,  8.000,  8.000, 12.000, 60),
('Website Page Design', 'MODERATE', 'Home, Services, Blog',                             'Page',   8.000, 12.000, 12.000, 16.000, 61),
('Website Page Design', 'COMPLEX',  'Landing Page, Interactive Pages',                  'Page',  16.000, 24.000, 24.000, 32.000, 62),

('Tablet Responsive Design', 'EASY',     'Existing Mobile Layout',                      'Screen', 0.167,  0.250,  0.333,  0.500, 70),
('Tablet Responsive Design', 'MODERATE', 'Layout Adjustment',                           'Screen', 0.333,  0.500,  0.500,  1.000, 71),
('Tablet Responsive Design', 'COMPLEX',  'Complete Responsive Redesign',                'Screen', 1.000,  2.000,  3.000,  4.000, 72),

('Dark Mode', 'EASY',     'Existing Design System',                                     'App',    8.000, 16.000, 16.000, 24.000, 80),
('Dark Mode', 'MODERATE', 'Multiple Components',                                        'App',   16.000, 24.000, 24.000, 32.000, 81),
('Dark Mode', 'COMPLEX',  'Design Tokens + QA',                                         'App',   24.000, 40.000, 40.000, 56.000, 82),

('Prototype', 'EASY',     'Basic Clickable Flow',                                       'App',    8.000, 16.000, 16.000, 24.000, 90),
('Prototype', 'MODERATE', 'User Journey with Animations',                               'App',   16.000, 24.000, 24.000, 32.000, 91),
('Prototype', 'COMPLEX',  'Full Interactive Prototype',                                 'App',   24.000, 40.000, 40.000, 56.000, 92),

('Play Store Assets', 'EASY',     'Icon, Splash, Screenshots',                          'App',    4.000,  8.000,  8.000, 12.000, 100),
('Play Store Assets', 'MODERATE', 'Feature Graphics',                                   'App',    8.000, 12.000, 12.000, 16.000, 101),
('Play Store Assets', 'COMPLEX',  'Complete Branding Kit',                              'App',   16.000, 24.000, 24.000, 32.000, 102),

('UI/UX Testing', 'EASY',     '20-30 Screens',                                          'App',    4.000,  8.000,  8.000, 12.000, 110),
('UI/UX Testing', 'MODERATE', '50-70 Screens',                                          'App',    8.000, 16.000, 16.000, 24.000, 111),
('UI/UX Testing', 'COMPLEX',  '100+ Screens',                                           'App',   16.000, 24.000, 24.000, 40.000, 112),

('Research & Competitor Analysis', 'EASY',     '2-3 Competitors',                       'Project', 4.000,  8.000,  8.000, 12.000, 120),
('Research & Competitor Analysis', 'MODERATE', '5-6 Competitors',                       'Project', 8.000, 16.000, 16.000, 24.000, 121),
('Research & Competitor Analysis', 'COMPLEX',  '10+ Competitors + UX Report',           'Project',16.000, 24.000, 24.000, 40.000, 122);

DROP PROCEDURE IF EXISTS _mig_add_constraint_if_missing;
DROP PROCEDURE IF EXISTS _mig_add_column_if_missing;
DROP PROCEDURE IF EXISTS _mig_sync_fk_column;
