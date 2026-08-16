<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);

$base = "SELECT t.task_id, t.project_id, t.employee_id, t.task_name, t.description, t.status, t.eta_hours,
                t.priority, t.progress_percentage, t.created_at, t.updated_at,
                t.estimate_id, t.quantity, t.has_frd, t.estimate_case, t.start_date, t.due_date,
                e.name AS employee_name, p.project_name, p.manager_id,
                est.deliverable AS estimate_deliverable,
                est.complexity  AS estimate_complexity,
                est.unit        AS estimate_unit
         FROM tasks t
         JOIN projects p ON p.project_id = t.project_id
         JOIN employees e ON e.employee_id = t.employee_id
         LEFT JOIN design_estimates est ON est.estimate_id = t.estimate_id ";

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
