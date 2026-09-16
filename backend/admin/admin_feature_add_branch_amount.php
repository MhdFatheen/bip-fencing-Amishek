<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: POST, OPTIONS');
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

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid JSON']);
    exit;
}

$branch_id   = (int)($data['branch_id'] ?? 0);
$branch_name = trim($data['branch_name'] ?? '');
$amount      = (float)($data['amount'] ?? 0);
$payment_date= trim($data['payment_date'] ?? '');
$note        = trim($data['note'] ?? '');
$received_by = trim($data['received_by'] ?? '');

if (!$branch_id || $amount <= 0 || empty($payment_date)) {
    http_response_code(400);
    echo json_encode(['message' => 'Branch ID, amount and date are required']);
    exit;
}

$conn = getDB();
$stmt = $conn->prepare('INSERT INTO branch_amounts (branch_id, branch_name, amount, payment_date, note, received_by) VALUES (?, ?, ?, ?, ?, ?)');
$stmt->bind_param('isdsss', $branch_id, $branch_name, $amount, $payment_date, $note, $received_by);

if ($stmt->execute()) {
    echo json_encode(['message' => 'Branch amount saved successfully', 'id' => $conn->insert_id]);
} else {
    http_response_code(500);
    echo json_encode(['message' => 'Database error: ' . $stmt->error]);
}
$stmt->close();
$conn->close();
?>