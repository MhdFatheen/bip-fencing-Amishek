<?php
// =============================================================
// auth_middleware.php
// =============================================================

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/db_pdo.php';

// -------------------------------------------------------------
// Read Authorization Header
// -------------------------------------------------------------
$authHeader = '';

if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = trim($_SERVER['HTTP_AUTHORIZATION']);
}

if (!$authHeader && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $authHeader = trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
}

if (!$authHeader && function_exists('getallheaders')) {
    $headers = getallheaders();

    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            $authHeader = trim($value);
            break;
        }
    }
}

if (!$authHeader && function_exists('apache_request_headers')) {
    $headers = apache_request_headers();

    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            $authHeader = trim($value);
            break;
        }
    }
}

// -------------------------------------------------------------
// Get Token
// -------------------------------------------------------------
$token = '';

// Authorization: Bearer xxxxx
if (!empty($authHeader) && preg_match('/Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $token = trim($matches[1]);
}

// GET ?token=
if (empty($token) && !empty($_GET['token'])) {
    $token = trim($_GET['token']);
}

// POST token
if (empty($token) && !empty($_POST['token'])) {
    $token = trim($_POST['token']);
}

// JSON body
if (empty($token)) {

    $raw = file_get_contents("php://input");

    if (!empty($raw)) {

        $json = json_decode($raw, true);

        if (json_last_error() === JSON_ERROR_NONE) {

            if (!empty($json['token'])) {
                $token = trim($json['token']);
            }
        }
    }
}

// -------------------------------------------------------------
// No Token
// -------------------------------------------------------------
if (empty($token)) {

    http_response_code(401);

    echo json_encode([
        "error" => "Unauthorised - no token provided"
    ]);

    exit;
}

// -------------------------------------------------------------
// Validate Session
// -------------------------------------------------------------
$sql = "
SELECT
    u.id,
    u.username,
    u.full_name,
    u.role,
    u.branch_id,
    u.is_active,
    b.name AS branch_name,
    b.code AS branch_code,
    s.created_at
FROM sessions s
INNER JOIN users u
    ON s.user_id = u.id
LEFT JOIN branches b
    ON b.id = u.branch_id
WHERE s.id = ?
LIMIT 1
";

$stmt = $pdo->prepare($sql);
$stmt->execute([$token]);

$authUser = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$authUser) {

    http_response_code(401);

    echo json_encode([
        "error" => "Unauthorised - invalid session"
    ]);

    exit;
}

if ((int)$authUser['is_active'] !== 1) {

    http_response_code(403);

    echo json_encode([
        "error" => "User account disabled"
    ]);

    exit;
}

// -------------------------------------------------------------
// Read X-Branch-ID
// -------------------------------------------------------------
$branchHeader = '';

if (isset($_SERVER['HTTP_X_BRANCH_ID'])) {
    $branchHeader = trim($_SERVER['HTTP_X_BRANCH_ID']);
}

if (!$branchHeader && function_exists('getallheaders')) {

    $headers = getallheaders();

    foreach ($headers as $key => $value) {

        if (strtolower($key) === 'x-branch-id') {
            $branchHeader = trim($value);
            break;
        }
    }
}

// -------------------------------------------------------------
// Effective Branch
// -------------------------------------------------------------
if ($authUser['role'] === 'admin') {

    if ($branchHeader !== '' && is_numeric($branchHeader)) {

        $authUser['view_branch_id'] = (int)$branchHeader;

    } else {

        $authUser['view_branch_id'] = null;
    }

} else {

    $authUser['view_branch_id'] = (int)$authUser['branch_id'];
}

// -------------------------------------------------------------
// Helper Functions
// -------------------------------------------------------------
function branchFilter(array $user): array
{
    if (
        $user['role'] === 'admin' &&
        $user['view_branch_id'] === null
    ) {
        return ['', []];
    }

    return [
        'WHERE branch_id = ?',
        [(int)$user['view_branch_id']]
    ];
}

function branchAnd(array $user): array
{
    if (
        $user['role'] === 'admin' &&
        $user['view_branch_id'] === null
    ) {
        return ['', []];
    }

    return [
        'AND branch_id = ?',
        [(int)$user['view_branch_id']]
    ];
}