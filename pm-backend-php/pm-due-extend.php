<?php
require 'config.php';
require 'auth.php';
/* Pushing a due date is a scheduling decision, so it belongs to whoever
 * runs the project — the BA who owns it, or an admin. A developer moving
 * their own deadline is the thing this feature exists to prevent. */
$user = requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING', 'DESIGNER', 'QA']);
$b = body();

/* One endpoint for all three kinds of work. Each row here says which
 * table holds the item, which column holds its date, and which column
 * identifies it — so the shape below is the only thing that has to change
 * when a fourth kind of work grows a due date. */
$KINDS = [
    'TASK'   => ['table' => 'tasks',        'id' => 'task_id',   'due' => 'due_date',  'name' => 'task_name'],
    'DESIGN' => ['table' => 'design_tasks', 'id' => 'design_id', 'due' => 'due_date',  'name' => 'title'],
    'BUG'    => ['table' => 'bugs',         'id' => 'bug_id',    'due' => 'due_date',  'name' => 'title'],
];

$type = strtoupper(trim($b['work_type'] ?? ''));
if (!isset($KINDS[$type])) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown kind of work: ' . $type]);
    exit;
}
$k = $KINDS[$type];

$workId = (int)($b['work_id'] ?? 0);
$newDue = trim($b['new_due'] ?? '');
$reason = trim($b['reason'] ?? '');

if (!$workId || $newDue === '') {
    http_response_code(400);
    echo json_encode(['error' => 'A work item and a new date are required.']);
    exit;
}

/* The reason is the whole point. A date that moved for no stated cause is
 * exactly what this replaces, so it is required and has to say something
 * — "asdf" is not a reason, and neither is one word. */
if (mb_strlen($reason) < 10) {
    http_response_code(400);
    echo json_encode(['error' => 'Give a reason of at least 10 characters — this is what the admin will read.']);
    exit;
}

// Only on a project the caller runs, same rule as everywhere else.
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare(
    "SELECT {$k['id']} AS id, project_id, {$k['due']} AS due, {$k['name']} AS name
     FROM {$k['table']} WHERE {$k['id']} = ? AND $scope"
);
$check->execute(array_merge([$workId], $params));
$item = $check->fetch();
if (!$item) denyNotYours();

$oldDue = $item['due'];
if ($oldDue === $newDue) {
    http_response_code(400);
    echo json_encode(['error' => 'That is already the due date.']);
    exit;
}

/* How far it moved, for the admin list. Negative means it was pulled
 * forward, which is worth recording too — this is a log of changes, not
 * only of slippage. NULL when there was no date to move from. */
$daysMoved = null;
if ($oldDue) {
    $daysMoved = (int)(new DateTime($oldDue))->diff(new DateTime($newDue))->format('%r%a');
}

$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE {$k['table']} SET {$k['due']} = ? WHERE {$k['id']} = ?")
        ->execute([$newDue, $workId]);

    $pdo->prepare(
        "INSERT INTO due_extensions
           (work_type, work_id, project_id, old_due, new_due, days_moved, reason, extended_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $type, $workId, $item['project_id'], $oldDue, $newDue, $daysMoved, $reason, $user['id'],
    ]);
    $pdo->commit();
} catch (Exception $e) {
    /* Both or neither. A date that moved without its reason recorded is
       the situation this endpoint exists to make impossible. */
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Could not record the extension, so the date was left alone.']);
    exit;
}

echo json_encode([
    'success'    => true,
    'old_due'    => $oldDue,
    'new_due'    => $newDue,
    'days_moved' => $daysMoved,
]);
