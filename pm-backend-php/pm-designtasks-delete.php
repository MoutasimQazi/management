<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);
$b = body();

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT design_id FROM design_tasks WHERE design_id = ? AND $scope");
$check->execute(array_merge([(int)($b['design_id'] ?? 0)], $params));
if (!$check->fetch()) denyNotYours();

$pdo->prepare("DELETE FROM design_tasks WHERE design_id = ?")->execute([(int)$b['design_id']]);
echo json_encode(['success' => true]);
