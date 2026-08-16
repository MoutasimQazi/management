<?php
require 'config.php';
require 'auth.php';
/* Setting a demo date is a scheduling decision, so it belongs to the
 * people who run the project — the owning BA, or an admin. Everyone else
 * on the project reads it. Marketing keeps the access it has elsewhere in
 * the projects module. */
$user = requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING']);
$b = body();

$TYPES    = ['INTERNAL', 'CLIENT', 'STAKEHOLDER', 'DRY_RUN', 'OTHER'];
$STATUSES = ['PLANNED', 'DONE', 'CANCELLED'];

$demoId    = (int)($b['demo_id'] ?? 0);
$projectId = (int)($b['project_id'] ?? 0);
$date      = trim($b['demo_date'] ?? '');

if (!$projectId || $date === '') {
    http_response_code(400);
    echo json_encode(['error' => 'A project and a date are required.']);
    exit;
}

// Only against a project the caller runs — projectScope, not the wider
// involvement scope: being on a project does not mean scheduling for it.
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT project_id FROM projects WHERE project_id = ? AND $scope");
$check->execute(array_merge([$projectId], $params));
if (!$check->fetch()) denyNotYours();

$type = strtoupper(trim($b['demo_type'] ?? 'INTERNAL'));
if (!in_array($type, $TYPES, true)) $type = 'INTERNAL';
$status = strtoupper(trim($b['status'] ?? 'PLANNED'));
if (!in_array($status, $STATUSES, true)) $status = 'PLANNED';

$title = trim($b['title'] ?? '');
$notes = trim($b['notes'] ?? '');
$time  = trim($b['demo_time'] ?? '');

$fields = [
    $projectId,
    $type,
    $title !== '' ? $title : null,
    $date,
    $time !== '' ? $time : null,
    $notes !== '' ? $notes : null,
    $status,
];

if ($demoId) {
    // Confirm the demo itself is on a project the caller runs, so an id
    // from another team's board cannot be edited by guessing it.
    $own = $pdo->prepare("SELECT demo_id FROM project_demos WHERE demo_id = ? AND $scope");
    $own->execute(array_merge([$demoId], $params));
    if (!$own->fetch()) denyNotYours();

    $stmt = $pdo->prepare(
        "UPDATE project_demos
         SET project_id = ?, demo_type = ?, title = ?, demo_date = ?, demo_time = ?, notes = ?, status = ?
         WHERE demo_id = ?"
    );
    $stmt->execute(array_merge($fields, [$demoId]));
    echo json_encode(['success' => true, 'demo_id' => $demoId]);
    exit;
}

$stmt = $pdo->prepare(
    "INSERT INTO project_demos (project_id, demo_type, title, demo_date, demo_time, notes, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt->execute(array_merge($fields, [$user['id']]));
$newId = (int)$pdo->lastInsertId();

/* Who is already booked off on the day. Returned with the new demo so
 * whoever scheduled it finds out immediately, rather than at the demo. */
$clash = $pdo->prepare(
    "SELECT COALESCE(e.name, m.full_name) AS person, l.start_date, l.end_date, l.status
     FROM leave_requests l
     LEFT JOIN employees e ON e.employee_id = l.employee_id
     LEFT JOIN managers  m ON m.manager_id  = l.manager_id
     WHERE l.status IN ('PENDING', 'APPROVED')
       AND ? BETWEEN l.start_date AND l.end_date
       AND (l.employee_id IN (SELECT employee_id FROM tasks WHERE project_id = ?)
            OR l.manager_id IN (
                 SELECT manager_id FROM projects WHERE project_id = ?
                 UNION SELECT qa_id FROM qa_assignments WHERE project_id = ?
                 UNION SELECT designer_id FROM design_assignments WHERE project_id = ?))"
);
try {
    $clash->execute([$date, $projectId, $projectId, $projectId, $projectId]);
    $away = $clash->fetchAll();
} catch (PDOException $e) {
    $away = [];   // qa_assignments / design_assignments may not exist yet
}

echo json_encode(['success' => true, 'demo_id' => $newId, 'away' => $away]);
