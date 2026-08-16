<?php
require 'config.php';
require 'auth.php';
// The projects the caller may file bugs / test cases against. QA gets only
// what an admin assigned them; managers get their own; admin gets all.
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);

[$scope, $params] = projectScope($user, 'p.project_id');

/* Each project carries its QA counts, so the page that answers "which
   projects am I on" also answers "and what is outstanding on each" in
   the same request. Same shape as the designers' project list. */
$stmt = $pdo->prepare(
    "SELECT p.project_id, p.project_name, p.client_name, p.status, p.due_date,
            m.full_name AS manager_name,
            (SELECT COUNT(*) FROM bugs b
              WHERE b.project_id = p.project_id
                AND b.status IN ('OPEN','REOPENED','IN_PROGRESS')) AS open_bugs,
            (SELECT COUNT(*) FROM bugs b
              WHERE b.project_id = p.project_id AND b.status = 'FIXED') AS to_verify,
            (SELECT COUNT(*) FROM test_cases c
              WHERE c.project_id = p.project_id) AS cases
     FROM projects p
     LEFT JOIN managers m ON m.manager_id = p.manager_id
     WHERE $scope ORDER BY p.project_name ASC"
);
$stmt->execute($params);
$rows = $stmt->fetchAll();
foreach ($rows as &$r) {
    foreach (['open_bugs', 'to_verify', 'cases'] as $k) $r[$k] = (int)$r[$k];
}
echo json_encode($rows);
