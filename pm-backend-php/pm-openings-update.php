<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

$statuses = ['OPEN', 'ON_HOLD', 'CLOSED'];
$status = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : 'OPEN';

$stmt = $pdo->prepare(
    "UPDATE job_openings SET title = ?, department = ?, notes = ?, status = ? WHERE opening_id = ?"
);
$stmt->execute([
    $b['title'] ?? '',
    $b['department'] ?? null,
    $b['notes'] ?? null,
    $status,
    $b['opening_id'] ?? 0,
]);
echo json_encode(['success' => true]);
