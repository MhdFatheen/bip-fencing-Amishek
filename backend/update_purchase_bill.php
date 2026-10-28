<?php
// =============================================================
//  update_purchase_bill.php — admin edits a purchase bill
//  POST { bill_id, company_name, supplier_phone, invoice_no, bill_date,
//         notes, gst_enabled, gst_rate, opening_balance, paid_amount, items[] }
//  • Old stock is reversed, new stock added
//  • Party re-linked by phone (same phone = same customer)
// =============================================================
header('Content-Type: application/json');
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/purchase_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') pbRespond(405, ['message' => 'Method not allowed']);
if ($authUser['role'] !== 'admin') pbRespond(403, ['message' => 'Only admin can edit purchase bills']);

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) pbRespond(400, ['message' => 'Invalid JSON']);

$billId          = (int)($data['bill_id'] ?? 0);
$company_name    = trim($data['company_name'] ?? '');
$supplier_phone  = pbPhoneKey($data['supplier_phone'] ?? '');
$invoice_no      = trim($data['invoice_no'] ?? '');
$bill_date       = trim($data['bill_date'] ?? '');
$notes           = trim($data['notes'] ?? '');
$paid_amount     = (float)($data['paid_amount'] ?? 0);
$opening_balance = (float)($data['opening_balance'] ?? 0);
$gst_enabled     = !empty($data['gst_enabled']) ? 1 : 0;
$gst_rate        = (float)($data['gst_rate'] ?? 18);
$items           = $data['items'] ?? [];

if (!$billId) pbRespond(400, ['message' => 'bill_id is required']);
// Invoice number is optional — the phone number identifies the customer
if ($company_name === '' || $bill_date === '' || !is_array($items) || !count($items)) {
    pbRespond(400, ['message' => 'Company name, date and at least one product item are required']);
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $bill_date)) pbRespond(400, ['message' => 'Invalid date format. Use YYYY-MM-DD']);

$subtotal = 0.0;
$clean = [];
foreach ($items as $i => $it) {
    $pid  = trim($it['product_id'] ?? '');
    $name = trim($it['product_name'] ?? '');
    $qty  = (float)($it['quantity'] ?? 0);
    $rate = (float)($it['rate'] ?? 0);
    if ($pid === '' || $name === '' || $qty <= 0 || $rate < 0) {
        pbRespond(400, ['message' => 'Item #' . ($i + 1) . ': product ID, name, quantity and rate are required']);
    }
    $amount = $qty * $rate;
    $subtotal += $amount;
    $clean[] = ['product_id' => $pid, 'product_name' => $name, 'quantity' => $qty, 'rate' => $rate, 'amount' => $amount];
}
$gst_amount   = $gst_enabled ? $subtotal * $gst_rate / 100 : 0.0;

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
$bill = pbLoadBill($conn, $billId, $authUser);
$branchId = $bill['branch_id'] === null ? null : (int)$bill['branch_id']; // null = All Branch

$conn->begin_transaction();
try {
    // 1) Reverse the old items' stock, then remove them
    $st = $conn->prepare("SELECT product_id, product_name, quantity, rate FROM purchase_bill_items WHERE purchase_bill_id = ?");
    $st->bind_param('i', $billId);
    $st->execute();
    $oldItems = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    pbApplyStock($conn, $oldItems, $branchId, -1);

    $st = $conn->prepare("DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?");
    $st->bind_param('i', $billId);
    $st->execute();
    $st->close();

    // 2) Re-link customer: phone → invoice no → name
    $client_id = pbLinkParty($conn, $company_name, $supplier_phone, $branchId, $invoice_no);

    // 3) Update header
    $st = $conn->prepare(
        "UPDATE purchase_bills
            SET company_name=?, supplier_phone=?, invoice_no=?, bill_date=?, total_amount=?,
                paid_amount=?, opening_balance=?, gst_enabled=?, gst_rate=?, notes=?, client_id=?,
                round_off_mode=?, round_off=?
          WHERE id=?"
    );
    $st->bind_param('ssssdddidsisdi',
        $company_name, $supplier_phone, $invoice_no, $bill_date, $total_amount,
        $paid_amount, $opening_balance, $gst_enabled, $gst_rate, $notes, $client_id,
        $round_off_mode, $round_off, $billId);
    $st->execute();
    $st->close();

    // 4) Insert new items + add their stock
    $ins = $conn->prepare(
        "INSERT INTO purchase_bill_items (purchase_bill_id, product_id, product_name, quantity, rate, amount, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    foreach ($clean as $it) {
        // same code but different product name = a different product (see purchase_common.php)
        $it['product_id'] = pbResolveProductId($conn, $it['product_id'], $it['product_name']);
        $ins->bind_param('issdddi', $billId, $it['product_id'], $it['product_name'],
            $it['quantity'], $it['rate'], $it['amount'], $branchId);
        $ins->execute();
        pbApplyStock($conn, [$it], $branchId, +1);   // one by one so later items see earlier ones
    }
    $ins->close();

    $conn->commit();
    echo json_encode([
        'message'      => 'Purchase bill updated successfully',
        'bill_id'      => $billId,
        'client_id'    => $client_id,
        'total_amount' => round($total_amount, 2),
        'round_off'    => $round_off,
    ]);
} catch (Throwable $e) {
    $conn->rollback();
    pbRespond(500, ['message' => 'Error: ' . $e->getMessage()]);
}