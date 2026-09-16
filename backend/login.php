<?php
// =============================================================
//  login.php  —  POST { username, password }
//  Returns: { success, token, user: { id, username, role,
//             branch_id, branch_name, branch_code, full_name } }
// =============================================================

require_once __DIR__ . '/cors.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/db_pdo.php';

$body     = json_decode(file_get_contents('php://input'), true);
$username = trim($body['username'] ?? '');
$password = trim($body['password'] ?? '');

if (!$username || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Username and password required']);
    exit;
}

$stmt = $pdo->prepare(
    "SELECT u.id, u.username, u.password, u.role, u.branch_id, u.full_name, u.is_active,
            b.name AS branch_name, b.code AS branch_code
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.username = ?
     LIMIT 1"
);
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !$user['is_active']) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}

// Support both plain-text (dev) and bcrypt (production) passwords
$valid = ($password === $user['password'])
      || password_verify($password, $user['password']);

if (!$valid) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}

// Generate session token
$token = bin2hex(random_bytes(32));

$stmt = $pdo->prepare(
    "INSERT INTO sessions (id, user_id, ip_address, user_agent) VALUES (?, ?, ?, ?)"
);
$stmt->execute([
    $token,
    $user['id'],
    $_SERVER['REMOTE_ADDR']     ?? '',
    $_SERVER['HTTP_USER_AGENT'] ?? '',
]);

echo json_encode([
    'success' => true,
    'token'   => $token,
    'user'    => [
        'id'          => $user['id'],
        'username'    => $user['username'],
        'full_name'   => $user['full_name'],
        'role'        => $user['role'],
        'branch_id'   => $user['branch_id'],
        'branch_name' => $user['branch_name'],
        'branch_code' => $user['branch_code'],
    ],
]);
