<?php
// =============================================================
//  logout.php  —  POST  (Authorization: Bearer <token>)
// =============================================================

require_once __DIR__ . '/cors.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/db_pdo.php';

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token      = str_replace('Bearer ', '', $authHeader);

if ($token) {
    $stmt = $pdo->prepare("DELETE FROM sessions WHERE id = ?");
    $stmt->execute([$token]);
}

echo json_encode(['success' => true]);
