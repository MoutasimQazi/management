<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING', 'DESIGNER', 'QA']);

/* Every date that moved, and why.
 *
 * An admin sees all of it — that is the point of the feature. Everyone
 * else sees only their own projects, through the same projectScope used
 * to authorise the move in the first place.
 *
 * project_id is denormalised onto the row precisely so this scoping does
 * not have to fan out across three different work tables to find out
 * which project a slipped deadline belonged to.
 */
[$scope, $params] = projectScope($user, 'x.project_id');

$sql = "SELECT x.extension_id, x.work_type, x.work_id, x.project_id,
               x.old_due, x.new_due, x.days_moved, x.reason, x.created_at,
               m.full_name AS extended_by_name,
               p.project_name,
               COALESCE(t.task_name, d.title, b.title) AS work_name
        FROM due_extensions x
        LEFT JOIN managers m ON m.manager_id = x.extended_by
        LEFT JOIN projects p ON p.project_id = x.project_id
        LEFT JOIN tasks        t ON x.work_type = 'TASK'   AND t.task_id   = x.work_id
        LEFT JOIN design_tasks d ON x.work_type = 'DESIGN' AND d.design_id = x.work_id
        LEFT JOIN bugs         b ON x.work_type = 'BUG'    AND b.bug_id    = x.work_id
        WHERE $scope";

if (!empty($_GET['work_type']) && !empty($_GET['work_id'])) {
    $sql .= " AND x.work_type = ? AND x.work_id = ?";
    $params[] = strtoupper($_GET['work_type']);
    $params[] = (int)$_GET['work_id'];
}
if (!empty($_GET['project_id'])) {
    $sql .= " AND x.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}

$sql .= " ORDER BY x.created_at DESC";
if (!empty($_GET['limit'])) {
    $sql .= " LIMIT " . max(1, min(200, (int)$_GET['limit']));
}

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['days_moved'] = $r['days_moved'] === null ? null : (int)$r['days_moved'];
    }
    echo json_encode($rows);
} catch (PDOException $e) {
    // Migration 012 is imported by hand; an admin panel asking for
    // extensions before the table exists should show none, not 500.
    echo json_encode([]);
}
