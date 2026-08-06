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
    // Any task in a project this account can reach — see the same note in
    // pm-questions-list.php about why this is projectScope and not an
    // owner comparison.
    [$scope, $scopeParams] = projectScope($user, 'p.project_id');
    $check = $pdo->prepare(
        "SELECT t.task_id FROM tasks t JOIN projects p ON p.project_id = t.project_id
         WHERE t.task_id = ? AND $scope"
    );
    $check->execute(array_merge([$b['task_id'] ?? 0], $scopeParams));
    if (!$check->fetch()) denyNotYours();

    $stmt = $pdo->prepare("INSERT INTO questions (task_id, manager_id, question) VALUES (?, ?, ?)");
    $stmt->execute([$b['task_id'], $user['id'], $b['question'] ?? '']);
}
echo json_encode(['success' => true, 'question_id' => (int)$pdo->lastInsertId()]);
