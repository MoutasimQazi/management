<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);
$b = body();

if ($user['user_type'] === 'EMPLOYEE') {
    // Employees may only raise questions against their own assigned tasks.
    $check = $pdo->prepare("SELECT task_id FROM tasks WHERE task_id = ? AND employee_id = ?");
    $check->execute([$b['task_id'] ?? 0, $user['id']]);
    if (!$check->fetch()) denyNotYours();

    $stmt = $pdo->prepare("INSERT INTO questions (task_id, employee_id, question) VALUES (?, ?, ?)");
    $stmt->execute([$b['task_id'], $user['id'], $b['question'] ?? '']);
} else {
    $check = $pdo->prepare(
        "SELECT t.task_id FROM tasks t JOIN projects p ON p.project_id = t.project_id
         WHERE t.task_id = ? AND (? = 'ADMIN' OR p.manager_id = ?)"
    );
    $check->execute([$b['task_id'] ?? 0, $user['role'], $user['id']]);
    if (!$check->fetch()) denyNotYours();

    $stmt = $pdo->prepare("INSERT INTO questions (task_id, manager_id, question) VALUES (?, ?, ?)");
    $stmt->execute([$b['task_id'], $user['id'], $b['question'] ?? '']);
}
echo json_encode(['success' => true, 'question_id' => (int)$pdo->lastInsertId()]);
