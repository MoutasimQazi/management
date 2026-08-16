<?php
// Mirrors the n8n "Check Credentials1" node so a token issued by that
// login is recognised here too. requireManager() checks the DB
// `managers.token` column first and only falls back to this list.
//
// SECURITY DEBT: this repo is public, so these tokens are readable by
// anyone and grant full API access. Rotating them requires updating the
// n8n node in the same change — rotating only one side signs everyone
// out, which is exactly what happened when it was attempted. Do both
// together, or make the repository private first.
$USERS = [
    ['email' => 'yusuf.shaikh@moveneticsdigital.com',   'token' => 'tok_yusuf_7d1c277c49791954'],
    ['email' => 'akruti.patel@moveneticsdigital.com',   'token' => 'tok_akruti_1203f0abfeea57ea'],
    ['email' => 'binson.abraham@moveneticsdigital.com', 'token' => 'tok_binson_831812f4fc9ec934'],
    ['email' => 'sapna.kaintu@moveneticsdigital.com',   'token' => 'tok_sapna_45a4494a4bb99fff'],
    ['email' => 'noor.beskar@moveneticsdigital.com',    'token' => 'tok_noor_3673c02679e15c15'],
    ['email' => 'asad.dongri@moveneticsdigital.com',    'token' => 'tok_asad_18d02455c601d090'],
];

// Pulls the Bearer token out of the request, however the current server
// happens to expose it.
function bearerToken(): string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return trim(preg_replace('/^Bearer\s+/i', '', $auth));
}

// Validates the Bearer token, resolves it to a managers-table row, and
// halts the request (with the same error shapes the old n8n workflow used)
// if either step fails. Every manager-only endpoint calls this first.
//
// Primary path: any managers row whose `token` column matches (covers the
// original 6 managers, whose tokens are backfilled to the values below, plus
// every HR/Marketing account created since). Falls back to the original
// static $USERS list + email lookup so nothing breaks if migration 001
// hasn't been run against this database yet.
function requireManager(PDO $pdo, array $USERS): array {
    $token = bearerToken();

    $stmt = $pdo->prepare(
        "SELECT manager_id, role, full_name FROM managers WHERE is_active = 1 AND token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $manager = $stmt->fetch();
    if ($manager) return $manager;

    $user = null;
    foreach ($USERS as $u) {
        if (hash_equals($u['token'], $token)) { $user = $u; break; }
    }
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or missing token']);
        exit;
    }

    $stmt = $pdo->prepare(
        "SELECT manager_id, role, full_name FROM managers WHERE is_active = 1 AND email = ? LIMIT 1"
    );
    $stmt->execute([$user['email']]);
    $manager = $stmt->fetch();

    if (!$manager) {
        http_response_code(403);
        echo json_encode(['error' =>
            'No manager record found for this email in the managers table (or the row is not is_active).']);
        exit;
    }
    return $manager; // ['manager_id' => .., 'role' => 'ADMIN'|'MANAGER'|'HR'|'MARKETING', 'full_name' => ..]
}

