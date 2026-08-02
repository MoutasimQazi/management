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

$pdo->prepare("DELETE FROM campaigns WHERE campaign_id = ?")->execute([$b['campaign_id']]);
echo json_encode(['success' => true]);
