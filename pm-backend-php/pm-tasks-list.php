<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);

$base = "SELECT t.task_id, t.project_id, t.employee_id, t.task_name, t.description, t.status, t.eta_hours,
                t.priority, t.progress_percentage, t.created_at, t.updated_at,
                e.name AS employee_name, p.project_name, p.manager_id
         FROM tasks t
         JOIN projects p ON p.project_id = t.project_id
         JOIN employees e ON e.employee_id = t.employee_id ";

if ($user['user_type'] === 'EMPLOYEE') {
    // An employee only ever sees their own assigned tasks.
    $sql = $base . "WHERE t.employee_id = ?";
    $params = [$user['id']];
} else {
    // Same rule as everywhere else: the projects this account can reach.
    // Identical to the old owner comparison for MANAGER and ADMIN, and it
    // stops QA and designers getting an empty list on projects that were
    // explicitly assigned to them.
    [$scope, $params] = projectScope($user, 'p.project_id');
    $sql = $base . "WHERE $scope";
}

if (!empty($_GET['project_id'])) {
    $sql .= " AND t.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
$sql .= " ORDER BY t.updated_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
