<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$stmt = $pdo->prepare(
    "INSERT INTO campaigns (manager_id, title, channel, scheduled_date, notes) VALUES (?, ?, ?, ?, ?)"
);
$stmt->execute([
    $manager['manager_id'],
    $b['title'] ?? '',
    $b['channel'] ?? null,
    $b['scheduled_date'] ?? null,
    $b['notes'] ?? null,
]);
echo json_encode(['success' => true, 'campaign_id' => (int)$pdo->lastInsertId()]);
