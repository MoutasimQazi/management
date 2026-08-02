<?php
require 'config.php';
require 'auth.php';
// Any logged-in account (manager, HR, marketing, or employee) can see the
// leave roster — leave status is company-wide visible by design. Only
// HR/ADMIN can approve or reject (see pm-leave-review.php).
$user = requireUser($pdo, $USERS);

$sql = "SELECT l.leave_id, l.employee_id, e.name AS employee_name, l.start_date, l.end_date, l.reason,
               l.status, l.reviewed_by, m.full_name AS reviewed_by_name, l.reviewed_at, l.created_at
        FROM leave_requests l
        JOIN employees e ON e.employee_id = l.employee_id
        LEFT JOIN managers m ON m.manager_id = l.reviewed_by
        WHERE 1=1";
$params = [];

if (!empty($_GET['mine']) && $user['user_type'] === 'EMPLOYEE') {
    $sql .= " AND l.employee_id = ?";
    $params[] = $user['id'];
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
