<?php
// =============================================================
//  purchase_common.php — shared helpers for purchase bill files
// =============================================================

function pbEffectiveBranchId(array $user): ?int {
    if ($user['role'] === 'admin') {
        return isset($user['view_branch_id']) && $user['view_branch_id'] !== null
            ? (int)$user['view_branch_id'] : null;
    }
    return isset($user['branch_id']) && $user['branch_id'] !== null ? (int)$user['branch_id'] : null;
}

function pbRespond(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

// Phone key = last 10 digits ("+91 98765 43210" == "9876543210")
function pbPhoneKey(?string $p): string {
    $d = preg_replace('/\D/', '', (string)$p);
    return strlen($d) > 10 ? substr($d, -10) : $d;
}

// Link a purchase bill to a customer/party:
//   1) phone number   (same phone = same customer; creates the party if new)
//   2) invoice number (only if given and it matches a Tax Invoice)
//   3) company name
function pbLinkParty(mysqli $conn, string $name, string $phone, ?int $branchId, string $invoiceNo = ''): ?int {
    if ($phone !== '') {
        $st = $conn->prepare(
            "SELECT id FROM clients
              WHERE RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+',''),'(',''),')',''),'.',''),'/',''), 10) = ?
              ORDER BY (branch_id <=> ?) DESC, id ASC LIMIT 1"
        );
        $st->bind_param('si', $phone, $branchId);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if ($row) return (int)$row['id'];

        $ins = $conn->prepare("INSERT INTO clients (name, phone, branch_id) VALUES (?, ?, ?)");
        $ins->bind_param('ssi', $name, $phone, $branchId);
        $ins->execute();
        $id = (int)$conn->insert_id;
        $ins->close();
        return $id;
    }

    if ($invoiceNo !== '') {
        $st = $conn->prepare(
            "SELECT client_id FROM invoices
              WHERE invoice_no = ? AND client_id IS NOT NULL
              ORDER BY id DESC LIMIT 1"
        );
        $st->bind_param('s', $invoiceNo);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if ($row) return (int)$row['client_id'];
    }

    $st = $conn->prepare("SELECT id FROM clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
    $st->bind_param('s', $name);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ? (int)$row['id'] : null;
}

// Load a bill and check the user may touch it
function pbLoadBill(mysqli $conn, int $billId, array $user): array {
    // (branch users may only touch their own branch's bills)
    $st = $conn->prepare("SELECT * FROM purchase_bills WHERE id = ?");
    $st->bind_param('i', $billId);
    $st->execute();
    $bill = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$bill) pbRespond(404, ['message' => 'Purchase bill not found']);
    if ($user['role'] !== 'admin' && (int)$bill['branch_id'] !== (int)$user['branch_id']) {
        pbRespond(403, ['message' => 'This bill belongs to another branch']);
    }
    return $bill;
}

// Add (+1) or reverse (-1) the stock of a bill's items
// Branch of ONE item: "All Branch" = NULL, otherwise a branch id (1/2/3).
// Admin picks it per item; branch users always use their own branch ($fallback).
// No choice sent (old clients) -> $fallback, i.e. the previous behaviour.
function pbItemBranch(mysqli $conn, array $it, array $user, ?int $fallback): ?int {
    if (($user['role'] ?? '') !== 'admin') return $fallback;
    if (!array_key_exists('branch_id', $it)) return $fallback;
    $v = $it['branch_id'];
    if ($v === null || $v === '' || $v === 'all') return null;
    $id = (int)$v;
    $res = $conn->query("SELECT id FROM branches WHERE id = " . $id);
    if ($res && $res->num_rows > 0) return $id;
    pbRespond(400, ['message' => 'Invalid branch selected for a product']);
}

function pbApplyStock(mysqli $conn, array $items, ?int $branchId, int $sign): void {
    // branch_id <=> ? also matches NULL (All Branch)
    $billBranch = $branchId;
    $sel = $conn->prepare("SELECT id FROM purchase_stock WHERE product_id = ? AND branch_id <=> ?");
    $upd = $conn->prepare(
        "UPDATE purchase_stock
            SET total_purchased = total_purchased + ?,
                current_stock   = current_stock + ?,
                rate = IF(? > 0, ?, rate),
                product_name = IF(? > 0 AND COALESCE(product_name,'') = '', ?, product_name),
                hsn = IF(? = 1, ?, hsn)
          WHERE product_id = ? AND branch_id <=> ?"
    );
    $ins = $conn->prepare(
        "INSERT INTO purchase_stock (product_id, product_name, hsn, total_purchased, current_stock, rate, branch_id)
         VALUES (?, ?, NULLIF(?, ''), ?, ?, ?, ?)"
    );
    foreach ($items as $it) {
        $pid  = (string)$it['product_id'];
        $name = (string)$it['product_name'];
        // per-item branch (item_branch) when given, else the bill's branch
        $hsn  = trim((string)($it['hsn'] ?? ''));
        $setHsn = ($sign > 0 && $hsn !== '') ? 1 : 0;   // HSN is only an attribute; never blanked
        $ib   = array_key_exists('item_branch', $it) ? ($it['item_branch'] === null ? null : (int)$it['item_branch']) : $billBranch;
        $qty  = (float)$it['quantity'] * $sign;
        $rate = (float)$it['rate'];

        $sel->bind_param('si', $pid, $ib);
        $sel->execute();
        $exists = $sel->get_result()->fetch_assoc();

        if ($exists) {
            $upd->bind_param('dddddsissi', $qty, $qty, $sign, $rate, $sign, $name, $setHsn, $hsn, $pid, $ib);
            $upd->execute();
        } elseif ($sign > 0) {
            $ins->bind_param('sssdddi', $pid, $name, $hsn, $qty, $qty, $rate, $ib);
            $ins->execute();
        }
    }
    $sel->close(); $upd->close(); $ins->close();
}

// Product identity = Product ID + Product Name. The typed code (HSN / code) is only
// an attribute: two DIFFERENT products may share the same code, so they must not be
// merged into one stock row. Returns the product_id to store/use for this item:
//   1) this id already belongs to this product name        -> that id
//   2) this product name already lives under a derived id  -> e.g. "1234-2"
//   3) the id is unused                                     -> the id as typed
//   4) the id belongs to another product                    -> next free "<id>-N"
function pbResolveProductId(mysqli $conn, string $pid, string $name): string {
    $key = mb_strtolower(trim($name));
    $one = function (string $sql, string $types, array $params) use ($conn) {
        $st = $conn->prepare($sql);
        $st->bind_param($types, ...$params);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        return $row;
    };

    if ($one("SELECT product_id FROM purchase_stock WHERE product_id = ? AND LOWER(TRIM(product_name)) = ? LIMIT 1",
             'ss', [$pid, $key])) {
        return $pid;
    }
    $like = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $pid) . '-%';
    if ($r = $one("SELECT product_id FROM purchase_stock WHERE LOWER(TRIM(product_name)) = ? AND product_id LIKE ? LIMIT 1",
                  'ss', [$key, $like])) {
        return $r['product_id'];
    }
    if (!$one("SELECT 1 AS x FROM purchase_stock WHERE product_id = ? LIMIT 1", 's', [$pid])) {
        return $pid;
    }
    for ($n = 2; $n < 1000; $n++) {
        $cand = $pid . '-' . $n;
        $r = $one("SELECT product_name FROM purchase_stock WHERE product_id = ? LIMIT 1", 's', [$cand]);
        if (!$r || mb_strtolower(trim($r['product_name'])) === $key) return $cand;
    }
    return $pid;
}

