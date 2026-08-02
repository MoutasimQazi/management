<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$roles = ['ADMIN', 'MANAGER', 'HR', 'MARKETING'];
$role = in_array($b['role'] ?? '', $roles, true) ? $b['role'] : 'MANAGER';
$fullName = trim($b['full_name'] ?? '');
$email = trim($b['email'] ?? '');
if ($fullName === '' || $email === '') {
    http_response_code(400);
    echo json_encode(['error' => 'full_name and email are required.']);
    exit;
}

$tempPassword = randomTempPassword();
$stmt = $pdo->prepare(
    "INSERT INTO managers (full_name, email, role, is_active, password_hash, token)
     VALUES (?, ?, ?, 1, ?, ?)"
);
$stmt->execute([
    $fullName,
    $email,
    $role,
    password_hash($tempPassword, PASSWORD_DEFAULT),
    randomToken(),
]);
echo json_encode([
    'success' => true,
    'manager_id' => (int)$pdo->lastInsertId(),
    'login_email' => $email,
    'temp_password' => $tempPassword,
]);
