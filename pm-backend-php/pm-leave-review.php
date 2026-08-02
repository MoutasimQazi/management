<?php
require 'config.php';
require 'auth.php';
// Approval belongs to the managers the request was addressed to (any one
// of them), or an ADMIN. HR no longer approves — they only track.
$user = requireUser($pdo, $USERS);
$b = body();

if ($user['user_type'] !== 'STAFF') {
    http_response_code(403);
    echo json_encode(['error' => 'Only managers review leave requests.']);
    exit;
}

$statuses = ['APPROVED', 'REJECTED'];
$status = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : null;
if (!$status) {
    http_response_code(400);
    echo json_encode(['error' => 'status must be APPROVED or REJECTED.']);
    exit;
}

$leaveId = (int)($b['leave_id'] ?? 0);
if ($user['role'] !== 'ADMIN') {
    $check = $pdo->prepare(
        "SELECT 1 FROM leave_approvers WHERE leave_id = ? AND manager_id = ?"
    );
    $check->execute([$leaveId, $user['id']]);
    if (!$check->fetch()) {
        http_response_code(403);
        echo json_encode(['error' => 'This request was not sent to you — only its listed approvers (or an admin) can review it.']);
        exit;
    }
}

$stmt = $pdo->prepare(
    "UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW()
     WHERE leave_id = ? AND status = 'PENDING'"
);
$stmt->execute([$status, $user['id'], $leaveId]);
echo json_encode(['success' => true]);
