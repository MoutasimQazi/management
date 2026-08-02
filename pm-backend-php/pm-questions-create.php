<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT t.task_id FROM tasks t JOIN projects p ON p.project_id = t.project_id
     WHERE t.task_id = ? AND (? = 'ADMIN' OR p.manager_id = ?)"
);
$check->execute([$b['task_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

$stmt = $pdo->prepare(
    "INSERT INTO questions (task_id, manager_id, question) VALUES (?, ?, ?)"
);
$stmt->execute([$b['task_id'], $manager['manager_id'], $b['question'] ?? '']);
echo json_encode(['success' => true, 'question_id' => (int)$pdo->lastInsertId()]);
