<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);

$base = "SELECT q.question_id, q.task_id, q.manager_id, q.employee_id, q.question, q.status, q.answer,
                q.answered_by, q.created_at, q.answered_at, t.task_name, p.project_id, p.project_name,
                e.name AS asked_by_employee, m.full_name AS asked_by_manager
         FROM questions q
         JOIN tasks t ON t.task_id = q.task_id
         JOIN projects p ON p.project_id = t.project_id
         LEFT JOIN employees e ON e.employee_id = q.employee_id
         LEFT JOIN managers m ON m.manager_id = q.manager_id ";

if ($user['user_type'] === 'EMPLOYEE') {
    // An employee only sees questions they themselves raised.
    $sql = $base . "WHERE q.employee_id = ?";
    $params = [$user['id']];
} else {
    /* Staff see every question raised on the projects they can reach —
       for a manager that is the projects they own, which is what this
       did before; ADMIN still sees all. Going through projectScope also
       gives QA and designers their assigned projects, which the old
       manager_id comparison silently denied them. */
    [$scope, $params] = projectScope($user, 'p.project_id');
    $sql = $base . "WHERE $scope";
}
$sql .= " ORDER BY q.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
