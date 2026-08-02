<?php
// Same USERS table as Fireflies Dispatch.json's login workflow (the
// "Check Credentials1" node). This is what makes the shared login work —
// a token issued by that n8n login is recognized here too, with zero
// changes to the Fireflies workflow. Keep this list in sync manually if
// that array ever changes.
$USERS = [
    ['email' => 'yusuf.shaikh@moveneticsdigital.com',   'token' => 'tok_yusuf_7d1c277c49791954'],
    ['email' => 'akruti.patel@moveneticsdigital.com',   'token' => 'tok_akruti_1203f0abfeea57ea'],
    ['email' => 'binson.abraham@moveneticsdigital.com', 'token' => 'tok_binson_831812f4fc9ec934'],
    ['email' => 'sapna.kaintu@moveneticsdigital.com',   'token' => 'tok_sapna_45a4494a4bb99fff'],
    ['email' => 'noor.beskar@moveneticsdigital.com',    'token' => 'tok_noor_3673c02679e15c15'],
    ['email' => 'asad.dongri@moveneticsdigital.com',    'token' => 'tok_asad_18d02455c601d090'],
];

// Validates the Bearer token, resolves it to a managers-table row, and
// halts the request (with the same error shapes the old n8n workflow used)
// if either step fails. Every endpoint calls this first.
function requireManager(PDO $pdo, array $USERS): array {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = trim(preg_replace('/^Bearer\s+/i', '', $auth));

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
    return $manager; // ['manager_id' => .., 'role' => 'ADMIN'|'MANAGER', 'full_name' => ..]
}

// Shared 403 for ownership checks that fail — same message everywhere.
function denyNotYours() {
    http_response_code(403);
    echo json_encode(['error' => 'This project or task does not belong to you.']);
    exit;
}
