<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);
$b = body();

$projectId = (int)($b['project_id'] ?? 0);
if (!$projectId || trim($b['title'] ?? '') === '') {
    http_response_code(400);
    echo json_encode(['error' => 'A project and a title are required.']);
    exit;
}

// The caller must be able to see the project they're filing against —
// same rule as the list, so a crafted project_id can't reach another
// team's board.
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT project_id FROM projects WHERE project_id = ? AND $scope");
$check->execute(array_merge([$projectId], $params));
if (!$check->fetch()) denyNotYours();

$severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$severity = in_array($b['severity'] ?? '', $severities, true) ? $b['severity'] : 'MEDIUM';

$stmt = $pdo->prepare(
    "INSERT INTO bugs (project_id, task_id, case_id, title, steps, severity, reported_by, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $projectId,
    !empty($b['task_id']) ? (int)$b['task_id'] : null,
    !empty($b['case_id']) ? (int)$b['case_id'] : null,
    trim($b['title']),
    $b['steps'] ?? null,
    $severity,
    $user['id'],
    !empty($b['assigned_to']) ? (int)$b['assigned_to'] : null,
]);
echo json_encode(['success' => true, 'bug_id' => (int)$pdo->lastInsertId()]);
