<?php
require 'config.php';
require 'auth.php';
/* Removing a person takes away their access, so it is not something a BA
   does to their own roster — only HR and admins, from HR › People. The
   button is gone from the Projects page, and this is what enforces it: a
   BA token calling this endpoint directly now gets a 403. */
requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

$employeeId = (int)($b['employee_id'] ?? 0);

$check = $pdo->prepare("SELECT employee_id FROM employees WHERE employee_id = ?");
$check->execute([$employeeId]);
if (!$check->fetch()) denyNotYours();

// employees has no ON DELETE cascade from tasks — guard it ourselves so the
// delete fails with a clear message instead of a raw FK constraint error.
$count = $pdo->prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE employee_id = ?");
$count->execute([$employeeId]);
if ((int)$count->fetch()['cnt'] > 0) {
    http_response_code(409);
    echo json_encode(['error' =>
        'This developer has tasks assigned. Reassign or delete those tasks first, then remove them.']);
    exit;
}

$pdo->prepare("DELETE FROM employees WHERE employee_id = ?")->execute([$employeeId]);
echo json_encode(['success' => true]);
