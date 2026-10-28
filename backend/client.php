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
         WHERE COALESCE(client_detached,0) = 0 AND (
                 client_id = ?
                 OR (? <> '' AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(supplier_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?)
                 OR (LOWER(TRIM(company_name)) = LOWER(TRIM(?)))
               )
    ";
    $params = [$cid, $phone, $phone, $name];
    $types  = 'isss';

    if ($branch_id !== null) {
        // "All Branch" bills (branch_id IS NULL) belong to every branch view
        $sql     .= " AND (branch_id = ? OR branch_id IS NULL) ";
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

// ── Central customer table: extra detail columns ─────────────
//    Added once, works on MySQL 5.7+ and MariaDB.
function ensureCustomerColumns(mysqli $conn): void {
    $cols = [
        'email'      => "VARCHAR(150) DEFAULT NULL",
        'city'       => "VARCHAR(100) DEFAULT NULL",
        'state'      => "VARCHAR(100) DEFAULT NULL",
        'state_code' => "VARCHAR(10)  DEFAULT NULL",
        'pincode'    => "VARCHAR(12)  DEFAULT NULL",
    ];
    foreach ($cols as $col => $def) {
        $res = $conn->query("SHOW COLUMNS FROM clients LIKE '$col'");
        if ($res && $res->num_rows === 0) {
            $conn->query("ALTER TABLE clients ADD COLUMN $col $def");
        }
    }
}
ensureCustomerColumns($conn);

// Bills of a DELETED customer are marked "detached" so a new customer
// with the same phone/name starts from 0 (bills stay in Sales/Purchase lists).
foreach (['invoices', 'purchase_bills'] as $t) {
    $res = $conn->query("SHOW COLUMNS FROM `$t` LIKE 'client_detached'");
    if ($res && $res->num_rows === 0) {
        $conn->query("ALTER TABLE `$t` ADD COLUMN client_detached TINYINT(1) NOT NULL DEFAULT 0");
    }
}

// Find one customer by phone (last 10 digits = the customer key)
function findCustomerByPhone(mysqli $conn, string $phone, $branch_id): ?array {
    if ($phone === '') return null;
    $sql = "SELECT * FROM clients
             WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?
             ORDER BY (branch_id <=> ?) DESC, id ASC LIMIT 1";
    $st = $conn->prepare($sql);
    $st->bind_param('si', $phone, $branch_id);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ?: null;
}

// Fill in state / address details from the customer's latest invoice
function customerWithFallbacks(mysqli $conn, array $c): array {
    $st = $conn->prepare(
        "SELECT buyer_address, buyer_gst, buyer_state, buyer_state_code
           FROM invoices WHERE client_id = ? ORDER BY id DESC LIMIT 1"
    );
    $st->bind_param('i', $c['id']);
    $st->execute();
    $inv = $st->get_result()->fetch_assoc();
    $st->close();

    $c['address']    = $c['address']    ?: ($inv['buyer_address'] ?? '');
    $c['gst']        = $c['gst']        ?: ($inv['buyer_gst'] ?? '');
    $c['state']      = $c['state']      ?: ($inv['buyer_state'] ?? 'Tamil Nadu');
    $c['state_code'] = $c['state_code'] ?: ($inv['buyer_state_code'] ?? '33');
    foreach (['email', 'city', 'pincode'] as $f) {
        $c[$f] = $c[$f] ?? '';
    }
    return $c;
}

switch ($method) {

    // ----------------------------------------------------------
    //  GET
    // ----------------------------------------------------------
    case 'GET':

        // ── Single invoice with items ─────────────────────────
        // ── Look up ONE customer by phone (autofill everywhere) ──
        if (isset($_GET['phone'])) {
            $phone  = normPhone($_GET['phone']);
            $client = $phone !== '' ? findCustomerByPhone($conn, $phone, $branch_id) : null;
            echo json_encode([
                'success' => true,
                'found'   => (bool) $client,
                'client'  => $client ? customerWithFallbacks($conn, $client) : null,
            ]);
            break;
        }

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
                    OR (client_id IS NULL AND COALESCE(client_detached,0) = 0 AND ? <> ''
                        AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(buyer_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?)
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

            // ---- Quotations for this customer (phone first, then name)
            $qPhone = normPhone($client['phone'] ?? '');
            $qName  = trim($client['name'] ?? '');
            $qStmt  = $conn->prepare("
                SELECT id, quote_no, quote_date, client_name, client_phone, branch_id
                  FROM quotations
                 WHERE (? <> '' AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(client_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?)
                    OR (LOWER(TRIM(client_name)) = LOWER(TRIM(?)))
                 ORDER BY quote_date DESC, id DESC
            ");
            $qStmt->bind_param('sss', $qPhone, $qPhone, $qName);
            $qStmt->execute();
            $quotations = $qStmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $qStmt->close();

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
                'quotations'      => $quotations,
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
                   c.email, c.city, c.pincode,
                   COALESCE(NULLIF(c.state,''),
                     (SELECT i2.buyer_state FROM invoices i2
                       WHERE i2.client_id = c.id AND COALESCE(i2.buyer_state,'') <> ''
                       ORDER BY i2.id DESC LIMIT 1)) AS state,
                   COALESCE(NULLIF(c.state_code,''),
                     (SELECT i3.buyer_state_code FROM invoices i3
                       WHERE i3.client_id = c.id AND COALESCE(i3.buyer_state_code,'') <> ''
                       ORDER BY i3.id DESC LIMIT 1)) AS state_code,
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
                     OR (i.client_id IS NULL AND COALESCE(i.client_detached,0) = 0 AND COALESCE(c.phone,'') <> ''
                         AND CONVERT(RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(i.buyer_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                           = CONVERT(RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
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

        // ---- Add / update a customer (central customer DB) --
        if (($_GET['action'] ?? '') === 'save_customer') {
            $name = trim($data['name'] ?? '');
            if ($name === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Customer name is required']);
                exit;
            }
            $phone      = normPhone($data['phone'] ?? '');
            $address    = trim($data['address'] ?? '');
            $gst        = trim($data['gst'] ?? '');
            $email      = trim($data['email'] ?? '');
            $city       = trim($data['city'] ?? '');
            $state      = trim($data['state'] ?? '');
            $state_code = trim($data['state_code'] ?? '');
            $pincode    = trim($data['pincode'] ?? '');

            // Same phone = same customer → update instead of adding a duplicate
            $existing = $phone !== '' ? findCustomerByPhone($conn, $phone, $branch_id) : null;
            if (!$existing && !empty($data['client_id'])) {
                $cid = (int) $data['client_id'];
                $st  = $conn->prepare("SELECT * FROM clients WHERE id = ?");
                $st->bind_param('i', $cid);
                $st->execute();
                $existing = $st->get_result()->fetch_assoc() ?: null;
                $st->close();
            }

            if ($existing) {
                // Blank fields keep whatever is already saved
                $keep = function ($new, $old) { return $new !== '' ? $new : (string) ($old ?? ''); };
                $address    = $keep($address,    $existing['address']);
                $gst        = $keep($gst,        $existing['gst']);
                $email      = $keep($email,      $existing['email'] ?? '');
                $city       = $keep($city,       $existing['city'] ?? '');
                $state      = $keep($state,      $existing['state'] ?? '');
                $state_code = $keep($state_code, $existing['state_code'] ?? '');
                $pincode    = $keep($pincode,    $existing['pincode'] ?? '');
                $phone      = $keep($phone,      $existing['phone']);

                $st = $conn->prepare(
                    "UPDATE clients
                        SET name=?, phone=?, address=?, gst=?, email=?, city=?, state=?, state_code=?, pincode=?
                      WHERE id=?"
                );
                $st->bind_param('sssssssssi', $name, $phone, $address, $gst, $email,
                    $city, $state, $state_code, $pincode, $existing['id']);
                $st->execute();
                $st->close();
                $client_id = (int) $existing['id'];
                $msg = 'Customer updated';
            } else {
                $st = $conn->prepare(
                    "INSERT INTO clients (name, phone, address, gst, email, city, state, state_code, pincode, branch_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                $st->bind_param('sssssssssi', $name, $phone, $address, $gst, $email,
                    $city, $state, $state_code, $pincode, $branch_id);
                $st->execute();
                $client_id = (int) $conn->insert_id;
                $st->close();
                $msg = 'Customer added';
            }

            // Link this customer's existing bills/invoices by phone
            if ($phone !== '') {
                foreach ([
                    "UPDATE purchase_bills SET client_id = ? WHERE client_id IS NULL AND COALESCE(client_detached,0) = 0 AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(supplier_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?",
                    "UPDATE invoices SET client_id = ? WHERE client_id IS NULL AND COALESCE(client_detached,0) = 0 AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(buyer_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?",
                ] as $sql) {
                    $lk = $conn->prepare($sql);
                    $lk->bind_param('is', $client_id, $phone);
                    $lk->execute();
                    $lk->close();
                }
            }

            $st = $conn->prepare("SELECT * FROM clients WHERE id = ?");
            $st->bind_param('i', $client_id);
            $st->execute();
            $saved = $st->get_result()->fetch_assoc();
            $st->close();

            echo json_encode([
                'success'   => true,
                'message'   => $msg,
                'client_id' => $client_id,
                'client'    => customerWithFallbacks($conn, $saved),
            ]);
            break;
        }

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

        // ---- Edit one payment (amount / date / note) ----
        if (!empty($_GET['payment_id'])) {
            $pid  = (int) $_GET['payment_id'];
            $amt  = (float) ($data['amount'] ?? 0);
            $date = $data['payment_date'] ?? '';
            $note = trim((string) ($data['note'] ?? ''));
            if ($amt == 0 || $date === '') {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Amount and date are required']);
                exit;
            }
            $u = $conn->prepare("UPDATE client_payments SET amount = ?, payment_date = ?, note = ? WHERE id = ?");
            $u->bind_param('dssi', $amt, $date, $note, $pid);
            $u->execute();
            $u->close();
            echo json_encode(['success' => true, 'message' => 'Payment updated']);
            break;
        }

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

        $email      = trim($data['email'] ?? '');
        $city       = trim($data['city'] ?? '');
        $state      = trim($data['state'] ?? '');
        $state_code = trim($data['state_code'] ?? '');
        $pincode    = trim($data['pincode'] ?? '');

        $stmt = $conn->prepare(
            "UPDATE clients
                SET name=?, phone=?, address=?, gst=?, email=?, city=?, state=?, state_code=?, pincode=?
              WHERE id=?"
        );
        $stmt->bind_param('sssssssssi', $name, $phone, $address, $gst, $email,
            $city, $state, $state_code, $pincode, $client_id);

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
                 WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(supplier_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?
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

        // ---- Delete one sales bill (invoice + its items) ----
        if (!empty($_GET['invoice_id'])) {
            $iid = (int) $_GET['invoice_id'];
            $conn->begin_transaction();
            try {
                $d = $conn->prepare("DELETE FROM invoice_items WHERE invoice_id = ?");
                $d->bind_param('i', $iid); $d->execute(); $d->close();
                $d = $conn->prepare("DELETE FROM invoices WHERE id = ?");
                $d->bind_param('i', $iid); $d->execute();
                $ok = $d->affected_rows > 0; $d->close();
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollback();
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Delete failed: ' . $e->getMessage()]);
                break;
            }
            echo json_encode($ok ? ['success' => true, 'message' => 'Bill deleted']
                                 : ['success' => false, 'message' => 'Bill not found']);
            break;
        }

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

        // Detach this customer's bills (matched by id / phone / name) so a
        // new customer with the same number does not get the old amounts.
        $cs = $conn->prepare("SELECT phone, name FROM clients WHERE id = ?");
        $cs->bind_param('i', $client_id);
        $cs->execute();
        $old = $cs->get_result()->fetch_assoc() ?: [];
        $cs->close();
        $oPhone = normPhone($old['phone'] ?? '');
        $oName  = trim($old['name'] ?? '');

        $d1 = $conn->prepare("UPDATE invoices SET client_detached = 1, client_id = NULL
                               WHERE client_id = ? OR (client_id IS NULL AND ? <> '' AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(buyer_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?)");
        $d1->bind_param('iss', $client_id, $oPhone, $oPhone);
        $d1->execute();
        $d1->close();

        $d2 = $conn->prepare("UPDATE purchase_bills SET client_detached = 1, client_id = NULL
                               WHERE client_id = ? OR (? <> '' AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(supplier_phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?)
                                  OR (? <> '' AND LOWER(TRIM(company_name)) = LOWER(TRIM(?)))");
        $d2->bind_param('issss', $client_id, $oPhone, $oPhone, $oName, $oName);
        $d2->execute();
        $d2->close();

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