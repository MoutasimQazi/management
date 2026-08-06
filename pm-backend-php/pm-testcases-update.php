<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);
$b = body();

$caseId = (int)($b['case_id'] ?? 0);
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT case_id, title, steps, expected, link FROM test_cases WHERE case_id = ? AND $scope");
$check->execute(array_merge([$caseId], $params));
$existing = $check->fetch();
if (!$existing) denyNotYours();

$stmt = $pdo->prepare("UPDATE test_cases SET title = ?, steps = ?, expected = ?, link = ? WHERE case_id = ?");
$stmt->execute([
    trim($b['title'] ?? '') !== '' ? trim($b['title']) : $existing['title'],
    array_key_exists('steps', $b) ? $b['steps'] : $existing['steps'],
    array_key_exists('expected', $b) ? $b['expected'] : $existing['expected'],
    // Sending "" clears the link; omitting the key leaves it alone.
    array_key_exists('link', $b)
        ? (trim((string)$b['link']) !== '' ? trim($b['link']) : null)
        : $existing['link'],
    $caseId,
]);
echo json_encode(['success' => true]);
