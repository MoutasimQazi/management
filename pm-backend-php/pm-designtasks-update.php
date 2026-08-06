<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'DESIGNER', 'MANAGER', 'MARKETING']);
$b = body();

$KINDS    = ['UI', 'UX', 'BRANDING', 'ILLUSTRATION', 'OTHER'];
$STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES', 'APPROVED'];

$designId = (int)($b['design_id'] ?? 0);

[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare(
    "SELECT design_id, title, brief, kind, status, link, due_date, assigned_to
     FROM design_tasks WHERE design_id = ? AND $scope"
);
$check->execute(array_merge([$designId], $params));
$existing = $check->fetch();
if (!$existing) denyNotYours();

/* Every field is optional: the board sends only `status` when a card is
   dragged, the edit form sends the lot. Anything absent keeps its
   current value rather than being blanked. */
$title = array_key_exists('title', $b) && trim($b['title']) !== ''
    ? trim($b['title']) : $existing['title'];

$kind = $existing['kind'];
if (array_key_exists('kind', $b)) {
    $k = strtoupper(trim($b['kind']));
    if (in_array($k, $KINDS, true)) $kind = $k;
}

$status = $existing['status'];
if (array_key_exists('status', $b)) {
    $s = strtoupper(trim($b['status']));
    if (!in_array($s, $STATUSES, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Unknown status: ' . $s]);
        exit;
    }
    $status = $s;
}

$assignedTo = $existing['assigned_to'];
if (array_key_exists('assigned_to', $b)) {
    if ($b['assigned_to'] === 'me') {
        /* "Take this on" from the board. Resolved here because the browser
           session holds no numeric id — see the note in the list endpoint.
           Only a designer can be an assignee, so an admin or manager
           clicking it would produce a row nobody can work. */
        if ($user['role'] !== 'DESIGNER') {
            http_response_code(400);
            echo json_encode(['error' => 'Only a designer account can take design work on.']);
            exit;
        }
        $assignedTo = (int)$user['id'];
    } else {
        $assignedTo = ($b['assigned_to'] === '' || $b['assigned_to'] === null) ? null : (int)$b['assigned_to'];
    }
    if ($assignedTo !== null && $b['assigned_to'] !== 'me') {
        $who = $pdo->prepare("SELECT manager_id FROM managers WHERE manager_id = ? AND role = 'DESIGNER' AND is_active = 1");
        $who->execute([$assignedTo]);
        if (!$who->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'That account is not an active designer.']);
            exit;
        }
    }
}

$brief = array_key_exists('brief', $b)
    ? (trim((string)$b['brief']) !== '' ? trim($b['brief']) : null) : $existing['brief'];
$link = array_key_exists('link', $b)
    ? (trim((string)$b['link']) !== '' ? trim($b['link']) : null) : $existing['link'];
$due = array_key_exists('due_date', $b)
    ? (trim((string)$b['due_date']) !== '' ? trim($b['due_date']) : null) : $existing['due_date'];

$stmt = $pdo->prepare(
    "UPDATE design_tasks
     SET title = ?, brief = ?, kind = ?, status = ?, link = ?, due_date = ?, assigned_to = ?
     WHERE design_id = ?"
);
$stmt->execute([$title, $brief, $kind, $status, $link, $due, $assignedTo, $designId]);
echo json_encode(['success' => true]);
