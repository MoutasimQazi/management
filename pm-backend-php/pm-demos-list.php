<?php
require 'config.php';
require 'auth.php';
/* Readable by anyone on the project — including developers, who have no
 * project access anywhere else in this system but are exactly the people
 * a demo date is aimed at. requireUser, not requireRole. */
$user = requireUser($pdo, $USERS);

[$scope, $params] = projectInvolvementScope($user, 'd.project_id');

$sql = "SELECT d.demo_id, d.project_id, d.demo_type, d.title, d.demo_date, d.demo_time,
               d.notes, d.status, d.created_by, d.created_at,
               p.project_name, p.client_name,
               m.full_name AS created_by_name
        FROM project_demos d
        JOIN projects p ON p.project_id = d.project_id
        LEFT JOIN managers m ON m.manager_id = d.created_by
        WHERE $scope";

if (!empty($_GET['project_id'])) {
    $sql .= " AND d.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
// upcoming=1 is what the dashboards ask for: today onwards, still planned.
if (!empty($_GET['upcoming'])) {
    $sql .= " AND d.demo_date >= CURDATE() AND d.status = 'PLANNED'";
}

// Soonest first for anything upcoming; a project's own list reads the
// same way, because the next demo is the one that matters.
$sql .= " ORDER BY d.demo_date ASC, d.demo_time ASC";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode($stmt->fetchAll());
} catch (PDOException $e) {
    // Migration 011 is imported by hand. A dashboard panel asking for
    // demos before the table exists should quietly show none, not 500.
    echo json_encode([]);
}
