<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

/* One entry point for adding anyone. Role decides which table the row
 * lands in: EMPLOYEE goes to the roster, everything else creates a staff
 * login. HR can add employees; only ADMIN can mint staff logins. */
$STAFF_ROLES = ['ADMIN', 'MANAGER', 'HR', 'MARKETING', 'QA', 'DESIGNER'];
$role  = strtoupper(trim($b['role'] ?? 'EMPLOYEE'));
$name  = trim($b['name'] ?? '');
$email = trim($b['email'] ?? '');

if ($name === '') {
    http_response_code(400);
    echo json_encode(['error' => 'A name is required.']);
    exit;
}

if ($role === 'EMPLOYEE') {
    // An email is optional here — an employee with no email is just a
    // roster entry that work can be assigned to, and can't sign in.
    $tempPassword = $passwordHash = $token = null;
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
        $user['id'],
        $name,
        $b['department'] ?? null,
        $b['designation'] ?? null,
        $email !== '' ? $email : null,
        $passwordHash,
        $token,
        $tempPassword,
    ]);
    $out = ['success' => true, 'kind' => 'EMPLOYEE', 'id' => (int)$pdo->lastInsertId()];
    if ($tempPassword) { $out['login_email'] = $email; $out['temp_password'] = $tempPassword; }
    echo json_encode($out);
    exit;
}

if (!in_array($role, $STAFF_ROLES, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown role.']);
    exit;
}
if ($user['role'] !== 'ADMIN') {
    http_response_code(403);
    echo json_encode(['error' => 'Only an admin can create staff logins.']);
    exit;
}
if ($email === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Staff logins need an email address.']);
    exit;
}

$tempPassword = randomTempPassword();
$stmt = $pdo->prepare(
    "INSERT INTO managers (full_name, email, role, is_active, password_hash, token, temp_password)
     VALUES (?, ?, ?, 1, ?, ?, ?)"
);
$stmt->execute([
    $name, $email, $role,
    password_hash($tempPassword, PASSWORD_DEFAULT),
    randomToken(),
    $tempPassword,
]);
echo json_encode([
    'success' => true, 'kind' => 'STAFF', 'id' => (int)$pdo->lastInsertId(),
    'login_email' => $email, 'temp_password' => $tempPassword,
]);
