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

// Allow only DELETE requests
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
    exit;
}

// Validate OT record ID
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['message' => 'ID required']);
    exit;
}

// Check branch access using the shared branch filter
list($whereClause, $params) = branchFilter($authUser);

$checkSql = "SELECT id FROM ot_details WHERE id = ? $whereClause";
$checkStmt = $conn->prepare($checkSql);

if (!$checkStmt) {
    http_response_code(500);
    echo json_encode(['message' => 'Failed to prepare permission check']);
    $conn->close();
    exit;
}

// Bind record ID and branch parameters
if (!empty($params)) {
    $types = 'i' . str_repeat('i', count($params));
    $checkStmt->bind_param($types, $id, ...$params);
} else {
    $checkStmt->bind_param('i', $id);
}

$checkStmt->execute();
$record = $checkStmt->get_result()->fetch_assoc();
$checkStmt->close();

// Reject missing records or records outside the permitted branch
if (!$record) {
    http_response_code(403);
    echo json_encode([
        'message' => 'Access denied – record not in your branch'
    ]);
    $conn->close();
    exit;
}

// Delete OT record
$stmt = $conn->prepare('DELETE FROM ot_details WHERE id = ?');

if (!$stmt) {
    http_response_code(500);
    echo json_encode(['message' => 'Failed to prepare delete query']);
    $conn->close();
    exit;
}

$stmt->bind_param('i', $id);

if ($stmt->execute()) {
    if ($stmt->affected_rows > 0) {
        echo json_encode([
            'success' => true,
            'message' => 'OT record deleted'
        ]);
    } else {
        http_response_code(404);
        echo json_encode(['message' => 'OT record not found']);
    }
} else {
    http_response_code(500);
    echo json_encode(['message' => 'Delete failed']);
}

$stmt->close();
$conn->close();
?>