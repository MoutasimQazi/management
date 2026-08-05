<?php
require 'config.php';
require 'auth.php';
// Managers need to see defects raised against their own projects, so this
// isn't QA-only — projectScope() handles who sees what.
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);

[$scope, $params] = projectScope($user, 'b.project_id');

$sql = "SELECT b.bug_id, b.project_id, b.task_id, b.case_id, b.title, b.steps,
               b.severity, b.status, b.reported_by, b.assigned_to,
               b.created_at, b.updated_at,
               p.project_name, t.task_name, c.title AS case_title,
               m.full_name AS reported_by_name, e.name AS assigned_to_name
        FROM bugs b
        JOIN projects p ON p.project_id = b.project_id
        LEFT JOIN tasks t ON t.task_id = b.task_id
        LEFT JOIN test_cases c ON c.case_id = b.case_id
        LEFT JOIN managers m ON m.manager_id = b.reported_by
        LEFT JOIN employees e ON e.employee_id = b.assigned_to
        WHERE $scope";

if (!empty($_GET['project_id'])) {
    $sql .= " AND b.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
if (!empty($_GET['status'])) {
    $sql .= " AND b.status = ?";
    $params[] = $_GET['status'];
}
// Newest first, but anything still open outranks anything already closed.
$sql .= " ORDER BY FIELD(b.status,'REOPENED','OPEN','IN_PROGRESS','FIXED','VERIFIED','CLOSED'),
                   FIELD(b.severity,'CRITICAL','HIGH','MEDIUM','LOW'), b.updated_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
