<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT t.task_id, t.eta_hours, t.estimate_id, t.quantity, t.has_frd,
            t.estimate_case, t.start_date, t.due_date
     FROM tasks t JOIN projects p ON p.project_id = t.project_id
     WHERE t.task_id = ? AND (? = 'ADMIN' OR p.manager_id = ?)"
);
$check->execute([$b['task_id'] ?? 0, $manager['role'], $manager['manager_id']]);
$existing = $check->fetch();
if (!$existing) denyNotYours();

$priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';

/* Only re-estimate when the request touches something the estimate rests
   on — otherwise an ordinary edit would recalculate a date someone set
   deliberately. Same rule as the design board. */
$estimateKeys = ['estimate_id', 'quantity', 'has_frd', 'estimate_case', 'start_date'];
$touchesEstimate = (bool)array_intersect($estimateKeys, array_keys($b));

$estimateId = array_key_exists('estimate_id', $b) ? $b['estimate_id'] : $existing['estimate_id'];
$quantity   = array_key_exists('quantity', $b) ? (float)$b['quantity'] : (float)$existing['quantity'];
if ($quantity <= 0) $quantity = 1;
$hasFrd = array_key_exists('has_frd', $b) ? !empty($b['has_frd']) : (bool)$existing['has_frd'];
$case   = array_key_exists('estimate_case', $b)
    ? (strtoupper(trim($b['estimate_case'])) === 'WORST' ? 'WORST' : 'BEST')
    : $existing['estimate_case'];
$start = array_key_exists('start_date', $b)
    ? (trim((string)$b['start_date']) !== '' ? trim($b['start_date']) : null)
    : $existing['start_date'];

if ($touchesEstimate) {
    $estimate   = loadDesignEstimate($pdo, $estimateId);
    $estimateId = $estimate ? (int)$estimate['estimate_id'] : null;
    $estimated  = designEstimateHours($estimate, $quantity, $hasFrd, $case);
} else {
    $estimated = null;
}

// A typed ETA wins; otherwise a re-estimate replaces it, and anything
// else leaves the stored hours alone.
if (isset($b['eta_hours']) && $b['eta_hours'] !== '') {
    $eta = (float)$b['eta_hours'];
} elseif ($touchesEstimate && $estimated !== null) {
    $eta = $estimated;
} else {
    $eta = $existing['eta_hours'] !== null ? (float)$existing['eta_hours'] : null;
}

if (array_key_exists('due_date', $b)) {
    $due = trim((string)$b['due_date']) !== '' ? trim($b['due_date']) : null;
} elseif ($touchesEstimate) {
    $due = designTargetDate($eta, $start) ?: $existing['due_date'];
} else {
    $due = $existing['due_date'];
}

$stmt = $pdo->prepare(
    "UPDATE tasks SET task_name = ?, description = ?, eta_hours = ?, priority = ?, employee_id = ?,
                      estimate_id = ?, quantity = ?, has_frd = ?, estimate_case = ?,
                      start_date = ?, due_date = ?
     WHERE task_id = ?"
);
$stmt->execute([
    $b['task_name'] ?? '',
    $b['description'] ?? null,
    $eta,
    $priority,
    $b['employee_id'] ?? null,
    $estimateId, $quantity, $hasFrd ? 1 : 0, $case, $start, $due,
    $b['task_id'],
]);
echo json_encode(['success' => true, 'eta_hours' => $eta, 'due_date' => $due]);
