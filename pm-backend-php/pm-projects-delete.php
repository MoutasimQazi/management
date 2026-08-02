<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT project_id FROM projects WHERE project_id = ? AND (? = 'ADMIN' OR manager_id = ?)"
);
$check->execute([$b['project_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

// Cascades to tasks, and from tasks to questions, per the FKs already on
// these tables — no extra cleanup needed here.
$pdo->prepare("DELETE FROM projects WHERE project_id = ?")->execute([$b['project_id']]);
echo json_encode(['success' => true]);
