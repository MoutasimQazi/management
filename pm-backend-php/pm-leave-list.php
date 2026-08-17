<?php
require 'config.php';
require 'auth.php';
// Approval is done by the managers a request was addressed to, or an ADMIN
// (see pm-leave-review.php); HR just tracks.
$user = requireUser($pdo, $USERS);

/* ── Who may see everyone's leave ─────────────────────
 * This used to be open to every signed-in account, so a developer's
 * leave tab listed the whole company's requests — including ones that
 * finished months ago. Someone else's time off is not their business.
 *
 * The roster stays with the roles that have a duty attached to it:
 * ADMIN, HR (whose section is leave tracking), and MANAGER — a business
 * analyst approves leave and plans around it. Everyone else may ask for
 * their own (?mine=1) and for requests addressed to them (?approvals=1),
 * both of which are scoped further down.
 */
$LEAVE_ROSTER_ROLES = ['ADMIN', 'HR', 'MANAGER'];
if (empty($_GET['mine']) && empty($_GET['approvals']) &&
    !in_array($user['role'], $LEAVE_ROSTER_ROLES, true)) {
    http_response_code(403);
    echo json_encode(['error' => "You can only see your own leave. Ask HR for anyone else's."]);
    exit;
}

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
$rows = $stmt->fetchAll();

/* ── Context for an approver ──────────────────────────
 * Approving a day off one request at a time is how someone quietly ends
 * up with three weeks in one month: each request looks reasonable alone.
 * So an approvals list carries, for every pending request, the rest of
 * that person's leave in the same calendar month.
 *
 * One extra query for the whole list rather than one per row — an
 * approver with a dozen pending requests should not cost a dozen
 * round trips to answer the same question.
 */
if (!empty($_GET['approvals']) && $rows) {
    $keys = [];      // "E:12" / "M:5" → true, who we need history for
    $bounds = [];
    foreach ($rows as $r) {
        $keys[($r['employee_id'] ? 'E:' . $r['employee_id'] : 'M:' . $r['manager_id'])] = true;
        $bounds[] = substr($r['start_date'], 0, 7);
    }
    sort($bounds);
    $first = $bounds[0] . '-01';
    $last  = end($bounds) . '-01';

    $empIds = array_values(array_filter(array_map(fn($r) => $r['employee_id'], $rows)));
    $mgrIds = array_values(array_filter(array_map(fn($r) => $r['manager_id'], $rows)));

    $clauses = [];
    $ctxParams = [];
    if ($empIds) {
        $clauses[] = 'l.employee_id IN (' . implode(',', array_fill(0, count($empIds), '?')) . ')';
        $ctxParams = array_merge($ctxParams, $empIds);
    }
    if ($mgrIds) {
        $clauses[] = 'l.manager_id IN (' . implode(',', array_fill(0, count($mgrIds), '?')) . ')';
        $ctxParams = array_merge($ctxParams, $mgrIds);
    }

    $history = [];
    if ($clauses) {
        $ctxSql = "SELECT l.leave_id, l.employee_id, l.manager_id, l.start_date, l.end_date, l.status
                   FROM leave_requests l
                   WHERE (" . implode(' OR ', $clauses) . ")
                     AND l.start_date <= LAST_DAY(?) AND l.end_date >= ?
                   ORDER BY l.start_date ASC";
        $ctxStmt = $pdo->prepare($ctxSql);
        $ctxStmt->execute(array_merge($ctxParams, [$last, $first]));
        $history = $ctxStmt->fetchAll();
    }

    foreach ($rows as &$r) {
        $key   = $r['employee_id'] ? 'E:' . $r['employee_id'] : 'M:' . $r['manager_id'];
        $month = substr($r['start_date'], 0, 7);
        $mine  = [];
        $days  = 0;

        foreach ($history as $h) {
            $hKey = $h['employee_id'] ? 'E:' . $h['employee_id'] : 'M:' . $h['manager_id'];
            if ($hKey !== $key) continue;
            if (substr($h['start_date'], 0, 7) !== $month &&
                substr($h['end_date'],   0, 7) !== $month) continue;
            if ($h['status'] === 'REJECTED') continue;   // a refusal is not time off

            // Days inside this month only, so a request spanning a month
            // boundary is not counted twice across two months.
            $mStart = new DateTime($month . '-01');
            $mEnd   = (new DateTime($month . '-01'))->modify('last day of this month');
            $s = max(new DateTime($h['start_date']), $mStart);
            $e = min(new DateTime($h['end_date']),   $mEnd);
            $n = $s <= $e ? $s->diff($e)->days + 1 : 0;
            $days += $n;

            if ((int)$h['leave_id'] !== (int)$r['leave_id']) {
                $mine[] = [
                    'leave_id'   => (int)$h['leave_id'],
                    'start_date' => $h['start_date'],
                    'end_date'   => $h['end_date'],
                    'status'     => $h['status'],
                    'days'       => $n,
                ];
            }
        }
        $r['month']            = $month;
        $r['month_other']      = $mine;   // everything else they have that month
        $r['month_total_days'] = $days;   // including the request being reviewed

        /* Does this leave land on a demo for a project they are working
           on? The most expensive thing an approver can miss, and the one
           they have no other way to know. */
        $r['demo_clashes'] = demoClashesFor(
            $pdo,
            $r['employee_id'] ? (int)$r['employee_id'] : null,
            $r['manager_id']  ? (int)$r['manager_id']  : null,
            $r['start_date'],
            $r['end_date']
        );
    }
    unset($r);
}

/* The same warning on your own requests, so it is visible when asking and
   not only when being approved — the person best placed to move a day off
   is the one requesting it. */
if (!empty($_GET['mine'])) {
    foreach ($rows as &$r) {
        if (!in_array($r['status'], ['PENDING', 'APPROVED'], true)) continue;
        $r['demo_clashes'] = demoClashesFor(
            $pdo,
            $r['employee_id'] ? (int)$r['employee_id'] : null,
            $r['manager_id']  ? (int)$r['manager_id']  : null,
            $r['start_date'],
            $r['end_date']
        );
    }
    unset($r);
}

echo json_encode($rows);
