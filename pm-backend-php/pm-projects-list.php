<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

$stmt = $pdo->prepare(
    "SELECT project_id, manager_id, project_name, client_name, description, start_date, due_date,
            status, priority, created_at, updated_at
     FROM projects WHERE (? = 'ADMIN' OR manager_id = ?)
     ORDER BY created_at DESC"
);
$stmt->execute([$manager['role'], $manager['manager_id']]);
echo json_encode($stmt->fetchAll());
