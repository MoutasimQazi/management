<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

// Soft delete only — flips is_active off so their token stops working
// without losing the historical row (projects/tasks/campaigns still
// reference this manager_id).
$stmt = $pdo->prepare("UPDATE managers SET is_active = 0 WHERE manager_id = ?");
$stmt->execute([$b['manager_id'] ?? 0]);
echo json_encode(['success' => true]);
