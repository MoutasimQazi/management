<?php
require 'config.php';
require 'auth.php';
/* Company-wide numbers, so admin only. A BA's own slice of each of these
 * already exists on their own pages; this is the aggregate. */
requireRole($pdo, $USERS, ['ADMIN']);

/* Four questions, one request. Each block is wrapped on its own so a
 * table that has not been migrated yet costs its chart and nothing else
 * — a dashboard where one missing feature blanks the other three is
 * worse than a dashboard with a gap in it.
 */
$WEEKS = 12;
$out = ['weeks' => $WEEKS, 'available' => []];

function attempt(PDO $pdo, string $sql, array $params = []): ?array {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    } catch (PDOException $e) {
        return null;
    }
}

/* Monday of the week, N weeks back, as the x-axis. Built in PHP so weeks
 * with no data still appear — a gap in a trend line means "nothing
 * happened", and a missing point means "we forgot to ask". */
$weekKeys = [];
for ($i = $WEEKS - 1; $i >= 0; $i--) {
    $d = new DateTime('monday this week');
    $d->modify('-' . $i . ' weeks');
    $weekKeys[] = $d->format('Y-m-d');
}
$since = $weekKeys[0];
$blank = array_fill_keys($weekKeys, 0);
$mondayOf = fn($date) => (new DateTime($date))->modify('monday this week')->format('Y-m-d');

/* ── 1. Slippage: days pushed out per week, by discipline ──
 * Only pushes count. A date pulled forward is recorded too (days_moved
 * goes negative) but averaging the two together would let one early
 * finish hide a fortnight of slip. */
