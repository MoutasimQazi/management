<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN', 'HR']);

$stmt = $pdo->prepare(
    "SELECT o.opening_id, o.title, o.department, o.status, o.notes, o.created_by, o.created_at, o.updated_at,
            (SELECT COUNT(*) FROM candidates c WHERE c.opening_id = o.opening_id) AS candidate_count
     FROM job_openings o ORDER BY o.created_at DESC"
);
$stmt->execute();
echo json_encode($stmt->fetchAll());
