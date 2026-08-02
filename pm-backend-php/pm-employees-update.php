<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT employee_id, token FROM employees WHERE employee_id = ? AND (? = 'ADMIN' OR manager_id = ?)"
);
$check->execute([$b['employee_id'] ?? 0, $manager['role'], $manager['manager_id']]);
$existing = $check->fetch();
if (!$existing) denyNotYours();

$email = trim($b['email'] ?? '');
$result = ['success' => true];

if ($email !== '' && !$existing['token']) {
    // First time this employee gets an email — provision their login now.
    $tempPassword = randomTempPassword();
    $stmt = $pdo->prepare(
        "UPDATE employees SET name = ?, department = ?, designation = ?, email = ?, password_hash = ?, token = ?, temp_password = ?
         WHERE employee_id = ?"
    );
    $stmt->execute([
        $b['name'] ?? '',
        $b['department'] ?? null,
        $b['designation'] ?? null,
        $email,
        password_hash($tempPassword, PASSWORD_DEFAULT),
        randomToken(),
        $tempPassword,
        $b['employee_id'],
    ]);
    $result['login_email'] = $email;
    $result['temp_password'] = $tempPassword;
} else {
    $stmt = $pdo->prepare(
        "UPDATE employees SET name = ?, department = ?, designation = ?, email = ? WHERE employee_id = ?"
    );
    $stmt->execute([
        $b['name'] ?? '',
        $b['department'] ?? null,
        $b['designation'] ?? null,
        $email !== '' ? $email : null,
        $b['employee_id'],
    ]);
}
echo json_encode($result);
