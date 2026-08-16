<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING']);
$b = body();

/* Set which designers and QA accounts are on ONE project.
 *
 * ── Why this is not pm-design-assign.php ──
 * That endpoint, and its QA twin, replace the whole set of projects for
 * one person: an admin picks a designer and ticks every project they work
 * on. This does the opposite — one project, many people — and it must
 * only ever touch rows for this project. Reusing the person-shaped
 * endpoint here would let a BA staffing their own project silently
 * unassign that designer from every other team's work.
 */
$projectId = (int)($b['project_id'] ?? 0);
if (!$projectId) {
    http_response_code(400);
    echo json_encode(['error' => 'A project is required.']);
    exit;
}

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT project_id FROM projects WHERE project_id = ? AND $scope");
$check->execute(array_merge([$projectId], $params));
if (!$check->fetch()) denyNotYours();

$ids = function ($v) {
    return array_values(array_unique(array_filter(
        array_map('intval', is_array($v) ? $v : [])
    )));
};
$designerIds = $ids($b['designer_ids'] ?? []);
$qaIds       = $ids($b['qa_ids'] ?? []);

/* Replaces this project's rows in one transaction. A half-applied change
 * would leave someone with access to work they are no longer on, or
 * without access to work they are. */
function setTeam(PDO $pdo, string $table, string $idCol, string $role, int $projectId, array $ids): int {
    $pdo->prepare("DELETE FROM $table WHERE project_id = ?")->execute([$projectId]);
    if (!$ids) return 0;

    // Only real, active accounts of the right role — an id typed into a
    // request should not be able to grant access to anyone else.
    $valid = $pdo->prepare(
        "SELECT manager_id FROM managers
         WHERE role = ? AND is_active = 1 AND manager_id IN (" .
         implode(',', array_fill(0, count($ids), '?')) . ")"
    );
    $valid->execute(array_merge([$role], $ids));

    $ins = $pdo->prepare("INSERT INTO $table ($idCol, project_id) VALUES (?, ?)");
    $n = 0;
    foreach ($valid->fetchAll() as $row) { $ins->execute([$row['manager_id'], $projectId]); $n++; }
    return $n;
}

$pdo->beginTransaction();
try {
    $nDesign = setTeam($pdo, 'design_assignments', 'designer_id', 'DESIGNER', $projectId, $designerIds);
    $nQa     = setTeam($pdo, 'qa_assignments',     'qa_id',       'QA',       $projectId, $qaIds);
    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Could not save the team. If this is a fresh database, import migrations 005 and 006 first.']);
    exit;
}

echo json_encode(['success' => true, 'designers' => $nDesign, 'qa' => $nQa]);