$rows = attempt($pdo,
    "SELECT created_at, work_type, days_moved FROM due_extensions
     WHERE created_at >= ? AND days_moved > 0", [$since]);
if ($rows !== null) {
    $series = ['TASK' => $blank, 'DESIGN' => $blank, 'BUG' => $blank];
    foreach ($rows as $r) {
        $w = $mondayOf(substr($r['created_at'], 0, 10));
        if (!isset($blank[$w]) || !isset($series[$r['work_type']])) continue;
        $series[$r['work_type']][$w] += (int)$r['days_moved'];
    }
    $out['slippage'] = [
        'weeks'  => $weekKeys,
        'series' => [
            ['name' => 'Development', 'values' => array_values($series['TASK'])],
            ['name' => 'Design',      'values' => array_values($series['DESIGN'])],
            ['name' => 'QA',          'values' => array_values($series['BUG'])],
        ],
    ];
    $out['available'][] = 'slippage';
}

/* ── 2. Bugs opened vs resolved per week ──
 * "Resolved" is updated_at landing in a settled status. It is an
 * approximation — the row records when it last changed, not when it was
 * fixed — but every bug that settles does so exactly once, so the weekly
 * shape is right even where a single date is a day or two out. */
$opened = attempt($pdo,
    "SELECT created_at FROM bugs WHERE created_at >= ?", [$since]);
$closed = attempt($pdo,
    "SELECT updated_at FROM bugs
     WHERE updated_at >= ? AND status IN ('FIXED','VERIFIED','CLOSED')", [$since]);
if ($opened !== null && $closed !== null) {
    $o = $blank; $c = $blank;
    foreach ($opened as $r) { $w = $mondayOf(substr($r['created_at'], 0, 10)); if (isset($o[$w])) $o[$w]++; }
    foreach ($closed as $r) { $w = $mondayOf(substr($r['updated_at'], 0, 10)); if (isset($c[$w])) $c[$w]++; }
    $out['bugs'] = [
        'weeks'  => $weekKeys,
        'series' => [
            ['name' => 'Opened',   'values' => array_values($o)],
            ['name' => 'Resolved', 'values' => array_values($c)],
        ],
    ];
    $out['available'][] = 'bugs';
}

/* ── 3. Workload: unfinished committed hours per person ──
 * Developers carry tasks, designers carry design tasks. Both are hours
 * somebody has been asked to find, so they belong on one axis. */
$load = [];
$devs = attempt($pdo,
    "SELECT e.name, COALESCE(SUM(t.eta_hours), 0) AS hours, COUNT(*) AS items
     FROM tasks t JOIN employees e ON e.employee_id = t.employee_id
     WHERE t.status NOT IN ('COMPLETED','CANCELLED')
     GROUP BY e.employee_id, e.name");
foreach (($devs ?: []) as $r) {
    $load[] = ['name' => $r['name'], 'role' => 'Developer',
               'hours' => round((float)$r['hours'], 1), 'items' => (int)$r['items']];
}
$designers = attempt($pdo,
    "SELECT m.full_name AS name, COALESCE(SUM(d.estimated_hours), 0) AS hours, COUNT(*) AS items
     FROM design_tasks d JOIN managers m ON m.manager_id = d.assigned_to
     WHERE d.status <> 'APPROVED'
     GROUP BY m.manager_id, m.full_name");
foreach (($designers ?: []) as $r) {
    $load[] = ['name' => $r['name'], 'role' => 'Designer',
               'hours' => round((float)$r['hours'], 1), 'items' => (int)$r['items']];
}
if ($load) {
    usort($load, fn($a, $b) => $b['hours'] <=> $a['hours'] ?: $b['items'] <=> $a['items']);
    $out['workload'] = array_slice($load, 0, 10);   // ten bars is already a tall chart
    $out['available'][] = 'workload';
}

/* ── 4. Committed hours vs capacity, next four weeks ──
 * Capacity is the delivery roster × an eight-hour day × the working days
 * in that week, less anyone's approved leave. Committed is what is due
 * that week according to the estimates.
 *
 * Both sides are approximations and worth naming: capacity assumes
 * everyone is available to everything, and committed only counts work
 * that has an estimate at all. The number to read is the ratio moving
 * week to week, not any single week's percentage. */
$headcount = attempt($pdo,
    "SELECT (SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE') AS devs,
            (SELECT COUNT(*) FROM managers WHERE role = 'DESIGNER' AND is_active = 1) AS designers");
$people = $headcount ? (int)$headcount[0]['devs'] + (int)$headcount[0]['designers'] : 0;

if ($people > 0) {
    $cap = [];
    for ($i = 0; $i < 4; $i++) {
        $start = (new DateTime('monday this week'))->modify('+' . $i . ' weeks');
        $end   = (clone $start)->modify('+6 days');
        $s = $start->format('Y-m-d');
        $e = $end->format('Y-m-d');

        $taskHrs = attempt($pdo,
            "SELECT COALESCE(SUM(eta_hours),0) AS h FROM tasks
             WHERE due_date BETWEEN ? AND ? AND status NOT IN ('COMPLETED','CANCELLED')", [$s, $e]);
        $designHrs = attempt($pdo,
            "SELECT COALESCE(SUM(estimated_hours),0) AS h FROM design_tasks
             WHERE due_date BETWEEN ? AND ? AND status <> 'APPROVED'", [$s, $e]);
        $committed = ($taskHrs ? (float)$taskHrs[0]['h'] : 0) + ($designHrs ? (float)$designHrs[0]['h'] : 0);

        // Approved leave days that fall on a weekday inside this week.
        $leave = attempt($pdo,
            "SELECT start_date, end_date FROM leave_requests
             WHERE status = 'APPROVED' AND start_date <= ? AND end_date >= ?", [$e, $s]);
        $lost = 0;
        foreach (($leave ?: []) as $l) {
            $from = max(new DateTime($l['start_date']), clone $start);
            $to   = min(new DateTime($l['end_date']),   clone $end);
            for ($d = clone $from; $d <= $to; $d->modify('+1 day')) {
                if ((int)$d->format('N') < 6) $lost++;
            }
        }

        $capacity = max(0, ($people * 5 - $lost) * DESIGN_HOURS_PER_DAY);
        $cap[] = [
            'week_start' => $s,
            'committed'  => round($committed, 1),
            'capacity'   => $capacity,
            'people'     => $people,
            'leave_days' => $lost,
        ];
    }
    $out['capacity'] = $cap;
    $out['available'][] = 'capacity';
}

echo json_encode($out);
