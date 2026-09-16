<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$db     = getDB();
$sql    = 'SELECT emp_id, employee_name AS emp_name FROM employees';
$params = [];
$types  = '';

if ($authUser['role'] !== 'admin') {
    $sql   .= ' WHERE branch_id = ?';
    $params = [(int)$authUser['branch_id']];
    $types  = 'i';
}
$sql .= ' ORDER BY employee_name ASC';

$stmt = $db->prepare($sql);
if ($params) $stmt->bind_param($types, ...$params);
$stmt->execute();
$employees = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

echo json_encode(['employees' => $employees]);
$stmt->close();
$db->close();
?>