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
function pbApplyStock(mysqli $conn, array $items, ?int $branchId, int $sign): void {
    // branch_id <=> ? also matches NULL (All Branch)
    $sel = $conn->prepare("SELECT id FROM purchase_stock WHERE product_id = ? AND branch_id <=> ?");
    $upd = $conn->prepare(
        "UPDATE purchase_stock
            SET total_purchased = total_purchased + ?,
                current_stock   = current_stock + ?,
                rate = IF(? > 0, ?, rate),
                product_name = IF(? > 0, ?, product_name)
          WHERE product_id = ? AND branch_id <=> ?"
    );
    $ins = $conn->prepare(
        "INSERT INTO purchase_stock (product_id, product_name, total_purchased, current_stock, rate, branch_id)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    foreach ($items as $it) {
        $pid  = (string)$it['product_id'];
        $name = (string)$it['product_name'];
        $qty  = (float)$it['quantity'] * $sign;
        $rate = (float)$it['rate'];

        $sel->bind_param('si', $pid, $branchId);
        $sel->execute();
        $exists = $sel->get_result()->fetch_assoc();

        if ($exists) {
            $upd->bind_param('dddddssi', $qty, $qty, $sign, $rate, $sign, $name, $pid, $branchId);
            $upd->execute();
        } elseif ($sign > 0) {
            $ins->bind_param('ssdddi', $pid, $name, $qty, $qty, $rate, $branchId);
            $ins->execute();
        }
    }
    $sel->close(); $upd->close(); $ins->close();
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