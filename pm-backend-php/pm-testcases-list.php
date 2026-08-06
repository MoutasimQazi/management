<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);

[$scope, $params] = projectScope($user, 'c.project_id');

// Each case carries its latest run, so the list doubles as a status board
// without a second request per row.
$sql = "SELECT c.case_id, c.project_id, c.title, c.steps, c.expected, c.link,
               c.created_by, c.created_at, c.updated_at,
               p.project_name, m.full_name AS created_by_name,
               r.result AS last_result, r.run_at AS last_run_at, r.notes AS last_notes,
               rm.full_name AS last_run_by
        FROM test_cases c
        JOIN projects p ON p.project_id = c.project_id
        LEFT JOIN managers m ON m.manager_id = c.created_by
        LEFT JOIN test_runs r ON r.run_id = (
            SELECT run_id FROM test_runs r2 WHERE r2.case_id = c.case_id
            ORDER BY r2.run_at DESC, r2.run_id DESC LIMIT 1)
        LEFT JOIN managers rm ON rm.manager_id = r.run_by
        WHERE $scope";

if (!empty($_GET['project_id'])) {
    $sql .= " AND c.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
$sql .= " ORDER BY p.project_name ASC, c.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
