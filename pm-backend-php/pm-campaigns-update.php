<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT campaign_id FROM campaigns WHERE campaign_id = ? AND (? = 'ADMIN' OR manager_id = ?)"
);
$check->execute([$b['campaign_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

$statuses = ['IDEA', 'PLANNED', 'IN_PROGRESS', 'PUBLISHED', 'CANCELLED'];
$status = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : 'IDEA';

$stmt = $pdo->prepare(
    "UPDATE campaigns SET title = ?, channel = ?, scheduled_date = ?, notes = ?, status = ? WHERE campaign_id = ?"
);
$stmt->execute([
    $b['title'] ?? '',
    $b['channel'] ?? null,
    $b['scheduled_date'] ?? null,
    $b['notes'] ?? null,
    $status,
    $b['campaign_id'],
]);
echo json_encode(['success' => true]);
