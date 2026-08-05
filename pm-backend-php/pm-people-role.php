<?php
require 'config.php';
require 'auth.php';

/* One place to change anyone's role, in any direction.
 *
 * Staff logins live in `managers`, the roster lives in `employees`, and
 * both are pointed at by foreign keys that must not break: tasks, leave,
 * questions and bugs hang off `employees`; projects, campaigns, QA
 * assignments and answered questions hang off `managers`. So a move
 * between the two is never a DELETE — the old row is deactivated and
 * keeps every bit of history, while the new side gets a fresh row.
 *
 * Body: { kind: 'STAFF'|'EMPLOYEE', id: <int>, role: <ROLE> }
 * Returns the new temp_password when a login was minted.
 */
$user = requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$STAFF_ROLES = ['ADMIN', 'MANAGER', 'HR', 'MARKETING', 'QA'];
$kind = strtoupper(trim($b['kind'] ?? ''));
$id   = (int)($b['id'] ?? 0);
$role = strtoupper(trim($b['role'] ?? ''));

if (!in_array($kind, ['STAFF', 'EMPLOYEE'], true) || $id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Tell me which person to change.']);
    exit;
}
if ($role !== 'EMPLOYEE' && !in_array($role, $STAFF_ROLES, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown role.']);
    exit;
}

function fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

/* ── The person is on the roster ───────────────────────────────────── */
if ($kind === 'EMPLOYEE') {
    $stmt = $pdo->prepare("SELECT * FROM employees WHERE employee_id = ?");
    $stmt->execute([$id]);
    $emp = $stmt->fetch();
    if (!$emp) fail(404, 'That person is no longer on the roster.');

    if ($role === 'EMPLOYEE') { echo json_encode(['success' => true, 'unchanged' => true]); exit; }

    // A staff login is an email address plus a password — without an email
    // there is nothing to sign in with.
    $email = trim((string)($emp['email'] ?? ''));
    if ($email === '') {
        fail(400, 'Add an email address for ' . $emp['name'] .
                  ' first — a staff login needs one to sign in with.');
    }

    $pdo->beginTransaction();
    try {
        $existing = $pdo->prepare("SELECT manager_id FROM managers WHERE email = ?");
        $existing->execute([$email]);
        $row = $existing->fetch();

        $tempPassword = null;
        if ($row) {
            // They already had a staff login at some point — reuse it rather
            // than colliding with the unique email, and leave the password be.
            $pdo->prepare("UPDATE managers SET role = ?, is_active = 1, full_name = ? WHERE manager_id = ?")
                ->execute([$role, $emp['name'], $row['manager_id']]);
            $managerId = (int)$row['manager_id'];
        } else {
            $tempPassword = randomTempPassword();
            $pdo->prepare(
                "INSERT INTO managers (full_name, email, role, is_active, password_hash, token, temp_password)
                 VALUES (?, ?, ?, 1, ?, ?, ?)"
            )->execute([
                $emp['name'], $email, $role,
                password_hash($tempPassword, PASSWORD_DEFAULT),
                randomToken(), $tempPassword,
            ]);
            $managerId = (int)$pdo->lastInsertId();
        }

        /* Off the roster, but the row stays: their tasks, leave and questions
         * all point at this employee_id. Clearing the token also ends the old
         * employee session, so they sign back in with the staff login. */
        $pdo->prepare(
            "UPDATE employees SET status = 'INACTIVE', token = NULL, temp_password = NULL
             WHERE employee_id = ?"
        )->execute([$id]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $out = ['success' => true, 'kind' => 'STAFF', 'id' => $managerId, 'login_email' => $email];
    if ($tempPassword) $out['temp_password'] = $tempPassword;
    echo json_encode($out);
    exit;
}

/* ── The person is staff ───────────────────────────────────────────── */
$stmt = $pdo->prepare("SELECT * FROM managers WHERE manager_id = ?");
$stmt->execute([$id]);
$staff = $stmt->fetch();
if (!$staff) fail(404, 'No such staff account.');

// Never leave the workspace without an admin — the same guard as a plain
// role change, and it applies to moving an admin onto the roster too.
if ($staff['role'] === 'ADMIN' && $role !== 'ADMIN') {
    $count = $pdo->query("SELECT COUNT(*) AS n FROM managers WHERE role = 'ADMIN' AND is_active = 1")->fetch();
    if ((int)$count['n'] <= 1) {
        fail(409, 'This is the last admin — make someone else an admin first.');
    }
}

if ($role !== 'EMPLOYEE') {
    $pdo->prepare("UPDATE managers SET role = ? WHERE manager_id = ?")->execute([$role, $id]);
    echo json_encode(['success' => true, 'kind' => 'STAFF', 'id' => $id]);
    exit;
}

/* Staff → roster. Their projects are scoped by manager_id, so deactivating
 * an owner would hide those projects from everyone but an admin. Make the
 * handover explicit rather than silently stranding the work. */
$owned = $pdo->prepare("SELECT COUNT(*) AS n FROM projects WHERE manager_id = ?");
$owned->execute([$id]);
$n = (int)$owned->fetch()['n'];
if ($n > 0) {
    fail(409, $staff['full_name'] . ' still owns ' . $n . ' project' . ($n === 1 ? '' : 's') .
              '. Hand those over to someone else first, then move them to the roster.');
}

$pdo->beginTransaction();
try {
    $email = trim((string)$staff['email']);
    $existing = $pdo->prepare("SELECT employee_id FROM employees WHERE email = ?");
    $existing->execute([$email]);
    $row = $existing->fetch();

    $tempPassword = null;
    if ($row) {
        // Coming back to a roster entry they held before.
        $pdo->prepare("UPDATE employees SET status = 'ACTIVE', name = ? WHERE employee_id = ?")
            ->execute([$staff['full_name'], $row['employee_id']]);
        $employeeId = (int)$row['employee_id'];
    } else {
        $tempPassword = randomTempPassword();
        $pdo->prepare(
            "INSERT INTO employees (manager_id, name, email, password_hash, token, temp_password, status)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')"
        )->execute([
            $user['id'], $staff['full_name'], $email,
            password_hash($tempPassword, PASSWORD_DEFAULT),
            randomToken(), $tempPassword,
        ]);
        $employeeId = (int)$pdo->lastInsertId();
    }

    // Staff login off, but the row stays — it is referenced by everything
    // they ever reported, answered or approved.
    $pdo->prepare("UPDATE managers SET is_active = 0, token = NULL, temp_password = NULL WHERE manager_id = ?")
        ->execute([$id]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

$out = ['success' => true, 'kind' => 'EMPLOYEE', 'id' => $employeeId, 'login_email' => $email];
if ($tempPassword) $out['temp_password'] = $tempPassword;
echo json_encode($out);
