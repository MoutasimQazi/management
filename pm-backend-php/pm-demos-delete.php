<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING']);
$b = body();

// Same rule as saving: only on a project the caller runs.
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT demo_id FROM project_demos WHERE demo_id = ? AND $scope");
$check->execute(array_merge([(int)($b['demo_id'] ?? 0)], $params));
if (!$check->fetch()) denyNotYours();

$pdo->prepare("DELETE FROM project_demos WHERE demo_id = ?")->execute([(int)$b['demo_id']]);
echo json_encode(['success' => true]);
