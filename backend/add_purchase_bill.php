<?php
// =============================================================
//  add_purchase_bill.php
//  Now records supplier_phone, paid_amount, GST fields, and
//  auto-links the bill to a client/party by phone number so the
//  Client page can net sales against purchases.
// =============================================================

error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');

require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/purchase_common.php';

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
    echo json_encode(['message' => 'Please select a specific branch to add purchase bills.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid JSON']);
    exit;
}

$company_name    = trim($data['company_name'] ?? '');
$supplier_phone  = preg_replace('/\D/', '', (string)($data['supplier_phone'] ?? ''));
if (strlen($supplier_phone) > 10) $supplier_phone = substr($supplier_phone, -10); // phone key = last 10 digits
$invoice_no      = trim($data['invoice_no'] ?? '');
$bill_date       = trim($data['bill_date'] ?? '');
$notes           = trim($data['notes'] ?? '');
$paid_amount     = (float)($data['paid_amount'] ?? 0);
$opening_balance = (float)($data['opening_balance'] ?? 0);
$gst_enabled     = !empty($data['gst_enabled']) ? 1 : 0;
$gst_rate        = (float)($data['gst_rate'] ?? 18);
$items           = $data['items'] ?? [];

// Invoice number is optional — the phone number identifies the customer
if (empty($company_name) || empty($bill_date) || !is_array($items) || count($items) === 0) {
    http_response_code(400);
    echo json_encode(['message' => 'Company name, date and at least one product item are required']);
    exit;
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $bill_date)) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid date format. Use YYYY-MM-DD']);
    exit;
}

$subtotal   = 0.0;
$cleanItems = [];

foreach ($items as $idx => $item) {
    $pid   = trim($item['product_id'] ?? '');
    $pname = trim($item['product_name'] ?? '');
    $qty   = (float)($item['quantity'] ?? 0);
    $rate  = (float)($item['rate'] ?? 0);

    if ($pid === '' || $pname === '' || $qty <= 0 || $rate < 0) {
        http_response_code(400);
        echo json_encode(['message' => "Item #" . ($idx + 1) . ": product ID, name and valid quantity/rate are required"]);
        exit;
    }

    $amount    = $qty * $rate;
    $subtotal += $amount;

    $cleanItems[] = [
        'product_id'   => $pid,
        'product_name' => $pname,
        'quantity'     => $qty,
        'rate'         => $rate,
        'amount'       => $amount,
    ];
}

// GST on top of the item subtotal, then any opening balance carried forward
$gst_amount   = $gst_enabled ? ($subtotal * $gst_rate / 100) : 0.0;
$total_amount = $subtotal + $gst_amount + $opening_balance;

$conn = getDB();
$conn->begin_transaction();

try {
    // ── Link to customer: phone → invoice no → name ───────────
    $client_id = pbLinkParty($conn, $company_name, $supplier_phone, $branchId, $invoice_no);

    $stmt = $conn->prepare(
        "INSERT INTO purchase_bills
            (company_name, supplier_phone, invoice_no, bill_date, total_amount,
             paid_amount, opening_balance, gst_enabled, gst_rate, notes, branch_id, client_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param(
        'ssssdddidsii',
        $company_name, $supplier_phone, $invoice_no, $bill_date, $total_amount,
        $paid_amount, $opening_balance, $gst_enabled, $gst_rate, $notes, $branchId, $client_id
    );
    $stmt->execute();
    $billId = (int)$conn->insert_id;
    $stmt->close();

    $itemStmt = $conn->prepare(
        "INSERT INTO purchase_bill_items
            (purchase_bill_id, product_id, product_name, quantity, rate, amount, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    $stockSelectStmt = $conn->prepare(
        "SELECT current_stock, total_purchased FROM purchase_stock WHERE product_id = ? AND branch_id = ?"
    );

    $stockUpdateStmt = $conn->prepare(
        "UPDATE purchase_stock
            SET total_purchased = total_purchased + ?,
                current_stock    = current_stock + ?,
                rate             = ?,
                product_name     = ?
          WHERE product_id = ? AND branch_id = ?"
    );

    $stockInsertStmt = $conn->prepare(
        "INSERT INTO purchase_stock
            (product_id, product_name, total_purchased, current_stock, rate, branch_id)
         VALUES (?, ?, ?, ?, ?, ?)"
    );

    foreach ($cleanItems as $item) {
        $pid    = $item['product_id'];
        $pname  = $item['product_name'];
        $qty    = $item['quantity'];
        $rate   = $item['rate'];
        $amount = $item['amount'];

        $itemStmt->bind_param('issdddi', $billId, $pid, $pname, $qty, $rate, $amount, $branchId);
        $itemStmt->execute();

        $stockSelectStmt->bind_param('si', $pid, $branchId);
        $stockSelectStmt->execute();
        $stockRow = $stockSelectStmt->get_result()->fetch_assoc();

        if ($stockRow) {
            $stockUpdateStmt->bind_param('dddssi', $qty, $qty, $rate, $pname, $pid, $branchId);
            $stockUpdateStmt->execute();
        } else {
            $stockInsertStmt->bind_param('ssdddi', $pid, $pname, $qty, $qty, $rate, $branchId);
            $stockInsertStmt->execute();
        }
    }

    $itemStmt->close();
    $stockSelectStmt->close();
    $stockUpdateStmt->close();
    $stockInsertStmt->close();

    $conn->commit();
    echo json_encode([
        'message'      => 'Purchase bill saved successfully',
        'bill_id'      => $billId,
        'client_id'    => $client_id,
        'total_amount' => round($total_amount, 2),
    ]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
}

$conn->close();