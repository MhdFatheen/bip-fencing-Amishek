<?php
// Start with clean output
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

// Allow token via GET parameter (for environments where HTTP_AUTHORIZATION is not set)
if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
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

// Validate required fields
if (empty($emp_name) || empty($emp_id) || empty($salary_type) ||
    empty($start_time) || empty($end_time) || $total_ot_hours === '' || empty($ot_date)) {
    http_response_code(400);
    echo json_encode(['message' => 'All fields are required']);
    exit;
}

if (!is_numeric($ot_salary) || $ot_salary < 0) {
    http_response_code(400);
    echo json_encode(['message' => 'OT salary must be a valid positive number']);
    exit;
}

// Get branch_id from employees table (needed for branch filtering later)
$branchId = null;
$stmtEmp = $conn->prepare("SELECT branch_id FROM employees WHERE emp_id = ? OR employee_name = ? LIMIT 1");
$stmtEmp->bind_param('ss', $emp_id, $emp_name);
$stmtEmp->execute();
$resultEmp = $stmtEmp->get_result();
if ($row = $resultEmp->fetch_assoc()) {
    $branchId = (int)$row['branch_id'];
}
$stmtEmp->close();

if (!$branchId) {
    http_response_code(400);
    echo json_encode(['message' => 'Employee not found or branch not assigned']);
    exit;
}

// Check for duplicate entry (emp_id + ot_date) – client-side also checks, but double‑safe
$checkStmt = $conn->prepare("SELECT id FROM ot_details WHERE emp_id = ? AND ot_date = ?");
$checkStmt->bind_param('ss', $emp_id, $ot_date);
$checkStmt->execute();
if ($checkStmt->get_result()->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['message' => 'OT entry already exists for this employee on this date']);
    exit;
}
$checkStmt->close();

// Insert new OT record
$stmt = $conn->prepare(
    'INSERT INTO ot_details (emp_name, emp_id, salary_type, start_time, end_time, total_ot_hours, ot_salary, ot_date, branch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['message' => 'Prepare failed', 'error' => $conn->error]);
    exit;
}

$stmt->bind_param('sssssddsi', 
    $emp_name, $emp_id, $salary_type, $start_time, $end_time, 
    $total_ot_hours, $ot_salary, $ot_date, $branchId
);

if ($stmt->execute()) {
    echo json_encode(['message' => 'OT details saved successfully']);
} else {
    http_response_code(500);
    echo json_encode(['message' => 'Execute failed', 'error' => $stmt->error]);
}

$stmt->close();
$conn->close();
?>