<?php
// =============================================================
//  govtax_api.php — Gov Tax: Sales / Purchase registers + monthly adjustment
//
//  A SEPARATE reporting & adjustment layer. It only READS invoices,
//  invoice_items, purchase_bills, purchase_bill_items, clients.
//  Every change is stored in its own tables:
//     govtax_purchase_override   (per purchase bill, register-only values)
//     govtax_purchase_history    (log of purchase register edits)
//     govtax_monthly             (manual adjustment / carry-forward use per month)
//     govtax_adjustment_history  (log of monthly adjustment changes)
//  No UPDATE / INSERT / DELETE is ever run on a billing table.
//
//  GET  ?action=data&from=YYYY-MM-DD&to=YYYY-MM-DD[&month=YYYY-MM]
//  GET  ?action=history&month=YYYY-MM
//  POST action=purchase_override  {purchase_bill_id, particulars?, gstin?, taxable?,
//                                  additional_cost?, cgst?, sgst?, igst?, round_off?, note?}
//  POST action=purchase_reset     {purchase_bill_id}
//  POST action=save_adjustment    {month, manual, carry_used, note?}
//
//  Monthly adjustment model (per branch scope; 0 = All Branch)
//     S = GST sales taxable total, P = GST purchase taxable total (after Gov Tax edits)
//     A = max(0, S - P)                 automatic adjustment
//     O = previous month's carry forward
//     available = A + O
//     M = manual adjustment (from this month's A), U = carry-forward used (from O)
//     Final adjusted sales = S - A - M - U      (never negative)
//     remaining = (A - M) + (O - U)  → this month's carry forward → next month's O
// =============================================================

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json');

if (($authUser['role'] ?? '') !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Gov Tax is available to admins only']);
    exit;
}

$conn = getDB();
$branch_id = $authUser['view_branch_id'] ?? null;
$branch_id = $branch_id ? (int)$branch_id : null;
$scope = $branch_id ?? 0;
$uid   = (int)($authUser['id'] ?? 0);
$uname = (string)($authUser['username'] ?? $authUser['name'] ?? ('user#' . $uid));

function gt_out($arr, int $code = 200) { http_response_code($code); echo json_encode($arr); exit; }
function gt_r($v): float { return round((float)$v, 2); }
function gt_valid_date($d): ?string { return ($d && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) ? $d : null; }

