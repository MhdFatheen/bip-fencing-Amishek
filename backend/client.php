<?php
// ============================================================
//  client.php  –  Client / Party management API  (MERGED)
//
//    they_owe  = invoices        - payments received
//    we_owe    = purchase bills  - what we paid - settlements
//    net       = they_owe - we_owe
//
//  GET    /client.php                      → all parties + net balance (+ state, state_code)
//  GET    /client.php?client_id=1          → one party, both sections
//  GET    /client.php?invoice_no=INV-001   → single invoice + items
//  POST   /client.php                      → record a payment received
//  POST   /client.php?action=settle        → settle what WE owe (cash/product)
//  PUT    /client.php                      → update party details
//  DELETE /client.php?client_id=1          → delete a party
//  DELETE /client.php?payment_id=1         → delete one payment
//  DELETE /client.php?settlement_id=1      → delete one settlement
// ============================================================

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

// ── Branch resolution ─────────────────────────────────────────
$branch_id = null;
if ($authUser['role'] === 'admin' && isset($authUser['view_branch_id'])) {
    $branch_id = $authUser['view_branch_id'];
} elseif ($authUser['role'] !== 'admin') {
    $branch_id = $authUser['branch_id'];
}

// ── Helper: phone key = last 10 digits ────────────────────────
//    "+91 98765 43210", "098765-43210" and "9876543210" are all
//    treated as the same customer.
function normPhone(?string $p): string
{
    $d = preg_replace('/\D/', '', (string) $p);
    return strlen($d) > 10 ? substr($d, -10) : $d;
}

// ── Helper: every purchase bill belonging to one party ────────
function purchaseBillsForClient(mysqli $conn, array $client, $branch_id): array
{
    $phone = normPhone($client['phone'] ?? '');
    $name  = trim($client['name'] ?? '');
    $cid   = (int) $client['id'];

    $sql = "
        SELECT id, company_name, supplier_phone, invoice_no, bill_date,
               total_amount, paid_amount, notes
          FROM purchase_bills
         WHERE (
                 client_id = ?
                 OR (? <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(supplier_phone,''), '[^0-9]', ''), 10) = ?)
                 OR (LOWER(TRIM(company_name)) = LOWER(TRIM(?)))
               )
    ";
    $params = [$cid, $phone, $phone, $name];
    $types  = 'isss';

    if ($branch_id !== null) {
        $sql     .= " AND branch_id = ? ";
        $params[] = $branch_id;
        $types   .= 'i';
    }
    $sql .= " ORDER BY bill_date DESC, id DESC";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    return $rows;
}

