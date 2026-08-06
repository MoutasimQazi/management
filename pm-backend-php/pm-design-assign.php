<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$designerId = (int)($b['designer_id'] ?? 0);
$check = $pdo->prepare("SELECT manager_id FROM managers WHERE manager_id = ? AND role = 'DESIGNER'");
$check->execute([$designerId]);
if (!$check->fetch()) {
    http_response_code(400);
    echo json_encode(['error' => 'That account is not a designer account.']);
    exit;
}

// Replace the whole set in one transaction — the UI sends the full list
// of ticked projects, so a partial failure must not leave a half-applied
// assignment that silently widens or narrows what the designer can see.
$ids = array_values(array_unique(array_filter(
    array_map('intval', is_array($b['project_ids'] ?? null) ? $b['project_ids'] : [])
)));

$pdo->beginTransaction();
try {
    $pdo->prepare("DELETE FROM design_assignments WHERE designer_id = ?")->execute([$designerId]);
    if ($ids) {
        $valid = $pdo->prepare(
            "SELECT project_id FROM projects WHERE project_id IN (" .
            implode(',', array_fill(0, count($ids), '?')) . ")"
        );
        $valid->execute($ids);
        $ins = $pdo->prepare("INSERT INTO design_assignments (designer_id, project_id) VALUES (?, ?)");
        foreach ($valid->fetchAll() as $row) {
            $ins->execute([$designerId, $row['project_id']]);
        }
    }
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Could not save the assignment.']);
    exit;
}
echo json_encode(['success' => true, 'assigned' => count($ids)]);
