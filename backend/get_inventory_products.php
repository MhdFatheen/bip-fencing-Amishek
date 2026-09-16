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
$search = isset($_GET['search']) ? trim($_GET['search']) : '';

try {
    if ($branchId === null) {
        // Admin viewing all branches – aggregate
        $sql = "SELECT product_id, product_name, 
                       SUM(total_purchased) AS total_purchased,
                       SUM(current_stock) AS current_stock,
                       AVG(rate) AS rate
                FROM purchase_stock
                WHERE 1=1";
        $params = [];
        if ($search !== '') {
            $sql .= " AND (product_name LIKE ? OR product_id LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }
        $sql .= " GROUP BY product_id, product_name ORDER BY product_name";
    } else {
        $sql = "SELECT product_id, product_name, total_purchased, current_stock, rate
                FROM purchase_stock
                WHERE branch_id = ?";
        $params = [$branchId];
        if ($search !== '') {
            $sql .= " AND (product_name LIKE ? OR product_id LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }
        $sql .= " ORDER BY product_name";
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();
    echo json_encode($products);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
exit;
?>