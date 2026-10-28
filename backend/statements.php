<?php
// =============================================================
//  statements.php — READ-ONLY statements / reports
//  Built only from existing data. Nothing is written.
//
//  GET ?type=customer  &client_id=1   &from=YYYY-MM-DD&to=YYYY-MM-DD
//  GET ?type=payment   [&client_id=1] &from&to
//  GET ?type=sales                     &from&to
//  GET ?type=purchase                  &from&to
//  GET ?type=product   &product=Name   &from&to
//  GET ?type=inventory                 &from&to
//  GET ?type=quotation &quotation_id=ID   (one quotation, full details)
//  GET ?type=employee  &employee_id=ID    (one employee salary statement)
//  GET ?type=customers   → customer list for the picker
//  GET ?type=products    → product list for the picker
//
//  Every statement returns:
//    opening, rows[] (date, particulars, reference, debit, credit, balance, …),
//    totals, closing
//  Customer balance follows client.php:
//    Debit  (+) = tax invoices, what we paid the party, settlements
//    Credit (−) = payments received, paid-on-invoice, purchase bills from the party
//    Balance > 0 → customer owes us,  < 0 → we owe the customer
// =============================================================

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$conn = getDB();

// ── Branch filter ───────────────────────────────────────────────
// Priority: ?branch= query param (Statement page picker) > topbar header > user's own branch
if ($authUser['role'] === 'admin') {
    if (isset($_GET['branch']) && $_GET['branch'] !== '' && $_GET['branch'] !== 'all') {
        $branch_id = (int) $_GET['branch'];
    } else if (isset($_GET['branch']) && ($_GET['branch'] === '' || $_GET['branch'] === 'all')) {
        $branch_id = null; // explicit All Branches
    } else {
        $branch_id = $authUser['view_branch_id'] ?? null; // topbar selection
    }
} else {
    $branch_id = isset($authUser['branch_id']) ? (int) $authUser['branch_id'] : null;
}
$branch_id = $branch_id ? (int) $branch_id : null;

// ── Helpers ──────────────────────────────────────────────────
function st_phone(?string $p): string {
    $d = preg_replace('/\D/', '', (string) $p);
    return strlen($d) > 10 ? substr($d, -10) : $d;
}
// SQL: last 10 digits of a phone column (works on MySQL 5.7+)
function st_phone_sql(string $col): string {
    return "RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE($col,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10)";
}
function st_date(?string $d): string {
    return $d ? substr($d, 0, 10) : '';
}
function st_valid_date(?string $d): ?string {
    return ($d && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) ? $d : null;
}
function st_table_exists(mysqli $conn, string $t): bool {
    $r = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($t) . "'");
    return $r && $r->num_rows > 0;
}
function st_column_exists(mysqli $conn, string $t, string $c): bool {
    if (!st_table_exists($conn, $t)) return false;
    $r = $conn->query("SHOW COLUMNS FROM `$t` LIKE '" . $conn->real_escape_string($c) . "'");
    return $r && $r->num_rows > 0;
}
function st_query(mysqli $conn, string $sql, string $types = '', array $params = []): array {
    $st = $conn->prepare($sql);
    if (!$st) return [];
    if ($types !== '') $st->bind_param($types, ...$params);
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    return $rows;
}
// branch condition: rows of this branch + All Branch (NULL) rows
function st_branch_sql(?int $branch_id, string $col): array {
    if ($branch_id === null) return ['', '', []];
    return [" AND ($col = ? OR $col IS NULL) ", 'i', [$branch_id]];
}

// Sort entries by date, keep a stable order inside the same day
function st_sort(array &$entries): void {
    foreach ($entries as $i => &$e) $e['_i'] = $i;
    unset($e);
    usort($entries, function ($a, $b) {
        $c = strcmp($a['date'], $b['date']);
        if ($c !== 0) return $c;
        $c = ($a['sort'] ?? 0) <=> ($b['sort'] ?? 0);
        return $c !== 0 ? $c : $a['_i'] <=> $b['_i'];
    });
}

// Opening balance before $from, rows inside [$from, $to] with running balance
function st_ledger(array $entries, ?string $from, ?string $to): array {
    st_sort($entries);
    $opening = 0.0;
    $balance = 0.0;
    $rows = [];
    foreach ($entries as $e) {
        $dr = (float) ($e['debit'] ?? 0);
        $cr = (float) ($e['credit'] ?? 0);
        if ($from && $e['date'] < $from) {
            $opening += $dr - $cr;
            continue;
        }
        if ($to && $e['date'] > $to) continue;
        if (!$rows) $balance = $opening;
        $balance += $dr - $cr;
        unset($e['_i'], $e['sort']);
        $e['debit']   = round($dr, 2);
        $e['credit']  = round($cr, 2);
        $e['balance'] = round($balance, 2);
        $rows[] = $e;
    }
    $closing = $rows ? $balance : $opening;
    return [round($opening, 2), $rows, round($closing, 2)];
}

$type = $_GET['type'] ?? '';
$from = st_valid_date($_GET['from'] ?? null);
$to   = st_valid_date($_GET['to'] ?? null);

