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

$priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$statuses   = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';
$status   = in_array($b['status'] ?? '', $statuses, true) ? $b['status'] : 'ACTIVE';

/* ── Handing a project to a different business analyst ──
 * Admin only, and deliberately so: a BA moving their own project to
 * someone else is handing away work, and a BA moving someone else's to
 * themselves is taking it. Neither should be possible without the person
 * who owns the allocation saying so.
 *
 * Absent from the request, the owner is left exactly as it was — the
 * ordinary edit form does not send it, and must not silently reassign.
 */
$reassigned = null;
if (array_key_exists('manager_id', $b) && $manager['role'] === 'ADMIN') {
    $newOwner = (int)$b['manager_id'];
    $who = $pdo->prepare(
        "SELECT manager_id, full_name FROM managers
         WHERE manager_id = ? AND is_active = 1 AND role IN ('MANAGER', 'ADMIN')"
    );
    $who->execute([$newOwner]);
    $row = $who->fetch();
    if (!$row) {
        http_response_code(400);
        echo json_encode(['error' => 'A project can only be owned by an active business analyst or an admin.']);
        exit;
    }
    $pdo->prepare("UPDATE projects SET manager_id = ? WHERE project_id = ?")
        ->execute([$newOwner, $b['project_id']]);
    $reassigned = $row['full_name'];
}

$stmt = $pdo->prepare(
    "UPDATE projects SET project_name = ?, client_name = ?, description = ?, due_date = ?, priority = ?, status = ?
     WHERE project_id = ?"
);
$stmt->execute([
    $b['project_name'] ?? '',
    $b['client_name'] ?? null,
    $b['description'] ?? null,
    $b['due_date'] ?? null,
    $priority,
    $status,
    $b['project_id'],
]);
echo json_encode(['success' => true, 'reassigned_to' => $reassigned]);
