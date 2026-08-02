<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

if ($manager['role'] !== 'ADMIN') {
    http_response_code(403);
    echo json_encode(['error' => 'This action requires the Admin role.']);
    exit;
}

$stmt = $pdo->prepare(
    "UPDATE questions SET answer = ?, answered_by = ?, status = 'ANSWERED', answered_at = NOW()
     WHERE question_id = ? AND status = 'OPEN'"
);
$stmt->execute([$b['answer'] ?? '', $manager['manager_id'], $b['question_id'] ?? 0]);
echo json_encode(['success' => true]);
