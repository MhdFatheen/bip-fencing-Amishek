<?php
// =============================================================
//  purchase_invoice_products.php
//  Purchase-Bill products that may be sold on a Tax Invoice.
//
//  A purchased product is eligible ONLY when an HSN Code was entered for it
//  (purchase_stock.hsn not empty) and it has stock. Products bought without
//  an HSN Code stay in Purchase Bill records / Inventory / Statements but are
//  never listed here. Products are identified by their internal product_id;
//  the HSN Code is only the visibility condition.
//
//  GET                          list for the selected branch
//                               (branch rows + "All Branch" rows, merged per product_id)
//  POST ?action=sale-deduct     body {product_id, qty, branch_id}
//                               reduces that product's stock (branch row first,
//                               then the All Branch row)
// =============================================================
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/purchase_common.php';

mysqli_report(MYSQLI_REPORT_OFF);
$conn = getDB();
pbEnsureHsnColumns($conn);

$isAdmin = ($authUser['role'] ?? '') === 'admin';
function effBranch($u): ?int {
    if (($u['role'] ?? '') === 'admin') {
        return isset($u['view_branch_id']) && $u['view_branch_id'] !== null ? (int)$u['view_branch_id'] : null;
    }
    return isset($u['branch_id']) && $u['branch_id'] !== null ? (int)$u['branch_id'] : null;
}
function out(int $code, $data): void { http_response_code($code); echo json_encode($data); exit; }

$branch = effBranch($authUser);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if ($branch === null) {
        $st = $conn->prepare("SELECT product_id, product_name, hsn, rate, current_stock, branch_id FROM purchase_stock
                               WHERE TRIM(COALESCE(hsn,'')) <> '' AND current_stock > 0 ORDER BY product_name");
    } else {
        $st = $conn->prepare("SELECT product_id, product_name, hsn, rate, current_stock, branch_id FROM purchase_stock
                               WHERE TRIM(COALESCE(hsn,'')) <> '' AND current_stock > 0
                                 AND (branch_id = ? OR branch_id IS NULL) ORDER BY product_name");
        $st->bind_param('i', $branch);
    }
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    $merged = [];
    foreach ($rows as $r) {
        $k = $r['product_id'] . ($branch === null ? '|' . ($r['branch_id'] ?? 'all') : '');
        if (!isset($merged[$k])) { $merged[$k] = $r; $merged[$k]['current_stock'] = 0.0; }
        $merged[$k]['current_stock'] += (float)$r['current_stock'];
        $merged[$k]['rate'] = $r['branch_id'] !== null ? $r['rate'] : $merged[$k]['rate'];
    }
    out(200, array_values($merged));
}

if ($method === 'POST' && ($_GET['action'] ?? '') === 'sale-deduct') {
    $d   = json_decode(file_get_contents('php://input'), true) ?: [];
    $pid = trim((string)($d['product_id'] ?? ''));
    $qty = (float)($d['qty'] ?? 0);
    $b   = $branch ?? (isset($d['branch_id']) && $d['branch_id'] !== '' ? (int)$d['branch_id'] : null);
    if ($pid === '' || $qty <= 0 || $b === null) out(400, ['error' => 'product_id, qty and branch are required']);

    $conn->begin_transaction();
    $st = $conn->prepare("SELECT id, branch_id, current_stock, product_name FROM purchase_stock
                           WHERE product_id = ? AND (branch_id = ? OR branch_id IS NULL)
                           ORDER BY (branch_id IS NULL) ASC FOR UPDATE");
    $st->bind_param('si', $pid, $b);
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    $avail = array_sum(array_map(fn($r) => max(0, (float)$r['current_stock']), $rows));
    if (!$rows || $avail + 1e-9 < $qty) {
        $conn->rollback();
        out(400, ['error' => 'Insufficient stock' . ($rows ? " for \"{$rows[0]['product_name']}\". Available: $avail, Required: $qty" : ': product not found')]);
    }
    $left = $qty;
    $upd = $conn->prepare("UPDATE purchase_stock SET current_stock = current_stock - ? WHERE id = ?");
    foreach ($rows as $r) {
        if ($left <= 0) break;
        $take = min($left, max(0, (float)$r['current_stock']));
        if ($take <= 0) continue;
        $upd->bind_param('di', $take, $r['id']);
        $upd->execute();
        $left -= $take;
    }
    $conn->commit();
    out(200, ['success' => true]);
}

out(405, ['error' => 'Method not allowed']);
