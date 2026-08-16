<?php
require 'config.php';
require 'auth.php';
/* Who can own a project: the active business analysts, plus admins.
 *
 * A separate, minimal endpoint rather than reusing pm-managers-list.php,
 * which is admin-only and returns emails, tokens and temporary
 * passwords. Filling a dropdown needs a name and an id and nothing else,
 * and the difference matters when a screen only wants the dropdown.
 */
requireRole($pdo, $USERS, ['ADMIN', 'MANAGER', 'MARKETING']);

$stmt = $pdo->query(
    "SELECT manager_id AS id, full_name AS name, role
     FROM managers
     WHERE is_active = 1 AND role IN ('MANAGER', 'ADMIN')
     ORDER BY FIELD(role, 'MANAGER', 'ADMIN'), full_name ASC"
);
$rows = $stmt->fetchAll();
foreach ($rows as &$r) { $r['id'] = (int)$r['id']; }
echo json_encode($rows);
