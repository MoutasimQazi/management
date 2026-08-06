<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);

[$scope, $params] = projectScope($user, 'd.project_id');

$sql = "SELECT d.design_id, d.project_id, d.title, d.brief, d.kind, d.status,
               d.link, d.due_date, d.assigned_to, d.created_by,
               d.created_at, d.updated_at,
               p.project_name, p.client_name,
               a.full_name AS assigned_to_name,
               c.full_name AS created_by_name
        FROM design_tasks d
        JOIN projects p ON p.project_id = d.project_id
        LEFT JOIN managers a ON a.manager_id = d.assigned_to
        LEFT JOIN managers c ON c.manager_id = d.created_by
        WHERE $scope";

if (!empty($_GET['project_id'])) {
    $sql .= " AND d.project_id = ?";
    $params[] = (int)$_GET['project_id'];
}
/* mine=1 is what the designer's own board asks for. This is resolved from
   the token rather than from an id the page sends, because the session in
   the browser only holds an email, a token and a role — it has never
   carried the numeric id, and "my work" must not depend on it. */
if (!empty($_GET['mine'])) {
    $sql .= " AND d.assigned_to = ?";
    $params[] = $user['id'];
}
if (!empty($_GET['unassigned'])) {
    $sql .= " AND d.assigned_to IS NULL";
}

/* Unfinished work first, and within that the nearest deadline. APPROVED
   is done, so it sinks; a NULL due date sorts after real ones rather
   than ahead of them, which is what MySQL would do left alone. */
$sql .= " ORDER BY (d.status = 'APPROVED') ASC,
                   (d.due_date IS NULL) ASC, d.due_date ASC,
                   d.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
