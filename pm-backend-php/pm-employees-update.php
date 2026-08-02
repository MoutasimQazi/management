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

$stmt = $pdo->prepare(
    "UPDATE employees SET name = ?, department = ?, designation = ? WHERE employee_id = ?"
);
$stmt->execute([
    $b['name'] ?? '',
    $b['department'] ?? null,
    $b['designation'] ?? null,
    $b['employee_id'],
]);
echo json_encode(['success' => true]);
