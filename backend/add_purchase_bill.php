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

// null = "All Branches" selected → the bill is saved without a branch
$branchId = getEffectiveBranchId($authUser);


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
    $pid   = trim($item['product_id'] ?? '');   // internal id (only sent when editing / old clients)
    $hsn   = array_key_exists('hsn', $item) ? trim((string)$item['hsn']) : $pid; // old clients: the typed code was the HSN
    $pname = trim($item['product_name'] ?? '');
    $qty   = (float)($item['quantity'] ?? 0);
    $rate  = (float)($item['rate'] ?? 0);

    if ($pname === '' || $qty <= 0 || $rate < 0) {
        http_response_code(400);
        echo json_encode(['message' => "Item #" . ($idx + 1) . ": product name and valid quantity/rate are required"]);
        exit;
    }

    $amount    = $qty * $rate;
    $subtotal += $amount;

    $cleanItems[] = [
        'item_raw'     => $item,
        'product_id'   => $pid,
        'hsn'          => $hsn,
        'product_name' => $pname,
        'quantity'     => $qty,
        'rate'         => $rate,
        'amount'       => $amount,
    ];
}

// GST on top of the item subtotal, then any opening balance carried forward
$gst_amount   = $gst_enabled ? ($subtotal * $gst_rate / 100) : 0.0;

// Round off applies to the bill amount (subtotal + GST), not the opening balance
[$round_off_mode, $round_off] = pbRoundOff(
    (string)($data['round_off_mode'] ?? 'none'),
    $data['round_off'] ?? null,
    $subtotal + $gst_amount
);
$total_amount = round($subtotal + $gst_amount + $round_off + $opening_balance, 2);

$conn = getDB();
pbEnsureRoundOffColumns($conn);
pbEnsureNullableBranch($conn);
pbEnsureHsnColumns($conn);
pbEnsureGstTypeColumn($conn);
$gst_type = (($data['gst_type'] ?? '') === 'igst') ? 'igst' : 'cgst_sgst';
// each product row can go to All Branch (NULL) or one chosen branch
foreach ($cleanItems as $k => $ci) {
    $cleanItems[$k]['branch'] = pbItemBranch($conn, $ci['item_raw'], $authUser, $branchId);
}
$conn->begin_transaction();

try {
    // ── Link to customer: phone → invoice no → name ───────────
    $client_id = pbLinkParty($conn, $company_name, $supplier_phone, $branchId, $invoice_no);

    $stmt = $conn->prepare(
        "INSERT INTO purchase_bills
            (company_name, supplier_phone, invoice_no, bill_date, total_amount,
             paid_amount, opening_balance, gst_enabled, gst_rate, notes, branch_id, client_id,
             round_off_mode, round_off)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param(
        'ssssdddidsiisd',
        $company_name, $supplier_phone, $invoice_no, $bill_date, $total_amount,
        $paid_amount, $opening_balance, $gst_enabled, $gst_rate, $notes, $branchId, $client_id,
        $round_off_mode, $round_off
    );
    $stmt->execute();
    $billId = (int)$conn->insert_id;
    $gtS = $conn->prepare("UPDATE purchase_bills SET gst_type = ? WHERE id = ?");
    $gtS->bind_param('si', $gst_type, $billId);
    $gtS->execute();
    $gtS->close();
    $stmt->close();

    $itemStmt = $conn->prepare(
        "INSERT INTO purchase_bill_items
            (purchase_bill_id, product_id, product_name, quantity, rate, amount, branch_id, hsn)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''))"
    );

    $stockSelectStmt = $conn->prepare(
        "SELECT current_stock, total_purchased FROM purchase_stock WHERE product_id = ? AND branch_id <=> ?"
    );

    $stockUpdateStmt = $conn->prepare(
        "UPDATE purchase_stock
            SET total_purchased = total_purchased + ?,
                current_stock    = current_stock + ?,
                rate             = ?,
                product_name     = IF(COALESCE(product_name,'') = '', ?, product_name),
                hsn              = IF(? <> '', ?, hsn)
          WHERE product_id = ? AND branch_id <=> ?"
    );

    $stockInsertStmt = $conn->prepare(
        "INSERT INTO purchase_stock
            (product_id, product_name, hsn, total_purchased, current_stock, rate, branch_id)
         VALUES (?, ?, NULLIF(?, ''), ?, ?, ?, ?)"
    );

    foreach ($cleanItems as $item) {
        $pname  = $item['product_name'];
        // same code but different product name = a different product (see purchase_common.php)
        $hsn    = $item['hsn'];
        $pid    = pbPickProductId($conn, $item['product_id'], $pname, $hsn);
        $pname  = pbCanonicalName($conn, $pid, $pname);   // existing product → its own spelling
        $qty    = $item['quantity'];
        $rate   = $item['rate'];
        $amount = $item['amount'];

        $ib     = $item['branch'];
        $itemStmt->bind_param('issdddis', $billId, $pid, $pname, $qty, $rate, $amount, $ib, $hsn);
        $itemStmt->execute();

        $stockSelectStmt->bind_param('si', $pid, $ib);
        $stockSelectStmt->execute();
        $stockRow = $stockSelectStmt->get_result()->fetch_assoc();

        if ($stockRow) {
            $stockUpdateStmt->bind_param('dddssssi', $qty, $qty, $rate, $pname, $hsn, $hsn, $pid, $ib);
            $stockUpdateStmt->execute();
        } else {
            $stockInsertStmt->bind_param('sssdddi', $pid, $pname, $hsn, $qty, $qty, $rate, $ib);
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
        'round_off'    => $round_off,
    ]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
}

$conn->close();