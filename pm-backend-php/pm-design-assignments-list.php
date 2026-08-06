<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);

// Every designer account with the projects currently assigned to it, so
// the admin screen can show and edit the whole picture in one request.
$stmt = $pdo->prepare(
    "SELECT m.manager_id AS designer_id, m.full_name, m.email, m.is_active,
            GROUP_CONCAT(a.project_id) AS project_ids
     FROM managers m
     LEFT JOIN design_assignments a ON a.designer_id = m.manager_id
     WHERE m.role = 'DESIGNER'
     GROUP BY m.manager_id, m.full_name, m.email, m.is_active
     ORDER BY m.full_name ASC"
);
$stmt->execute();
$rows = $stmt->fetchAll();
foreach ($rows as &$r) {
    $r['project_ids'] = $r['project_ids']
        ? array_map('intval', explode(',', $r['project_ids']))
        : [];
}
echo json_encode($rows);
