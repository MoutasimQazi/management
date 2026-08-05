<?php
// DELIBERATELY EMPTY — do not put tokens back in this file.
//
// This used to hold the six managers' bearer tokens inline, mirroring the
// n8n "Check Credentials1" node. Because this repo is public, those tokens
// were readable by anyone, and the fallback below meant that knowing one
// granted full API access. They have since been rotated; the live values
// now live only in the `managers.token` column, which requireManager()
// checks first.
//
// Every account (the original managers included) authenticates through
// that DB lookup now, so this array has no entries. Leaving it empty is
// what keeps the old published tokens from working.
$USERS = [];

// Pulls the Bearer token out of the request, however the current server
// happens to expose it.
function bearerToken(): string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return trim(preg_replace('/^Bearer\s+/i', '', $auth));
}

// Validates the Bearer token, resolves it to a managers-table row, and
// halts the request (with the same error shapes the old n8n workflow used)
// if either step fails. Every manager-only endpoint calls this first.
//
// Primary path: any managers row whose `token` column matches (covers the
// original 6 managers, whose tokens are backfilled to the values below, plus
// every HR/Marketing account created since). Falls back to the original
// static $USERS list + email lookup so nothing breaks if migration 001
// hasn't been run against this database yet.
function requireManager(PDO $pdo, array $USERS): array {
    $token = bearerToken();

    $stmt = $pdo->prepare(
        "SELECT manager_id, role, full_name FROM managers WHERE is_active = 1 AND token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $manager = $stmt->fetch();
    if ($manager) return $manager;

    $user = null;
    foreach ($USERS as $u) {
        if (hash_equals($u['token'], $token)) { $user = $u; break; }
    }
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or missing token']);
        exit;
    }

    $stmt = $pdo->prepare(
        "SELECT manager_id, role, full_name FROM managers WHERE is_active = 1 AND email = ? LIMIT 1"
    );
    $stmt->execute([$user['email']]);
    $manager = $stmt->fetch();

    if (!$manager) {
        http_response_code(403);
        echo json_encode(['error' =>
            'No manager record found for this email in the managers table (or the row is not is_active).']);
        exit;
    }
    return $manager; // ['manager_id' => .., 'role' => 'ADMIN'|'MANAGER'|'HR'|'MARKETING', 'full_name' => ..]
}

// Like requireManager(), but also accepts an employee login — used by
// endpoints an employee can call directly (their own tasks, their own
// questions, filing/viewing leave). Returns a unified shape with
// `user_type` = 'STAFF' (any managers-table role) or 'EMPLOYEE'.
function requireUser(PDO $pdo, array $USERS): array {
    $token = bearerToken();

    $stmt = $pdo->prepare(
        "SELECT manager_id AS id, role, full_name AS name, email FROM managers WHERE is_active = 1 AND token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if ($row) { $row['user_type'] = 'STAFF'; return $row; }

    $stmt = $pdo->prepare(
        "SELECT employee_id AS id, name, email FROM employees WHERE status = 'ACTIVE' AND token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if ($row) { $row['role'] = 'EMPLOYEE'; $row['user_type'] = 'EMPLOYEE'; return $row; }

    // Fallback to the legacy static token list for the original 6 managers.
    foreach ($USERS as $u) {
        if (!hash_equals($u['token'], $token)) continue;
        $stmt = $pdo->prepare(
            "SELECT manager_id AS id, role, full_name AS name, email FROM managers WHERE is_active = 1 AND email = ? LIMIT 1"
        );
        $stmt->execute([$u['email']]);
        $row = $stmt->fetch();
        if ($row) { $row['user_type'] = 'STAFF'; return $row; }
    }

    http_response_code(401);
    echo json_encode(['error' => 'Invalid or missing token']);
    exit;
}

// Wraps requireUser() with a role allowlist — for endpoints only some
// roles may call (e.g. HR + ADMIN for recruitment, HR + ADMIN for
// reviewing leave).
function requireRole(PDO $pdo, array $USERS, array $allowedRoles): array {
    $user = requireUser($pdo, $USERS);
    if (!in_array($user['role'], $allowedRoles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'This action requires one of: ' . implode(', ', $allowedRoles)]);
        exit;
    }
    return $user;
}

// Shared 403 for ownership checks that fail — same message everywhere.
function denyNotYours() {
    http_response_code(403);
    echo json_encode(['error' => 'This does not belong to you.']);
    exit;
}
