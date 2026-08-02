<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT t.task_id FROM tasks t JOIN projects p ON p.project_id = t.project_id
     WHERE t.task_id = ? AND (? = 'ADMIN' OR p.manager_id = ?)"
);
$check->execute([$b['task_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

$priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';

$stmt = $pdo->prepare(
    "UPDATE tasks SET task_name = ?, description = ?, eta_hours = ?, priority = ?, employee_id = ?
     WHERE task_id = ?"
);
$stmt->execute([
    $b['task_name'] ?? '',
    $b['description'] ?? null,
    (isset($b['eta_hours']) && $b['eta_hours'] !== '') ? (float)$b['eta_hours'] : null,
    $priority,
    $b['employee_id'] ?? null,
    $b['task_id'],
]);
echo json_encode(['success' => true]);
