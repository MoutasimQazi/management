<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);
$b = body();

if ($user['user_type'] === 'EMPLOYEE') {
    $employeeId = (int)$user['id'];
} elseif (in_array($user['role'], ['ADMIN', 'HR'], true)) {
    // HR/Admin can file leave on behalf of an employee.
    $employeeId = (int)($b['employee_id'] ?? 0);
} else {
    http_response_code(403);
    echo json_encode(['error' => 'Only an employee (for themselves) or HR/Admin (on behalf of one) can file leave.']);
    exit;
}

if (!$employeeId || empty($b['start_date']) || empty($b['end_date'])) {
    http_response_code(400);
    echo json_encode(['error' => 'employee, start_date and end_date are required.']);
    exit;
}

$stmt = $pdo->prepare(
    "INSERT INTO leave_requests (employee_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)"
);
$stmt->execute([$employeeId, $b['start_date'], $b['end_date'], $b['reason'] ?? null]);
echo json_encode(['success' => true, 'leave_id' => (int)$pdo->lastInsertId()]);