// ── Own tables (created on first use) ───────────────────────────
function gt_ensure(mysqli $c): void {
    $c->query("CREATE TABLE IF NOT EXISTS govtax_purchase_override (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        purchase_bill_id INT UNSIGNED NOT NULL,
        particulars VARCHAR(255) NULL,
        gstin VARCHAR(50) NULL,
        taxable DECIMAL(12,2) NULL,
        additional_cost DECIMAL(12,2) NULL,
        cgst DECIMAL(12,2) NULL,
        sgst DECIMAL(12,2) NULL,
        igst DECIMAL(12,2) NULL,
        round_off DECIMAL(10,2) NULL,
        updated_by VARCHAR(100) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_gt_pb (purchase_bill_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $c->query("CREATE TABLE IF NOT EXISTS govtax_purchase_history (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        purchase_bill_id INT UNSIGNED NOT NULL,
        action VARCHAR(20) NOT NULL,
        before_json TEXT NULL,
        after_json TEXT NULL,
        note VARCHAR(255) NULL,
        changed_by VARCHAR(100) NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_gt_ph (purchase_bill_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $c->query("CREATE TABLE IF NOT EXISTS govtax_monthly (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        scope_key INT UNSIGNED NOT NULL DEFAULT 0,
        ym CHAR(7) NOT NULL,
        manual_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0,
        carry_used DECIMAL(12,2) NOT NULL DEFAULT 0,
        note VARCHAR(255) NULL,
        updated_by VARCHAR(100) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_gt_month (scope_key, ym)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $c->query("CREATE TABLE IF NOT EXISTS govtax_adjustment_history (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        scope_key INT UNSIGNED NOT NULL DEFAULT 0,
        ym CHAR(7) NOT NULL,
        old_manual DECIMAL(12,2) NOT NULL DEFAULT 0,
        new_manual DECIMAL(12,2) NOT NULL DEFAULT 0,
        old_carry_used DECIMAL(12,2) NOT NULL DEFAULT 0,
        new_carry_used DECIMAL(12,2) NOT NULL DEFAULT 0,
        auto_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0,
        opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        closing_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        note VARCHAR(255) NULL,
        changed_by VARCHAR(100) NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_gt_ah (scope_key, ym)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
gt_ensure($conn);

// ── Read helpers (billing tables are only SELECTed) ─────────────
function gt_has_col(mysqli $c, string $t, string $col): bool {
    $r = $c->query("SHOW COLUMNS FROM `$t` LIKE '" . $c->real_escape_string($col) . "'");
    return $r && $r->num_rows > 0;
}

/** GST tax invoices (loose or with customer). Non-GST (rate 0 and no tax) excluded. */
function gt_sales_rows(mysqli $c, ?int $branch): array {
    $igstCol = gt_has_col($c, 'invoices', 'gst_type') ? "i.gst_type" : "'cgst_sgst'";
    $sql = "SELECT i.id, i.invoice_no, i.invoice_date, i.buyer_name, i.buyer_gst, i.subtotal,
                   i.cgst_amount, i.sgst_amount, i.total_tax, i.round_off, i.net_amount, i.gst_rate,
                   $igstCol AS gst_type, i.branch_id, c.gst AS client_gst, c.name AS client_name
              FROM invoices i
              LEFT JOIN clients c ON c.id = i.client_id
             WHERE (i.gst_rate > 0 OR i.total_tax > 0)";
    if ($branch !== null) $sql .= " AND (i.branch_id = ? OR i.branch_id IS NULL)";
    $sql .= " ORDER BY i.invoice_date ASC, i.id ASC";
    $st = $c->prepare($sql);
    if ($branch !== null) $st->bind_param('i', $branch);
    $st->execute();
    $out = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        $igst = ($r['gst_type'] === 'igst');
        $tax  = gt_r($r['total_tax']);
        $out[] = [
            'id'          => (int)$r['id'],
            'date'        => substr($r['invoice_date'], 0, 10),
            'particulars' => $r['buyer_name'] !== '' && $r['buyer_name'] !== null ? $r['buyer_name'] : ($r['client_name'] ?? ''),
            'voucher'     => 'GST Sales',
            'bill_no'     => $r['invoice_no'],
            'gstin'       => $r['buyer_gst'] ?: ($r['client_gst'] ?? ''),
            'value'       => gt_r($r['subtotal']),
            'gross'       => gt_r($r['net_amount']),
            'gst_sales'   => gt_r($r['subtotal']),
            'cgst'        => $igst ? 0.0 : gt_r($r['cgst_amount']),
            'sgst'        => $igst ? 0.0 : gt_r($r['sgst_amount']),
            'igst'        => $igst ? $tax : 0.0,
            'round_off'   => gt_r($r['round_off']),
            'gst_type'    => $igst ? 'igst' : 'cgst_sgst',
        ];
    }
    return $out;
}

/** GST purchase bills with Gov Tax edits layered on top (originals untouched). */
function gt_purchase_rows(mysqli $c, ?int $branch): array {
    $igstCol = gt_has_col($c, 'purchase_bills', 'gst_type') ? "p.gst_type" : "'cgst_sgst'";
    $sql = "SELECT p.id, p.company_name, p.invoice_no, p.bill_date, p.total_amount, p.opening_balance,
                   p.gst_rate, p.round_off, p.branch_id, $igstCol AS gst_type, c.gst AS client_gst,
                   (SELECT SUM(pi.amount) FROM purchase_bill_items pi WHERE pi.purchase_bill_id = p.id) AS items_total,
                   o.id AS ov_id, o.particulars AS o_part, o.gstin AS o_gstin, o.taxable AS o_taxable,
                   o.additional_cost AS o_add, o.cgst AS o_cgst, o.sgst AS o_sgst, o.igst AS o_igst,
                   o.round_off AS o_round, o.updated_by AS o_by, o.updated_at AS o_at
              FROM purchase_bills p
              LEFT JOIN clients c ON c.id = p.client_id
              LEFT JOIN govtax_purchase_override o ON o.purchase_bill_id = p.id
             WHERE p.gst_enabled = 1";
    if ($branch !== null) $sql .= " AND (p.branch_id = ? OR p.branch_id IS NULL)";
    $sql .= " ORDER BY p.bill_date ASC, p.id ASC";
    $st = $c->prepare($sql);
    if ($branch !== null) $st->bind_param('i', $branch);
    $st->execute();
    $out = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        $rate = (float)$r['gst_rate'];
        if ($r['items_total'] !== null) {
            $sub = gt_r($r['items_total']);
        } else {
            $sub = gt_r(((float)$r['total_amount'] - (float)$r['opening_balance'] - (float)$r['round_off']) / (1 + $rate / 100));
        }
        $gst  = gt_r($sub * $rate / 100);
        $igst = ($r['gst_type'] === 'igst');
        $o_cgst = $igst ? 0.0 : gt_r($gst / 2);
        $orig = [
            'particulars'     => (string)$r['company_name'],
            'gstin'           => (string)($r['client_gst'] ?? ''),
            'taxable'         => $sub,
            'additional_cost' => 0.0,
            'cgst'            => $o_cgst,
            'sgst'            => $igst ? 0.0 : gt_r($gst - $o_cgst),
            'igst'            => $igst ? $gst : 0.0,
            'round_off'       => gt_r($r['round_off']),
        ];
        $eff = $orig;
        $edited = !empty($r['ov_id']);
        if ($edited) {
            $map = ['particulars' => 'o_part', 'gstin' => 'o_gstin', 'taxable' => 'o_taxable',
                    'additional_cost' => 'o_add', 'cgst' => 'o_cgst', 'sgst' => 'o_sgst',
                    'igst' => 'o_igst', 'round_off' => 'o_round'];
            foreach ($map as $k => $col) {
                if ($r[$col] !== null) {
                    $eff[$k] = in_array($k, ['particulars', 'gstin'], true) ? (string)$r[$col] : gt_r($r[$col]);
                }
            }
        }
        $gross = gt_r($eff['taxable'] + $eff['additional_cost'] + $eff['cgst'] + $eff['sgst'] + $eff['igst'] + $eff['round_off']);
        $ogross = gt_r($orig['taxable'] + $orig['cgst'] + $orig['sgst'] + $orig['igst'] + $orig['round_off']);
        $out[] = [
            'id'              => (int)$r['id'],
            'date'            => substr($r['bill_date'], 0, 10),
            'particulars'     => $eff['particulars'],
            'voucher'         => 'Purchase',
            'bill_no'         => $r['invoice_no'] !== '' ? $r['invoice_no'] : ('PB-' . $r['id']),
            'gstin'           => $eff['gstin'],
            'value'           => $eff['taxable'],
            'additional_cost' => $eff['additional_cost'],
            'gross'           => $gross,
            'gst_purchase'    => $eff['taxable'],
            'cgst'            => $eff['cgst'],
            'sgst'            => $eff['sgst'],
            'igst'            => $eff['igst'],
            'round_off'       => $eff['round_off'],
            'gst_type'        => $igst ? 'igst' : 'cgst_sgst',
            'gst_rate'        => $rate,
            'edited'          => $edited,
            'edited_by'       => $edited ? $r['o_by'] : null,
            'edited_at'       => $edited ? $r['o_at'] : null,
            'original'        => $orig + ['gross' => $ogross],
        ];
    }
    return $out;
}

function gt_totals(array $rows, array $keys): array {
    $t = array_fill_keys($keys, 0.0);
    foreach ($rows as $r) foreach ($keys as $k) $t[$k] += (float)$r[$k];
    foreach ($t as $k => $v) $t[$k] = gt_r($v);
    return $t;
}

function gt_month_sums(array $rows, string $key): array {
    $m = [];
    foreach ($rows as $r) {
        $ym = substr($r['date'], 0, 7);
        $m[$ym] = ($m[$ym] ?? 0) + (float)$r[$key];
    }
    return $m;
}

/** Walk month by month; each closing balance becomes the next opening balance. */
function gt_chain(mysqli $c, int $scope, array $sales, array $purchase, string $upToYm): array {
    $S = gt_month_sums($sales, 'gst_sales');
    $P = gt_month_sums($purchase, 'gst_purchase');
    $saved = [];
    $st = $c->prepare("SELECT ym, manual_adjustment, carry_used, note, updated_by, updated_at FROM govtax_monthly WHERE scope_key = ?");
    $st->bind_param('i', $scope);
    $st->execute();
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $r) $saved[$r['ym']] = $r;

    $all = array_merge(array_keys($S), array_keys($P), array_keys($saved), [$upToYm]);
    sort($all);
    $first = $all[0];
    $last  = max($all);
    $res = [];
    $open = 0.0;
    $cur = new DateTime($first . '-01');
    $end = new DateTime($last . '-01');
    while ($cur <= $end) {
        $ym  = $cur->format('Y-m');
        $s   = gt_r($S[$ym] ?? 0);
        $p   = gt_r($P[$ym] ?? 0);
        $a   = gt_r(max(0, $s - $p));
        $m0  = (float)($saved[$ym]['manual_adjustment'] ?? 0);
        $u0  = (float)($saved[$ym]['carry_used'] ?? 0);
        $room = max(0, $s - $a);                       // sales left after automatic adjustment
        $m   = gt_r(max(0, min($m0, $a, $room)));
        $u   = gt_r(max(0, min($u0, $open, $room - $m)));
        $final = gt_r($s - $a - $m - $u);
        $remaining = gt_r(($a - $m) + ($open - $u));
        $res[$ym] = [
            'month'            => $ym,
            'actual_sales'     => $s,
            'purchase_total'   => $p,
            'auto_adjustment'  => $a,
            'manual_adjustment'=> $m,
            'prev_carry_forward' => gt_r($open),
            'balance_used'     => $u,
            'final_sales'      => $final,
            'available'        => gt_r($a + $open),
            'remaining'        => $remaining,
            'carry_forward'    => $remaining,
            'max_manual'       => gt_r(min($a, $room)),
            'max_carry_use'    => gt_r(min($open, $room - $m)),
            'clamped'          => (abs($m - $m0) > 0.004 || abs($u - $u0) > 0.004),
            'note'             => $saved[$ym]['note'] ?? null,
            'updated_by'       => $saved[$ym]['updated_by'] ?? null,
            'updated_at'       => $saved[$ym]['updated_at'] ?? null,
        ];
        $open = $remaining;
        $cur->modify('+1 month');
    }
    return $res;
}

$action = $_GET['action'] ?? '';
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $body['action'] ?? $action;
}

// ─────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'data') {
    $from = gt_valid_date($_GET['from'] ?? null);
    $to   = gt_valid_date($_GET['to'] ?? null);
    $month = preg_match('/^\d{4}-\d{2}$/', $_GET['month'] ?? '') ? $_GET['month'] : substr($from ?: date('Y-m-d'), 0, 7);

    $salesAll = gt_sales_rows($conn, $branch_id);
    $purAll   = gt_purchase_rows($conn, $branch_id);

    $f = fn($r) => (!$from || $r['date'] >= $from) && (!$to || $r['date'] <= $to);
    $sales = array_values(array_filter($salesAll, $f));
    $pur   = array_values(array_filter($purAll, $f));

    $chain = gt_chain($conn, $scope, $salesAll, $purAll, $month);

    // Helpers for the screen: how much GST data exists outside the chosen dates, and how many
    // purchase bills are Non-GST (excluded by design).
    $lastP = $purAll ? max(array_column($purAll, 'date')) : null;
    $lastS = $salesAll ? max(array_column($salesAll, 'date')) : null;
    $latest = max((string)$lastP, (string)$lastS);
    $nonGst = 0;
    $q = "SELECT COUNT(*) AS n FROM purchase_bills WHERE gst_enabled = 0" . ($branch_id !== null ? " AND (branch_id = ? OR branch_id IS NULL)" : "");
    $st = $conn->prepare($q);
    if ($branch_id !== null) $st->bind_param('i', $branch_id);
    $st->execute();
    $nonGst = (int)($st->get_result()->fetch_assoc()['n'] ?? 0);

    gt_out([
        'success' => true,
        'branch_id' => $branch_id,
        'sales' => ['rows' => $sales, 'totals' => gt_totals($sales, ['value', 'gross', 'gst_sales', 'cgst', 'sgst', 'igst', 'round_off'])],
        'purchase' => ['rows' => $pur, 'totals' => gt_totals($pur, ['value', 'additional_cost', 'gross', 'gst_purchase', 'cgst', 'sgst', 'igst', 'round_off'])],
        'adjustment' => $chain[$month] ?? null,
        'meta' => [
            'gst_sales_total_count' => count($salesAll),
            'gst_purchase_total_count' => count($purAll),
            'non_gst_purchase_count' => $nonGst,
            'latest_month' => $latest ? substr($latest, 0, 7) : null,
            'latest_purchase_month' => $lastP ? substr($lastP, 0, 7) : null,
        ],
        'months' => array_values($chain),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'history') {
    $out = ['adjustments' => [], 'purchase_edits' => []];
    $month = $_GET['month'] ?? '';
    if (preg_match('/^\d{4}-\d{2}$/', $month)) {
        $st = $conn->prepare("SELECT * FROM govtax_adjustment_history WHERE scope_key = ? AND ym = ? ORDER BY id DESC LIMIT 100");
        $st->bind_param('is', $scope, $month);
    } else {
        $st = $conn->prepare("SELECT * FROM govtax_adjustment_history WHERE scope_key = ? ORDER BY id DESC LIMIT 100");
        $st->bind_param('i', $scope);
    }
    $st->execute();
    $out['adjustments'] = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $pb = (int)($_GET['purchase_bill_id'] ?? 0);
    if ($pb) {
        $st = $conn->prepare("SELECT * FROM govtax_purchase_history WHERE purchase_bill_id = ? ORDER BY id DESC LIMIT 50");
        $st->bind_param('i', $pb);
        $st->execute();
        $out['purchase_edits'] = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    }
    gt_out(['success' => true] + $out);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'purchase_override') {
    $pb = (int)($body['purchase_bill_id'] ?? 0);
    $exists = $conn->prepare("SELECT id FROM purchase_bills WHERE id = ? AND gst_enabled = 1");
    $exists->bind_param('i', $pb);
    $exists->execute();
    if (!$exists->get_result()->fetch_assoc()) gt_out(['success' => false, 'message' => 'GST purchase bill not found'], 404);

    $nums = ['taxable', 'additional_cost', 'cgst', 'sgst', 'igst', 'round_off'];
    $vals = [];
    foreach ($nums as $k) {
        if (!array_key_exists($k, $body) || $body[$k] === '' || $body[$k] === null) { $vals[$k] = null; continue; }
        if (!is_numeric($body[$k])) gt_out(['success' => false, 'message' => "$k must be a number"], 422);
        $v = gt_r($body[$k]);
        if ($k !== 'round_off' && $v < 0) gt_out(['success' => false, 'message' => "$k cannot be negative"], 422);
        $vals[$k] = $v;
    }
    $part  = isset($body['particulars']) && trim($body['particulars']) !== '' ? trim($body['particulars']) : null;
    $gstin = isset($body['gstin']) && trim($body['gstin']) !== '' ? trim($body['gstin']) : null;
    $note  = isset($body['note']) ? mb_substr(trim($body['note']), 0, 250) : null;

    $before = null;
    $b = $conn->prepare("SELECT * FROM govtax_purchase_override WHERE purchase_bill_id = ?");
    $b->bind_param('i', $pb);
    $b->execute();
    $before = $b->get_result()->fetch_assoc();

    $st = $conn->prepare("INSERT INTO govtax_purchase_override
        (purchase_bill_id, particulars, gstin, taxable, additional_cost, cgst, sgst, igst, round_off, updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE particulars=VALUES(particulars), gstin=VALUES(gstin), taxable=VALUES(taxable),
          additional_cost=VALUES(additional_cost), cgst=VALUES(cgst), sgst=VALUES(sgst), igst=VALUES(igst),
          round_off=VALUES(round_off), updated_by=VALUES(updated_by)");
    $st->bind_param('issdddddds', $pb, $part, $gstin, $vals['taxable'], $vals['additional_cost'],
        $vals['cgst'], $vals['sgst'], $vals['igst'], $vals['round_off'], $uname);
    $st->execute();

    $after = json_encode(['particulars' => $part, 'gstin' => $gstin] + $vals);
    $h = $conn->prepare("INSERT INTO govtax_purchase_history (purchase_bill_id, action, before_json, after_json, note, changed_by) VALUES (?,?,?,?,?,?)");
    $act = 'edit'; $bj = $before ? json_encode($before) : null;
    $h->bind_param('isssss', $pb, $act, $bj, $after, $note, $uname);
    $h->execute();
    gt_out(['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'purchase_reset') {
    $pb = (int)($body['purchase_bill_id'] ?? 0);
    $b = $conn->prepare("SELECT * FROM govtax_purchase_override WHERE purchase_bill_id = ?");
    $b->bind_param('i', $pb);
    $b->execute();
    $before = $b->get_result()->fetch_assoc();
    if ($before) {
        $d = $conn->prepare("DELETE FROM govtax_purchase_override WHERE purchase_bill_id = ?"); // Gov Tax table only
        $d->bind_param('i', $pb);
        $d->execute();
        $h = $conn->prepare("INSERT INTO govtax_purchase_history (purchase_bill_id, action, before_json, after_json, note, changed_by) VALUES (?,?,?,?,?,?)");
        $act = 'reset'; $bj = json_encode($before); $aj = null; $note = 'Restored original values';
        $h->bind_param('isssss', $pb, $act, $bj, $aj, $note, $uname);
        $h->execute();
    }
    gt_out(['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'save_adjustment') {
    $month = (string)($body['month'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) gt_out(['success' => false, 'message' => 'Invalid month'], 422);
    foreach (['manual', 'carry_used'] as $k) {
        if (!isset($body[$k]) || !is_numeric($body[$k]) || (float)$body[$k] < 0) {
            gt_out(['success' => false, 'message' => 'Amounts must be zero or more'], 422);
        }
    }
    $m = gt_r($body['manual']);
    $u = gt_r($body['carry_used']);
    $note = isset($body['note']) ? mb_substr(trim($body['note']), 0, 250) : null;

    $salesAll = gt_sales_rows($conn, $branch_id);
    $purAll   = gt_purchase_rows($conn, $branch_id);
    $chain = gt_chain($conn, $scope, $salesAll, $purAll, $month);
    $row = $chain[$month];
    if ($m > $row['max_manual'] + 0.004) {
        gt_out(['success' => false, 'message' => 'Manual adjustment cannot exceed the available adjustment of this month (₹' . number_format($row['max_manual'], 2) . ')'], 422);
    }
    // carry use is limited by what is left after the chosen manual amount
    $room = max(0, $row['actual_sales'] - $row['auto_adjustment'] - $m);
    $maxU = min($row['prev_carry_forward'], $room);
    if ($u > $maxU + 0.004) {
        gt_out(['success' => false, 'message' => 'Carry-forward use cannot exceed ₹' . number_format($maxU, 2)], 422);
    }

    $st = $conn->prepare("INSERT INTO govtax_monthly (scope_key, ym, manual_adjustment, carry_used, note, updated_by)
                          VALUES (?,?,?,?,?,?)
                          ON DUPLICATE KEY UPDATE manual_adjustment=VALUES(manual_adjustment), carry_used=VALUES(carry_used),
                                                  note=VALUES(note), updated_by=VALUES(updated_by)");
    $st->bind_param('isddss', $scope, $month, $m, $u, $note, $uname);
    $st->execute();

    $new = gt_chain($conn, $scope, $salesAll, $purAll, $month)[$month];
    $h = $conn->prepare("INSERT INTO govtax_adjustment_history
        (scope_key, ym, old_manual, new_manual, old_carry_used, new_carry_used, auto_adjustment, opening_balance, closing_balance, note, changed_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    $h->bind_param('isdddddddss', $scope, $month, $row['manual_adjustment'], $m, $row['balance_used'], $u,
        $new['auto_adjustment'], $new['prev_carry_forward'], $new['carry_forward'], $note, $uname);
    $h->execute();
    gt_out(['success' => true, 'adjustment' => $new]);
}

gt_out(['success' => false, 'message' => 'Unknown action'], 400);