<?php
require 'config.php';
require 'auth.php';
// The projects the caller may file design work against. A designer gets
// only what an admin assigned them; managers get their own; admin gets all.
$user = requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);

[$scope, $params] = projectScope($user, 'p.project_id');

// Each project carries its design counts, so the overview page is one
// request rather than one per project.
$sql = "SELECT p.project_id, p.project_name, p.client_name, p.status, p.due_date,
               COUNT(d.design_id) AS design_total,
               SUM(d.status = 'APPROVED') AS design_done,
               SUM(d.status = 'IN_REVIEW') AS design_in_review,
               SUM(d.status = 'CHANGES') AS design_changes
        FROM projects p
        LEFT JOIN design_tasks d ON d.project_id = p.project_id
        WHERE $scope
        GROUP BY p.project_id, p.project_name, p.client_name, p.status, p.due_date
        ORDER BY p.project_name ASC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

// SUM() over no rows is NULL, and COUNT of a LEFT JOIN miss is 0 — send
// plain integers so the page never has to think about either.
foreach ($rows as &$r) {
    foreach (['design_total', 'design_done', 'design_in_review', 'design_changes'] as $k) {
        $r[$k] = (int)$r[$k];
    }
}
echo json_encode($rows);
