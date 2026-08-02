<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

$sql = "SELECT t.task_id, t.project_id, t.employee_id, t.task_name, t.description, t.status, t.eta,
               t.priority, t.progress_percentage, t.created_at, t.updated_at,
               e.name AS employee_name, p.project_name, p.manager_id
        FROM tasks t
        JOIN projects p ON p.project_id = t.project_id
        JOIN employees e ON e.employee_id = t.employee_id
        WHERE (? = 'ADMIN' OR p.manager_id = ?)";
$params = [$manager['role'], $manager['manager_id']];

if (!empty($_GET['project_id'])) {
    $sql .= " AND t.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
$sql .= " ORDER BY t.updated_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
