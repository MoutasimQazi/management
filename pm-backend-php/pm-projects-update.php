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
$statuses   = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';
$status   = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : 'ACTIVE';

$stmt = $pdo->prepare(
    "UPDATE projects SET project_name = ?, client_name = ?, description = ?, due_date = ?, priority = ?, status = ?
     WHERE project_id = ?"
);
$stmt->execute([
    $b['project_name'] ?? '',
    $b['client_name'] ?? null,
    $b['description'] ?? null,
    $b['due_date'] ?? null,
    $priority,
    $status,
    $b['project_id'],
]);
echo json_encode(['success' => true]);
