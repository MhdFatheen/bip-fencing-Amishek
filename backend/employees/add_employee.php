<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$required = ['employee_name', 'emp_id', 'department', 'salary_type', 'date_of_joining'];
foreach ($required as $f) {
    if (empty(trim((string)($body[$f] ?? '')))) {
        http_response_code(422);
        echo json_encode(['error' => "Field '$f' is required"]);
        exit;
    }
}

// Convert null values to empty strings for bind_param
$name    = trim($body['employee_name']);
$empId   = trim($body['emp_id']);
$dept    = trim($body['department']);
$dest    = isset($body['destination']) && $body['destination'] !== '' ? trim($body['destination']) : '';
$gender  = isset($body['gender']) && $body['gender'] !== '' ? $body['gender'] : '';
$email   = isset($body['email']) && $body['email'] !== '' ? trim($body['email']) : '';
$phone   = isset($body['phone_number']) && $body['phone_number'] !== '' ? trim($body['phone_number']) : '';
$address = isset($body['address']) && $body['address'] !== '' ? trim($body['address']) : '';
$salType = trim($body['salary_type']);
$doj     = trim($body['date_of_joining']);

if (!in_array($salType, ['monthly', 'weekly', 'daily'], true)) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid salary_type']);
    exit;
}

// Branch ID logic
$branchId = null;
if ($authUser['role'] === 'admin') {
    if (isset($authUser['view_branch_id']) && $authUser['view_branch_id'] !== null) {
        $branchId = (int)$authUser['view_branch_id'];
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Please select a specific branch from the topbar before adding an employee.']);
        exit;
    }
} else {
    $branchId = (int)$authUser['branch_id'];
}

$db = getDB();

// Check duplicate Employee ID or Mobile Number
$check = $db->prepare("
    SELECT id
    FROM employees
    WHERE emp_id = ?
       OR phone_number = ?
");

$check->bind_param("ss", $empId, $phone);
$check->execute();

if ($check->get_result()->num_rows > 0) {
    http_response_code(409);
    echo json_encode([
        "error" => "Employee ID or Mobile Number already exists."
    ]);
    $check->close();
    $db->close();
    exit;
}

$check->close();

$stmt = $db->prepare(
    'INSERT INTO employees 
        (employee_name, emp_id, department, destination, gender, email, phone_number, address, salary_type, date_of_joining, branch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->bind_param(
    'ssssssssssi',
    $name, $empId, $dept, $dest, $gender, $email, $phone, $address, $salType, $doj, $branchId
);

if ($stmt->execute()) {
    http_response_code(201);
    echo json_encode(['success' => true, 'id' => $db->insert_id]);
} else {
    $code = $db->errno === 1062 ? 409 : 500;
    http_response_code($code);
    echo json_encode(['error' => $db->errno === 1062 ? "Employee ID '$empId' already exists" : $db->error]);
}
$stmt->close();
$db->close();
?>