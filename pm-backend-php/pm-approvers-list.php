<?php
require 'config.php';
require 'auth.php';
// Any signed-in account (including employees) needs this list to pick
// who a leave request goes to — names and roles only, nothing sensitive.
requireUser($pdo, $USERS);

$stmt = $pdo->prepare(
    "SELECT manager_id, full_name, role FROM managers WHERE is_active = 1 ORDER BY full_name ASC"
);
$stmt->execute();
echo json_encode($stmt->fetchAll());