// Product names are matched ignoring upper/lower case and extra spaces. When the
// product already exists, its stored spelling is used (never the typed one), so
// "CHAIN 4X4" and "chain 4x4" both stay as the existing "Chain 4x4".
function pbCanonicalName(mysqli $conn, string $pid, string $name): string {
    $name = trim($name);
    $st = $conn->prepare("SELECT product_name FROM purchase_stock WHERE product_id = ? ORDER BY id ASC LIMIT 1");
    $st->bind_param('s', $pid);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    if ($row && trim((string)$row['product_name']) !== '' &&
        mb_strtolower(trim((string)$row['product_name'])) === mb_strtolower($name)) {
        return trim((string)$row['product_name']);
    }
    return $name;
}

// HSN code is only an attribute of a purchased product (NOT an identifier).
// Added once, on purchase_bill_items and purchase_stock. Existing rows stay NULL.
function pbEnsureHsnColumns(mysqli $conn): void {
    foreach (['purchase_bill_items', 'purchase_stock'] as $table) {
        $res = $conn->query("SHOW COLUMNS FROM $table LIKE 'hsn'");
        if ($res && $res->num_rows === 0) {
            $conn->query("ALTER TABLE $table ADD COLUMN hsn VARCHAR(50) NULL DEFAULT NULL");
        }
    }
}

