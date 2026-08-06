<?php
require 'config.php';
require 'auth.php';
/* Not QA-only. Managers see defects on their own projects, designers on
   theirs, and — since a bug can now be assigned to a developer — the
   developer holding one has to be able to see it. Being assigned work you
   cannot see is worse than not being assigned it. */
$user = requireUser($pdo, $USERS);

if ($user['user_type'] === 'EMPLOYEE') {
    // A developer sees the bugs on their desk and nothing else: they have
    // no project-level access anywhere in this system.
    $scope  = 'b.assigned_to = ?';
    $params = [$user['id']];
} else {
    if (!in_array($user['role'], ['ADMIN', 'QA', 'MANAGER', 'MARKETING', 'DESIGNER'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'This section is not available to your account.']);
        exit;
    }
    [$scope, $params] = projectScope($user, 'b.project_id');
    // "Only the ones on my desk", for a staff member's own board.
    if (!empty($_GET['mine'])) {
        $scope .= ' AND b.assigned_manager_id = ?';
        $params[] = $user['id'];
    }
}

/* The assignee is a developer or a staff account — two columns, at most
   one set (migration 008). Collapsed to one name and one kind here, so
   the page renders "who has it" without knowing which table they sit in
   and the assignee picker can preselect the right entry. */
$sql = "SELECT b.bug_id, b.project_id, b.task_id, b.case_id, b.title, b.steps, b.link,
               b.severity, b.status, b.reported_by,
               b.assigned_to, b.assigned_manager_id,
               b.created_at, b.updated_at,
               p.project_name, t.task_name, c.title AS case_title,
               m.full_name AS reported_by_name,
               COALESCE(e.name, am.full_name) AS assigned_to_name,
               CASE WHEN b.assigned_to IS NOT NULL THEN 'EMPLOYEE'
                    WHEN b.assigned_manager_id IS NOT NULL THEN 'STAFF'
               END AS assignee_kind,
               COALESCE(b.assigned_to, b.assigned_manager_id) AS assignee_id,
               am.role AS assignee_role
        FROM bugs b
        JOIN projects p ON p.project_id = b.project_id
        LEFT JOIN tasks t ON t.task_id = b.task_id
        LEFT JOIN test_cases c ON c.case_id = b.case_id
        LEFT JOIN managers m ON m.manager_id = b.reported_by
        LEFT JOIN employees e ON e.employee_id = b.assigned_to
        LEFT JOIN managers am ON am.manager_id = b.assigned_manager_id
        WHERE $scope";

if (!empty($_GET['project_id'])) {
    $sql .= " AND b.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
if (!empty($_GET['status'])) {
    $sql .= " AND b.status = ?";
    $params[] = $_GET['status'];
}
// Newest first, but anything still open outranks anything already closed.
$sql .= " ORDER BY FIELD(b.status,'REOPENED','OPEN','IN_PROGRESS','FIXED','VERIFIED','CLOSED'),
                   FIELD(b.severity,'CRITICAL','HIGH','MEDIUM','LOW'), b.updated_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
