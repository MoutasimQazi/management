<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

$stages = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
$stage = in_array($b['stage'] ?? '', $stages, true) ? $b['stage'] : 'APPLIED';

$stmt = $pdo->prepare(
    "UPDATE candidates SET name = ?, email = ?, phone = ?, stage = ?, notes = ? WHERE candidate_id = ?"
);
$stmt->execute([
    $b['name'] ?? '',
    $b['email'] ?? null,
    $b['phone'] ?? null,
    $stage,
    $b['notes'] ?? null,
    $b['candidate_id'] ?? 0,
]);
echo json_encode(['success' => true]);
