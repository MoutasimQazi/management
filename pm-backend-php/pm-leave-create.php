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
        echo json_encode(['error' => 'Only HR/Admin can file leave on behalf of an employee.']);
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

$stmt = $pdo->prepare(
    "INSERT INTO leave_requests (employee_id, manager_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)"
);
$stmt->execute([$employeeId, $managerId, $b['start_date'], $b['end_date'], $b['reason'] ?? null]);
echo json_encode(['success' => true, 'leave_id' => (int)$pdo->lastInsertId()]);