// Like requireManager(), but also accepts an employee login — used by
// endpoints an employee can call directly (their own tasks, their own
// questions, filing/viewing leave). Returns a unified shape with
// `user_type` = 'STAFF' (any managers-table role) or 'EMPLOYEE'.
function requireUser(PDO $pdo, array $USERS): array {
    $token = bearerToken();

    $stmt = $pdo->prepare(
        "SELECT manager_id AS id, role, full_name AS name, email FROM managers WHERE is_active = 1 AND token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if ($row) { $row['user_type'] = 'STAFF'; return $row; }

    $stmt = $pdo->prepare(
        "SELECT employee_id AS id, name, email FROM employees WHERE status = 'ACTIVE' AND token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if ($row) { $row['role'] = 'EMPLOYEE'; $row['user_type'] = 'EMPLOYEE'; return $row; }

    // Fallback to the legacy static token list for the original 6 managers.
    foreach ($USERS as $u) {
        if (!hash_equals($u['token'], $token)) continue;
        $stmt = $pdo->prepare(
            "SELECT manager_id AS id, role, full_name AS name, email FROM managers WHERE is_active = 1 AND email = ? LIMIT 1"
        );
        $stmt->execute([$u['email']]);
        $row = $stmt->fetch();
        if ($row) { $row['user_type'] = 'STAFF'; return $row; }
    }

    http_response_code(401);
    echo json_encode(['error' => 'Invalid or missing token']);
    exit;
}

// Wraps requireUser() with a role allowlist — for endpoints only some
// roles may call (e.g. HR + ADMIN for recruitment, HR + ADMIN for
// reviewing leave).
function requireRole(PDO $pdo, array $USERS, array $allowedRoles): array {
    $user = requireUser($pdo, $USERS);
    if (!in_array($user['role'], $allowedRoles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'This action requires one of: ' . implode(', ', $allowedRoles)]);
        exit;
    }
    return $user;
}

/* Who a bug is on. A developer is an `employees` row and QA, design and
 * the business analysts are `managers` rows, so the assignee is two
 * nullable columns of which at most one is ever set (migration 008).
 *
 * Takes the request body, returns [employeeId, managerId] ready to write
 * — always both, so the caller assigns them together and cannot leave a
 * stale value behind in the column it did not think about.
 *
 * Accepts { assignee_kind: 'EMPLOYEE'|'STAFF', assignee_id } and, for
 * anything still sending the original shape, a bare { assigned_to }
 * meaning an employee. Sending an empty assignee_id clears both.
 *
 * Halts the request if the target does not exist or is not active —
 * silently dropping an assignment would look like it worked.
 */
function resolveBugAssignee(PDO $pdo, array $b): array {
    if (!array_key_exists('assignee_kind', $b) && array_key_exists('assigned_to', $b)) {
        $b['assignee_kind'] = 'EMPLOYEE';
        $b['assignee_id']   = $b['assigned_to'];
    }

    $kind = strtoupper(trim((string)($b['assignee_kind'] ?? '')));
    $id   = $b['assignee_id'] ?? '';
    if ($kind === '' || $id === '' || $id === null) return [null, null];

    if ($kind === 'EMPLOYEE') {
        $q = $pdo->prepare("SELECT employee_id FROM employees WHERE employee_id = ? AND status = 'ACTIVE'");
        $q->execute([(int)$id]);
        if (!$q->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'That developer is not on the active roster.']);
            exit;
        }
        return [(int)$id, null];
    }

    if ($kind === 'STAFF') {
        $q = $pdo->prepare(
            "SELECT manager_id FROM managers
             WHERE manager_id = ? AND is_active = 1 AND role IN ('QA','DESIGNER','MANAGER')"
        );
        $q->execute([(int)$id]);
        if (!$q->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'Bugs can only go to an active QA, designer or business analyst.']);
            exit;
        }
        return [null, (int)$id];
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unknown assignee kind: ' . $kind]);
    exit;
}

/* Put a QA or designer account on a project, if it is not already.
 *
 * ── Why this exists at all ──
 * QA and designers see only the projects assigned to them. So handing
 * one a piece of work on a project they are not on creates a row they
 * cannot open: assigned work, invisible to the assignee. That has now
 * turned up four times in this codebase — bugs to developers with no
 * bugs page, designers made assignable with nowhere to see one, design
 * work assigned off-project, and bugs assigned to off-project QA.
 *
 * Being given the work is being put on the project, so the grant follows
 * the assignment rather than waiting for somebody to notice. One helper
 * for both roles, so QA and Design cannot drift apart again.
 *
 * Only ever adds. Nothing here takes anyone off a project — that is the
 * Team panel's job, and it should stay a deliberate act.
 *
 * Returns true when it actually granted, so the caller can say so
 * instead of letting the access appear from nowhere.
 */
function grantProjectAccess(PDO $pdo, string $role, int $managerId, int $projectId): bool {
    $map = [
        'QA'       => ['qa_assignments',     'qa_id'],
        'DESIGNER' => ['design_assignments', 'designer_id'],
    ];
    if (!isset($map[$role]) || !$managerId || !$projectId) return false;
    [$table, $col] = $map[$role];

    try {
        $has = $pdo->prepare("SELECT 1 FROM $table WHERE $col = ? AND project_id = ?");
        $has->execute([$managerId, $projectId]);
        if ($has->fetch()) return false;

        $pdo->prepare("INSERT INTO $table ($col, project_id) VALUES (?, ?)")
            ->execute([$managerId, $projectId]);
        return true;
    } catch (PDOException $e) {
        // The module's migration may not be imported yet. The work is
        // still worth creating; it just cannot be granted for now.
        return false;
    }
}

/* The role of a managers-table account, or '' if it is not one. Used to
 * decide which assignment table a grant belongs in. */
function managerRole(PDO $pdo, ?int $managerId): string {
    if (!$managerId) return '';
    $q = $pdo->prepare("SELECT role FROM managers WHERE manager_id = ? AND is_active = 1");
    $q->execute([$managerId]);
    $row = $q->fetch();
    return $row ? (string)$row['role'] : '';
}

