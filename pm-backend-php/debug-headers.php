<?php
// Temporary diagnostic — shows exactly what PHP receives, so we can tell
// whether the Authorization header is really reaching PHP or being
// stripped by the web server first. Delete this file once auth works.
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

echo json_encode([
    'getallheaders' => function_exists('getallheaders') ? getallheaders() : 'not available on this SAPI',
    'HTTP_AUTHORIZATION' => $_SERVER['HTTP_AUTHORIZATION'] ?? null,
    'REDIRECT_HTTP_AUTHORIZATION' => $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
    'php_sapi' => php_sapi_name(),
], JSON_PRETTY_PRINT);
