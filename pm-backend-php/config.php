<?php
// ── CORS + JSON response headers, shared by every endpoint ──
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

// Browsers send an OPTIONS preflight before cross-origin POSTs — answer it
// and stop, so it never reaches the actual endpoint logic below.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── Database connection ──
// Same database the n8n Project Management workflow already used — no data
// migration needed. Password is masked in the credential panel you have
// open, so I can't read it — fill in DB_PASS yourself.
$DB_HOST = '213.136.64.26';
$DB_PORT = '3306';
$DB_NAME = 'movenetics_n8n';
$DB_USER = 'movenetics_moutasim';
$DB_PASS = '@Iv+rUv_^$EeSm[Q';

try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER, $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 10,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

// Parses the JSON body of a POST request into an associative array.
function body() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// Random login token (stored in managers.token / employees.token) or a
// human-typeable temporary password — same generator, different lengths.
function randomToken(int $bytes = 24): string {
    return bin2hex(random_bytes($bytes));
}
function randomTempPassword(): string {
    return substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(9))), 0, 10);
}
