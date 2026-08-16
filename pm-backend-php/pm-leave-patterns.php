<?php
require 'config.php';
require 'auth.php';
/* HR tracks leave and admins oversee it, so both. Approvers do their
 * deciding on the Overview against a single request; this is the other
 * question — the shape of someone's leave over months, which no single
 * approval screen can show you. */
requireRole($pdo, $USERS, ['ADMIN', 'HR']);

/* How far back to look. Six months is long enough for a pattern to be a
 * pattern rather than a run of bad luck, and short enough that someone
 * who was difficult last year and fine since is not still being counted
 * for it. */
$months = max(1, min(24, (int)($_GET['months'] ?? 6)));
$since  = (new DateTime('first day of this month'))
            ->modify('-' . ($months - 1) . ' months')->format('Y-m-d');

/* One row per person, over the window. Rejected requests are excluded —
 * asking for a day and being told no is not a pattern of taking leave. */
$stmt = $pdo->prepare(
    "SELECT l.leave_id, l.employee_id, l.manager_id,
            COALESCE(e.name, m.full_name) AS person,
            COALESCE(m.role, 'EMPLOYEE') AS role,
            l.start_date, l.end_date, l.status,
            DATEDIFF(l.end_date, l.start_date) + 1 AS days
     FROM leave_requests l
     LEFT JOIN employees e ON e.employee_id = l.employee_id
     LEFT JOIN managers  m ON m.manager_id  = l.manager_id
     WHERE l.status IN ('PENDING', 'APPROVED') AND l.end_date >= ?
     ORDER BY l.start_date DESC"
);
$stmt->execute([$since]);
$rows = $stmt->fetchAll();

/* Which of those landed on or just before a demo on a project the person
 * was working on. Reuses demoClashesFor so this agrees exactly with the
 * warning the approver saw at the time — two different answers to the
 * same question would make both useless. */
$people = [];
foreach ($rows as $r) {
    $key = $r['employee_id'] ? 'E:' . $r['employee_id'] : 'M:' . $r['manager_id'];
    if (!isset($people[$key])) {
        $people[$key] = [
            'key'            => $key,
            'person'         => $r['person'],
            'role'           => $r['role'],
            'requests'       => 0,
            'days'           => 0,
            'near_demo'      => 0,   // requests that fell on or just before a demo
            'near_demo_days' => 0,
            'last_leave'     => null,
            'examples'       => [],  // the demo-adjacent ones, for the tooltip
        ];
    }
    $p = &$people[$key];
    $p['requests']++;
    $p['days'] += (int)$r['days'];
    if ($p['last_leave'] === null) $p['last_leave'] = $r['start_date'];

    $clashes = demoClashesFor(
        $pdo,
        $r['employee_id'] ? (int)$r['employee_id'] : null,
        $r['manager_id']  ? (int)$r['manager_id']  : null,
        $r['start_date'],
        $r['end_date']
    );
    if ($clashes) {
        $p['near_demo']++;
        $p['near_demo_days'] += (int)$r['days'];
        if (count($p['examples']) < 4) {
            $c = $clashes[0];
            $p['examples'][] = [
                'start_date'   => $r['start_date'],
                'end_date'     => $r['end_date'],
                'demo_date'    => $c['demo_date'],
                'demo_type'    => $c['demo_type'],
                'project_name' => $c['project_name'],
                'proximity'    => $c['proximity'],
            ];
        }
    }
    unset($p);
}

/* Most demo-adjacent first, then most days. The whole reason to open
 * this screen is the top of that order — nobody scrolls a leave report
 * looking for the person who took two quiet days in March. */
$out = array_values($people);
usort($out, function ($a, $b) {
    if ($a['near_demo'] !== $b['near_demo']) return $b['near_demo'] <=> $a['near_demo'];
    return $b['days'] <=> $a['days'];
});

/* ── Absence by month, against demos ──────────────────
 * Leave days per month with the number of demos that month beside them.
 * A tall month under a row of demo dots is a crunch week: people away
 * while something was being shown.
 *
 * Demos are counted, not plotted on the same scale — days off and demos
 * are different things and putting both on one y-axis would be a lie
 * about their relationship. The chart marks them above the column.
 */
$series = [];
for ($i = $months - 1; $i >= 0; $i--) {
    $m     = (new DateTime('first day of this month'))->modify('-' . $i . ' months');
    $mKey  = $m->format('Y-m');
    $mFrom = $m->format('Y-m-d');
    $mTo   = (clone $m)->modify('last day of this month')->format('Y-m-d');

    // Only the days inside this month, so a request spanning a boundary
    // is not counted twice.
    $days = 0;
    foreach ($rows as $r) {
        $s = max(new DateTime($r['start_date']), new DateTime($mFrom));
        $e = min(new DateTime($r['end_date']),   new DateTime($mTo));
        if ($s <= $e) $days += $s->diff($e)->days + 1;
    }

    $demoCount = 0;
    try {
        $q = $pdo->prepare(
            "SELECT COUNT(*) AS n FROM project_demos
             WHERE demo_date BETWEEN ? AND ? AND status <> 'CANCELLED'"
        );
        $q->execute([$mFrom, $mTo]);
        $demoCount = (int)$q->fetch()['n'];
    } catch (PDOException $e) {
        $demoCount = 0;   // migration 011 not imported
    }

    $series[] = [
        'month' => $mKey,
        'label' => $m->format('M'),
        'days'  => $days,
        'demos' => $demoCount,
    ];
}

echo json_encode([
    'since'   => $since,
    'months'  => $months,
    'people'  => $out,
    'by_month' => $series,
]);
