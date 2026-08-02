<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$stmt = $pdo->prepare(
    "INSERT INTO employees (manager_id, name, department, designation) VALUES (?, ?, ?, ?)"
);
$stmt->execute([
    $manager['manager_id'],
    $b['name'] ?? '',
    $b['department'] ?? null,
    $b['designation'] ?? null,
]);
echo json_encode(['success' => true, 'employee_id' => (int)$pdo->lastInsertId()]);
