<?php
// =============================================================
//  delete_purchase_bill.php — admin deletes a purchase bill
//  POST { bill_id }   → stock added by the bill is reversed
// =============================================================
header('Content-Type: application/json');
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/purchase_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') pbRespond(405, ['message' => 'Method not allowed']);
if ($authUser['role'] !== 'admin') pbRespond(403, ['message' => 'Only admin can delete purchase bills']);

$data   = json_decode(file_get_contents('php://input'), true) ?: [];
$billId = (int)($data['bill_id'] ?? 0);
if (!$billId) pbRespond(400, ['message' => 'bill_id is required']);

$conn = getDB();
$bill = pbLoadBill($conn, $billId, $authUser);
pbEnsurePaymentsTable($conn);

$conn->begin_transaction();
try {
    $st = $conn->prepare("SELECT product_id, product_name, quantity, rate FROM purchase_bill_items WHERE purchase_bill_id = ?");
    $st->bind_param('i', $billId);
    $st->execute();
    $items = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    pbApplyStock($conn, $items, (int)$bill['branch_id'], -1);

    foreach (['purchase_bill_items', 'purchase_bill_payments'] as $t) {
        $st = $conn->prepare("DELETE FROM $t WHERE purchase_bill_id = ?");
        $st->bind_param('i', $billId);
        $st->execute();
        $st->close();
    }
    $st = $conn->prepare("DELETE FROM purchase_bills WHERE id = ?");
    $st->bind_param('i', $billId);
    $st->execute();
    $st->close();

    $conn->commit();
    $label = $bill['invoice_no'] !== '' ? $bill['invoice_no'] : $bill['company_name'];
    echo json_encode(['message' => "Bill {$label} deleted and stock reversed"]);
} catch (Throwable $e) {
    $conn->rollback();
    pbRespond(500, ['message' => 'Error: ' . $e->getMessage()]);
}