// Internal product id for one purchased row (HSN is NOT used to identify products):
//   - an id already sent (editing a saved bill)           -> kept (pbResolveProductId)
//   - the product NAME already exists in purchase stock   -> that product's id
//   - otherwise a NEW product: HSN-based id when an HSN was typed (kept unique by
//     pbResolveProductId, so same HSN + different name = separate product),
//     or an auto id "PB-n" when no HSN was typed
function pbPickProductId(mysqli $conn, string $pidIn, string $name, string $hsn): string {
    if ($pidIn !== '') return pbResolveProductId($conn, $pidIn, $name);
    $key = mb_strtolower(trim($name));
    $st = $conn->prepare("SELECT product_id FROM purchase_stock WHERE LOWER(TRIM(product_name)) = ? ORDER BY id ASC LIMIT 1");
    $st->bind_param('s', $key);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    if ($row) return (string)$row['product_id'];
    if ($hsn !== '') return pbResolveProductId($conn, $hsn, $name);
    $chk = $conn->prepare("SELECT 1 AS x FROM purchase_stock WHERE product_id = ? LIMIT 1");
    for ($n = 1; $n < 100000; $n++) {
        $cand = 'PB-' . $n;
        $chk->bind_param('s', $cand);
        $chk->execute();
        if (!$chk->get_result()->fetch_assoc()) { $chk->close(); return $cand; }
    }
    $chk->close();
    return 'PB-' . time();
}

function pbEnsurePaymentsTable(mysqli $conn): void {
    $conn->query("
        CREATE TABLE IF NOT EXISTS purchase_bill_payments (
          id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
          purchase_bill_id INT UNSIGNED  NOT NULL,
          amount           DECIMAL(12,2) NOT NULL,
          payment_date     DATE          NOT NULL,
          note             TEXT          DEFAULT NULL,
          branch_id        INT UNSIGNED  DEFAULT NULL,
          created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id), KEY (purchase_bill_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

// ── Round off ─────────────────────────────────────────────────
// Adds purchase_bills.round_off_mode / round_off once (MySQL + MariaDB safe)
// "All Branch" purchase bills store branch_id = NULL → columns must allow it
function pbEnsureNullableBranch(mysqli $conn): void {
    $targets = [
        'purchase_bills'      => 'branch_id',
        'purchase_bill_items' => 'branch_id',
        'purchase_stock'      => 'branch_id',
    ];
    foreach ($targets as $table => $col) {
        $res = $conn->query("SHOW COLUMNS FROM $table LIKE '$col'");
        $row = $res ? $res->fetch_assoc() : null;
        if ($row && strtoupper($row['Null']) === 'NO') {
            $conn->query("ALTER TABLE $table MODIFY COLUMN $col INT UNSIGNED NULL DEFAULT NULL");
        }
    }
}

function pbEnsureRoundOffColumns(mysqli $conn): void {
    $cols = [
        'round_off_mode' => "VARCHAR(10) NOT NULL DEFAULT 'none'",
        'round_off'      => "DECIMAL(10,2) NOT NULL DEFAULT 0.00",
    ];
    foreach ($cols as $col => $def) {
        $res = $conn->query("SHOW COLUMNS FROM purchase_bills LIKE '$col'");
        if ($res && $res->num_rows === 0) {
            $conn->query("ALTER TABLE purchase_bills ADD COLUMN $col $def");
        }
    }
}

// mode: 'auto'   → nearest whole rupee (server calculates)
//       'manual' → amount typed by the user (+ or −)
//       'none'   → no round off (old bills)
// $billAmount = subtotal + GST (opening balance is NOT rounded)
// Returns [mode, roundOff]
function pbRoundOff(string $mode, $manualValue, float $billAmount): array {
    $mode = in_array($mode, ['auto', 'manual', 'none'], true) ? $mode : 'none';
    if ($mode === 'auto') {
        return ['auto', round(round($billAmount) - $billAmount, 2)];
    }
    if ($mode === 'manual') {
        if ($manualValue === '' || $manualValue === null || !is_numeric($manualValue)) {
            pbRespond(400, ['message' => 'Enter a valid manual round off amount (e.g. 0.40 or -0.60)']);
        }
        $r = round((float)$manualValue, 2);
        if ($billAmount + $r < 0) {
            pbRespond(400, ['message' => 'Round off cannot make the bill amount negative']);
        }
        return ['manual', $r];
    }
    return ['none', 0.0];
}

// purchase_bills.gst_type: 'cgst_sgst' (default, as before) or 'igst' – column added once
function pbEnsureGstTypeColumn(mysqli $conn): void
{
    $r = $conn->query("SHOW COLUMNS FROM purchase_bills LIKE 'gst_type'");
    if ($r && $r->num_rows === 0) {
        $conn->query("ALTER TABLE purchase_bills ADD COLUMN gst_type VARCHAR(10) NOT NULL DEFAULT 'cgst_sgst'");
    }
}