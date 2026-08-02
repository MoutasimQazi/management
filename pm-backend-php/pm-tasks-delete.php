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

// Cascades to questions for this task, per the existing FK.
$pdo->prepare("DELETE FROM tasks WHERE task_id = ?")->execute([$b['task_id']]);
echo json_encode(['success' => true]);
