<?php
// ============================================================
//  save_invoice.php  –  Insert or Update invoice + line items
//  Also auto-creates or links a client record by phone number
// ============================================================

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

if (isset($_GET['next_no'])) {
    $res = $conn->query("SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1");
    $row = $res->fetch_assoc();
    if ($row && preg_match('/(\d+)$/', $row['invoice_no'], $m)) {
        $next = str_pad((int)$m[1] + 1, 3, '0', STR_PAD_LEFT);
    } else {
        $next = '001';
    }
    echo json_encode(['next_no' => "BFCWS-{$next}"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

if (empty($data['invoice_no']) || empty($data['invoice_date']) || empty($data['buyer_name'])) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'invoice_no, invoice_date and buyer_name are required']);
    exit;
}
if (empty($data['items']) || !is_array($data['items'])) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'At least one item is required']);
    exit;
}

// ── Branch resolution ─────────────────────────────────────────
//  Admin in "All Branches" mode → X-Branch-ID header → first item's branch
//  "All Branch" invoice (admin) → branch_id = NULL
if ($authUser['role'] === 'admin' && !empty($data['all_branch'])) {
    $branch_id = null;
} elseif ($authUser['role'] === 'admin') {
    $branch_id = $authUser['view_branch_id'] ?? null;
    if (!$branch_id && !empty($_SERVER['HTTP_X_BRANCH_ID'])) {
        $branch_id = (int) $_SERVER['HTTP_X_BRANCH_ID'];
    }
    // first row that has a specific branch
    if (!$branch_id) {
        foreach ($data['items'] as $it) {
            if (!empty($it['branch_id'])) { $branch_id = (int) $it['branch_id']; break; }
        }
    }
} else {
    $branch_id = $authUser['branch_id'] ?? null;
}
$branch_id = $branch_id ? (int) $branch_id : null;

// ── Helpers ───────────────────────────────────────────────────
$s = fn($k) => isset($data[$k]) && $data[$k] !== '' ? (string)$data[$k] : null;
$f = fn($k) => isset($data[$k]) && $data[$k] !== '' ? floatval($data[$k]) : 0.0;
$d = fn($k) => !empty($data[$k]) ? $data[$k] : null;

// ── Collect all values ────────────────────────────────────────
$copy_type            = $s('copy_type');
$payment_mode         = $s('payment_mode');
$gst_rate             = $f('gst_rate') ?: 18;
$invoice_no           = $s('invoice_no');
$invoice_date         = $data['invoice_date'];
$reference_no         = $s('reference_no');
$buyers_order_no      = $s('buyers_order_no');
$dated                = $d('dated');
$dispatch_doc_no      = $s('dispatch_doc_no');
$delivery_note_date   = $d('delivery_note_date');
$dispatched_through   = $s('dispatched_through');
$destination          = $s('destination');
$bill_of_lading       = $s('bill_of_lading');
$motor_vehicle_no     = $s('motor_vehicle_no');
$eway_required        = $s('eway_required');
$eway_number          = $s('eway_number');
$consignee_name       = $s('consignee_name');
$consignee_address    = $s('consignee_address');
$consignee_state      = $s('consignee_state');
$consignee_state_code = $s('consignee_state_code');
$buyer_name           = $s('buyer_name');
$buyer_address        = $s('buyer_address');
$buyer_phone          = $s('buyer_phone');
$buyer_gst            = $s('buyer_gst');
$buyer_state          = $s('buyer_state');
$buyer_state_code     = $s('buyer_state_code');
$subtotal             = $f('subtotal');
$cgst_rate            = $f('cgst_rate');
$cgst_amount          = $f('cgst_amount');
$sgst_rate            = $f('sgst_rate');
$sgst_amount          = $f('sgst_amount');
$total_tax            = $f('total_tax');
$round_off            = $f('round_off');
$net_amount           = $f('net_amount');
$open_balance         = $f('open_balance');
$paid_amount          = $f('paid_amount');   // Balance Tracking → Paid Amount
$closing_balance      = $f('closing_balance');
$bank_holder_name     = $s('bank_holder_name');
$bank_name            = $s('bank_name');
$bank_account_no      = $s('bank_account_no');
$bank_ifsc            = $s('bank_ifsc');
$bank_branch          = $s('bank_branch');

// Does invoice_items have a branch_id column? (older DBs may not)
$itemsHaveBranch = (bool) $conn->query("SHOW COLUMNS FROM invoice_items LIKE 'branch_id'")->num_rows;

// Balance Tracking → Paid Amount (column added once; MySQL 5.7+ and MariaDB)
$paidCol = $conn->query("SHOW COLUMNS FROM invoices LIKE 'paid_amount'");
if ($paidCol && $paidCol->num_rows === 0) {
    $conn->query("ALTER TABLE invoices ADD COLUMN paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00");
}

$conn->begin_transaction();

