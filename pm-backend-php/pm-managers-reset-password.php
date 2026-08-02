<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$check = $pdo->prepare("SELECT manager_id, email FROM managers WHERE manager_id = ?");
$check->execute([$b['manager_id'] ?? 0]);
$row = $check->fetch();
if (!$row) {
    http_response_code(404);
    echo json_encode(['error' => 'Account not found.']);
    exit;
}

$tempPassword = randomTempPassword();
$stmt = $pdo->prepare(
    "UPDATE managers SET password_hash = ?, temp_password = ? WHERE manager_id = ?"
);
$stmt->execute([password_hash($tempPassword, PASSWORD_DEFAULT), $tempPassword, $row['manager_id']]);
echo json_encode(['success' => true, 'login_email' => $row['email'], 'temp_password' => $tempPassword]);
