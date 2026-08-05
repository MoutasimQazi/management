<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);
$b = body();

$employeeId = null;
$managerId = null;

if ($user['user_type'] === 'EMPLOYEE') {
    $employeeId = (int)$user['id'];
} elseif (!empty($b['employee_id'])) {
    // HR/Admin filing on behalf of an employee.
    if (!in_array($user['role'], ['ADMIN', 'HR'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Only HR/Admin can file leave on behalf of a developer.']);
        exit;
    }
    $employeeId = (int)$b['employee_id'];
} else {
    // Any staff member (Manager, Admin, HR, Marketing) filing for themselves.
    $managerId = (int)$user['id'];
}

if (empty($b['start_date']) || empty($b['end_date'])) {
    http_response_code(400);
    echo json_encode(['error' => 'start_date and end_date are required.']);
    exit;
}

// The requester addresses the request to one or more managers — any one
// of them (or an ADMIN) can approve it. Accepts approver_ids: [1,2] and
// tolerates a single approver_id for good measure.
$approverIds = [];
if (!empty($b['approver_ids']) && is_array($b['approver_ids'])) {
    $approverIds = array_map('intval', $b['approver_ids']);
} elseif (!empty($b['approver_id'])) {
    $approverIds = [(int)$b['approver_id']];
}
$approverIds = array_values(array_unique(array_filter($approverIds)));
if (!$approverIds) {
    http_response_code(400);
    echo json_encode(['error' => 'Select at least one manager to send this request to.']);
    exit;
}

// Keep only real, active, approval-eligible manager rows out of whatever
// the client sent — leave approval is a manager-side responsibility, so
// HR accounts are never valid approvers even if a client tries to send one.
$placeholders = implode(',', array_fill(0, count($approverIds), '?'));
$check = $pdo->prepare(
    "SELECT manager_id FROM managers
     WHERE is_active = 1 AND role IN ('ADMIN', 'MANAGER', 'MARKETING') AND manager_id IN ($placeholders)"
);
$check->execute($approverIds);
$validIds = array_column($check->fetchAll(), 'manager_id');
if (!$validIds) {
    http_response_code(400);
    echo json_encode(['error' => 'None of the selected approvers exist.']);
    exit;
}

$stmt = $pdo->prepare(
    "INSERT INTO leave_requests (employee_id, manager_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)"
);
$stmt->execute([$employeeId, $managerId, $b['start_date'], $b['end_date'], $b['reason'] ?? null]);
$leaveId = (int)$pdo->lastInsertId();

$ins = $pdo->prepare("INSERT INTO leave_approvers (leave_id, manager_id) VALUES (?, ?)");
foreach ($validIds as $mid) {
    $ins->execute([$leaveId, $mid]);
}

echo json_encode(['success' => true, 'leave_id' => $leaveId]);
