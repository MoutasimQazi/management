<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

$stmt = $pdo->prepare(
    "INSERT INTO job_openings (title, department, notes, created_by) VALUES (?, ?, ?, ?)"
);
$stmt->execute([
    $b['title'] ?? '',
    $b['department'] ?? null,
    $b['notes'] ?? null,
    $user['id'],
]);
echo json_encode(['success' => true, 'opening_id' => (int)$pdo->lastInsertId()]);