try {
switch ($type) {

// ─────────────────────────────────────────────────────────────
//  Pickers
// ─────────────────────────────────────────────────────────────
case 'customers':
    $rows = st_query($conn, "SELECT id, name, phone FROM clients ORDER BY name ASC");
    echo json_encode(['success' => true, 'customers' => $rows]);
    break;

// Pickers for the record-specific statements (quotation / employee)
case 'quotations':
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
    $rows = st_table_exists($conn, 'quotations')
        ? st_query($conn, "SELECT id, quote_no, client_name, quote_date FROM quotations WHERE 1=1 $bSql ORDER BY id DESC", $bT, $bP)
        : [];
    echo json_encode(['success' => true, 'quotations' => $rows]);
    break;

case 'employees':
    $sqlE = "SELECT id, employee_name, branch_id FROM employees";
    $rows = ($authUser['role'] !== 'admin' && !empty($authUser['branch_id']))
        ? st_query($conn, "$sqlE WHERE branch_id = ? ORDER BY employee_name ASC", 'i', [(int) $authUser['branch_id']])
        : st_query($conn, "$sqlE ORDER BY employee_name ASC");
    echo json_encode(['success' => true, 'employees' => $rows]);
    break;

case 'products':
    $names = [];
    foreach ([
        "SELECT DISTINCT product_name AS n FROM purchase_stock",
        "SELECT DISTINCT product_name AS n FROM products",
        "SELECT DISTINCT product_name AS n FROM purchase_bill_items",
        "SELECT DISTINCT product_name AS n FROM purchase_products",
    ] as $sql) {
        foreach (st_query($conn, $sql) as $r) {
            $n = trim((string) $r['n']);
            if ($n !== '') $names[strtolower($n)] = $n;
        }
    }
    natcasesort($names);
    echo json_encode(['success' => true, 'products' => array_values($names)]);
    break;

// ─────────────────────────────────────────────────────────────
//  1 / 8. Customer statement (bank-statement style)
// ─────────────────────────────────────────────────────────────
case 'customer':
    $cid = (int) ($_GET['client_id'] ?? 0);
    $cl  = st_query($conn, "SELECT * FROM clients WHERE id = ?", 'i', [$cid]);
    if (!$cl) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Customer not found']);
        break;
    }
    $client = $cl[0];
    $phone  = st_phone($client['phone'] ?? '');
    $name   = trim($client['name'] ?? '');
    $hasInvPaid = st_column_exists($conn, 'invoices', 'paid_amount');
    $entries = [];

    // Tax invoices (same match as client.php: client_id, or unlinked with same phone)
    $inv = st_query($conn,
        "SELECT id, invoice_no, invoice_date, net_amount, payment_mode"
        . ($hasInvPaid ? ", paid_amount" : ", 0 AS paid_amount") . "
           FROM invoices
          WHERE client_id = ?
             OR (client_id IS NULL AND ? <> '' AND " . st_phone_sql('buyer_phone') . " = ?)",
        'iss', [$cid, $phone, $phone]);
    foreach ($inv as $r) {
        $d = st_date($r['invoice_date']);
        $entries[] = [
            'date' => $d, 'sort' => 1, 'kind' => 'invoice',
            'particulars' => 'Tax Invoice', 'reference' => $r['invoice_no'],
            'debit' => (float) $r['net_amount'], 'credit' => 0,
            'bill_amount' => (float) $r['net_amount'], 'paid_amount' => 0,
            'payment_date' => '', 'method' => $r['payment_mode'] ?? '',
        ];
        if ((float) $r['paid_amount'] > 0) {
            $entries[] = [
                'date' => $d, 'sort' => 2, 'kind' => 'payment',
                'particulars' => 'Paid on Invoice', 'reference' => $r['invoice_no'],
                'debit' => 0, 'credit' => (float) $r['paid_amount'],
                'bill_amount' => 0, 'paid_amount' => (float) $r['paid_amount'],
                'payment_date' => $d, 'method' => $r['payment_mode'] ?? '',
            ];
        }
    }

    // Payments received
    foreach (st_query($conn, "SELECT id, amount, note, payment_date FROM client_payments WHERE client_id = ?", 'i', [$cid]) as $r) {
        $d = st_date($r['payment_date']);
        $entries[] = [
            'date' => $d, 'sort' => 3, 'kind' => 'payment',
            'particulars' => 'Payment Received' . ($r['note'] ? ' — ' . $r['note'] : ''),
            'reference' => 'PAY' . str_pad($r['id'], 3, '0', STR_PAD_LEFT),
            'debit' => 0, 'credit' => (float) $r['amount'],
            'bill_amount' => 0, 'paid_amount' => (float) $r['amount'],
            'payment_date' => $d, 'method' => $r['note'] ?? '',
        ];
    }

    // Purchase bills from this party (same match as client.php)
    $hasPayTbl = st_table_exists($conn, 'purchase_bill_payments');
    $pbs = st_query($conn,
        "SELECT id, invoice_no, bill_date, total_amount, paid_amount FROM purchase_bills
          WHERE client_id = ?
             OR (? <> '' AND " . st_phone_sql('supplier_phone') . " = ?)
             OR (LOWER(TRIM(company_name)) = LOWER(TRIM(?)))",
        'isss', [$cid, $phone, $phone, $name]);
    foreach ($pbs as $r) {
        $d   = st_date($r['bill_date']);
        $ref = $r['invoice_no'] !== '' ? $r['invoice_no'] : 'PB-' . $r['id'];
        $entries[] = [
            'date' => $d, 'sort' => 1, 'kind' => 'purchase',
            'particulars' => 'Purchase Bill (from party)', 'reference' => $ref,
            'debit' => 0, 'credit' => (float) $r['total_amount'],
            'bill_amount' => (float) $r['total_amount'], 'paid_amount' => 0,
            'payment_date' => '', 'method' => '',
        ];
        // what we paid on it: later payments with their own dates, rest on the bill date
        $later = $hasPayTbl
            ? st_query($conn, "SELECT id, amount, payment_date, note FROM purchase_bill_payments WHERE purchase_bill_id = ?", 'i', [$r['id']])
            : [];
        $laterSum = array_sum(array_map(fn($p) => (float) $p['amount'], $later));
        $initial  = (float) $r['paid_amount'] - $laterSum;
        if ($initial > 0.004) {
            $entries[] = [
                'date' => $d, 'sort' => 2, 'kind' => 'paid_out',
                'particulars' => 'Paid to Party', 'reference' => $ref,
                'debit' => $initial, 'credit' => 0,
                'bill_amount' => 0, 'paid_amount' => $initial,
                'payment_date' => $d, 'method' => '',
            ];
        }
        foreach ($later as $p) {
            $pd = st_date($p['payment_date']);
            $entries[] = [
                'date' => $pd, 'sort' => 3, 'kind' => 'paid_out',
                'particulars' => 'Paid to Party' . ($p['note'] ? ' — ' . $p['note'] : ''), 'reference' => $ref,
                'debit' => (float) $p['amount'], 'credit' => 0,
                'bill_amount' => 0, 'paid_amount' => (float) $p['amount'],
                'payment_date' => $pd, 'method' => $p['note'] ?? '',
            ];
        }
    }

    // Settlements of what we owe (cash / product)
    if (st_table_exists($conn, 'party_settlements')) {
        foreach (st_query($conn, "SELECT id, settle_date, mode, amount, product_name, quantity, note FROM party_settlements WHERE client_id = ?", 'i', [$cid]) as $r) {
            $d = st_date($r['settle_date']);
            $detail = $r['mode'] === 'product' && $r['product_name']
                ? " ({$r['product_name']} × " . (float) $r['quantity'] . ")" : '';
            $entries[] = [
                'date' => $d, 'sort' => 3, 'kind' => 'paid_out',
                'particulars' => 'Settlement — ' . ucfirst((string) $r['mode']) . $detail,
                'reference' => 'SET' . str_pad($r['id'], 3, '0', STR_PAD_LEFT),
                'debit' => (float) $r['amount'], 'credit' => 0,
                'bill_amount' => 0, 'paid_amount' => (float) $r['amount'],
                'payment_date' => $d, 'method' => $r['mode'] ?? '',
            ];
        }
    }

    [$opening, $rows, $closing] = st_ledger($entries, $from, $to);
    $sum = fn($k, $cond) => round(array_sum(array_map(fn($r) => $cond($r) ? (float) $r[$k] : 0, $rows)), 2);
    $totals = [
        'total_invoice'  => $sum('debit',  fn($r) => $r['kind'] === 'invoice'),
        'total_paid'     => $sum('credit', fn($r) => $r['kind'] === 'payment'),
        'total_purchase' => $sum('credit', fn($r) => $r['kind'] === 'purchase'),
        'total_paid_out' => $sum('debit',  fn($r) => $r['kind'] === 'paid_out'),
        'total_debit'    => $sum('debit',  fn($r) => true),
        'total_credit'   => $sum('credit', fn($r) => true),
        'outstanding'    => $closing,
    ];
    echo json_encode([
        'success' => true, 'type' => 'customer',
        'customer' => [
            'id' => (int) $client['id'], 'name' => $client['name'], 'phone' => $client['phone'],
            'address' => $client['address'] ?? '', 'gst' => $client['gst'] ?? '',
        ],
        'from' => $from, 'to' => $to,
        'opening' => $opening, 'rows' => $rows, 'closing' => $closing, 'totals' => $totals,
        'balance_label' => $closing < 0 ? 'You Owe' : 'Balance Due',
    ]);
    break;

// ─────────────────────────────────────────────────────────────
//  2. Payment statement (money received and paid out)
// ─────────────────────────────────────────────────────────────
case 'payment':
    $cid = (int) ($_GET['client_id'] ?? 0);
    $hasInvPaid = st_column_exists($conn, 'invoices', 'paid_amount');
    $entries = [];

    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'p.branch_id');
    $sql = "SELECT p.id, p.amount, p.note, p.payment_date, c.name, c.phone
              FROM client_payments p LEFT JOIN clients c ON c.id = p.client_id WHERE 1=1 $bSql";
    $t = $bT; $pr = $bP;
    if ($cid) { $sql .= " AND p.client_id = ?"; $t .= 'i'; $pr[] = $cid; }
    foreach (st_query($conn, $sql, $t, $pr) as $r) {
        $entries[] = [
            'date' => st_date($r['payment_date']), 'sort' => 1,
            'particulars' => 'Payment Received' . ($r['note'] ? ' — ' . $r['note'] : ''),
            'party' => $r['name'] ?? '', 'phone' => $r['phone'] ?? '',
            'reference' => 'PAY' . str_pad($r['id'], 3, '0', STR_PAD_LEFT),
            'method' => $r['note'] ?? '', 'debit' => 0, 'credit' => (float) $r['amount'],
        ];
    }

    if ($hasInvPaid) {
        [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
        $sql = "SELECT invoice_no, invoice_date, paid_amount, payment_mode, buyer_name, buyer_phone
                  FROM invoices WHERE paid_amount > 0 $bSql";
        $t = $bT; $pr = $bP;
        if ($cid) { $sql .= " AND client_id = ?"; $t .= 'i'; $pr[] = $cid; }
        foreach (st_query($conn, $sql, $t, $pr) as $r) {
            $entries[] = [
                'date' => st_date($r['invoice_date']), 'sort' => 1,
                'particulars' => 'Paid on Invoice', 'party' => $r['buyer_name'] ?? '',
                'phone' => $r['buyer_phone'] ?? '', 'reference' => $r['invoice_no'],
                'method' => $r['payment_mode'] ?? '', 'debit' => 0, 'credit' => (float) $r['paid_amount'],
            ];
        }
    }

    // Paid out on purchase bills
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'b.branch_id');
    $sql = "SELECT b.id, b.invoice_no, b.bill_date, b.paid_amount, b.company_name, b.supplier_phone
              FROM purchase_bills b WHERE b.paid_amount > 0 $bSql";
    $t = $bT; $pr = $bP;
    if ($cid) { $sql .= " AND b.client_id = ?"; $t .= 'i'; $pr[] = $cid; }
    $hasPayTbl = st_table_exists($conn, 'purchase_bill_payments');
    foreach (st_query($conn, $sql, $t, $pr) as $r) {
        $ref   = $r['invoice_no'] !== '' ? $r['invoice_no'] : 'PB-' . $r['id'];
        $later = $hasPayTbl
            ? st_query($conn, "SELECT amount, payment_date, note FROM purchase_bill_payments WHERE purchase_bill_id = ?", 'i', [$r['id']])
            : [];
        $initial = (float) $r['paid_amount'] - array_sum(array_map(fn($p) => (float) $p['amount'], $later));
        if ($initial > 0.004) {
            $entries[] = [
                'date' => st_date($r['bill_date']), 'sort' => 2, 'particulars' => 'Paid on Purchase Bill',
                'party' => $r['company_name'], 'phone' => $r['supplier_phone'] ?? '',
                'reference' => $ref, 'method' => '', 'debit' => $initial, 'credit' => 0,
            ];
        }
        foreach ($later as $p) {
            $entries[] = [
                'date' => st_date($p['payment_date']), 'sort' => 2,
                'particulars' => 'Paid on Purchase Bill' . ($p['note'] ? ' — ' . $p['note'] : ''),
                'party' => $r['company_name'], 'phone' => $r['supplier_phone'] ?? '',
                'reference' => $ref, 'method' => $p['note'] ?? '', 'debit' => (float) $p['amount'], 'credit' => 0,
            ];
        }
    }

    // Opening/running balance here = net cash (received − paid out)
    $flip = array_map(function ($e) { [$e['debit'], $e['credit']] = [$e['credit'], $e['debit']]; return $e; }, $entries);
    [$opening, $rows, $closing] = st_ledger($flip, $from, $to);
    $rows = array_map(function ($r) {
        [$r['debit'], $r['credit']] = [$r['credit'], $r['debit']];
        $r['received'] = $r['credit']; $r['paid_out'] = $r['debit'];
        return $r;
    }, $rows);
    echo json_encode([
        'success' => true, 'type' => 'payment', 'from' => $from, 'to' => $to,
        'opening' => $opening, 'rows' => $rows, 'closing' => $closing,
        'totals' => [
            'total_received' => round(array_sum(array_column($rows, 'credit')), 2),
            'total_paid_out' => round(array_sum(array_column($rows, 'debit')), 2),
            'net'            => round(array_sum(array_column($rows, 'credit')) - array_sum(array_column($rows, 'debit')), 2),
        ],
    ]);
    break;

