<?php
require 'config.php';
require 'auth.php';
$user = requireRole($pdo, $USERS, ['ADMIN']);
$b = body();

$ROLES = ['ADMIN', 'MANAGER', 'HR', 'MARKETING', 'QA'];
$role = strtoupper(trim($b['role'] ?? ''));
$managerId = (int)($b['manager_id'] ?? 0);

if (!in_array($role, $ROLES, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown role.']);
    exit;
}

$check = $pdo->prepare("SELECT manager_id, role FROM managers WHERE manager_id = ?");
$check->execute([$managerId]);
$target = $check->fetch();
if (!$target) {
    http_response_code(404);
    echo json_encode(['error' => 'Account not found.']);
    exit;
}

// Refuse to remove the last admin — otherwise nobody can administer the
// workspace again, and there is no way back in through the UI.
if ($target['role'] === 'ADMIN' && $role !== 'ADMIN') {
    $count = $pdo->query("SELECT COUNT(*) AS n FROM managers WHERE role = 'ADMIN' AND is_active = 1")->fetch();
    if ((int)$count['n'] <= 1) {
        http_response_code(409);
        echo json_encode(['error' => 'This is the only active admin — promote someone else first.']);
        exit;
    }
}

$pdo->prepare("UPDATE managers SET role = ? WHERE manager_id = ?")->execute([$role, $managerId]);

// Leaving QA drops the project assignments, which would otherwise sit
// around and silently take effect again if the account returned to QA.
if ($target['role'] === 'QA' && $role !== 'QA') {
    $pdo->prepare("DELETE FROM qa_assignments WHERE qa_id = ?")->execute([$managerId]);
}

echo json_encode(['success' => true, 'role' => $role]);
