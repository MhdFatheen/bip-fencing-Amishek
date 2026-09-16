<?php
// =============================================================
//  add_purchase_payment.php — record a later payment on a bill
//  POST { bill_id, amount, payment_date, note }
// =============================================================
header('Content-Type: application/json');
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/purchase_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') pbRespond(405, ['message' => 'Method not allowed']);

$data   = json_decode(file_get_contents('php://input'), true) ?: [];
$billId = (int)($data['bill_id'] ?? 0);
$amount = round((float)($data['amount'] ?? 0), 2);
$date   = trim($data['payment_date'] ?? '') ?: date('Y-m-d');
$note   = trim($data['note'] ?? '');

if (!$billId) pbRespond(400, ['message' => 'bill_id is required']);
if ($amount <= 0) pbRespond(400, ['message' => 'Enter a valid payment amount']);
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) pbRespond(400, ['message' => 'Invalid date format. Use YYYY-MM-DD']);

$conn = getDB();
$bill = pbLoadBill($conn, $billId, $authUser);
pbEnsurePaymentsTable($conn);

$balance = round((float)$bill['total_amount'] - (float)$bill['paid_amount'], 2);
if ($amount > $balance) {
    pbRespond(400, ['message' => "Payment is more than the balance (₹" . number_format($balance, 2) . ")"]);
}

$conn->begin_transaction();
try {
    $branchId = (int)$bill['branch_id'];
    $st = $conn->prepare(
        "INSERT INTO purchase_bill_payments (purchase_bill_id, amount, payment_date, note, branch_id)
         VALUES (?, ?, ?, ?, ?)"
    );
    $st->bind_param('idssi', $billId, $amount, $date, $note, $branchId);
    $st->execute();
    $st->close();

    $st = $conn->prepare("UPDATE purchase_bills SET paid_amount = paid_amount + ? WHERE id = ?");
    $st->bind_param('di', $amount, $billId);
    $st->execute();
    $st->close();

    $conn->commit();
    echo json_encode([
        'message' => 'Payment recorded',
        'balance' => round($balance - $amount, 2),
    ]);
} catch (Throwable $e) {
    $conn->rollback();
    pbRespond(500, ['message' => 'Error: ' . $e->getMessage()]);
}