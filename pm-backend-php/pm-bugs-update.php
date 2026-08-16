<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);
$b = body();

$bugId = (int)($b['bug_id'] ?? 0);

$statuses = ['OPEN', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'CLOSED', 'REOPENED'];

/* A developer can move a bug that is on their desk, and nothing else.
   Not the title, not the severity, and not who it belongs to — being
   handed a defect is not authority over the report of it. Handled here
   and returned early, so the staff path below stays the staff path. */
if ($user['user_type'] === 'EMPLOYEE') {
    $own = $pdo->prepare("SELECT bug_id FROM bugs WHERE bug_id = ? AND assigned_to = ?");
    $own->execute([$bugId, $user['id']]);
    if (!$own->fetch()) denyNotYours();

    $status = strtoupper(trim((string)($b['status'] ?? '')));
    if (!in_array($status, $statuses, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Unknown status: ' . $status]);
        exit;
    }
    $pdo->prepare("UPDATE bugs SET status = ? WHERE bug_id = ?")->execute([$status, $bugId]);
    echo json_encode(['success' => true]);
    exit;
}

if (!in_array($user['role'], ['ADMIN', 'QA', 'MANAGER', 'MARKETING', 'DESIGNER'], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'This action is not available to your account.']);
    exit;
}
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare(
    "SELECT bug_id, title, steps, link, severity, status, assigned_to, assigned_manager_id
     FROM bugs WHERE bug_id = ? AND $scope"
);
$check->execute(array_merge([$bugId], $params));
$existing = $check->fetch();
if (!$existing) denyNotYours();

// Status-only moves are the common case (the dropdown on each row), so
// every other field falls back to what's already stored. $statuses is
// declared above, where the developer path also needs it.
$severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$severity = in_array($b['severity'] ?? '', $severities, true) ? $b['severity'] : $existing['severity'];
$status   = in_array($b['status'] ?? '', $statuses, true)   ? $b['status']   : $existing['status'];

/* Reassignment is only attempted when the request says something about
   it. A status-only move — the dropdown on each row — must leave whoever
   holds the bug exactly where they are. When it is attempted, both
   columns are written together, so moving a bug from a developer to a
   designer cannot leave the old developer behind in the other column. */
$touchesAssignee = array_key_exists('assignee_kind', $b) || array_key_exists('assigned_to', $b);
if ($touchesAssignee) {
    [$assignedEmployee, $assignedManager] = resolveBugAssignee($pdo, $b);
} else {
    $assignedEmployee = $existing['assigned_to'];
    $assignedManager  = $existing['assigned_manager_id'];
}

/* Reassigning has the same problem as assigning: moving a bug to a QA
   account that is not on the project hides it from them. */
$granted = false;
if ($touchesAssignee && $assignedManager) {
    $proj = $pdo->prepare("SELECT project_id FROM bugs WHERE bug_id = ?");
    $proj->execute([$bugId]);
    $row = $proj->fetch();
    if ($row) {
        $granted = grantProjectAccess(
            $pdo, managerRole($pdo, $assignedManager), (int)$assignedManager, (int)$row['project_id']
        );
    }
}

$stmt = $pdo->prepare(
    "UPDATE bugs SET title = ?, steps = ?, link = ?, severity = ?, status = ?,
                     assigned_to = ?, assigned_manager_id = ?
     WHERE bug_id = ?"
);
$stmt->execute([
    array_key_exists('title', $b) && trim($b['title']) !== '' ? trim($b['title']) : $existing['title'],
    array_key_exists('steps', $b) ? $b['steps'] : $existing['steps'],
    // Sending "" clears the link; omitting the key leaves it alone.
    array_key_exists('link', $b)
        ? (trim((string)$b['link']) !== '' ? trim($b['link']) : null)
        : $existing['link'],
    $severity,
    $status,
    $assignedEmployee,
    $assignedManager,
    $bugId,
]);
echo json_encode(['success' => true, 'granted_access' => $granted]);
