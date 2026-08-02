<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';

$stmt = $pdo->prepare(
    "INSERT INTO projects (manager_id, project_name, client_name, description, start_date, due_date, status, priority)
     VALUES (?, ?, ?, ?, CURDATE(), ?, 'ACTIVE', ?)"
);
$stmt->execute([
    $manager['manager_id'],
    $b['project_name'] ?? '',
    $b['client_name'] ?? null,
    $b['description'] ?? null,
    $b['due_date'] ?? null,
    $priority,
]);
echo json_encode(['success' => true, 'project_id' => (int)$pdo->lastInsertId()]);
