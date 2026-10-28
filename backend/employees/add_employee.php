<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_employee_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('Method not allowed', 405);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) jsonFail('Invalid JSON');

$db   = getDB();
$cols = tableColumns($db, 'employees');
$data = employeeData($db, $body, $cols, true);

// Non-admin users can only add to their own branch
if ($authUser['role'] !== 'admin') $data['branch_id'] = (int)$authUser['branch_id'];

// Duplicate name / WhatsApp check
$phoneCol = isset($data['whatsapp_number']) ? 'whatsapp_number' : (isset($data['phone_number']) ? 'phone_number' : null);
$sql = "SELECT id FROM employees WHERE employee_name = ?";
$params = [$data['employee_name']];
if ($phoneCol && $data[$phoneCol] !== '') { $sql .= " OR `$phoneCol` = ?"; $params[] = $data[$phoneCol]; }
$st = $db->prepare($sql);
$st->bind_param(str_repeat('s', count($params)), ...$params);
$st->execute();
if ($st->get_result()->num_rows > 0) jsonFail('Employee name or WhatsApp number already exists.', 409);
$st->close();

$keys = array_keys($data);
$vals = array_values($data);
$st = $db->prepare("INSERT INTO employees (`" . implode('`,`', $keys) . "`) VALUES (" . implode(',', array_fill(0, count($vals), '?')) . ")");
$st->bind_param(bindTypes($vals), ...$vals);

if ($st->execute()) {
    http_response_code(201);
    echo json_encode(['success' => true, 'id' => $db->insert_id]);
} else {
    jsonFail($db->errno === 1062 ? 'Employee already exists' : $st->error, $db->errno === 1062 ? 409 : 500);
}
$st->close();
$db->close();
