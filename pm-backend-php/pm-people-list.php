<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'HR']);

/* One roster over two tables. `managers` holds staff logins and
 * `employees` holds the people work is assigned to — they stay separate
 * because tasks, leave, questions and bugs all carry foreign keys into
 * `employees`, but there is no reason the admin screen should expose that
 * split. Each row is tagged `kind` so the UI knows which endpoints apply.
 *
 * temp_password is a live credential, so it is only ever included for an
 * ADMIN caller.
 */
$isAdmin = $user['role'] === 'ADMIN';

$staff = $pdo->query(
    "SELECT manager_id AS id, full_name AS name, email, role, is_active,
            (token IS NOT NULL) AS has_login, temp_password, NULL AS department,
            NULL AS designation, NULL AS manager_id
     FROM managers"
)->fetchAll();
foreach ($staff as &$s) { $s['kind'] = 'STAFF'; $s['id'] = (int)$s['id']; }
unset($s);

$employees = $pdo->query(
    "SELECT employee_id AS id, name, email, 'EMPLOYEE' AS role, 1 AS is_active,
            (token IS NOT NULL) AS has_login, temp_password, department,
            designation, manager_id
     FROM employees WHERE status = 'ACTIVE'"
)->fetchAll();
foreach ($employees as &$e) { $e['kind'] = 'EMPLOYEE'; $e['id'] = (int)$e['id']; }
unset($e);

$rows = array_merge($staff, $employees);
if (!$isAdmin) {
    foreach ($rows as &$r) unset($r['temp_password']);
    unset($r);
}

usort($rows, fn($a, $b) => strcasecmp($a['name'] ?? '', $b['name'] ?? ''));
echo json_encode($rows);
