<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);
$b = body();

$bugId = (int)($b['bug_id'] ?? 0);
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT bug_id, title, steps, link, severity, status, assigned_to FROM bugs WHERE bug_id = ? AND $scope");
$check->execute(array_merge([$bugId], $params));
$existing = $check->fetch();
if (!$existing) denyNotYours();

// Status-only moves are the common case (the dropdown on each row), so
// every other field falls back to what's already stored.
$severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$statuses   = ['OPEN', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'CLOSED', 'REOPENED'];
$severity = in_array($b['severity'] ?? '', $severities, true) ? $b['severity'] : $existing['severity'];
$status   = in_array($b['status'] ?? '', $statuses, true)   ? $b['status']   : $existing['status'];

$stmt = $pdo->prepare(
    "UPDATE bugs SET title = ?, steps = ?, link = ?, severity = ?, status = ?, assigned_to = ? WHERE bug_id = ?"
);
$stmt->execute([
    array_key_exists('title', $b) && trim($b['title']) !== '' ? trim($b['title']) : $existing['title'],
    array_key_exists('steps', $b) ? $b['steps'] : $existing['steps'],
    // Sending "" clears the link; omitting the key leaves it alone.
    array_key_exists('link', $b)
        ? (trim((string)$b['link']) !== '' ? trim($b['link']) : null)
        : $existing['link'],
    $severity,
    $status,
    array_key_exists('assigned_to', $b)
        ? (!empty($b['assigned_to']) ? (int)$b['assigned_to'] : null)
        : $existing['assigned_to'],
    $bugId,
]);
echo json_encode(['success' => true]);
