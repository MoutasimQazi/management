<?php
require 'config.php';
require 'auth.php';
// Any signed-in account (including employees) needs this list to pick
// who a leave request goes to — names and roles only, nothing sensitive.
requireUser($pdo, $USERS);

// Leave approval is a manager-side responsibility, not HR's — HR tracks
// requests but doesn't decide them, so HR accounts aren't offered here.
$stmt = $pdo->prepare(
    "SELECT manager_id, full_name, role FROM managers
     WHERE is_active = 1 AND role IN ('ADMIN', 'MANAGER', 'MARKETING')
     ORDER BY full_name ASC"
);
$stmt->execute();
echo json_encode($stmt->fetchAll());
