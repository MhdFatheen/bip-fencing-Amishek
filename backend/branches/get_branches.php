<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../db.php';

header('Content-Type: application/json');

// Allow only GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    $conn->close();
    exit;
}

// Simple branch list
// Usage: branches.php?simple=1
if (isset($_GET['simple']) && $_GET['simple'] == 1) {

    $sql = "SELECT id, name FROM branches ORDER BY name ASC";

    $result = $conn->query($sql);

    if (!$result) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch branches']);
        $conn->close();
        exit;
    }

    $branches = [];

    while ($row = $result->fetch_assoc()) {
        $branches[] = $row;
    }

    echo json_encode($branches);

    $conn->close();
    exit;
}

// Full branch list
// Includes fields from both original files
$sql = "SELECT
            id,
            name AS branch_name,
            code,
            is_active,
            location,
            created_at
        FROM branches
        ORDER BY name ASC";

$result = $conn->query($sql);

if (!$result) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch branches']);
    $conn->close();
    exit;
}

$branches = [];

while ($row = $result->fetch_assoc()) {
    $branches[] = $row;
}

echo json_encode($branches);

$conn->close();
?>