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

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT project_id FROM projects WHERE project_id = ? AND $scope");
$check->execute(array_merge([$projectId], $params));
if (!$check->fetch()) denyNotYours();

$stmt = $pdo->prepare(
    "INSERT INTO test_cases (project_id, title, steps, expected, link, created_by)
     VALUES (?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $projectId,
    trim($b['title']),
    $b['steps'] ?? null,
    $b['expected'] ?? null,
    trim($b['link'] ?? '') !== '' ? trim($b['link']) : null,
    $user['id'],
]);
echo json_encode(['success' => true, 'case_id' => (int)$pdo->lastInsertId()]);
