<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT project_id FROM projects WHERE project_id = ? AND (? = 'ADMIN' OR manager_id = ?)"
);
$check->execute([$b['project_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

$priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';

$stmt = $pdo->prepare(
    "INSERT INTO tasks (project_id, employee_id, task_name, description, eta, priority)
     VALUES (?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $b['project_id'],
    $b['employee_id'] ?? null,
    $b['task_name'] ?? '',
    $b['description'] ?? null,
    $b['eta'] ?? null,
    $priority,
]);
echo json_encode(['success' => true, 'task_id' => (int)$pdo->lastInsertId()]);
