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
    "SELECT design_id, title, brief, kind, status, link, due_date, assigned_to,
            estimate_id, quantity, has_frd, estimate_case, estimated_hours, start_date
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
/* Re-estimating happens only when the request touches something the
   estimate depends on. A status move must not silently recalculate a
   date somebody set deliberately three weeks ago. */
$estimateKeys = ['estimate_id', 'quantity', 'has_frd', 'estimate_case', 'start_date'];
$touchesEstimate = (bool)array_intersect($estimateKeys, array_keys($b));

$estimateId = array_key_exists('estimate_id', $b) ? $b['estimate_id'] : $existing['estimate_id'];
$quantity   = array_key_exists('quantity', $b) ? (float)$b['quantity'] : (float)$existing['quantity'];
$hasFrd     = array_key_exists('has_frd', $b) ? !empty($b['has_frd']) : (bool)$existing['has_frd'];
$case       = array_key_exists('estimate_case', $b)
    ? (strtoupper(trim($b['estimate_case'])) === 'WORST' ? 'WORST' : 'BEST')
    : $existing['estimate_case'];
$start = array_key_exists('start_date', $b)
    ? (trim((string)$b['start_date']) !== '' ? trim($b['start_date']) : null)
    : $existing['start_date'];
if ($quantity <= 0) $quantity = 1;

if ($touchesEstimate) {
    $estimate = loadDesignEstimate($pdo, $estimateId);
    $estimateId = $estimate ? (int)$estimate['estimate_id'] : null;
    $hours = designEstimateHours($estimate, $quantity, $hasFrd, $case);
} else {
    $hours = $existing['estimated_hours'] !== null ? (float)$existing['estimated_hours'] : null;
}

/* A hand-typed due date always wins. Otherwise a re-estimate moves the
   date with it, and everything else leaves it alone. */
if (array_key_exists('due_date', $b)) {
    $due = trim((string)$b['due_date']) !== '' ? trim($b['due_date']) : null;
} elseif ($touchesEstimate) {
    $due = designTargetDate($hours, $start) ?: $existing['due_date'];
} else {
    $due = $existing['due_date'];
}

/* Reassigning has the same problem as assigning: moving design work to
   a designer who is not on the project hides it from them. Same helper
   as the create path and as the QA one — see auth.php. */
$granted = false;
if (array_key_exists('assigned_to', $b) && $assignedTo) {
    $proj = $pdo->prepare("SELECT project_id FROM design_tasks WHERE design_id = ?");
    $proj->execute([$designId]);
    $row = $proj->fetch();
    if ($row) $granted = grantProjectAccess($pdo, 'DESIGNER', (int)$assignedTo, (int)$row['project_id']);
}

$stmt = $pdo->prepare(
    "UPDATE design_tasks
     SET title = ?, brief = ?, kind = ?, status = ?, link = ?, due_date = ?, assigned_to = ?,
         estimate_id = ?, quantity = ?, has_frd = ?, estimate_case = ?,
         estimated_hours = ?, start_date = ?
     WHERE design_id = ?"
);
$stmt->execute([
    $title, $brief, $kind, $status, $link, $due, $assignedTo,
    $estimateId, $quantity, $hasFrd ? 1 : 0, $case, $hours, $start,
    $designId,
]);
echo json_encode([
    'success' => true, 'estimated_hours' => $hours, 'due_date' => $due,
    'granted_access' => $granted,
]);
