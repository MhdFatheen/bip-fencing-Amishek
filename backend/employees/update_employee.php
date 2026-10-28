<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_employee_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') jsonFail('Method not allowed', 405);

$id = (int)($_GET['id'] ?? 0);
if (!$id) jsonFail('Employee ID required');

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) jsonFail('Invalid JSON');

$db = getDB();

// Permission: non-admin can only edit own-branch employees, and cannot move branch
if ($authUser['role'] !== 'admin') {
    $st = $db->prepare("SELECT id FROM employees WHERE id = ? AND branch_id = ?");
    $bid = (int)$authUser['branch_id'];
    $st->bind_param('ii', $id, $bid);
    $st->execute();
    if (!$st->get_result()->fetch_assoc()) jsonFail('Access denied', 403);
    $st->close();
    unset($body['branch_name']);
}

$cols = tableColumns($db, 'employees');
$data = employeeData($db, $body, $cols, false);

// Duplicate name / WhatsApp check (other employees)
$phoneCol = isset($data['whatsapp_number']) ? 'whatsapp_number' : (isset($data['phone_number']) ? 'phone_number' : null);
$sql = "SELECT id FROM employees WHERE id <> ? AND (employee_name = ?";
$params = [$id, $data['employee_name']];
if ($phoneCol && $data[$phoneCol] !== '') { $sql .= " OR `$phoneCol` = ?"; $params[] = $data[$phoneCol]; }
$sql .= ")";
$st = $db->prepare($sql);
$st->bind_param('i' . str_repeat('s', count($params) - 1), ...$params);
$st->execute();
if ($st->get_result()->num_rows > 0) jsonFail('Employee name or WhatsApp number already exists.', 409);
$st->close();

$set  = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($data)));
$vals = array_values($data);
$vals[] = $id;
$st = $db->prepare("UPDATE employees SET $set WHERE id = ?");
$st->bind_param(bindTypes($vals), ...$vals);

if ($st->execute()) {
    echo json_encode(['success' => true, 'message' => 'Employee updated successfully']);
} else {
    jsonFail($st->error, 500);
}
$st->close();
$db->close();
