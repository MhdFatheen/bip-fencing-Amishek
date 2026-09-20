<?php
// =============================================================
//  delete_stock_product.php — remove a product from Purchase Inventory
//  POST { product_id, branch_id }
//  • Only the inventory (stock) row is removed
//  • Purchase bills and their items are kept as history
//  • Stock deduction history for that product is removed with it
// =============================================================
header('Content-Type: application/json');
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/purchase_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') pbRespond(405, ['error' => 'Method not allowed']);

$data      = json_decode(file_get_contents('php://input'), true) ?: [];
$productId = trim((string)($data['product_id'] ?? ''));
$hasBranch = array_key_exists('branch_id', $data) && $data['branch_id'] !== null && $data['branch_id'] !== '';
$branchId  = $hasBranch ? (int) $data['branch_id'] : null;

if ($productId === '') pbRespond(400, ['error' => 'product_id is required']);

// Branch users may only delete their own branch's stock
if ($authUser['role'] !== 'admin') {
    $ownBranch = (int) $authUser['branch_id'];
    if ($branchId !== null && $branchId !== $ownBranch) {
        pbRespond(403, ['error' => 'This product belongs to another branch']);
    }
    $branchId = $ownBranch;
    $hasBranch = true;
}

$conn = getDB();

// Which stock rows are we deleting? (no branch given = every branch, "All Branches" view)
$where  = "product_id = ?";
$params = [$productId];
$types  = 's';
if ($hasBranch) {
    $where   .= " AND branch_id <=> ?";
    $params[] = $branchId;
    $types   .= 'i';
}

$chk = $conn->prepare("SELECT COUNT(*) AS c FROM purchase_stock WHERE $where");
$chk->bind_param($types, ...$params);
$chk->execute();
$found = (int) ($chk->get_result()->fetch_assoc()['c'] ?? 0);
$chk->close();

if ($found === 0) pbRespond(404, ['error' => 'Product not found in inventory']);

// How many purchase bills mention it (kept, just reported)
$billCount = 0;
$bc = $conn->prepare("SELECT COUNT(DISTINCT purchase_bill_id) AS c FROM purchase_bill_items WHERE product_id = ?");
$bc->bind_param('s', $productId);
$bc->execute();
$billCount = (int) ($bc->get_result()->fetch_assoc()['c'] ?? 0);
$bc->close();

$conn->begin_transaction();
try {
    // Stock deduction history for this product (table may not exist on older setups)
    if ($conn->query("SHOW TABLES LIKE 'stock_deductions'")->num_rows > 0) {
        $dWhere  = $hasBranch ? "product_id = ? AND branch_id <=> ?" : "product_id = ?";
        $del = $conn->prepare("DELETE FROM stock_deductions WHERE $dWhere");
        $del->bind_param($types, ...$params);
        $del->execute();
        $del->close();
    }

    $del = $conn->prepare("DELETE FROM purchase_stock WHERE $where");
    $del->bind_param($types, ...$params);
    $del->execute();
    $removed = $del->affected_rows;
    $del->close();

    $conn->commit();

    $msg = "Product removed from inventory";
    if ($billCount > 0) {
        $msg .= " ({$billCount} purchase bill" . ($billCount === 1 ? "" : "s") . " kept as history)";
    }
    echo json_encode(['success' => true, 'message' => $msg, 'removed' => $removed]);
} catch (Throwable $e) {
    $conn->rollback();
    pbRespond(500, ['error' => 'Could not delete: ' . $e->getMessage()]);
}