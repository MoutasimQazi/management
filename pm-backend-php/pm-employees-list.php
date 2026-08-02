<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

// Employees are visible to every manager (not scoped to who created them).
// temp_password is a live plaintext password — only an ADMIN caller gets
// it back, everyone else just sees whether a login exists.
$stmt = $pdo->prepare(
    "SELECT employee_id, manager_id, name, department, designation, status, created_at, email,
            (token IS NOT NULL) AS has_login, temp_password
     FROM employees WHERE status = 'ACTIVE' ORDER BY name ASC"
);
$stmt->execute();
$rows = $stmt->fetchAll();
if ($manager['role'] !== 'ADMIN') {
    foreach ($rows as &$row) unset($row['temp_password']);
}
echo json_encode($rows);
