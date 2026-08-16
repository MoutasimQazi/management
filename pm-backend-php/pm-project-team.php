<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING']);

/* Who is on this project, and who could be.
 *
 * ── The thing this fixes ──
 * A business analyst could already create design work and bugs for their
 * own project — MANAGER is in both create allowlists. What they could not
 * do was put a designer or a QA account ON the project, because that was
 * admin-only. Designers and QA see only their assigned projects, so a BA
 * assigning design work produced a row the designer could not see.
 *
 * Staffing your own project is not an administrative act; it is the job.
 * So this is scoped by projectScope — your projects, or everything if you
 * are an admin — rather than gated on being one.
 */
$projectId = (int)($_GET['project_id'] ?? 0);
if (!$projectId) {
    http_response_code(400);
    echo json_encode(['error' => 'A project is required.']);
    exit;
}

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT project_id, manager_id FROM projects WHERE project_id = ? AND $scope");
$check->execute(array_merge([$projectId], $params));
$project = $check->fetch();
if (!$project) denyNotYours();

/* Every designer and QA account, each flagged with whether they are on
 * this project. One list rather than "assigned" and "available" apart,
 * because the screen is a set of checkboxes and that is the shape of it.
 */
function rosterFor(PDO $pdo, string $role, string $table, string $idCol, int $projectId): array {
    try {
        $stmt = $pdo->prepare(
            "SELECT m.manager_id AS id, m.full_name AS name,
                    EXISTS(SELECT 1 FROM $table a
                            WHERE a.$idCol = m.manager_id AND a.project_id = ?) AS on_project
             FROM managers m
             WHERE m.role = ? AND m.is_active = 1
             ORDER BY m.full_name ASC"
        );
        $stmt->execute([$projectId, $role]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['on_project'] = (bool)$r['on_project']; }
        return $rows;
    } catch (PDOException $e) {
        return [];   // the module's migration may not be imported yet
    }
}

// Developers are not assigned to a project — they are assigned to tasks
// on it. Listed here as who currently holds unfinished work, so the panel
// shows the whole team and not only the half that is granted access.
$devs = $pdo->prepare(
    "SELECT e.employee_id AS id, e.name, COUNT(*) AS open_tasks
     FROM tasks t JOIN employees e ON e.employee_id = t.employee_id
     WHERE t.project_id = ? AND t.status NOT IN ('COMPLETED','CANCELLED')
     GROUP BY e.employee_id, e.name
     ORDER BY e.name ASC"
);
$devs->execute([$projectId]);
$developers = $devs->fetchAll();
foreach ($developers as &$d) { $d['id'] = (int)$d['id']; $d['open_tasks'] = (int)$d['open_tasks']; }

echo json_encode([
    'project_id' => $projectId,
    'designers'  => rosterFor($pdo, 'DESIGNER', 'design_assignments', 'designer_id', $projectId),
    'qa'         => rosterFor($pdo, 'QA', 'qa_assignments', 'qa_id', $projectId),
    'developers' => $developers,
]);
