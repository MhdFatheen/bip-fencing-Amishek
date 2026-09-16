<?php
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db_pdo.php';

if (!isset($authUser) || empty($authUser)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized – invalid token']);
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

$branchId = getEffectiveBranchId($authUser);
$search   = isset($_GET['search']) ? trim($_GET['search']) : '';
$dateFrom = isset($_GET['date_from']) ? trim($_GET['date_from']) : '';
$dateTo   = isset($_GET['date_to']) ? trim($_GET['date_to']) : '';

$where = [];
$params = [];

if ($branchId !== null) {
    $where[] = "branch_id = ?";
    $params[] = $branchId;
}
if ($search !== '') {
    $where[] = "(product_name LIKE ? OR product_id LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($dateFrom !== '') {
    $where[] = "DATE(deducted_at) >= ?";
    $params[] = $dateFrom;
}
if ($dateTo !== '') {
    $where[] = "DATE(deducted_at) <= ?";
    $params[] = $dateTo;
}

$whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
$sql = "SELECT id, product_id, product_name, deducted_qty, note, deducted_at 
        FROM stock_deductions 
        $whereSql 
        ORDER BY deducted_at DESC, id DESC";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    echo json_encode($rows);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
exit;
?>