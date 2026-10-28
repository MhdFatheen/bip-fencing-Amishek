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

// Allow only PUT requests
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
    exit;
}

// Validate OT record ID
$id = (int)($_GET['id'] ?? 0);

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['message' => 'ID required']);
    exit;
}

// Read and validate JSON
$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid JSON data']);
    exit;
}

// Read fields
$emp_name       = trim($data['emp_name'] ?? '');
$emp_id         = trim($data['emp_id'] ?? '');
$salary_type    = trim($data['salary_type'] ?? '');
$start_time     = trim($data['start_time'] ?? '');
$end_time       = trim($data['end_time'] ?? '');
$total_ot_hours = $data['total_ot_hours'] ?? '';
$ot_salary      = $data['ot_salary'] ?? 0;
$ot_date        = trim($data['ot_date'] ?? '');

// Validate required fields
if (
    $emp_name === '' ||
    $emp_id === '' ||
    $salary_type === '' ||
    $start_time === '' ||
    $end_time === '' ||
    $total_ot_hours === '' ||
    $ot_date === ''
) {
    http_response_code(400);
    echo json_encode(['message' => 'All fields are required']);
    exit;
}

// Validate numeric values
if (
    !is_numeric($total_ot_hours) ||
    !is_numeric($ot_salary) ||
    (float)$total_ot_hours < 0 ||
    (float)$ot_salary < 0
) {
    http_response_code(422);
    echo json_encode(['message' => 'Invalid OT hours or salary']);
    exit;
}

$total_ot_hours = (float)$total_ot_hours;
$ot_salary = (float)$ot_salary;

// Check branch permission
// branchAnd() must return an AND-compatible SQL condition.
list($branchClause, $branchParams) = branchAnd($authUser);

$checkSql = "SELECT id FROM ot_details WHERE id = ? $branchClause";
$checkStmt = $conn->prepare($checkSql);

if (!$checkStmt) {
    http_response_code(500);
    echo json_encode(['message' => 'Failed to prepare permission check']);
    $conn->close();
    exit;
}

if (!empty($branchParams)) {
    $types = 'i' . str_repeat('i', count($branchParams));
    $checkStmt->bind_param($types, $id, ...$branchParams);
} else {
    $checkStmt->bind_param('i', $id);
}

if (!$checkStmt->execute()) {
    $checkStmt->close();
    $conn->close();

    http_response_code(500);
    echo json_encode(['message' => 'Permission check failed']);
    exit;
}

$record = $checkStmt->get_result()->fetch_assoc();
$checkStmt->close();

if (!$record) {
    $conn->close();

    http_response_code(403);
    echo json_encode([
        'message' => 'Access denied – record not in your branch'
    ]);
    exit;
}

// Update OT record
$stmt = $conn->prepare(
    'UPDATE ot_details
     SET emp_name = ?,
         emp_id = ?,
         salary_type = ?,
         start_time = ?,
         end_time = ?,
         total_ot_hours = ?,
         ot_salary = ?,
         ot_date = ?
     WHERE id = ?'
);

if (!$stmt) {
    $conn->close();

    http_response_code(500);
    echo json_encode(['message' => 'Failed to prepare OT update']);
    exit;
}

$stmt->bind_param(
    'sssssddsi',
    $emp_name,
    $emp_id,
    $salary_type,
    $start_time,
    $end_time,
    $total_ot_hours,
    $ot_salary,
    $ot_date,
    $id
);

if ($stmt->execute()) {
    echo json_encode([
        'success' => true,
        'message' => 'OT record updated'
    ]);
} else {
    http_response_code(500);
    echo json_encode(['message' => 'Update failed']);
}

$stmt->close();
$conn->close();
?>