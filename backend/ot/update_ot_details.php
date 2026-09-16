<?php
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
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

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid JSON data']);
    exit;
}

$emp_name       = trim($data['emp_name'] ?? '');
$emp_id         = trim($data['emp_id'] ?? '');
$salary_type    = trim($data['salary_type'] ?? '');
$start_time     = trim($data['start_time'] ?? '');
$end_time       = trim($data['end_time'] ?? '');
$total_ot_hours = $data['total_ot_hours'] ?? '';
$ot_salary      = $data['ot_salary'] ?? 0;
$ot_date        = trim($data['ot_date'] ?? '');

if (empty($emp_name) || empty($emp_id) || empty($salary_type) ||
    empty($start_time) || empty($end_time) || $total_ot_hours === '' || empty($ot_date)) {
    http_response_code(400);
    echo json_encode(['message' => 'All fields are required']);
    exit;
}

// FIX: Use branchAnd() so the branch condition appends as AND, not a second WHERE
list($branchClause, $branchParams) = branchAnd($authUser);

// Query already starts with WHERE id = ?, so branch condition must use AND
$checkSql = "SELECT id FROM ot_details WHERE id = ? $branchClause";
$checkStmt = $conn->prepare($checkSql);

if ($branchParams) {
    $checkStmt->bind_param('i' . str_repeat('i', count($branchParams)), $id, ...$branchParams);
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

// Update record
$stmt = $conn->prepare(
    'UPDATE ot_details SET emp_name=?, emp_id=?, salary_type=?, start_time=?, end_time=?, total_ot_hours=?, ot_salary=?, ot_date=? WHERE id=?'
);
$stmt->bind_param('ssssssdsi', $emp_name, $emp_id, $salary_type, $start_time, $end_time, $total_ot_hours, $ot_salary, $ot_date, $id);

if ($stmt->execute()) {
    echo json_encode(['message' => 'OT record updated']);
} else {
    http_response_code(500);
    echo json_encode(['message' => 'Update failed', 'error' => $stmt->error]);
}

$stmt->close();
$conn->close();
?>