<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Branch-ID');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($authUser['role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['message' => 'Admin access required']);
    exit;
}

function getEffectiveBranchId($user): ?int {
    if ($user['role'] === 'admin' && isset($user['view_branch_id']) && $user['view_branch_id'] !== null) {
        return (int)$user['view_branch_id'];
    }
    if ($user['role'] !== 'admin' && isset($user['branch_id']) && $user['branch_id'] !== null) {
        return (int)$user['branch_id'];
    }
    return null;
}

$effectiveBranch = getEffectiveBranchId($authUser);
$conn = getDB();

// Added ba.branch_id to SELECT so React can use it for edit/update
$sql = "SELECT ba.id, ba.branch_id, b.name as branch_name, ba.amount, ba.payment_date, ba.note, ba.received_by, ba.created_at 
        FROM branch_amounts ba
        JOIN branches b ON ba.branch_id = b.id";
$params = [];
$types = '';

if ($effectiveBranch !== null) {
    $sql .= " WHERE ba.branch_id = ?";
    $params[] = $effectiveBranch;
    $types = 'i';
}

$sql .= " ORDER BY ba.payment_date DESC, ba.id DESC";

$stmt = $conn->prepare($sql);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'Prepare failed: ' . $conn->error]);
    exit;
}
if ($params) $stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();

$records = [];
$totalAmount = 0;
while ($row = $result->fetch_assoc()) {
    $totalAmount += $row['amount'];
    $row['time'] = date('h:i A', strtotime($row['created_at']));
    $records[] = $row;
}

$totalEntries = count($records);
$averageAmount = $totalEntries > 0 ? $totalAmount / $totalEntries : 0;
$lastAmount = $records ? $records[0]['amount'] : 0;

echo json_encode([
    'records' => $records,
    'stats' => [
        'total_amount'   => $totalAmount,
        'total_entries'  => $totalEntries,
        'average_amount' => $averageAmount,
        'last_amount'    => $lastAmount,
    ]
]);
$conn->close();
?>