<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);
$b = body();

$KINDS = ['UI', 'UX', 'BRANDING', 'ILLUSTRATION', 'OTHER'];

$projectId = (int)($b['project_id'] ?? 0);
if (!$projectId || trim($b['title'] ?? '') === '') {
    http_response_code(400);
    echo json_encode(['error' => 'A project and a title are required.']);
    exit;
}

// The project must be one the caller can already see, or anyone could
// file work against any project by guessing an id.
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT project_id FROM projects WHERE project_id = ? AND $scope");
$check->execute(array_merge([$projectId], $params));
if (!$check->fetch()) denyNotYours();

$kind = strtoupper(trim($b['kind'] ?? 'UI'));
if (!in_array($kind, $KINDS, true)) $kind = 'UI';

// An assignee must actually be a designer — otherwise the board fills
// with work assigned to people who have no page to see it on.
$assignedTo = isset($b['assigned_to']) && $b['assigned_to'] !== '' ? (int)$b['assigned_to'] : null;
if ($assignedTo !== null) {
    $who = $pdo->prepare("SELECT manager_id FROM managers WHERE manager_id = ? AND role = 'DESIGNER' AND is_active = 1");
    $who->execute([$assignedTo]);
    if (!$who->fetch()) {
        http_response_code(400);
        echo json_encode(['error' => 'That account is not an active designer.']);
        exit;
    }
}

/* The rate card decides how long this takes and, from that, when it is
   due. Computed here rather than trusted from the page — see auth.php.
   A due date typed by hand still wins: the estimate is a default, not a
   ruling, and someone who knows better should be able to say so. */
$estimate = loadDesignEstimate($pdo, $b['estimate_id'] ?? null);
$quantity = isset($b['quantity']) ? (float)$b['quantity'] : 1;
$hasFrd   = array_key_exists('has_frd', $b) ? !empty($b['has_frd']) : true;
$case     = strtoupper(trim($b['estimate_case'] ?? 'BEST')) === 'WORST' ? 'WORST' : 'BEST';

$hours   = designEstimateHours($estimate, $quantity, $hasFrd, $case);
$start   = trim($b['start_date'] ?? '');
$start   = $start !== '' ? $start : null;
$due     = trim($b['due_date'] ?? '');
$dueDate = $due !== '' ? $due : designTargetDate($hours, $start);

$stmt = $pdo->prepare(
    "INSERT INTO design_tasks
       (project_id, estimate_id, title, brief, kind, quantity, has_frd, estimate_case,
        estimated_hours, start_date, link, due_date, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $projectId,
    $estimate ? (int)$estimate['estimate_id'] : null,
    trim($b['title']),
    trim($b['brief'] ?? '') !== '' ? trim($b['brief']) : null,
    $kind,
    $quantity > 0 ? $quantity : 1,
    $hasFrd ? 1 : 0,
    $case,
    $hours,
    $start,
    trim($b['link'] ?? '') !== '' ? trim($b['link']) : null,
    $dueDate,
    $assignedTo,
    $user['id'],
]);
echo json_encode([
    'success'         => true,
    'design_id'       => (int)$pdo->lastInsertId(),
    'estimated_hours' => $hours,
    'due_date'        => $dueDate,
]);
