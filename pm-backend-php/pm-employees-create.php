<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

// An email grants the employee their own login — a temp password and
// token are generated now and returned once so it can be shared with them.
$email = trim($b['email'] ?? '');
$tempPassword = null;
$passwordHash = null;
$token = null;
if ($email !== '') {
    $tempPassword = randomTempPassword();
    $passwordHash = password_hash($tempPassword, PASSWORD_DEFAULT);
    $token = randomToken();
}

$stmt = $pdo->prepare(
    "INSERT INTO employees (manager_id, name, department, designation, email, password_hash, token, temp_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $manager['manager_id'],
    $b['name'] ?? '',
    $b['department'] ?? null,
    $b['designation'] ?? null,
    $email !== '' ? $email : null,
    $passwordHash,
    $token,
    $tempPassword,
]);
$result = ['success' => true, 'employee_id' => (int)$pdo->lastInsertId()];
if ($tempPassword) { $result['login_email'] = $email; $result['temp_password'] = $tempPassword; }
echo json_encode($result);
