<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT employee_id FROM employees WHERE employee_id = ? AND (? = 'ADMIN' OR manager_id = ?)"
);
$check->execute([$b['employee_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

// employees has no ON DELETE cascade from tasks — guard it ourselves so the
// delete fails with a clear message instead of a raw FK constraint error.
$count = $pdo->prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE employee_id = ?");
$count->execute([$b['employee_id']]);
if ((int)$count->fetch()['cnt'] > 0) {
    http_response_code(409);
    echo json_encode(['error' =>
        'This employee has tasks assigned. Reassign or delete those tasks first, then delete the employee.']);
    exit;
}

$pdo->prepare("DELETE FROM employees WHERE employee_id = ?")->execute([$b['employee_id']]);
echo json_encode(['success' => true]);