// ─────────────────────────────────────────────────────────────
//  6. Sales statement (tax invoices)
// ─────────────────────────────────────────────────────────────
case 'sales':
    $hasInvPaid = st_column_exists($conn, 'invoices', 'paid_amount');
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
    // Optional: one specific invoice (Statement button next to a record)
    $onlyInv = trim((string) ($_GET['invoice_no'] ?? ''));
    if ($onlyInv !== '') { $bSql .= ' AND invoice_no = ? '; $bT .= 's'; $bP[] = $onlyInv; }
    $inv = st_query($conn,
        "SELECT id, invoice_no, invoice_date, buyer_name, buyer_phone, subtotal, total_tax, round_off, net_amount, payment_mode"
        . ($hasInvPaid ? ", paid_amount" : ", 0 AS paid_amount") . "
           FROM invoices WHERE 1=1 $bSql", $bT, $bP);
    $items = [];
    if ($inv) {
        $ids = implode(',', array_map('intval', array_column($inv, 'id')));
        foreach (st_query($conn, "SELECT invoice_id, description, qty, per, taxable_amt FROM invoice_items WHERE invoice_id IN ($ids) ORDER BY id") as $it) {
            $items[(int) $it['invoice_id']][] = $it;
        }
    }
    $entries = [];
    foreach ($inv as $r) {
        $its  = $items[(int) $r['id']] ?? [];
        $prod = implode(', ', array_map(fn($i) => trim($i['description']) . ' × ' . (float) $i['qty'], $its));
        $qty  = array_sum(array_map(fn($i) => (float) $i['qty'], $its));
        $net  = (float) $r['net_amount'];
        $paid = (float) $r['paid_amount'];
        $entries[] = [
            'date' => st_date($r['invoice_date']), 'sort' => 1,
            'particulars' => 'Tax Invoice', 'reference' => $r['invoice_no'],
            'party' => $r['buyer_name'], 'phone' => $r['buyer_phone'],
            'products' => $prod, 'qty' => $qty, 'items' => $its,
            'amount' => round((float) $r['subtotal'], 2), 'gst' => round((float) $r['total_tax'], 2),
            'discount' => 0, 'round_off' => round((float) $r['round_off'], 2),
            'total' => round($net, 2), 'paid' => round($paid, 2), 'bill_balance' => round($net - $paid, 2),
            'method' => $r['payment_mode'] ?? '',
            'debit' => $net, 'credit' => $paid,
        ];
    }
    [$opening, $rows, $closing] = st_ledger($entries, $from, $to);
    $tot = fn($k) => round(array_sum(array_column($rows, $k)), 2);
    echo json_encode([
        'success' => true, 'type' => 'sales', 'from' => $from, 'to' => $to,
        'opening' => $opening, 'rows' => $rows, 'closing' => $closing,
        'totals' => [
            'invoices' => count($rows), 'qty' => $tot('qty'), 'amount' => $tot('amount'), 'gst' => $tot('gst'),
            'round_off' => $tot('round_off'), 'total' => $tot('total'), 'paid' => $tot('paid'),
            'outstanding' => $tot('bill_balance'),
        ],
    ]);
    break;

// ─────────────────────────────────────────────────────────────
//  7. Purchase statement (purchase bills)
// ─────────────────────────────────────────────────────────────
case 'purchase':
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
    $hasRound = st_column_exists($conn, 'purchase_bills', 'round_off');
    // Optional: one specific purchase bill (Statement button next to a record)
    $onlyBill = (int) ($_GET['bill_id'] ?? 0);
    if ($onlyBill > 0) { $bSql .= ' AND id = ? '; $bT .= 'i'; $bP[] = $onlyBill; }
    $bills = st_query($conn,
        "SELECT id, invoice_no, bill_date, company_name, supplier_phone, total_amount, paid_amount,
                opening_balance, gst_enabled, gst_rate" . ($hasRound ? ", round_off" : ", 0 AS round_off") . "
           FROM purchase_bills WHERE 1=1 $bSql", $bT, $bP);
    $items = [];
    if ($bills) {
        $ids = implode(',', array_map('intval', array_column($bills, 'id')));
        foreach (st_query($conn, "SELECT purchase_bill_id, product_name, quantity, rate, amount FROM purchase_bill_items WHERE purchase_bill_id IN ($ids) ORDER BY id") as $it) {
            $items[(int) $it['purchase_bill_id']][] = $it;
        }
    }
    $entries = [];
    foreach ($bills as $r) {
        $its  = $items[(int) $r['id']] ?? [];
        $sub  = array_sum(array_map(fn($i) => (float) $i['amount'], $its));
        $gst  = (int) $r['gst_enabled'] === 1 ? $sub * (float) $r['gst_rate'] / 100 : 0;
        $bill = (float) $r['total_amount'] - (float) $r['opening_balance']; // this bill only
        $paid = (float) $r['paid_amount'];
        $entries[] = [
            'date' => st_date($r['bill_date']), 'sort' => 1,
            'particulars' => 'Purchase Bill',
            'reference' => $r['invoice_no'] !== '' ? $r['invoice_no'] : 'PB-' . $r['id'],
            'party' => $r['company_name'], 'phone' => $r['supplier_phone'] ?? '',
            'products' => implode(', ', array_map(fn($i) => trim($i['product_name']) . ' × ' . (float) $i['quantity'], $its)),
            'qty' => array_sum(array_map(fn($i) => (float) $i['quantity'], $its)), 'items' => $its,
            'amount' => round($sub, 2), 'gst' => round($gst, 2), 'round_off' => round((float) $r['round_off'], 2),
            'total' => round($bill, 2), 'opening_balance' => round((float) $r['opening_balance'], 2),
            'paid' => round($paid, 2), 'bill_balance' => round((float) $r['total_amount'] - $paid, 2),
            // payable view: bill = credit (we owe more), paid = debit
            'debit' => $paid, 'credit' => $bill,
        ];
    }
    // balance shown as "payable" (positive = we owe)
    $flip = array_map(function ($e) { [$e['debit'], $e['credit']] = [$e['credit'], $e['debit']]; return $e; }, $entries);
    [$opening, $rows, $closing] = st_ledger($flip, $from, $to);
    $rows = array_map(function ($r) { [$r['debit'], $r['credit']] = [$r['credit'], $r['debit']]; return $r; }, $rows);
    $tot = fn($k) => round(array_sum(array_column($rows, $k)), 2);
    echo json_encode([
        'success' => true, 'type' => 'purchase', 'from' => $from, 'to' => $to,
        'opening' => $opening, 'rows' => $rows, 'closing' => $closing,
        'totals' => [
            'bills' => count($rows), 'qty' => $tot('qty'), 'amount' => $tot('amount'), 'gst' => $tot('gst'),
            'round_off' => $tot('round_off'), 'total' => $tot('total'), 'paid' => $tot('paid'),
            'outstanding' => $tot('bill_balance'),
        ],
    ]);
    break;

// ─────────────────────────────────────────────────────────────
//  4 / 5. Product & Inventory statements (stock movement)
// ─────────────────────────────────────────────────────────────
case 'product':
case 'inventory':
    $prodName = trim((string) ($_GET['product'] ?? ''));
    // Exact record: resolve the product by its unique ID (src = product | purchase)
    $pid = (int) ($_GET['product_id'] ?? 0);
    if ($type === 'product' && $pid > 0) {
        $tbl = (($_GET['src'] ?? '') === 'purchase') ? 'purchase_products' : 'products';
        if (st_table_exists($conn, $tbl)) {
            $rr = st_query($conn, "SELECT product_name FROM `$tbl` WHERE id = ? LIMIT 1", 'i', [$pid]);
            if ($rr && trim((string) $rr[0]['product_name']) !== '') $prodName = trim((string) $rr[0]['product_name']);
        }
    }
    $only = $type === 'product' ? strtolower($prodName) : null;
    if ($type === 'product' && $only === '') {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Choose a product']);
        break;
    }
    $moves = [];
    $branchNames = [1 => 'Kadambankulam', 2 => 'Nanguneri', 3 => 'Kadambankulam'];
    $bLabel = fn($b) => ($b === null || $b === '') ? 'All Branch' : ($branchNames[(int) $b] ?? ('Branch ' . $b));
    $add = function ($name, $date, $kind, $ref, $in, $out, $party = '', $sort = 1, $branch = '', $rate = null) use (&$moves, $only, $bLabel) {
        $key = strtolower(trim((string) $name));
        if ($key === '' || ($only !== null && $key !== $only)) return;
        $moves[] = [
            'branch' => $bLabel($branch), 'rate' => $rate === null ? 0 : (float) $rate,
            'product' => trim((string) $name), 'date' => st_date($date), 'sort' => $sort,
            'particulars' => $kind, 'reference' => $ref, 'party' => $party,
            'qty_in' => (float) $in, 'qty_out' => (float) $out,
            'debit' => (float) $in, 'credit' => (float) $out,
        ];
    };

    // Stock IN — manual additions from the Product page (product_stock_log)
    if (st_table_exists($conn, 'product_stock_log')) {
        [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
        foreach (st_query($conn,
            "SELECT product_name, qty, branch_id, note, logged_at
               FROM product_stock_log
              WHERE log_type = 'stock_in' $bSql
              ORDER BY logged_at",
            $bT, $bP) as $r) {
            $add($r['product_name'], $r['logged_at'], 'Stock In (Manual)',
                $r['note'] ?: 'Manual', $r['qty'], 0, '', 0, $r['branch_id']); // sort=0 → before purchases on same day
        }
    }

    // Stock IN — purchase bills
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'b.branch_id');
    foreach (st_query($conn,
        "SELECT i.product_name, i.quantity, i.rate, b.branch_id, b.bill_date, b.invoice_no, b.id, b.company_name
           FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.purchase_bill_id WHERE 1=1 $bSql", $bT, $bP) as $r) {
        $add($r['product_name'], $r['bill_date'], 'Purchase',
            $r['invoice_no'] !== '' ? $r['invoice_no'] : 'PB-' . $r['id'], $r['quantity'], 0, $r['company_name'], 1, $r['branch_id'], $r['rate']);
    }

    // Stock IN — Purchase Catalog (Add Purchase / manual stock-in on the Purchase Catalog)
    if (st_table_exists($conn, 'purchase_product_log')) {
        [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
        foreach (st_query($conn,
            "SELECT id, product_name, qty, rate, branch_id, supplier, reference, note, logged_at
               FROM purchase_product_log WHERE log_type = 'stock_in' $bSql ORDER BY logged_at", $bT, $bP) as $r) {
            $add($r['product_name'], $r['logged_at'],
                $r['note'] === 'Manual Stock In' ? 'Stock In (Purchase Catalog)' : 'Purchase (Purchase Catalog)',
                $r['reference'] !== '' ? $r['reference'] : 'PC-' . $r['id'], $r['qty'], 0,
                $r['supplier'], 1, $r['branch_id'], $r['rate']);
        }
    }
    // Stock OUT — tax invoices (item description = product name)
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'i.branch_id');
    foreach (st_query($conn,
        "SELECT i.description, i.qty, i.branch_id, v.invoice_date, v.invoice_no, v.buyer_name
           FROM invoice_items i JOIN invoices v ON v.id = i.invoice_id WHERE 1=1 $bSql", $bT, $bP) as $r) {
        $add($r['description'], $r['invoice_date'], 'Sale', $r['invoice_no'], 0, $r['qty'], $r['buyer_name'], 2, $r['branch_id']);
    }
    // Stock OUT — manual deductions / product settlements
    if (st_table_exists($conn, 'stock_deductions')) {
        [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
        foreach (st_query($conn, "SELECT id, product_name, deducted_qty, note, deducted_at, branch_id FROM stock_deductions WHERE 1=1 $bSql", $bT, $bP) as $r) {
            $add($r['product_name'], $r['deducted_at'], 'Stock Adjustment' . ($r['note'] ? ' — ' . $r['note'] : ''),
                'ADJ' . str_pad($r['id'], 3, '0', STR_PAD_LEFT), 0, $r['deducted_qty'], '', 3, $r['branch_id']);
        }
    }
    // Stock OUT — damage
    if (st_table_exists($conn, 'product_damage')) {
        [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'd.branch_id');
        foreach (st_query($conn,
            "SELECT d.id, d.qty, d.damage_date, d.branch_id, p.product_name
               FROM product_damage d JOIN products p ON p.id = d.product_id WHERE 1=1 $bSql", $bT, $bP) as $r) {
            $add($r['product_name'], $r['damage_date'], 'Damage', 'DMG' . str_pad($r['id'], 3, '0', STR_PAD_LEFT), 0, $r['qty'], '', 3, $r['branch_id']);
        }
    }

    // Stock OUT — Purchase Catalog damage
    if (st_table_exists($conn, 'purchase_product_damage') && st_table_exists($conn, 'purchase_products')) {
        [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'd.branch_id');
        foreach (st_query($conn,
            "SELECT d.id, d.qty, d.damage_date, d.branch_id, p.product_name
               FROM purchase_product_damage d JOIN purchase_products p ON p.id = d.product_id WHERE 1=1 $bSql", $bT, $bP) as $r) {
            $add($r['product_name'], $r['damage_date'], 'Damage', 'PDMG' . str_pad($r['id'], 3, '0', STR_PAD_LEFT), 0, $r['qty'], '', 3, $r['branch_id']);
        }
    }

    // Current stock as the app shows it today
    $current = [];
    [$bSql, $bT, $bP] = st_branch_sql($branch_id, 'branch_id');
    foreach (st_query($conn, "SELECT product_name, SUM(current_stock) AS s FROM purchase_stock WHERE 1=1 $bSql GROUP BY product_name", $bT, $bP) as $r) {
        $current[strtolower(trim($r['product_name']))]['purchase_stock'] = round((float) $r['s'], 2);
    }
    foreach (st_query($conn, "SELECT product_name, SUM(stock_qty) AS s FROM products WHERE 1=1 $bSql GROUP BY product_name", $bT, $bP) as $r) {
        $current[strtolower(trim($r['product_name']))]['product_stock'] = round((float) $r['s'], 2);
    }

    // Purchase Catalog stock (names are never shared with the Product Catalog)
    if (st_table_exists($conn, 'purchase_products')) {
        foreach (st_query($conn, "SELECT product_name, SUM(stock_qty) AS s FROM purchase_products WHERE 1=1 $bSql GROUP BY product_name", $bT, $bP) as $r) {
            $k = strtolower(trim($r['product_name']));
            $current[$k]['product_stock'] = round(($current[$k]['product_stock'] ?? 0) + (float) $r['s'], 2);
        }
    }

    // Running balance per product
    $byProduct = [];
    foreach ($moves as $m) $byProduct[strtolower($m['product'])][] = $m;
    $rows = []; $summary = [];
    foreach ($byProduct as $key => $list) {
        [$op, $r, $cl] = st_ledger($list, $from, $to);
        foreach ($r as &$x) { $x['stock_balance'] = $x['balance']; }
        unset($x);
        $rows = array_merge($rows, $r);
        $summary[] = [
            'product' => $list[0]['product'], 'opening' => $op,
            'qty_in' => round(array_sum(array_column($r, 'qty_in')), 2),
            'qty_out' => round(array_sum(array_column($r, 'qty_out')), 2),
            'closing' => $cl,
            'current_stock' => $current[$key]['purchase_stock'] ?? null,
            'product_stock' => $current[$key]['product_stock'] ?? null,
        ];
    }
    usort($rows, fn($a, $b) => strcmp($a['date'], $b['date']) ?: strcasecmp($a['product'], $b['product']));
    usort($summary, fn($a, $b) => strcasecmp($a['product'], $b['product']));

    $out = [
        'success' => true, 'type' => $type, 'from' => $from, 'to' => $to,
        'rows' => $rows, 'summary' => $summary,
        'totals' => [
            'qty_in'  => round(array_sum(array_column($rows, 'qty_in')), 2),
            'qty_out' => round(array_sum(array_column($rows, 'qty_out')), 2),
        ],
    ];
    if ($type === 'product') {
        $s = $summary[0] ?? ['product' => $prodName, 'opening' => 0, 'closing' => 0,
                             'current_stock' => $current[$only]['purchase_stock'] ?? null,
                             'product_stock' => $current[$only]['product_stock'] ?? null];
        $out['product'] = $s['product'];
        $out['opening'] = $s['opening'];
        $out['closing'] = $s['closing'];
        $out['current_stock'] = $s['current_stock'];
        $out['product_stock'] = $s['product_stock'];
    }
    echo json_encode($out);
    break;

// ─────────────────────────────────────────────────────────────
//  9. Quotation statement — ONE quotation with all its details
//     GET ?type=quotation&quotation_id=ID
// ─────────────────────────────────────────────────────────────
case 'quotation':
    $qid = (int) ($_GET['quotation_id'] ?? 0);
    if ($qid <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Choose a quotation']);
        break;
    }
    $q = st_query($conn, "SELECT * FROM quotations WHERE id = ? LIMIT 1", 'i', [$qid])[0] ?? null;
    if (!$q || ($authUser['role'] !== 'admin' && !empty($authUser['branch_id']) && (int) $q['branch_id'] !== (int) $authUser['branch_id'])) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Quotation not found']);
        break;
    }
    $its = st_query($conn, "SELECT description, hsn, unit, quantity, rate, amount FROM quotation_items WHERE quotation_id = ? ORDER BY id", 'i', [$qid]);
    // same formula as quotation_api.php
    $sub     = array_sum(array_map(fn($i) => (float) $i['quantity'] * (float) $i['rate'], $its));
    $discAmt = $sub * (float) $q['discount_percent'] / 100;
    $taxable = $sub - $discAmt;
    $isGst   = !isset($q['is_gst']) || (int) $q['is_gst'] === 1;
    $taxAmt  = $isGst ? $taxable * (float) $q['tax_percent'] / 100 : 0;
    $roundOff = ($q['round_off'] !== null && $q['round_off'] !== '')
        ? (float) $q['round_off']
        : round($taxable + $taxAmt) - ($taxable + $taxAmt);
    $grand = $taxable + $taxAmt + $roundOff;
    $rows = [];
    foreach ($its as $i) {
        $rows[] = [
            'date' => st_date($q['quote_date']), 'reference' => $q['quote_no'],
            'description' => $i['description'], 'hsn' => $i['hsn'] ?? '', 'unit' => $i['unit'] ?? '',
            'qty' => (float) $i['quantity'], 'rate' => round((float) $i['rate'], 2),
            'amount' => round((float) $i['quantity'] * (float) $i['rate'], 2),
        ];
    }
    echo json_encode([
        'success' => true, 'type' => 'quotation', 'from' => $from, 'to' => $to,
        'quotation' => [
            'id' => (int) $q['id'], 'quote_no' => $q['quote_no'], 'date' => st_date($q['quote_date']),
            'valid_until' => $q['valid_until'] ? st_date($q['valid_until']) : '',
            'client_name' => $q['client_name'], 'client_phone' => $q['client_phone'] ?? '',
            'client_address' => $q['client_address'] ?? '', 'client_gst' => $q['client_gst'] ?? '',
            'po_no' => $q['po_no'] ?? '', 'notes' => $q['notes'] ?? '',
            'discount_percent' => (float) $q['discount_percent'], 'tax_percent' => $isGst ? (float) $q['tax_percent'] : 0,
            'branch_id' => (int) $q['branch_id'],
            'branch' => [1 => 'Kadambankulam', 2 => 'Nanguneri', 3 => 'Panagudi'][(int) $q['branch_id']] ?? '',
            'valid_until_raw' => $q['valid_until'] ?? '', 'vehicle_no' => $q['vehicle_no'] ?? '',
            'dispatched_through' => $q['dispatched_through'] ?? '', 'client_email' => $q['client_email'] ?? '',
            'ship_name' => $q['ship_name'] ?? '', 'ship_address' => $q['ship_address'] ?? '',
        ],
        'rows' => $rows,
        'totals' => [
            'items' => count($rows), 'qty' => round(array_sum(array_column($rows, 'qty')), 2),
            'subtotal' => round($sub, 2), 'discount' => round($discAmt, 2), 'tax' => round($taxAmt, 2),
            'round_off' => round($roundOff, 2), 'grand_total' => round($grand, 2),
        ],
        'opening' => 0, 'closing' => round($grand, 2),
    ]);
    break;

// ─────────────────────────────────────────────────────────────
//  10. Employee / salary statement — ONE employee
//      Earned (salary_days, net of advance) vs Paid (salary_payments)
//      GET ?type=employee&employee_id=ID&from&to
// ─────────────────────────────────────────────────────────────
case 'employee':
    $eid = (int) ($_GET['employee_id'] ?? 0);
    if ($eid <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Choose an employee']);
        break;
    }
    $emp = st_query($conn, "SELECT * FROM employees WHERE id = ? LIMIT 1", 'i', [$eid])[0] ?? null;
    if (!$emp || ($authUser['role'] !== 'admin' && !empty($authUser['branch_id']) && (int) $emp['branch_id'] !== (int) $authUser['branch_id'])) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Employee not found']);
        break;
    }
    $bn = [1 => 'Kadambankulam', 2 => 'Nanguneri', 3 => 'Panagudi'];
    $entries = [];
    if (st_table_exists($conn, 'salary_days')) {
        foreach (st_query($conn, "SELECT * FROM salary_days WHERE employee_id = ? ORDER BY date, id", 'i', [$eid]) as $d) {
            $n = fn($k) => (float) ($d[$k] ?? 0);
            $parts = [];
            if ($n('salary_amount'))   $parts[] = 'Salary ' . $n('salary_amount');
            if ($n('pack_count'))      $parts[] = 'Packs ' . $n('pack_count') . ' × ' . $n('pack_rate');
            if ($n('kambi_amount'))    $parts[] = 'Kambi Kattu ' . $n('kambi_amount');
            if ($n('others_amount'))   $parts[] = 'Others ' . $n('others_amount');
            if ($n('loading_amount'))  $parts[] = 'Loading ' . $n('loading_amount');
            if ($n('unloading_amount')) $parts[] = 'Unloading ' . $n('unloading_amount');
            if ($n('location_change')) $parts[] = 'Location ' . $n('location_change');
            if ($n('petrol'))          $parts[] = 'Petrol ' . $n('petrol');
            if ($n('tea'))             $parts[] = 'Tea ' . $n('tea');
            if ($n('food_amount'))     $parts[] = 'Food ' . $n('food_amount');
            if ($n('ot_day_amount') || $n('ot_amount')) $parts[] = 'OT ' . ($n('ot_day_amount') + $n('ot_amount'));
            if ((int) ($d['work_yes'] ?? 0) === 1 && $n('work_amount')) $parts[] = 'Work ' . $n('work_amount');
            if ($n('extra_amount'))    $parts[] = 'Extra ' . $n('extra_amount');
            $entries[] = [
                'date' => st_date($d['date']), 'sort' => 1, 'kind' => 'salary',
                'attendance' => (string) ($d['attendance_status'] ?? ''),
                'particulars' => 'Salary — ' . (($d['attendance_status'] ?? '') !== '' ? $d['attendance_status'] : 'Entry'),
                'reference' => 'SD-' . $d['id'], 'details' => implode(', ', $parts),
                'advance' => round($n('advance'), 2),
                'debit' => $n('total_amount'), 'credit' => 0,   // earned (already net of advance)
            ];
        }
    }
    if (st_table_exists($conn, 'salary_payments')) {
        foreach (st_query($conn, "SELECT id, amount, payment_date, note FROM salary_payments WHERE employee_id = ? ORDER BY payment_date, id", 'i', [$eid]) as $pm) {
            $entries[] = [
                'date' => st_date($pm['payment_date']), 'sort' => 2, 'kind' => 'payment',
                'particulars' => 'Salary Payment', 'reference' => 'SP-' . $pm['id'],
                'details' => (string) ($pm['note'] ?? ''), 'advance' => 0,
                'debit' => 0, 'credit' => (float) $pm['amount'],
            ];
        }
    }
    [$opening, $rows, $closing] = st_ledger($entries, $from, $to);
    $tot = fn($k) => round(array_sum(array_column($rows, $k)), 2);
    // salary period + attendance counts (from the saved salary entries in range)
    $salRows = array_values(array_filter($rows, fn($r) => ($r['kind'] ?? '') === 'salary'));
    $att = ['Present' => 0, 'Half Day' => 0, 'Absent' => 0];
    foreach ($salRows as $r) if (isset($att[$r['attendance'] ?? ''])) $att[$r['attendance']]++;
    echo json_encode([
        'success' => true, 'type' => 'employee', 'from' => $from, 'to' => $to,
        'employee' => [
            'id' => (int) $emp['id'], 'name' => $emp['employee_name'], 'emp_id' => $emp['emp_id'] ?? '',
            'gender' => $emp['gender'] ?? '', 'address' => $emp['address'] ?? '',
            'phone' => $emp['whatsapp_number'] ?? $emp['phone_number'] ?? '',
            'branch' => $bn[(int) $emp['branch_id']] ?? '', 'branch_id' => (int) $emp['branch_id'],
            'salary_type' => $emp['salary_type'] ?? '', 'salary_amount' => (float) ($emp['salary_amount'] ?? 0),
            'date_of_joining' => $emp['date_of_joining'] ?? '',
        ],
        'opening' => $opening, 'rows' => $rows, 'closing' => $closing,
        'totals' => [
            'earned' => $tot('debit'), 'paid' => $tot('credit'), 'advance' => $tot('advance'),
            'entries' => count($rows), 'salary_days' => count($salRows),
            'first_date' => $salRows ? $salRows[0]['date'] : '', 'last_date' => $salRows ? end($salRows)['date'] : '',
            'present' => $att['Present'], 'half_day' => $att['Half Day'], 'absent' => $att['Absent'],
        ],
    ]);
    break;

default:
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Unknown statement type']);
}
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Statement error: ' . $e->getMessage()]);
}