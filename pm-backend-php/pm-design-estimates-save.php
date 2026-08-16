<?php
require 'config.php';
require 'auth.php';
// The rate card is a company-wide policy about how long work takes, so
// only an admin sets it. Everyone else reads it.
requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$COMPLEXITIES = ['EASY', 'MODERATE', 'COMPLEX'];
// Developer work is not counted in screens and pages alone — a module, an
// endpoint or a single bug are all real units of estimation.
$UNITS        = ['Screen', 'Page', 'App', 'Project', 'Module', 'API', 'Endpoint', 'Feature', 'Bug'];
$DISCIPLINES  = ['DESIGN', 'DEV'];

$deliverable = trim($b['deliverable'] ?? '');
$complexity  = strtoupper(trim($b['complexity'] ?? ''));
$unit        = trim($b['unit'] ?? 'Screen');
$discipline  = strtoupper(trim($b['discipline'] ?? 'DESIGN'));
if (!in_array($discipline, $DISCIPLINES, true)) $discipline = 'DESIGN';

if ($deliverable === '' || !in_array($complexity, $COMPLEXITIES, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'A deliverable and a complexity of Easy, Moderate or Complex are required.']);
    exit;
}
if (!in_array($unit, $UNITS, true)) $unit = 'Screen';

/* All four rates are hours for one unit. The sheet these came from
 * writes some of them the other way round ("2 Screens / Hour"); the page
 * converts before sending, because storing both directions would mean
 * every reader having to know which one it was looking at. */
$rates = [];
foreach (['frd_best', 'frd_worst', 'nofrd_best', 'nofrd_worst'] as $k) {
    $v = isset($b[$k]) ? (float)$b[$k] : 0;
    if ($v <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Every rate must be more than zero hours.']);
        exit;
    }
    // Three decimals: a third of an hour is a real rate on this card.
    $rates[$k] = round($v, 3);
}

$definition = trim($b['definition'] ?? '');
$definition = $definition !== '' ? $definition : null;
$sortOrder  = isset($b['sort_order']) ? (int)$b['sort_order'] : 0;
$isActive   = array_key_exists('is_active', $b) ? (int)!empty($b['is_active']) : 1;
$estimateId = (int)($b['estimate_id'] ?? 0);

if ($estimateId) {
    $stmt = $pdo->prepare(
        "UPDATE design_estimates
         SET discipline = ?, deliverable = ?, complexity = ?, definition = ?, unit = ?,
             frd_best = ?, frd_worst = ?, nofrd_best = ?, nofrd_worst = ?,
             sort_order = ?, is_active = ?
         WHERE estimate_id = ?"
    );
    $ok = $stmt->execute([
        $discipline, $deliverable, $complexity, $definition, $unit,
        $rates['frd_best'], $rates['frd_worst'], $rates['nofrd_best'], $rates['nofrd_worst'],
        $sortOrder, $isActive, $estimateId,
    ]);
    if (!$ok) { http_response_code(500); echo json_encode(['error' => 'Could not save.']); exit; }
    echo json_encode(['success' => true, 'estimate_id' => $estimateId]);
    exit;
}

/* One row per deliverable+complexity, enforced by a unique key. Catching
 * the collision rather than checking first: two admins saving at once
 * would both pass the check and one would still fail. */
try {
    $stmt = $pdo->prepare(
        "INSERT INTO design_estimates
           (discipline, deliverable, complexity, definition, unit,
            frd_best, frd_worst, nofrd_best, nofrd_worst, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $discipline, $deliverable, $complexity, $definition, $unit,
        $rates['frd_best'], $rates['frd_worst'], $rates['nofrd_best'], $rates['nofrd_worst'],
        $sortOrder, $isActive,
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        http_response_code(400);
        echo json_encode(['error' => 'There is already a row for ' . $deliverable . ' at ' . ucfirst(strtolower($complexity)) . '.']);
        exit;
    }
    throw $e;
}
echo json_encode(['success' => true, 'estimate_id' => (int)$pdo->lastInsertId()]);
