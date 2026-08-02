<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

// Same ownership pattern as projects: ADMIN sees everything, everyone
// else (MARKETING, MANAGER) sees only campaigns they created.
$stmt = $pdo->prepare(
    "SELECT campaign_id, manager_id, title, channel, status, scheduled_date, notes, created_at, updated_at
     FROM campaigns WHERE (? = 'ADMIN' OR manager_id = ?)
     ORDER BY (scheduled_date IS NULL), scheduled_date ASC, created_at DESC"
);
$stmt->execute([$manager['role'], $manager['manager_id']]);
echo json_encode($stmt->fetchAll());
