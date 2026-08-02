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
    // A manager sees every question raised on their own projects
    // (by themselves or by an employee working under them); ADMIN sees all.
    $sql = $base . "WHERE (? = 'ADMIN' OR p.manager_id = ?)";
    $params = [$user['role'], $user['id']];
}
$sql .= " ORDER BY q.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
