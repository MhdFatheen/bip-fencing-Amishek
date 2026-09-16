<?php
// =============================================================
//  get_invoice_number.php
//  GLOBAL invoice numbering: BFCWS-{number}
//  ONE shared counter for ALL branches (invoice_global_counter).
//  Works in "All Branches" mode too — a branch is NOT required,
//  since the counter is global.
//
//  GET  -> "peek" the next number. Does NOT touch the counter.
//  POST -> "reserve" the next number (atomic, FOR UPDATE lock).
// =============================================================

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

header('Cache-Control: no-store');

function formatInvoiceNo(int $number): string {
    return 'BFCWS-' . str_pad((string) $number, 3, '0', STR_PAD_LEFT);
}

// ── Branch (informational only) ──────────────────────────────
//  admin: selected branch → X-Branch-ID header → null (All Branches)
//  staff: own branch
if (($authUser['role'] ?? '') === 'admin') {
    $branchId = $authUser['view_branch_id'] ?? null;
    if (!$branchId && !empty($_SERVER['HTTP_X_BRANCH_ID'])) {
        $branchId = $_SERVER['HTTP_X_BRANCH_ID'];
    }
} else {
    $branchId = $authUser['branch_id'] ?? null;
}
$branchId = $branchId ? (int) $branchId : null;

// ── Self-contained global counter table ──────────────────────
$conn->query("
    CREATE TABLE IF NOT EXISTS invoice_global_counter (
        id INT UNSIGNED NOT NULL PRIMARY KEY,
        last_number INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB
");
$conn->query("INSERT IGNORE INTO invoice_global_counter (id, last_number) VALUES (1, 0)");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // ── Reserve: atomically increment the GLOBAL counter ─────
    $conn->begin_transaction();
    try {
        $res  = $conn->query("SELECT last_number FROM invoice_global_counter WHERE id = 1 FOR UPDATE");
        $row  = $res ? $res->fetch_assoc() : null;
        $next = ((int) ($row['last_number'] ?? 0)) + 1;

        $upd = $conn->prepare("UPDATE invoice_global_counter SET last_number = ? WHERE id = 1");
        $upd->bind_param('i', $next);
        $upd->execute();
        $upd->close();

        $conn->commit();
    } catch (Throwable $ex) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to reserve invoice number']);
        exit;
    }

    echo json_encode([
        'success'    => true,
        'invoice_no' => formatInvoiceNo($next),
        'branch_id'  => $branchId,
        'number'     => $next,
    ]);
    exit;
}

// ── GET: peek only — does not change the counter ─────────────
$res  = $conn->query("SELECT last_number FROM invoice_global_counter WHERE id = 1");
$row  = $res ? $res->fetch_assoc() : null;
$next = ((int) ($row['last_number'] ?? 0)) + 1;

echo json_encode([
    'success'    => true,
    'invoice_no' => formatInvoiceNo($next),
    'branch_id'  => $branchId,
    'number'     => $next,
]);