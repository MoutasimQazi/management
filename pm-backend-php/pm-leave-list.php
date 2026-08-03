<?php
require 'config.php';
require 'auth.php';
// Any logged-in account (manager, HR, marketing, or employee) can see the
// leave roster — leave status is company-wide visible by design. Approval
// is done by the managers the request was addressed to, or an ADMIN
// (see pm-leave-review.php); HR just tracks.
$user = requireUser($pdo, $USERS);

$sql = "SELECT l.leave_id, l.employee_id, l.manager_id,
               COALESCE(e.name, req.full_name) AS employee_name,
               l.start_date, l.end_date, l.reason,
               l.status, l.reviewed_by, rvm.full_name AS reviewed_by_name, l.reviewed_at, l.created_at,
               (SELECT GROUP_CONCAT(m2.full_name SEPARATOR ', ')
                  FROM leave_approvers la JOIN managers m2 ON m2.manager_id = la.manager_id
                 WHERE la.leave_id = l.leave_id) AS approver_names
        FROM leave_requests l
        LEFT JOIN employees e ON e.employee_id = l.employee_id
        LEFT JOIN managers req ON req.manager_id = l.manager_id
        LEFT JOIN managers rvm ON rvm.manager_id = l.reviewed_by
        WHERE 1=1";
$params = [];

if (!empty($_GET['mine'])) {
    if ($user['user_type'] === 'EMPLOYEE') {
        $sql .= " AND l.employee_id = ?";
        $params[] = $user['id'];
    } else {
        $sql .= " AND l.manager_id = ?";
        $params[] = $user['id'];
    }
}
if (!empty($_GET['approvals'])) {
    // Pending requests waiting on the calling manager: ones that name
    // them as an approver — ADMIN sees every pending request. HR tracks
    // but doesn't approve, so it's excluded here too.
    if ($user['user_type'] !== 'STAFF' || $user['role'] === 'HR') {
        http_response_code(403);
        echo json_encode(['error' => 'Only managers review leave requests.']);
        exit;
    }
    $sql .= " AND l.status = 'PENDING'";
    if ($user['role'] !== 'ADMIN') {
        $sql .= " AND EXISTS (SELECT 1 FROM leave_approvers la WHERE la.leave_id = l.leave_id AND la.manager_id = ?)";
        $params[] = $user['id'];
    }
}
if (!empty($_GET['status'])) {
    $sql .= " AND l.status = ?";
    $params[] = $_GET['status'];
}
if (!empty($_GET['month'])) {
    // 'YYYY-MM' — any leave that overlaps that calendar month. This is
    // what HR's monthly view uses; it naturally starts fresh every time
    // the month rolls over since it's driven off the request dates, not
    // a separate snapshot that needs manual upkeep.
    $monthStart = $_GET['month'] . '-01';
    $sql .= " AND l.start_date <= LAST_DAY(?) AND l.end_date >= ?";
    $params[] = $monthStart;
    $params[] = $monthStart;
}

$sql .= " ORDER BY l.start_date DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
