<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN', 'QA', 'MANAGER', 'MARKETING']);
$b = body();

$caseId = (int)($b['case_id'] ?? 0);
[$scope, $params] = projectScope($user, 'project_id');
$check = $pdo->prepare("SELECT case_id, project_id, title FROM test_cases WHERE case_id = ? AND $scope");
$check->execute(array_merge([$caseId], $params));
$case = $check->fetch();
if (!$case) denyNotYours();

$results = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];
$result = in_array($b['result'] ?? '', $results, true) ? $b['result'] : 'PASS';

$stmt = $pdo->prepare("INSERT INTO test_runs (case_id, result, notes, run_by) VALUES (?, ?, ?, ?)");
$stmt->execute([$caseId, $result, $b['notes'] ?? null, $user['id']]);
$out = ['success' => true, 'run_id' => (int)$pdo->lastInsertId()];

// A failing test is the usual reason a bug exists, so offer to open one
// in the same step rather than making the tester re-enter everything.
if ($result === 'FAIL' && !empty($b['raise_bug'])) {
    $bug = $pdo->prepare(
        "INSERT INTO bugs (project_id, case_id, title, steps, severity, reported_by)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    $severity = in_array($b['severity'] ?? '', $severities, true) ? $b['severity'] : 'MEDIUM';
    $bug->execute([
        $case['project_id'],
        $caseId,
        'Failed: ' . $case['title'],
        $b['notes'] ?? null,
        $severity,
        $user['id'],
    ]);
    $out['bug_id'] = (int)$pdo->lastInsertId();
}

echo json_encode($out);
