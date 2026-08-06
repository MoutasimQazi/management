<?php
require 'config.php';
require 'auth.php';
// Everyone a bug can be handed to, in one list for one picker.
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);

/* Two tables, because a developer is an `employees` row and QA, design
 * and the business analysts are `managers` rows. The page should not have
 * to know that, so both come back in one shape with `kind` saying which
 * column a chosen id belongs in.
 *
 * Names only — this fills a dropdown, and no contact details are needed
 * to do it.
 */
$out = [];

$devs = $pdo->query(
    "SELECT employee_id AS id, name, designation
     FROM employees
     WHERE status = 'ACTIVE'
     ORDER BY name ASC"
)->fetchAll();
foreach ($devs as $d) {
    $out[] = [
        'kind'  => 'EMPLOYEE',
        'id'    => (int)$d['id'],
        'name'  => $d['name'],
        // The designation is free text and often blank; "Developer" is
        // what the roster means when it says nothing.
        'role'  => $d['designation'] !== null && trim($d['designation']) !== ''
                     ? $d['designation'] : 'Developer',
    ];
}

/* ADMIN is left out on purpose: it is an access level, not a person who
 * takes defects. HR and Marketing likewise — a bug on their desk is a
 * mis-file, and leaving them out of the list is the cheapest way to stop
 * it happening. */
$staff = $pdo->query(
    "SELECT manager_id AS id, full_name AS name, role
     FROM managers
     WHERE is_active = 1 AND role IN ('QA', 'DESIGNER', 'MANAGER')
     ORDER BY FIELD(role, 'QA', 'DESIGNER', 'MANAGER'), full_name ASC"
)->fetchAll();

$LABELS = ['QA' => 'QA', 'DESIGNER' => 'Designer', 'MANAGER' => 'Business Analyst'];
foreach ($staff as $s) {
    $out[] = [
        'kind' => 'STAFF',
        'id'   => (int)$s['id'],
        'name' => $s['name'],
        'role' => $LABELS[$s['role']] ?? $s['role'],
    ];
}

echo json_encode($out);
