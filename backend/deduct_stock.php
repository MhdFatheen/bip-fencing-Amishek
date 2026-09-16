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
if ($branchId === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Please select a specific branch to deduct stock.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

$product_id = trim($data['product_id'] ?? '');
$deduct_qty = (float)($data['deduct_qty'] ?? 0);
$note = trim($data['note'] ?? '');
$deducted_at = isset($data['deducted_at']) ? trim($data['deducted_at']) : date('Y-m-d H:i:s');

if (empty($product_id) || $deduct_qty <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Product ID and valid deduction quantity required']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Get current stock and product name
    $stmt = $pdo->prepare("SELECT current_stock, product_name FROM purchase_stock WHERE product_id = ? AND branch_id = ?");
    $stmt->execute([$product_id, $branchId]);
    $stock = $stmt->fetch();

    if (!$stock) {
        throw new Exception('Product not found in stock for this branch');
    }

    $current_stock = (float)$stock['current_stock'];
    if ($deduct_qty > $current_stock) {
        throw new Exception("Insufficient stock. Available: $current_stock");
    }

    $new_stock = $current_stock - $deduct_qty;
    $product_name = $stock['product_name'];

    // Update inventory
    $update = $pdo->prepare("UPDATE purchase_stock SET current_stock = ? WHERE product_id = ? AND branch_id = ?");
    $update->execute([$new_stock, $product_id, $branchId]);

    // Log deduction (ensure stock_deductions table exists)
    $log = $pdo->prepare("INSERT INTO stock_deductions (product_id, product_name, deducted_qty, note, deducted_at, branch_id) VALUES (?, ?, ?, ?, ?, ?)");
    $log->execute([$product_id, $product_name, $deduct_qty, $note, $deducted_at, $branchId]);

    $pdo->commit();
    echo json_encode(['success' => true, 'new_stock' => $new_stock]);

} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
exit;
?>