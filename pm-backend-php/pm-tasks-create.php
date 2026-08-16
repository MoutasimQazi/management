<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);
$b = body();

$check = $pdo->prepare(
    "SELECT project_id FROM projects WHERE project_id = ? AND (? = 'ADMIN' OR manager_id = ?)"
);
$check->execute([$b['project_id'] ?? 0, $manager['role'], $manager['manager_id']]);
if (!$check->fetch()) denyNotYours();

$priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
$priority = in_array($b['priority'] ?? '', $priorities, true) ? $b['priority'] : 'MEDIUM';

/* The rate card can supply the ETA and the due date. A number typed by
   hand still wins on both — an estimate is a starting point, and the
   person who knows this particular job better should be able to say so.
   Same rule, and the same arithmetic, as the design board (auth.php). */
$estimate = loadDesignEstimate($pdo, $b['estimate_id'] ?? null);
$quantity = isset($b['quantity']) ? (float)$b['quantity'] : 1;
if ($quantity <= 0) $quantity = 1;
$hasFrd = array_key_exists('has_frd', $b) ? !empty($b['has_frd']) : true;
$case   = strtoupper(trim($b['estimate_case'] ?? 'BEST')) === 'WORST' ? 'WORST' : 'BEST';

$estimatedHours = designEstimateHours($estimate, $quantity, $hasFrd, $case);
$eta = (isset($b['eta_hours']) && $b['eta_hours'] !== '') ? (float)$b['eta_hours'] : $estimatedHours;

$start = trim($b['start_date'] ?? '');
$start = $start !== '' ? $start : null;
$due   = trim($b['due_date'] ?? '');
$due   = $due !== '' ? $due : designTargetDate($eta, $start);

$stmt = $pdo->prepare(
    "INSERT INTO tasks (project_id, employee_id, task_name, description, eta_hours, priority,
                        estimate_id, quantity, has_frd, estimate_case, start_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $b['project_id'],
    $b['employee_id'] ?? null,
    $b['task_name'] ?? '',
    $b['description'] ?? null,
    $eta,
    $priority,
    $estimate ? (int)$estimate['estimate_id'] : null,
    $quantity,
    $hasFrd ? 1 : 0,
    $case,
    $start,
    $due,
]);
echo json_encode([
    'success'   => true,
    'task_id'   => (int)$pdo->lastInsertId(),
    'eta_hours' => $eta,
    'due_date'  => $due,
]);
