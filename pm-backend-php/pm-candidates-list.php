<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN', 'HR']);

$sql = "SELECT c.candidate_id, c.opening_id, c.name, c.email, c.phone, c.stage, c.notes,
               c.created_at, c.updated_at, o.title AS opening_title
        FROM candidates c
        JOIN job_openings o ON o.opening_id = c.opening_id";
$params = [];
if (!empty($_GET['opening_id'])) {
    $sql .= " WHERE c.opening_id = ?";
    $params[] = (int)$_GET['opening_id'];
}
$sql .= " ORDER BY c.updated_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
