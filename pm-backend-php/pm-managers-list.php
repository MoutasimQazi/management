<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);

$stmt = $pdo->prepare(
    "SELECT manager_id, full_name, email, role, is_active, (token IS NOT NULL) AS has_login, temp_password
     FROM managers ORDER BY role, full_name ASC"
);
$stmt->execute();
echo json_encode($stmt->fetchAll());
