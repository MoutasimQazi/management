<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

$stmt = $pdo->prepare(
    "INSERT INTO candidates (opening_id, name, email, phone, notes) VALUES (?, ?, ?, ?, ?)"
);
$stmt->execute([
    $b['opening_id'] ?? 0,
    $b['name'] ?? '',
    $b['email'] ?? null,
    $b['phone'] ?? null,
    $b['notes'] ?? null,
]);
echo json_encode(['success' => true, 'candidate_id' => (int)$pdo->lastInsertId()]);
