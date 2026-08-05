<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);
$b = body();

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT case_id FROM test_cases WHERE case_id = ? AND $scope");
$check->execute(array_merge([(int)($b['case_id'] ?? 0)], $params));
if (!$check->fetch()) denyNotYours();

// test_runs cascade from the FK; bugs raised from this case keep their
// history and just lose the link (ON DELETE SET NULL).
$pdo->prepare("DELETE FROM test_cases WHERE case_id = ?")->execute([(int)$b['case_id']]);
echo json_encode(['success' => true]);