/* Who is "on" a project, for things everyone working on it should see —
 * demo dates, and the leave clashes those cause.
 *
 * Deliberately wider than projectScope(): that one answers "what may this
 * account administer", and a developer administers nothing, which is why
 * it has no developer branch at all. This answers "whose project is this
 * anyway", and a developer holding tasks on it is unarguably on it.
 *
 *   ADMIN     everything
 *   EMPLOYEE  projects they hold tasks on
 *   QA        projects assigned via qa_assignments
 *   DESIGNER  projects assigned via design_assignments
 *   other     projects they own
 *
 * The demo list and the leave clash warning must both use this, or a
 * warning could name a demo the person cannot open.
 */
function projectInvolvementScope(array $user, string $col): array {
    if (($user['role'] ?? '') === 'ADMIN') {
        return ['1=1', []];
    }
    if (($user['user_type'] ?? '') === 'EMPLOYEE') {
        return ["$col IN (SELECT project_id FROM tasks WHERE employee_id = ?)", [$user['id']]];
    }
    if ($user['role'] === 'QA') {
        return ["$col IN (SELECT project_id FROM qa_assignments WHERE qa_id = ?)", [$user['id']]];
    }
    if ($user['role'] === 'DESIGNER') {
        return ["$col IN (SELECT project_id FROM design_assignments WHERE designer_id = ?)", [$user['id']]];
    }
    return ["$col IN (SELECT project_id FROM projects WHERE manager_id = ?)", [$user['id']]];
}

/* How close a demo can sit after someone gets back and still be the
 * approver's problem. A week: long enough to catch "off Mon-Wed, client
 * demo Thursday", short enough that a demo three weeks out — which they
 * will be back in plenty of time for — does not cry wolf. */
const DEMO_LOOKAHEAD_DAYS = 7;

/* Demos around a date range, on projects a given person is on.
 *
 * Used to warn an approver about the leave in front of them. Takes the
 * requester's identity rather than the caller's — the question is about
 * them, not about who is reading the answer.
 *
 * ── Why this looks past the end of the leave ──
 * The first version only caught a demo falling inside the leave. But
 * being away Monday to Wednesday before a Thursday client demo is the
 * worse case and it matched nothing: the person is absent for exactly
 * the run-up, and back with a day to spare. Both are reported, and each
 * row says which it is, because they are not the same problem:
 *
 *   during  they are away on the day itself
 *   after   the demo lands within a week of them getting back
 *
 * Each row also carries how much unfinished work they hold on that
 * project, which is the difference between "they are on it" and "they
 * are the one building it".
 *
 * Returns [] rather than failing if project_demos does not exist yet:
 * migration 011 is imported by hand, and an approvals screen must not
 * break because a feature has not been installed.
 */
function demoClashesFor(PDO $pdo, ?int $employeeId, ?int $managerId, string $from, string $to): array {
    if (!$employeeId && !$managerId) return [];

    if ($employeeId) {
        $scope  = 'd.project_id IN (SELECT project_id FROM tasks WHERE employee_id = ?)';
        $params = [$employeeId];
    } else {
        /* A staff requester could be on a project any of three ways, and
           the point is to catch a clash, so all three are asked. */
        $scope = 'd.project_id IN (SELECT project_id FROM projects WHERE manager_id = ?
                                   UNION SELECT project_id FROM qa_assignments WHERE qa_id = ?
                                   UNION SELECT project_id FROM design_assignments WHERE designer_id = ?)';
        $params = [$managerId, $managerId, $managerId];
    }

    // The window runs from the first day off to a week after the last.
    $until = (new DateTime($to))->modify('+' . DEMO_LOOKAHEAD_DAYS . ' days')->format('Y-m-d');

    try {
        $stmt = $pdo->prepare(
            "SELECT d.demo_id, d.project_id, d.demo_type, d.title, d.demo_date, d.demo_time,
                    p.project_name,
                    CASE WHEN d.demo_date <= ? THEN 'during' ELSE 'after' END AS proximity,
                    DATEDIFF(d.demo_date, ?) AS days_after_return
             FROM project_demos d
             JOIN projects p ON p.project_id = d.project_id
             WHERE d.status = 'PLANNED' AND d.demo_date BETWEEN ? AND ? AND $scope
             ORDER BY d.demo_date ASC"
        );
        $stmt->execute(array_merge([$to, $to, $from, $until], $params));
        $rows = $stmt->fetchAll();
    } catch (PDOException $e) {
        return [];   // table not there yet
    }

    /* How much unfinished work they hold on each of those projects. Only
       meaningful for a developer — QA and designers are on a project as
       a whole, not through a list of tasks. */
    foreach ($rows as &$r) {
        $r['days_after_return'] = (int)$r['days_after_return'];
        $r['open_tasks'] = 0;
        if ($employeeId) {
            $q = $pdo->prepare(
                "SELECT COUNT(*) AS n FROM tasks
                 WHERE employee_id = ? AND project_id = ?
                   AND status NOT IN ('COMPLETED','CANCELLED')"
            );
            $q->execute([$employeeId, $r['project_id']]);
            $r['open_tasks'] = (int)$q->fetch()['n'];
        }
    }
    return $rows;
}

