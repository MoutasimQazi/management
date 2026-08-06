<?php
require 'config.php';
require 'auth.php';
requireRole($pdo, $USERS, ['ADMIN']);

/* Every project with the people on it, in one request.
 *
 * The Overview could stitch this together from the project, task, QA and
 * design lists it already fetches, but that is four round trips and a
 * join done in the browser over data the browser has no business holding
 * all of. The counting belongs next to the tables.
 *
 * Admin-only on purpose: this is the whole company's allocation. A
 * manager sees their own projects on the Projects page instead.
 */

/* The QA and design modules arrive with migrations 005 and 006, which are
 * imported by hand — a database that has not had them yet must not turn
 * this whole panel into a 500. A missing table means "that module is not
 * installed", which the page then declines to report gaps for, rather
 * than flagging every project as missing a designer. */
function optionalRows(PDO $pdo, string $sql): ?array {
    try {
        $stmt = $pdo->query($sql);
        return $stmt->fetchAll();
    } catch (PDOException $e) {
        return null;      // no such table
    }
}

$projects = $pdo->query(
    "SELECT p.project_id, p.project_name, p.client_name, p.status, p.due_date,
            p.manager_id, m.full_name AS manager_name, m.role AS manager_role
     FROM projects p
     LEFT JOIN managers m ON m.manager_id = p.manager_id
     ORDER BY p.project_name ASC"
)->fetchAll();

/* Developers are "on" a project when they hold work on it that is not
 * finished — a completed task tells you where someone has been, not what
 * they are carrying now. */
$devRows = $pdo->query(
    "SELECT t.project_id, e.employee_id, e.name, COUNT(*) AS open_tasks
     FROM tasks t
     JOIN employees e ON e.employee_id = t.employee_id
     WHERE t.status NOT IN ('COMPLETED', 'CANCELLED')
     GROUP BY t.project_id, e.employee_id, e.name
     ORDER BY COUNT(*) DESC, e.name ASC"
)->fetchAll();

$qaRows = optionalRows($pdo,
    "SELECT a.project_id, m.full_name
     FROM qa_assignments a
     JOIN managers m ON m.manager_id = a.qa_id
     WHERE m.is_active = 1
     ORDER BY m.full_name ASC");

$designRows = optionalRows($pdo,
    "SELECT a.project_id, m.full_name
     FROM design_assignments a
     JOIN managers m ON m.manager_id = a.designer_id
     WHERE m.is_active = 1
     ORDER BY m.full_name ASC");

// Bucket the flat rows by project so the page does no grouping of its own.
$byProject = [];
foreach ($devRows as $r) {
    $byProject[$r['project_id']]['dev'][] = ['name' => $r['name'], 'open_tasks' => (int)$r['open_tasks']];
}
foreach (($qaRows ?: []) as $r)     { $byProject[$r['project_id']]['qa'][]     = $r['full_name']; }
foreach (($designRows ?: []) as $r) { $byProject[$r['project_id']]['design'][] = $r['full_name']; }

$out = [];
foreach ($projects as $p) {
    $id  = $p['project_id'];
    $bkt = $byProject[$id] ?? [];
    $dev = $bkt['dev'] ?? [];
    $out[] = [
        'project_id'   => (int)$id,
        'project_name' => $p['project_name'],
        'client_name'  => $p['client_name'],
        'status'       => $p['status'],
        'due_date'     => $p['due_date'],
        'manager_name' => $p['manager_name'],
        'developers'   => $dev,
        'qa'           => $bkt['qa'] ?? [],
        'designers'    => $bkt['design'] ?? [],
        'open_tasks'   => array_sum(array_column($dev, 'open_tasks')),
    ];
}

echo json_encode([
    'projects' => $out,
    // Which roles this database can actually staff. The page only reports
    // a missing QA or designer for a module that exists.
    'modules'  => ['qa' => $qaRows !== null, 'design' => $designRows !== null],
]);
