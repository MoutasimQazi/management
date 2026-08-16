<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$estimateId = (int)($b['estimate_id'] ?? 0);
$q = $pdo->prepare("SELECT estimate_id FROM design_estimates WHERE estimate_id = ?");
$q->execute([$estimateId]);
if (!$q->fetch()) {
    http_response_code(404);
    echo json_encode(['error' => 'No such rate.']);
    exit;
}

/* A rate that has been used is retired, not deleted. Design tasks record
 * which rate produced their estimate, and deleting it would leave the
 * hours on those tasks with nothing explaining where they came from —
 * the foreign key is ON DELETE SET NULL, so the link would just vanish.
 * Retiring keeps the history and takes the row out of the picker. */
/* Both boards point at this table now, so both have to be asked before a
   row can be considered unused. */
$used = $pdo->prepare(
    "SELECT (SELECT COUNT(*) FROM design_tasks WHERE estimate_id = ?)
          + (SELECT COUNT(*) FROM tasks WHERE estimate_id = ?) AS n"
);
$used->execute([$estimateId, $estimateId]);
$n = (int)$used->fetch()['n'];

if ($n > 0) {
    $pdo->prepare("UPDATE design_estimates SET is_active = 0 WHERE estimate_id = ?")->execute([$estimateId]);
    echo json_encode([
        'success' => true,
        'retired' => true,
        'used_by' => $n,
        'message' => 'Retired instead of deleted — ' . $n . ' design task' . ($n === 1 ? '' : 's') .
                     ' still reference this rate. It no longer appears when creating work.',
    ]);
    exit;
}

$pdo->prepare("DELETE FROM design_estimates WHERE estimate_id = ?")->execute([$estimateId]);
echo json_encode(['success' => true, 'retired' => false]);
