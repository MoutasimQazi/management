<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

$stmt = $pdo->prepare(
    "SELECT q.question_id, q.task_id, q.manager_id, q.question, q.status, q.answer, q.answered_by,
            q.created_at, q.answered_at, t.task_name, p.project_id, p.project_name
     FROM questions q
     JOIN tasks t ON t.task_id = q.task_id
     JOIN projects p ON p.project_id = t.project_id
     WHERE (? = 'ADMIN' OR q.manager_id = ?)
     ORDER BY q.created_at DESC"
);
$stmt->execute([$manager['role'], $manager['manager_id']]);
echo json_encode($stmt->fetchAll());
