<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$check = $pdo->prepare("SELECT employee_id, email FROM employees WHERE employee_id = ?");
$check->execute([$b['employee_id'] ?? 0]);
$employee = $check->fetch();
if (!$employee || !$employee['email']) {
    http_response_code(400);
    echo json_encode(['error' => 'This employee has no login to reset — add an email first.']);
    exit;
}

$tempPassword = randomTempPassword();
$stmt = $pdo->prepare(
    "UPDATE employees SET password_hash = ?, temp_password = ? WHERE employee_id = ?"
);
$stmt->execute([password_hash($tempPassword, PASSWORD_DEFAULT), $tempPassword, $employee['employee_id']]);
echo json_encode(['success' => true, 'login_email' => $employee['email'], 'temp_password' => $tempPassword]);