try {
    // ── Step 1: Auto-create or find client by phone ──────────
    // Phone is the customer key: keep the last 10 digits only
    if ($buyer_phone) {
        $buyer_phone = preg_replace('/\D/', '', $buyer_phone);
        if (strlen($buyer_phone) > 10) $buyer_phone = substr($buyer_phone, -10);
    }

    $client_id = null;
    if ($buyer_phone) {
        // Match by phone within this branch, or an older row with no branch
        if ($branch_id === null) {
            $cChk = $conn->prepare("SELECT id FROM clients WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ? ORDER BY id ASC LIMIT 1");
            $cChk->bind_param('s', $buyer_phone);
        } else {
            $cChk = $conn->prepare("
                SELECT id FROM clients
                 WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ? AND (branch_id = ? OR branch_id IS NULL)
                 ORDER BY (branch_id = ?) DESC, id ASC LIMIT 1
            ");
            $cChk->bind_param('sii', $buyer_phone, $branch_id, $branch_id);
        }
        $cChk->execute();
        $existingClient = $cChk->get_result()->fetch_assoc();
        $cChk->close();

        if ($existingClient) {
            $client_id = (int) $existingClient['id'];
            $cUpd = $conn->prepare("
                UPDATE clients
                   SET name  = COALESCE(NULLIF(?, ''), name),
                       phone = COALESCE(NULLIF(?, ''), phone),
                       address = COALESCE(NULLIF(?, ''), address),
                       gst   = COALESCE(NULLIF(?, ''), gst),
                       branch_id = COALESCE(branch_id, ?)
                 WHERE id = ?
            ");
            $cUpd->bind_param('ssssii', $buyer_name, $buyer_phone, $buyer_address, $buyer_gst, $branch_id, $client_id);
            $cUpd->execute();
            $cUpd->close();
        } else {
            $cIns = $conn->prepare("INSERT INTO clients (name, phone, address, gst, branch_id) VALUES (?,?,?,?,?)");
            $cIns->bind_param('ssssi', $buyer_name, $buyer_phone, $buyer_address, $buyer_gst, $branch_id);
            $cIns->execute();
            $client_id = (int) $conn->insert_id;
            $cIns->close();
        }
    }

    // ── Step 2: Insert or update invoice ─────────────────────
    $chk = $conn->prepare("SELECT id FROM invoices WHERE invoice_no = ?");
    $chk->bind_param('s', $invoice_no);
    $chk->execute();
    $existing = $chk->get_result()->fetch_assoc();
    $chk->close();

    if ($existing) {
        $invoice_id = (int) $existing['id'];

        $stmt = $conn->prepare("
            UPDATE invoices SET
                copy_type=?, payment_mode=?, gst_rate=?,
                invoice_date=?, reference_no=?, buyers_order_no=?, dated=?,
                dispatch_doc_no=?, delivery_note_date=?, dispatched_through=?, destination=?,
                bill_of_lading=?, motor_vehicle_no=?, eway_required=?, eway_number=?,
                consignee_name=?, consignee_address=?, consignee_state=?, consignee_state_code=?,
                buyer_name=?, buyer_address=?, buyer_phone=?, buyer_gst=?, buyer_state=?, buyer_state_code=?,
                subtotal=?, cgst_rate=?, cgst_amount=?, sgst_rate=?, sgst_amount=?,
                total_tax=?, round_off=?, net_amount=?,
                open_balance=?, closing_balance=?,
                bank_holder_name=?, bank_name=?, bank_account_no=?, bank_ifsc=?, bank_branch=?,
                client_id=COALESCE(?, client_id),
                branch_id=COALESCE(branch_id, ?)
            WHERE id=?
        ");
        if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);

        // 2 s + 1 d + 22 s + 10 d + 5 s + 3 i  = 43
        $types = 'ssd' . str_repeat('s', 22) . str_repeat('d', 10) . str_repeat('s', 5) . 'iii';
        $stmt->bind_param(
            $types,
            $copy_type, $payment_mode, $gst_rate,
            $invoice_date, $reference_no, $buyers_order_no, $dated,
            $dispatch_doc_no, $delivery_note_date, $dispatched_through, $destination,
            $bill_of_lading, $motor_vehicle_no, $eway_required, $eway_number,
            $consignee_name, $consignee_address, $consignee_state, $consignee_state_code,
            $buyer_name, $buyer_address, $buyer_phone, $buyer_gst, $buyer_state, $buyer_state_code,
            $subtotal, $cgst_rate, $cgst_amount, $sgst_rate, $sgst_amount,
            $total_tax, $round_off, $net_amount,
            $open_balance, $closing_balance,
            $bank_holder_name, $bank_name, $bank_account_no, $bank_ifsc, $bank_branch,
            $client_id, $branch_id, $invoice_id
        );
        if (!$stmt->execute()) throw new Exception('Update failed: ' . $stmt->error);
        $stmt->close();

        $conn->query("DELETE FROM invoice_items WHERE invoice_id = $invoice_id");
        $action = 'updated';

    } else {
        $stmt = $conn->prepare("
            INSERT INTO invoices (
                copy_type, payment_mode, gst_rate,
                invoice_no, invoice_date, reference_no, buyers_order_no, dated,
                dispatch_doc_no, delivery_note_date, dispatched_through, destination,
                bill_of_lading, motor_vehicle_no, eway_required, eway_number,
                consignee_name, consignee_address, consignee_state, consignee_state_code,
                buyer_name, buyer_address, buyer_phone, buyer_gst, buyer_state, buyer_state_code,
                subtotal, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                total_tax, round_off, net_amount,
                open_balance, closing_balance,
                bank_holder_name, bank_name, bank_account_no, bank_ifsc, bank_branch,
                branch_id, client_id
            ) VALUES (
                ?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,
                ?,?,?,?,?, ?,?,?, ?,?, ?,?,?,?,?, ?,?
            )
        ");
        if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);

        // 2 s + 1 d + 23 s + 10 d + 5 s + 2 i = 43
        $types = 'ssd' . str_repeat('s', 23) . str_repeat('d', 10) . str_repeat('s', 5) . 'ii';
        $stmt->bind_param(
            $types,
            $copy_type, $payment_mode, $gst_rate,
            $invoice_no, $invoice_date, $reference_no, $buyers_order_no, $dated,
            $dispatch_doc_no, $delivery_note_date, $dispatched_through, $destination,
            $bill_of_lading, $motor_vehicle_no, $eway_required, $eway_number,
            $consignee_name, $consignee_address, $consignee_state, $consignee_state_code,
            $buyer_name, $buyer_address, $buyer_phone, $buyer_gst, $buyer_state, $buyer_state_code,
            $subtotal, $cgst_rate, $cgst_amount, $sgst_rate, $sgst_amount,
            $total_tax, $round_off, $net_amount,
            $open_balance, $closing_balance,
            $bank_holder_name, $bank_name, $bank_account_no, $bank_ifsc, $bank_branch,
            $branch_id, $client_id
        );
        if (!$stmt->execute()) throw new Exception($stmt->error);

        $invoice_id = (int) $conn->insert_id;
        $stmt->close();
        $action = 'created';
    }

    // Balance Tracking → Paid Amount (kept separate from the statements above)
    $pStmt = $conn->prepare("UPDATE invoices SET paid_amount = ? WHERE id = ?");
    $pStmt->bind_param('di', $paid_amount, $invoice_id);
    $pStmt->execute();
    $pStmt->close();

    // ── Step 3: Insert line items ────────────────────────────
    if ($itemsHaveBranch) {
        $iStmt = $conn->prepare("
            INSERT INTO invoice_items (invoice_id, description, hsn, qty, per, rate_incl, rate_excl, taxable_amt, branch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
    } else {
        $iStmt = $conn->prepare("
            INSERT INTO invoice_items (invoice_id, description, hsn, qty, per, rate_incl, rate_excl, taxable_amt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
    }
    if (!$iStmt) throw new Exception('Prepare items failed: ' . $conn->error);

    foreach ($data['items'] as $item) {
        $desc      = trim((string) ($item['desc'] ?? ''));
        $hsn       = trim((string) ($item['hsn'] ?? ''));
        $qty       = floatval($item['qty'] ?? 0);
        $per       = trim((string) ($item['per'] ?? 'NOS'));
        $rate_incl = floatval($item['rateIncl'] ?? 0);
        $rate_excl = floatval($item['rateExcl'] ?? 0);
        $taxable   = floatval($item['taxableAmt'] ?? ($rate_excl * $qty));
        // "All Branch" row (new Tax Invoice page sends branch_id = null) stays NULL
        $item_br   = !empty($item['branch_id'])
            ? (int) $item['branch_id']
            : ($authUser['role'] === 'admin' && isset($data['all_branch']) && array_key_exists('branch_id', $item) ? null : $branch_id);

        if (!$desc || $qty <= 0) continue;

        if ($itemsHaveBranch) {
            $iStmt->bind_param('issdsdddi', $invoice_id, $desc, $hsn, $qty, $per, $rate_incl, $rate_excl, $taxable, $item_br);
        } else {
            $iStmt->bind_param('issdsddd', $invoice_id, $desc, $hsn, $qty, $per, $rate_incl, $rate_excl, $taxable);
        }
        if (!$iStmt->execute()) throw new Exception('Item insert failed: ' . $iStmt->error);
    }
    $iStmt->close();

    $conn->commit();

    http_response_code($action === 'created' ? 201 : 200);
    echo json_encode([
        'success'   => true,
        'message'   => "Invoice $action successfully",
        'id'        => $invoice_id,
        'client_id' => $client_id,
        'branch_id' => $branch_id,
        'action'    => $action,
    ]);

} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

$conn->close();