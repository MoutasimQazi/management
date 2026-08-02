<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

// Employees are visible to every manager (not scoped to who created them).
$stmt = $pdo->prepare(
    "SELECT employee_id, manager_id, name, department, designation, status, created_at, email,
            (token IS NOT NULL) AS has_login
     FROM employees WHERE status = 'ACTIVE' ORDER BY name ASC"
);
$stmt->execute();
echo json_encode($stmt->fetchAll());
