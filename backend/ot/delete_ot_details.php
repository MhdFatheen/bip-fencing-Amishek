<?php
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

// Allow token via GET parameter
if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
    exit;
}

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) {
    http_response_code(400);
    echo json_encode(['message' => 'ID required']);
    exit;
}

// Check branch permission (admin can delete any record in their view branch, others only their own branch)
list($whereClause, $params) = branchFilter($authUser);
$checkSql = "SELECT id FROM ot_details WHERE id = ? $whereClause";
$checkStmt = $conn->prepare($checkSql);
if (!empty($params)) {
    $types = 'i' . str_repeat('i', count($params));
    $checkStmt->bind_param($types, $id, ...$params);
} else {
    $checkStmt->bind_param('i', $id);
}
$checkStmt->execute();
if (!$checkStmt->get_result()->fetch_assoc()) {
    http_response_code(403);
    echo json_encode(['message' => 'Access denied – record not in your branch']);
    exit;
}
$checkStmt->close();

// Proceed with delete
$stmt = $conn->prepare('DELETE FROM ot_details WHERE id = ?');
$stmt->bind_param('i', $id);

if ($stmt->execute()) {
    echo json_encode(['message' => 'OT record deleted']);
} else {
    http_response_code(500);
    echo json_encode(['message' => 'Delete failed', 'error' => $stmt->error]);
}
$stmt->close();
$conn->close();
?>