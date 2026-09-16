<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
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

$db = getDB();

// Permission check
if ($authUser['role'] !== 'admin') {
    $check = $db->prepare("SELECT id FROM employees WHERE id = ? AND branch_id = ?");
    $check->bind_param('ii', $id, $authUser['branch_id']);
    $check->execute();
    if (!$check->get_result()->fetch_assoc()) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        exit;
    }
}

$stmt = $db->prepare("DELETE FROM employees WHERE id = ?");
$stmt->bind_param('i', $id);
if ($stmt->execute()) {
    echo json_encode(['success' => true, 'message' => 'Employee deleted']);
} else {
    http_response_code(500);
    echo json_encode(['error' => $stmt->error]);
}
$stmt->close();
$db->close();
?>