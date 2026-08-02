<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

$statuses = ['APPROVED', 'REJECTED'];
$status = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : null;
if (!$status) {
    http_response_code(400);
    echo json_encode(['error' => 'status must be APPROVED or REJECTED.']);
    exit;
}

$stmt = $pdo->prepare(
    "UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW()
     WHERE leave_id = ? AND status = 'PENDING'"
);
$stmt->execute([$status, $user['id'], $b['leave_id'] ?? 0]);
echo json_encode(['success' => true]);
