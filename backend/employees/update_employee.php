<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
if (!$id) {
    http_response_code(400);
    echo json_encode(['error' => 'Employee ID required']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$name    = trim($body['employee_name'] ?? '');
$empId   = trim($body['emp_id'] ?? '');
$dept    = trim($body['department'] ?? '');
$dest    = trim($body['destination'] ?? '');
$gender  = trim($body['gender'] ?? '');
$email   = trim($body['email'] ?? '');
$phone   = trim($body['phone_number'] ?? '');
$address = trim($body['address'] ?? '');
$salType = trim($body['salary_type'] ?? '');
$doj     = trim($body['date_of_joining'] ?? '');

if (!$name || !$empId || !$dept || !$salType || !$doj) {
    http_response_code(422);
    echo json_encode(['error' => 'Missing required fields']);
    exit;
}

$db = getDB();

/* --------------------------------------------------
   Permission check
---------------------------------------------------*/
if ($authUser['role'] !== 'admin') {
    $check = $db->prepare(
        "SELECT id
         FROM employees
         WHERE id = ? AND branch_id = ?"
    );
    $check->bind_param("ii", $id, $authUser['branch_id']);
    $check->execute();

    if (!$check->get_result()->fetch_assoc()) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        exit;
    }

    $check->close();
}

/* --------------------------------------------------
   Check duplicate Employee ID / Phone Number
---------------------------------------------------*/
$duplicate = $db->prepare(
    "SELECT id
     FROM employees
     WHERE (emp_id = ? OR phone_number = ?)
     AND id != ?"
);

$duplicate->bind_param(
    "ssi",
    $empId,
    $phone,
    $id
);

$duplicate->execute();

if ($duplicate->get_result()->num_rows > 0) {
    http_response_code(409);
    echo json_encode([
        'error' => 'Employee ID or Mobile Number already exists.'
    ]);
    exit;
}

$duplicate->close();

/* --------------------------------------------------
   Update employee
---------------------------------------------------*/
$stmt = $db->prepare(
    "UPDATE employees
     SET
        employee_name = ?,
        emp_id = ?,
        department = ?,
        destination = ?,
        gender = ?,
        email = ?,
        phone_number = ?,
        address = ?,
        salary_type = ?,
        date_of_joining = ?
     WHERE id = ?"
);

$stmt->bind_param(
    "ssssssssssi",
    $name,
    $empId,
    $dept,
    $dest,
    $gender,
    $email,
    $phone,
    $address,
    $salType,
    $doj,
    $id
);

if ($stmt->execute()) {
    echo json_encode([
        'success' => true,
        'message' => 'Employee updated successfully'
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'error' => $stmt->error
    ]);
}

$stmt->close();
$db->close();
?>