switch ($method) {

    // ----------------------------------------------------------
    //  GET
    // ----------------------------------------------------------
    case 'GET':

        // ── Single invoice with items ─────────────────────────
        if (!empty($_GET['invoice_no'])) {
            $invoice_no = $_GET['invoice_no'];

            $stmt = $conn->prepare("SELECT * FROM invoices WHERE invoice_no = ?");
            $stmt->bind_param('s', $invoice_no);
            $stmt->execute();
            $invoice = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$invoice) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Invoice not found']);
                exit;
            }

            $invoice_id = (int) $invoice['id'];
            $iStmt = $conn->prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC");
            $iStmt->bind_param('i', $invoice_id);
            $iStmt->execute();
            $invoice['items'] = $iStmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $iStmt->close();

            echo json_encode(['success' => true, 'invoice' => $invoice]);
            break;
        }

        // ── Single party: BOTH sections + net balance ─────────
        if (!empty($_GET['client_id'])) {
            $client_id = (int) $_GET['client_id'];

            $cStmt = $conn->prepare("SELECT * FROM clients WHERE id = ?");
            $cStmt->bind_param('i', $client_id);
            $cStmt->execute();
            $client = $cStmt->get_result()->fetch_assoc();
            $cStmt->close();

            if (!$client) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Client not found']);
                exit;
            }

            // ---- SECTION 1: SALES ---------------------------
            $invStmt = $conn->prepare("
                SELECT id, invoice_no, invoice_date, net_amount, payment_mode
                  FROM invoices
                 WHERE client_id = ?
                    OR (client_id IS NULL AND ? <> ''
                        AND RIGHT(REGEXP_REPLACE(COALESCE(buyer_phone,''), '[^0-9]', ''), 10) = ?)
                 ORDER BY invoice_date DESC, id DESC
            ");
            $clientPhone = normPhone($client['phone'] ?? '');
            $invStmt->bind_param('iss', $client_id, $clientPhone, $clientPhone);
            $invStmt->execute();
            $invoices = $invStmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $invStmt->close();

            $pStmt = $conn->prepare("
                SELECT * FROM client_payments
                 WHERE client_id = ?
                 ORDER BY payment_date DESC, id DESC
            ");
            $pStmt->bind_param('i', $client_id);
            $pStmt->execute();
            $payments = $pStmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $pStmt->close();

            $total_billed = (float) array_sum(array_column($invoices, 'net_amount'));
            $total_paid   = (float) array_sum(array_column($payments, 'amount'));
            $they_owe     = $total_billed - $total_paid;

            // ---- SECTION 2: PURCHASES -----------------------
            $purchases = purchaseBillsForClient($conn, $client, $branch_id);

            $total_purchased = (float) array_sum(array_column($purchases, 'total_amount'));
            $purchase_paid   = (float) array_sum(array_column($purchases, 'paid_amount'));

            $sStmt = $conn->prepare("
                SELECT * FROM party_settlements
                 WHERE client_id = ?
                 ORDER BY settle_date DESC, id DESC
            ");
            $sStmt->bind_param('i', $client_id);
            $sStmt->execute();
            $settlements = $sStmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $sStmt->close();

            $settled = (float) array_sum(array_column($settlements, 'amount'));
            $we_owe  = $total_purchased - $purchase_paid - $settled;

            $net = $they_owe - $we_owe;

            echo json_encode([
                'success' => true,
                'client'  => $client,

                'invoices'        => $invoices,
                'payments'        => $payments,
                'total_billed'    => round($total_billed, 2),
                'total_paid'      => round($total_paid, 2),
                'they_owe'        => round($they_owe, 2),

                'purchases'       => $purchases,
                'settlements'     => $settlements,
                'total_purchased' => round($total_purchased, 2),
                'purchase_paid'   => round($purchase_paid, 2),
                'settled'         => round($settled, 2),
                'we_owe'          => round($we_owe, 2),

                'net_balance'     => round($net, 2),
                'direction'       => $net < 0 ? 'we_owe' : 'they_owe',
                'balance_label'   => $net < 0 ? 'You Owe' : 'Balance Due',
                'balance_amount'  => round(abs($net), 2),
                'pending'         => round($net, 2),
            ]);
            break;
        }

        // ── All parties with netted summary ───────────────────
        //    state / state_code come from the client's latest invoice
        $listSql = "
            SELECT c.id, c.name, c.phone, c.address, c.gst, c.created_at,
                   (SELECT i2.buyer_state FROM invoices i2
                     WHERE i2.client_id = c.id AND COALESCE(i2.buyer_state,'') <> ''
                     ORDER BY i2.id DESC LIMIT 1) AS state,
                   (SELECT i3.buyer_state_code FROM invoices i3
                     WHERE i3.client_id = c.id AND COALESCE(i3.buyer_state_code,'') <> ''
                     ORDER BY i3.id DESC LIMIT 1) AS state_code,
                   COUNT(i.id)          AS total_invoices,
                   MAX(i.invoice_date)  AS last_invoice_date,
                   MAX(i.invoice_no)    AS last_invoice_no,
                   COALESCE(SUM(i.net_amount), 0) AS total_billed,
                   COALESCE((
                       SELECT SUM(p.amount) FROM client_payments p
                        WHERE p.client_id = c.id
                   ), 0) AS total_paid
              FROM clients c
              LEFT JOIN invoices i
                     ON i.client_id = c.id
                     OR (i.client_id IS NULL AND COALESCE(c.phone,'') <> ''
                         AND CONVERT(RIGHT(REGEXP_REPLACE(COALESCE(i.buyer_phone,''), '[^0-9]', ''), 10) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                           = CONVERT(RIGHT(REGEXP_REPLACE(COALESCE(c.phone,''), '[^0-9]', ''), 10) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
        ";

        if ($branch_id !== null) {
            $listSql .= " WHERE (c.branch_id = ? OR c.branch_id IS NULL) ";
        }

        $listSql .= " GROUP BY c.id ORDER BY MAX(i.id) DESC, c.name ASC";

        if ($branch_id !== null) {
            $stmt = $conn->prepare($listSql);
            $stmt->bind_param('i', $branch_id);
            $stmt->execute();
            $clients = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        } else {
            $clients = $conn->query($listSql)->fetch_all(MYSQLI_ASSOC);
        }

        foreach ($clients as &$c) {
            $purchases = purchaseBillsForClient($conn, $c, $branch_id);

            $total_purchased = (float) array_sum(array_column($purchases, 'total_amount'));
            $purchase_paid   = (float) array_sum(array_column($purchases, 'paid_amount'));

            $sStmt = $conn->prepare("SELECT COALESCE(SUM(amount),0) AS s FROM party_settlements WHERE client_id = ?");
            $sStmt->bind_param('i', $c['id']);
            $sStmt->execute();
            $settled = (float) ($sStmt->get_result()->fetch_assoc()['s'] ?? 0);
            $sStmt->close();

            $they_owe = (float) $c['total_billed'] - (float) $c['total_paid'];
            $we_owe   = $total_purchased - $purchase_paid - $settled;
            $net      = $they_owe - $we_owe;

            // Default state when the client has no invoice yet
            $c['state']      = $c['state']      ?: 'Tamil Nadu';
            $c['state_code'] = $c['state_code'] ?: '33';

            $c['total_purchased'] = round($total_purchased, 2);
            $c['purchase_paid']   = round($purchase_paid, 2);
            $c['settled']         = round($settled, 2);
            $c['total_purchases'] = count($purchases);
            $c['they_owe']        = round($they_owe, 2);
            $c['we_owe']          = round($we_owe, 2);
            $c['net_balance']     = round($net, 2);
            $c['direction']       = $net < 0 ? 'we_owe' : 'they_owe';
            $c['balance_label']   = $net < 0 ? 'You Owe' : 'Balance Due';
            $c['balance_amount']  = round(abs($net), 2);
            $c['is_dual_party']   = count($purchases) > 0 && (int) $c['total_invoices'] > 0;
            $c['pending']         = round($net, 2);
        }
        unset($c);

        echo json_encode(['success' => true, 'clients' => $clients]);
        break;

    // ----------------------------------------------------------
    //  POST
    // ----------------------------------------------------------
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);

        // ---- Settle what WE owe (cash or product) -----------
        if (($_GET['action'] ?? '') === 'settle') {

            if (empty($data['client_id']) || empty($data['settle_date'])) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'client_id and settle_date are required']);
                exit;
            }

            $client_id   = (int) $data['client_id'];
            $settle_date = $data['settle_date'];
            $mode        = ($data['mode'] ?? 'cash') === 'product' ? 'product' : 'cash';
            $note        = trim($data['note'] ?? '');

            $conn->begin_transaction();

            try {
                if ($mode === 'product') {
                    $product_id   = trim($data['product_id'] ?? '');
                    $product_name = trim($data['product_name'] ?? '');
                    $quantity     = (float) ($data['quantity'] ?? 0);
                    $rate         = (float) ($data['rate'] ?? 0);

                    if ($product_id === '' || $quantity <= 0) {
                        throw new Exception('Product and a quantity greater than zero are required');
                    }
                    if ($branch_id === null) {
                        throw new Exception('Select a specific branch before settling in product');
                    }

                    $stk = $conn->prepare("
                        SELECT current_stock, product_name, rate
                          FROM purchase_stock
                         WHERE product_id = ? AND branch_id = ?
                    ");
                    $stk->bind_param('si', $product_id, $branch_id);
                    $stk->execute();
                    $stock = $stk->get_result()->fetch_assoc();
                    $stk->close();

                    if (!$stock) {
                        throw new Exception('Product not found in stock for this branch');
                    }
                    if ($quantity > (float) $stock['current_stock']) {
                        throw new Exception('Insufficient stock. Available: ' . $stock['current_stock']);
                    }

                    if ($product_name === '') $product_name = $stock['product_name'];
                    if ($rate <= 0)           $rate         = (float) $stock['rate'];

                    $amount = $quantity * $rate;

                    $upd = $conn->prepare("
                        UPDATE purchase_stock
                           SET current_stock = current_stock - ?
                         WHERE product_id = ? AND branch_id = ?
                    ");
                    $upd->bind_param('dsi', $quantity, $product_id, $branch_id);
                    $upd->execute();
                    $upd->close();

                    $logNote = 'Settlement to party #' . $client_id . ($note ? ' — ' . $note : '');
                    $log = $conn->prepare("
                        INSERT INTO stock_deductions
                            (product_id, product_name, deducted_qty, note, deducted_at, branch_id)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ");
                    $log->bind_param('ssdssi', $product_id, $product_name, $quantity, $logNote, $settle_date, $branch_id);
                    $log->execute();
                    $log->close();

                } else {
                    $amount       = (float) ($data['amount'] ?? 0);
                    $product_id   = null;
                    $product_name = null;
                    $quantity     = null;
                    $rate         = null;

                    if ($amount <= 0) {
                        throw new Exception('Amount must be greater than zero');
                    }
                }

                $ins = $conn->prepare("
                    INSERT INTO party_settlements
                        (client_id, settle_date, mode, amount, product_id,
                         product_name, quantity, rate, note, branch_id)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                ");
                $ins->bind_param(
                    'issdssddsi',
                    $client_id, $settle_date, $mode, $amount, $product_id,
                    $product_name, $quantity, $rate, $note, $branch_id
                );
                $ins->execute();
                $settlement_id = $conn->insert_id;
                $ins->close();

                $conn->commit();

                echo json_encode([
                    'success'       => true,
                    'message'       => 'Settlement recorded',
                    'settlement_id' => $settlement_id,
                    'amount'        => round($amount, 2),
                ]);

            } catch (Exception $e) {
                $conn->rollback();
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            break;
        }

        // ---- Normal payment received from customer ----------
        if (empty($data['client_id']) || empty($data['amount']) || empty($data['payment_date'])) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'client_id, amount and payment_date are required']);
            exit;
        }

        $client_id    = (int) $data['client_id'];
        $amount       = (float) $data['amount'];
        $note         = trim($data['note'] ?? '');
        $payment_date = $data['payment_date'];

        $stmt = $conn->prepare("
            INSERT INTO client_payments (client_id, amount, note, payment_date, branch_id)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->bind_param('idssi', $client_id, $amount, $note, $payment_date, $branch_id);

        if (!$stmt->execute()) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $stmt->error]);
            exit;
        }

        echo json_encode([
            'success'    => true,
            'message'    => 'Payment recorded successfully',
            'payment_id' => $conn->insert_id,
        ]);
        $stmt->close();
        break;

    // ----------------------------------------------------------
    //  PUT – update party details
    // ----------------------------------------------------------
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['client_id']) || empty($data['name'])) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'client_id and name are required']);
            exit;
        }

        $client_id = (int) $data['client_id'];
        $name      = trim($data['name']);
        $phone     = normPhone($data['phone'] ?? '');
        $address   = trim($data['address'] ?? '');
        $gst       = trim($data['gst'] ?? '');

        $stmt = $conn->prepare("UPDATE clients SET name=?, phone=?, address=?, gst=? WHERE id=?");
        $stmt->bind_param('ssssi', $name, $phone, $address, $gst, $client_id);

        if (!$stmt->execute()) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $stmt->error]);
            exit;
        }
        $stmt->close();

        if ($phone !== '') {
            $link = $conn->prepare("
                UPDATE purchase_bills
                   SET client_id = ?
                 WHERE REGEXP_REPLACE(COALESCE(supplier_phone,''), '[^0-9]', '') = ?
            ");
            $link->bind_param('is', $client_id, $phone);
            $link->execute();
            $link->close();
        }

        echo json_encode(['success' => true, 'message' => 'Client updated']);
        break;

    // ----------------------------------------------------------
    //  DELETE
    // ----------------------------------------------------------
    case 'DELETE':

        if (!empty($_GET['payment_id'])) {
            $payment_id = (int) $_GET['payment_id'];
            $stmt = $conn->prepare("DELETE FROM client_payments WHERE id = ?");
            $stmt->bind_param('i', $payment_id);
            $stmt->execute();
            $ok = $stmt->affected_rows > 0;
            $stmt->close();

            if ($ok) {
                echo json_encode(['success' => true, 'message' => 'Payment deleted']);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Payment not found']);
            }
            break;
        }

        if (!empty($_GET['settlement_id'])) {
            $settlement_id = (int) $_GET['settlement_id'];

            $sel = $conn->prepare("SELECT * FROM party_settlements WHERE id = ?");
            $sel->bind_param('i', $settlement_id);
            $sel->execute();
            $row = $sel->get_result()->fetch_assoc();
            $sel->close();

            if (!$row) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Settlement not found']);
                break;
            }

            $conn->begin_transaction();
            try {
                if ($row['mode'] === 'product' && $row['product_id']) {
                    $back = $conn->prepare("
                        UPDATE purchase_stock
                           SET current_stock = current_stock + ?
                         WHERE product_id = ? AND branch_id = ?
                    ");
                    $back->bind_param('dsi', $row['quantity'], $row['product_id'], $row['branch_id']);
                    $back->execute();
                    $back->close();
                }

                $del = $conn->prepare("DELETE FROM party_settlements WHERE id = ?");
                $del->bind_param('i', $settlement_id);
                $del->execute();
                $del->close();

                $conn->commit();
                echo json_encode(['success' => true, 'message' => 'Settlement deleted']);
            } catch (Exception $e) {
                $conn->rollback();
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            break;
        }

        $client_id = (int) ($_GET['client_id'] ?? 0);
        if (!$client_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'client_id required']);
            exit;
        }

        $stmt = $conn->prepare("DELETE FROM client_payments WHERE client_id = ?");
        $stmt->bind_param('i', $client_id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM party_settlements WHERE client_id = ?");
        $stmt->bind_param('i', $client_id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM clients WHERE id = ?");
        $stmt->bind_param('i', $client_id);
        $stmt->execute();
        $ok = $stmt->affected_rows > 0;
        $stmt->close();

        if ($ok) {
            echo json_encode(['success' => true, 'message' => 'Client deleted']);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Client not found']);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}

$conn->close();