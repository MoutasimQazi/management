<?php
require 'config.php';
require 'auth.php';
/* Removing a person takes away their access, so HR and admins only —
 * same rule as pm-employees-delete.php, which this replaces for the
 * People screen. */
$user = requireRole($pdo, $USERS, ['ADMIN', 'HR']);
$b = body();

/* One endpoint for both kinds of person.
 *
 * ── The bug this fixes ──
 * The People list only offered Delete on developers. Anyone in the
 * managers table — a BA, HR, marketing, QA, a designer, an admin — had
 * no delete at all, so removing them was impossible from the UI. There
 * was a pm-managers-deactivate.php sitting in the repo that nothing has
 * ever called.
 *
 * ── Why a staff account is not simply DELETEd ──
 * A developer only has to be clear of `tasks`. A manager row is
 * referenced by nearly everything in the workspace: projects they own,
 * questions they asked, bugs they raised, leave they filed or reviewed,
 * design work they created, demos they scheduled, deadlines they
 * extended. Those are foreign keys, so a hard DELETE would either fail
 * with a constraint error or take the history with it.
 *
 * So: if nothing references them, they are deleted outright and are
 * genuinely gone. If something does, the account is deactivated — the
 * login stops working immediately, which is the part that matters — and
 * the reply says exactly what is holding the row, so the answer is never
 * a silent no-op.
 */
$kind = strtoupper(trim($b['kind'] ?? ''));
$id   = (int)($b['id'] ?? 0);
if (!$id || !in_array($kind, ['EMPLOYEE', 'STAFF'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Which person, and of which kind?']);
    exit;
}

/* ── A developer ──
 *
 * This branch used to check `tasks` and nothing else, which was only
 * ever half the story: `questions.employee_id` and
 * `leave_requests.employee_id` are foreign keys into employees too, and
 * neither cascades. So a developer who had once asked for a day off
 * could not be removed — the DELETE hit a raw constraint error and the
 * screen showed a 500 with nothing to act on.
 *
 * A developer now gets exactly what a staff account gets: count what
 * holds the row, delete outright when nothing does, and otherwise
 * deactivate — the login stops working immediately, which is the part
 * that matters — and say precisely what is holding it. */
if ($kind === 'EMPLOYEE') {
    $check = $pdo->prepare("SELECT name, status FROM employees WHERE employee_id = ?");
    $check->execute([$id]);
    $person = $check->fetch();
    if (!$person) denyNotYours();

    $holds = [];
    $checks = [
        ['tasks',          'employee_id', 'task assigned to them'],
        ['questions',      'employee_id', 'question they asked'],
        ['leave_requests', 'employee_id', 'leave request'],
    ];
    foreach ($checks as [$table, $col, $label]) {
        try {
            $q = $pdo->prepare("SELECT COUNT(*) AS c FROM $table WHERE $col = ?");
            $q->execute([$id]);
            $c = (int)$q->fetch()['c'];
            if ($c > 0) $holds[] = $c . ' ' . $label . ($c === 1 ? '' : 's');
        } catch (PDOException $e) {
            // table not in this database yet — nothing to hold the row
        }
    }

    if (!$holds) {
        // bugs.assigned_to is ON DELETE SET NULL, so it never blocks and is
        // not counted — the bug survives, just unassigned.
        $pdo->prepare("DELETE FROM employees WHERE employee_id = ?")->execute([$id]);
        echo json_encode(['success' => true, 'removed' => true, 'name' => $person['name']]);
        exit;
    }

    // Referenced: the login goes, the history stays. 'INACTIVE' is the
    // same status pm-people-role.php sets when moving someone off the
    // roster, so the two paths leave the row in one shape, not two.
    $pdo->prepare(
        "UPDATE employees SET status = 'INACTIVE', token = NULL, temp_password = NULL
          WHERE employee_id = ?"
    )->execute([$id]);
    echo json_encode([
        'success' => true,
        'removed' => false,
        'name'    => $person['name'],
        'holds'   => $holds,
        'message' => $person['name'] . ' can no longer sign in, but the account was kept because ' .
                     'their work is still referenced: ' . implode(', ', $holds) .
                     '. Delete or reassign those and remove them again to clear the record entirely.',
    ]);
    exit;
}

/* ── A staff account ── */
$check = $pdo->prepare("SELECT full_name, role, is_active FROM managers WHERE manager_id = ?");
$check->execute([$id]);
$person = $check->fetch();
if (!$person) denyNotYours();

// Nobody removes their own account — an admin locking themselves out of
// the only admin login is not a recoverable mistake from inside the app.
if ((int)$id === (int)$user['id']) {
    http_response_code(400);
    echo json_encode(['error' => 'You cannot remove your own account.']);
    exit;
}

/* What still points at this person, in words an admin can act on. Each
 * is asked separately and tolerantly, because a workspace that has not
 * imported every migration is missing some of these tables entirely. */
$holds = [];
$checks = [
    ['projects',        'manager_id',          'project'],
    ['employees',       'manager_id',          'developer on their roster'],
    ['questions',       'manager_id',          'question'],
    ['leave_requests',  'manager_id',          'leave request'],
    ['leave_requests',  'reviewed_by',         'leave review'],
    ['bugs',            'reported_by',         'bug they raised'],
    ['bugs',            'assigned_manager_id', 'bug assigned to them'],
    ['test_cases',      'created_by',          'test case'],
    ['design_tasks',    'created_by',          'design task they created'],
    ['design_tasks',    'assigned_to',         'design task assigned to them'],
    ['project_demos',   'created_by',          'demo'],
    ['due_extensions',  'extended_by',         'recorded deadline change'],
];
foreach ($checks as [$table, $col, $label]) {
    try {
        $q = $pdo->prepare("SELECT COUNT(*) AS c FROM $table WHERE $col = ?");
        $q->execute([$id]);
        $c = (int)$q->fetch()['c'];
        if ($c > 0) $holds[] = $c . ' ' . $label . ($c === 1 ? '' : 's');
    } catch (PDOException $e) {
        // table not in this database yet — nothing to hold the row
    }
}

/* Project access rows are deliberately NOT counted. They are pure
 * access, they carry no history, and their foreign keys cascade — so
 * they should never be the reason someone cannot be removed. */
if (!$holds) {
    try {
        $pdo->prepare("DELETE FROM qa_assignments WHERE qa_id = ?")->execute([$id]);
    } catch (PDOException $e) {}
    try {
        $pdo->prepare("DELETE FROM design_assignments WHERE designer_id = ?")->execute([$id]);
    } catch (PDOException $e) {}
    try {
        $pdo->prepare("DELETE FROM leave_approvers WHERE manager_id = ?")->execute([$id]);
    } catch (PDOException $e) {}

    $pdo->prepare("DELETE FROM managers WHERE manager_id = ?")->execute([$id]);
    echo json_encode(['success' => true, 'removed' => true, 'name' => $person['full_name']]);
    exit;
}

// Referenced: the login goes, the history stays.
$pdo->prepare("UPDATE managers SET is_active = 0, token = NULL WHERE manager_id = ?")->execute([$id]);
echo json_encode([
    'success'   => true,
    'removed'   => false,
    'name'      => $person['full_name'],
    'holds'     => $holds,
    'message'   => $person['full_name'] . ' can no longer sign in, but the account was kept because ' .
                   'their work is still referenced: ' . implode(', ', $holds) .
                   '. Delete or reassign those and remove them again to clear the record entirely.',
]);
