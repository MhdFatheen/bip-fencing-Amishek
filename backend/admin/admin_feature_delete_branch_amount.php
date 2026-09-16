<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Branch-ID');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($authUser['role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['message' => 'Admin access required']);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
if (!$id) {
    http_response_code(400);
    echo json_encode(['message' => 'ID required']);
    exit;
}

$conn = getDB();
$stmt = $conn->prepare('DELETE FROM branch_amounts WHERE id = ?');
$stmt->bind_param('i', $id);
if ($stmt->execute()) {
    echo json_encode(['message' => 'Deleted successfully']);
} else {
    http_response_code(500);
    echo json_encode(['message' => $stmt->error]);
}
$stmt->close();
$conn->close();
?>