/* ── Design estimates ─────────────────────────────────
 * A design task borrows a rate from the card and multiplies it by how
 * many screens / pages / apps it covers. The arithmetic is here rather
 * than in the browser so the stored hours and the stored date always
 * agree with the rate that was actually used — a page computing its own
 * number could send anything.
 */

// A working day. Not a constant anyone should have to guess at twice.
const DESIGN_HOURS_PER_DAY = 8;

/* Hours for a whole task: the rate for the chosen condition × quantity.
 * $row is a design_estimates row; returns null when there is no estimate
 * to make, which is a legitimate state and not an error. */
function designEstimateHours(?array $row, float $quantity, bool $hasFrd, string $case): ?float {
    if (!$row || $quantity <= 0) return null;
    $col = ($hasFrd ? 'frd_' : 'nofrd_') . (strtoupper($case) === 'WORST' ? 'worst' : 'best');
    if (!isset($row[$col])) return null;
    return round((float)$row[$col] * $quantity, 2);
}

/* Target date for that many hours, starting from $start.
 *
 * Counts working days and skips weekends, because a 40-hour estimate
 * handed out on a Thursday is not due on Saturday. Day one is the start
 * date itself, so 8 hours or fewer lands on the day it began. Public
 * holidays are not modelled — the workspace has no calendar of them, and
 * inventing one here would be worse than the small optimism this leaves.
 */
function designTargetDate(?float $hours, ?string $start): ?string {
    if ($hours === null || $hours <= 0) return null;
    $date = new DateTime($start ?: 'today');

    $days = (int)ceil($hours / DESIGN_HOURS_PER_DAY);
    // Start on a working day, then step forward for each day after the first.
    while ((int)$date->format('N') >= 6) $date->modify('+1 day');
    for ($i = 1; $i < $days; $i++) {
        $date->modify('+1 day');
        while ((int)$date->format('N') >= 6) $date->modify('+1 day');
    }
    return $date->format('Y-m-d');
}

/* Loads a rate-card row the caller named, or halts if it does not exist.
 * Returns null when no estimate was requested at all. */
function loadDesignEstimate(PDO $pdo, $estimateId): ?array {
    if ($estimateId === null || $estimateId === '' || (int)$estimateId === 0) return null;
    $q = $pdo->prepare("SELECT * FROM design_estimates WHERE estimate_id = ? AND is_active = 1");
    $q->execute([(int)$estimateId]);
    $row = $q->fetch();
    if (!$row) {
        http_response_code(400);
        echo json_encode(['error' => 'That estimate is no longer on the rate card.']);
        exit;
    }
    return $row;
}

// Shared 403 for ownership checks that fail — same message everywhere.
function denyNotYours() {
    http_response_code(403);
    echo json_encode(['error' => 'This does not belong to you.']);
    exit;
}

/* Which projects a caller may see, as a [sqlFragment, params] pair to
 * append to a WHERE clause. Centralised because QA, designer, manager and
 * admin visibility differ and every scoped endpoint must apply the same
 * rule:
 *   ADMIN     everything
 *   QA        only projects assigned to them via qa_assignments
 *   DESIGNER  only projects assigned to them via design_assignments
 *   other     projects they own
 * $col is the qualified project_id column in the caller's query.
 */
function projectScope(array $user, string $col): array {
    if ($user['role'] === 'ADMIN') {
        return ['1=1', []];
    }
    if ($user['role'] === 'QA') {
        return ["$col IN (SELECT project_id FROM qa_assignments WHERE qa_id = ?)", [$user['id']]];
    }
    if ($user['role'] === 'DESIGNER') {
        return ["$col IN (SELECT project_id FROM design_assignments WHERE designer_id = ?)", [$user['id']]];
    }
    return ["$col IN (SELECT project_id FROM projects WHERE manager_id = ?)", [$user['id']]];
}
