<?php
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

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

$company  = isset($_GET['company']) ? trim($_GET['company']) : '';
$product  = isset($_GET['product']) ? trim($_GET['product']) : '';
$invoice  = isset($_GET['invoice']) ? trim($_GET['invoice']) : '';
$dateFrom = isset($_GET['date_from']) ? trim($_GET['date_from']) : '';
$dateTo   = isset($_GET['date_to']) ? trim($_GET['date_to']) : '';

$where = [];
$params = [];
$types = '';

if ($effectiveBranch !== null) {
    $where[] = "pb.branch_id = ?";
    $params[] = $effectiveBranch;
    $types .= 'i';
}
if ($company !== '') {
    $where[] = "pb.company_name LIKE ?";
    $params[] = "%$company%";
    $types .= 's';
}
if ($invoice !== '') {
    $where[] = "pb.invoice_no LIKE ?";
    $params[] = "%$invoice%";
    $types .= 's';
}
if ($dateFrom !== '') {
    $where[] = "pb.bill_date >= ?";
    $params[] = $dateFrom;
    $types .= 's';
}
if ($dateTo !== '') {
    $where[] = "pb.bill_date <= ?";
    $params[] = $dateTo;
    $types .= 's';
}
if ($product !== '') {
    $where[] = "EXISTS (SELECT 1 FROM purchase_bill_items pbi WHERE pbi.purchase_bill_id = pb.id AND (pbi.product_name LIKE ? OR pbi.product_id LIKE ?))";
    $params[] = "%$product%";
    $params[] = "%$product%";
    $types .= 'ss';
}

$whereSql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

$sql = "SELECT pb.* FROM purchase_bills pb $whereSql ORDER BY pb.bill_date DESC, pb.id DESC";

if (count($params) > 0) {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    $result = $conn->query($sql);
}

$bills = [];
$billIds = [];
while ($row = $result->fetch_assoc()) {
    $row['items'] = [];
    $bills[$row['id']] = $row;
    $billIds[] = (int)$row['id'];
}

if (count($billIds) > 0) {
    $placeholders = implode(',', array_fill(0, count($billIds), '?'));
    $itemSql = "SELECT * FROM purchase_bill_items WHERE purchase_bill_id IN ($placeholders) ORDER BY id ASC";
    $itemStmt = $conn->prepare($itemSql);
    $itemTypes = str_repeat('i', count($billIds));
    $itemStmt->bind_param($itemTypes, ...$billIds);
    $itemStmt->execute();
    $itemResult = $itemStmt->get_result();
    while ($itemRow = $itemResult->fetch_assoc()) {
        $bIdKey = (int)$itemRow['purchase_bill_id'];
        if (isset($bills[$bIdKey])) {
            $bills[$bIdKey]['items'][] = $itemRow;
        }
    }
}

// Later payments + branch name for each bill
if (count($billIds) > 0) {
    require_once __DIR__ . '/purchase_common.php';
    pbEnsurePaymentsTable($conn);
    $payStmt = $conn->prepare(
        "SELECT id, purchase_bill_id, amount, payment_date, note
           FROM purchase_bill_payments
          WHERE purchase_bill_id IN ($placeholders)
          ORDER BY payment_date ASC, id ASC"
    );
    $payStmt->bind_param($itemTypes, ...$billIds);
    $payStmt->execute();
    $payResult = $payStmt->get_result();
    while ($p = $payResult->fetch_assoc()) {
        $k = (int)$p['purchase_bill_id'];
        if (isset($bills[$k])) $bills[$k]['payments'][] = $p;
    }
    $branchNames = [];
    $bRes = $conn->query("SELECT id, name FROM branches");
    while ($b = $bRes->fetch_assoc()) $branchNames[(int)$b['id']] = $b['name'];
    foreach ($bills as &$b) {
        $b['payments']    = $b['payments'] ?? [];
        $b['branch_name'] = $branchNames[(int)$b['branch_id']] ?? null;
    }
    unset($b);
}

echo json_encode(array_values($bills));
$conn->close();
?>