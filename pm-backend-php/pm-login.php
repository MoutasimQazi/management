<?php
require 'config.php';

// DB-backed login for HR / Marketing / Employee accounts. index.html tries
// the original n8n login first (unchanged, for the 6 existing managers) and
// only falls back here on a 401 — so this endpoint only ever needs to know
// about accounts that were never in n8n's credential list to begin with.
$b = body();
$email = trim($b['email'] ?? '');
$password = (string)($b['password'] ?? '');

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Email and password are required.']);
    exit;
}

$stmt = $pdo->prepare(
    "SELECT manager_id, full_name, email, role, password_hash, token
     FROM managers WHERE is_active = 1 AND email = ? LIMIT 1"
);
$stmt->execute([$email]);
$row = $stmt->fetch();
if ($row && $row['password_hash'] && password_verify($password, $row['password_hash'])) {
    if (!$row['token']) {
        http_response_code(500);
        echo json_encode(['error' => 'This account has no login token set up yet. Contact an admin.']);
        exit;
    }
    echo json_encode(['token' => $row['token'], 'email' => $row['email'], 'role' => $row['role'], 'full_name' => $row['full_name']]);
    exit;
}

$stmt = $pdo->prepare(
    "SELECT employee_id, name, email, password_hash, token
     FROM employees WHERE status = 'ACTIVE' AND email = ? LIMIT 1"
);
$stmt->execute([$email]);
$row = $stmt->fetch();
if ($row && $row['password_hash'] && password_verify($password, $row['password_hash'])) {
    if (!$row['token']) {
        http_response_code(500);
        echo json_encode(['error' => 'This account has no login token set up yet. Contact an admin.']);
        exit;
    }
    echo json_encode(['token' => $row['token'], 'email' => $row['email'], 'role' => 'EMPLOYEE', 'full_name' => $row['name']]);
    exit;
}

http_response_code(401);
echo json_encode(['error' => 'That email and password combination was rejected.']);
