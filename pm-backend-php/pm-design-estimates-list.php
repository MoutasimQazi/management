<?php
require 'config.php';
require 'auth.php';
// Readable by anyone who can file design work — they need it to pick a
// rate. Editing is admin-only and lives in pm-design-estimates-save.php.
requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);

/* One card, two disciplines (migration 010). Callers say which they want;
   the design board asks for DESIGN, the projects board for DEV. Anything
   unrecognised falls back to DESIGN rather than returning both, since a
   picker showing "Bug Fixing" next to "Dark Mode" helps nobody. */
$discipline = strtoupper(trim($_GET['discipline'] ?? 'DESIGN'));
if (!in_array($discipline, ['DESIGN', 'DEV'], true)) $discipline = 'DESIGN';

// Inactive rows are retired, not deleted: a task created against one
// keeps its estimate. Admins ask for all of them to manage the card.
$all = !empty($_GET['all']);
$sql = "SELECT estimate_id, discipline, deliverable, complexity, definition, unit,
               frd_best, frd_worst, nofrd_best, nofrd_worst, sort_order, is_active
        FROM design_estimates
        WHERE discipline = ?" . ($all ? "" : " AND is_active = 1") . "
        ORDER BY sort_order ASC, deliverable ASC,
                 FIELD(complexity, 'EASY', 'MODERATE', 'COMPLEX')";

$stmt = $pdo->prepare($sql);
$stmt->execute([$discipline]);
$rows = $stmt->fetchAll();
foreach ($rows as &$r) {
    foreach (['frd_best', 'frd_worst', 'nofrd_best', 'nofrd_worst'] as $k) {
        $r[$k] = (float)$r[$k];
    }
    $r['sort_order'] = (int)$r['sort_order'];
    $r['is_active']  = (int)$r['is_active'];
}

// The page also needs the working day to preview a date before saving,
// and it must be the same number the server uses — see auth.php.
echo json_encode([
    'estimates'     => $rows,
    'discipline'    => $discipline,
    'hours_per_day' => DESIGN_HOURS_PER_DAY,
]);
