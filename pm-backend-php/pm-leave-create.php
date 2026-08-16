<?php
require 'config.php';
require 'auth.php';
$user = requireUser($pdo, $USERS);
$b = body();

$employeeId = null;
$managerId = null;

if ($user['user_type'] === 'EMPLOYEE') {
    $employeeId = (int)$user['id'];
} elseif (!empty($b['employee_id'])) {
    // HR/Admin filing on behalf of an employee.
    if (!in_array($user['role'], ['ADMIN', 'HR'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Only HR/Admin can file leave on behalf of a developer.']);
        exit;
    }
    $employeeId = (int)$b['employee_id'];
} else {
    // Any staff member (Manager, Admin, HR, Marketing) filing for themselves.
    $managerId = (int)$user['id'];
}

if (empty($b['start_date']) || empty($b['end_date'])) {
    http_response_code(400);
    echo json_encode(['error' => 'start_date and end_date are required.']);
    exit;
}

// The requester addresses the request to one or more managers — any one
// of them (or an ADMIN) can approve it. Accepts approver_ids: [1,2] and
// tolerates a single approver_id for good measure.
$approverIds = [];
if (!empty($b['approver_ids']) && is_array($b['approver_ids'])) {
    $approverIds = array_map('intval', $b['approver_ids']);
} elseif (!empty($b['approver_id'])) {
    $approverIds = [(int)$b['approver_id']];
}
$approverIds = array_values(array_unique(array_filter($approverIds)));

/* ── An admin does not request leave, they record it ──
 * There is nobody above an admin to approve it, so asking them to pick
 * an approver is asking them to nominate a subordinate to authorise
 * their own time off. They choose the dates and the leave is simply
 * booked — approved on the spot, by themselves, and visible to everyone
 * on the same day as anyone else's. */
$isAdmin = ($user['user_type'] ?? '') === 'STAFF' && ($user['role'] ?? '') === 'ADMIN';

if ($isAdmin) {
    $stmt = $pdo->prepare(
        "INSERT INTO leave_requests
           (employee_id, manager_id, start_date, end_date, reason, status, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, NOW())"
    );
    $stmt->execute([
        $employeeId, $managerId, $b['start_date'], $b['end_date'], $b['reason'] ?? null, $user['id'],
    ]);
    echo json_encode([
        'success'  => true,
        'leave_id' => (int)$pdo->lastInsertId(),
        'status'   => 'APPROVED',
        'booked'   => true,
    ]);
    exit;
}

if (!$approverIds) {
    http_response_code(400);
    echo json_encode(['error' => 'Select at least one manager to send this request to.']);
    exit;
}

/* Keep only real, active, approval-eligible manager rows out of whatever
 * the client sent — leave approval is a manager-side responsibility, so
 * HR accounts are never valid approvers even if a client tries to send one.
 *
 * A business analyst's own leave goes to an admin and nobody else: BAs
 * are the managers here, and a BA signing off a peer's time off is not
 * an approval. The form only offers admins to a BA, but the form is not
 * the enforcement — this is. */
$isBa = ($user['user_type'] ?? '') === 'STAFF' && ($user['role'] ?? '') === 'MANAGER';
$allowed = $isBa ? ['ADMIN'] : ['ADMIN', 'MANAGER', 'MARKETING'];

$placeholders = implode(',', array_fill(0, count($approverIds), '?'));
$rolePlaceholders = implode(',', array_fill(0, count($allowed), '?'));
$check = $pdo->prepare(
    "SELECT manager_id FROM managers
     WHERE is_active = 1 AND role IN ($rolePlaceholders) AND manager_id IN ($placeholders)
       AND manager_id <> ?"
);
$check->execute(array_merge($allowed, $approverIds, [(int)($managerId ?: 0)]));
$validIds = array_column($check->fetchAll(), 'manager_id');
if (!$validIds) {
    http_response_code(400);
    echo json_encode(['error' => $isBa
        ? 'A business analyst's leave has to go to an admin.'
        : 'None of the selected approvers can approve leave.']);
    exit;
}

$stmt = $pdo->prepare(
    "INSERT INTO leave_requests (employee_id, manager_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)"
);
$stmt->execute([$employeeId, $managerId, $b['start_date'], $b['end_date'], $b['reason'] ?? null]);
$leaveId = (int)$pdo->lastInsertId();

$ins = $pdo->prepare("INSERT INTO leave_approvers (leave_id, manager_id) VALUES (?, ?)");
foreach ($validIds as $mid) {
    $ins->execute([$leaveId, $mid]);
}

echo json_encode(['success' => true, 'leave_id' => $leaveId]);
