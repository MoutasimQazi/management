<?php
require 'config.php';
require 'auth.php';
// Any signed-in account (including employees) needs this list to pick
// who a leave request goes to — names and roles only, nothing sensitive.
$user = requireUser($pdo, $USERS);

/* Leave approval is a manager-side responsibility, not HR's — HR tracks
 * requests but does not decide them, so HR accounts are never offered.
 *
 * ── A business analyst's own leave goes to an admin ──
 * BAs are the managers here, so a BA approving another BA's time off is
 * a peer signing off a peer. Their requests go to an admin and nobody
 * else. Everyone else can send to any admin, BA, marketing or QA lead.
 *
 * This list is what the form shows; pm-leave-create.php applies the same
 * rule to whatever actually arrives, because hiding an option is not
 * enforcement. */
$isBa = ($user['user_type'] ?? '') === 'STAFF' && ($user['role'] ?? '') === 'MANAGER';
$roles = $isBa ? ['ADMIN'] : ['ADMIN', 'MANAGER', 'MARKETING', 'QA'];

$sql = "SELECT manager_id, full_name, role FROM managers
        WHERE is_active = 1 AND role IN (" . implode(',', array_fill(0, count($roles), '?')) . ")";
$params = $roles;

// Nobody approves their own leave.
if (($user['user_type'] ?? '') === 'STAFF') {
    $sql .= " AND manager_id <> ?";
    $params[] = $user['id'];
}
$sql .= " ORDER BY FIELD(role, 'ADMIN', 'MANAGER', 'MARKETING', 'QA'), full_name ASC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
echo json_encode($stmt->fetchAll());
