<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);
$b = body();

if ($user['user_type'] === 'EMPLOYEE') {
    // Employees may only move their own assigned tasks.
    $check = $pdo->prepare("SELECT task_id FROM tasks WHERE task_id = ? AND employee_id = ?");
    $check->execute([$b['task_id'] ?? 0, $user['id']]);
} else {
    $check = $pdo->prepare(
        "SELECT t.task_id FROM tasks t JOIN projects p ON p.project_id = t.project_id
         WHERE t.task_id = ? AND (? = 'ADMIN' OR p.manager_id = ?)"
    );
    $check->execute([$b['task_id'] ?? 0, $user['role'], $user['id']]);
}
if (!$check->fetch()) denyNotYours();

// Direct status changes — no separate approval/sign-off step. Whoever owns
// the task (their manager, or Yusuf) moves it between all five states.
$statuses = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'];
$status = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : 'TODO';

if ($status === 'COMPLETED') {
    $stmt = $pdo->prepare("UPDATE tasks SET status = ?, progress_percentage = 100 WHERE task_id = ?");
    $stmt->execute([$status, $b['task_id']]);
} elseif (isset($b['progress']) && is_numeric($b['progress'])) {
    $progress = max(0, min(100, (int)$b['progress']));
    $stmt = $pdo->prepare("UPDATE tasks SET status = ?, progress_percentage = ? WHERE task_id = ?");
    $stmt->execute([$status, $progress, $b['task_id']]);
} else {
    $stmt = $pdo->prepare("UPDATE tasks SET status = ? WHERE task_id = ?");
    $stmt->execute([$status, $b['task_id']]);
}
echo json_encode(['success' => true]);
