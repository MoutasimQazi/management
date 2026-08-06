<?php
require 'config.php';
require 'auth.php';
// Just enough to fill an assignee menu. pm-design-assignments-list.php
// covers the admin view and stays admin-only; this one is readable by
// anyone who can file design work, and returns no contact details.
requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);

$stmt = $pdo->prepare(
    "SELECT manager_id AS designer_id, full_name
     FROM managers
     WHERE role = 'DESIGNER' AND is_active = 1
     ORDER BY full_name ASC"
);
$stmt->execute();
echo json_encode($stmt->fetchAll());
