<?php
require 'config.php';
require 'auth.php';
// The projects the caller may file bugs / test cases against. QA gets only
// what an admin assigned them; managers get their own; admin gets all.
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);

[$scope, $params] = projectScope($user, 'project_id');
$stmt = $pdo->prepare(
    "SELECT project_id, project_name, client_name, status FROM projects
     WHERE $scope ORDER BY project_name ASC"
);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
