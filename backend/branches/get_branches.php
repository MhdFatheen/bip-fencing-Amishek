<?php
header('Content-Type: application/json');

// No authentication for simple branch list (temporary fix)
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (isset($_GET['simple']) && $_GET['simple'] == 1) {
    $sql = "SELECT id, branch_name as name FROM branches ORDER BY branch_name ASC";
    $result = $conn->query($sql);
    $branches = [];
    while ($row = $result->fetch_assoc()) {
        $branches[] = $row;
    }
    echo json_encode($branches);
    $conn->close();
    exit;
}

// Otherwise return full list
$sql = "SELECT id, branch_name, location, created_at FROM branches ORDER BY branch_name ASC";
$result = $conn->query($sql);
$branches = [];
while ($row = $result->fetch_assoc()) {
    $branches[] = $row;
}
echo json_encode($branches);
$conn->close();
?>