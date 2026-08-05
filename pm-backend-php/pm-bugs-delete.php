<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);
$b = body();

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT bug_id FROM bugs WHERE bug_id = ? AND $scope");
$check->execute(array_merge([(int)($b['bug_id'] ?? 0)], $params));
if (!$check->fetch()) denyNotYours();

$pdo->prepare("DELETE FROM bugs WHERE bug_id = ?")->execute([(int)$b['bug_id']]);
echo json_encode(['success' => true]);
