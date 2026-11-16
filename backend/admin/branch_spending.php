<?php
// =============================================================
//  branch_spending.php — money given to a branch vs. how it was spent
//  GET  ?action=ledger&from=YYYY-MM-DD&to=YYYY-MM-DD
//  POST ?action=add_expense      {amount, expense_date, purpose, note}
//  DELETE ?action=delete_expense&id=   (admin only)
//  Spent = only the expenses entered by hand (Add Expense) — nothing automatic
// =============================================================
require_once __DIR__ . '/../cors.php';              // CORS + OPTIONS preflight
require_once __DIR__ . '/../auth_middleware.php';   // $authUser + $pdo
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

function out($d, $c = 200) { http_response_code($c); echo json_encode($d); exit; }

// table for other expenses (created automatically)
$pdo->exec("CREATE TABLE IF NOT EXISTS branch_expenses (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id INT UNSIGNED NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    purpose VARCHAR(150) NOT NULL,
    note VARCHAR(255) DEFAULT NULL,
    created_by VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_be_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$isAdmin = $authUser['role'] === 'admin';
$branch  = $isAdmin ? ($authUser['view_branch_id'] ?? null) : ($authUser['branch_id'] ?? null);
$branch  = $branch ? (int) $branch : null;
$action  = $_GET['action'] ?? 'ledger';
$in      = json_decode(file_get_contents('php://input'), true) ?: [];

if ($action === 'add_expense') {
    $amt = (float) ($in['amount'] ?? 0);
    $dt  = $in['expense_date'] ?? '';
    $pur = trim((string) ($in['purpose'] ?? ''));
    if ($amt <= 0 || !$dt || $pur === '') out(['error' => 'Amount, date and purpose are required'], 422);
    if (!$branch) out(['error' => 'Select a branch in the topbar first'], 422);
    $pdo->prepare("INSERT INTO branch_expenses (branch_id, amount, expense_date, purpose, note, created_by) VALUES (?,?,?,?,?,?)")
        ->execute([$branch, $amt, $dt, $pur, trim((string) ($in['note'] ?? '')) ?: null, $authUser['username'] ?? ($authUser['name'] ?? null)]);
    out(['success' => true]);
}

if ($action === 'delete_expense') {
    if (!$isAdmin) out(['error' => 'Only admin can delete'], 403);
    $pdo->prepare("DELETE FROM branch_expenses WHERE id = ?")->execute([(int) ($_GET['id'] ?? 0)]);
    out(['success' => true]);
}

// ---------- ledger ----------
$from = $_GET['from'] ?? date('Y-m-01');
$to   = $_GET['to']   ?? date('Y-m-d');
$bw   = fn($col) => $branch ? " AND $col = $branch" : '';

$sql = "
  SELECT 'given' AS kind, ba.id, ba.payment_date AS dt, ba.amount,
         CONVERT(CONCAT('Amount given', IF(ba.received_by IS NULL OR ba.received_by = '', '', CONCAT(' (received by ', ba.received_by, ')'))) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details,
         CONVERT(ba.note USING utf8mb4) COLLATE utf8mb4_unicode_ci AS note, ba.branch_id
    FROM branch_amounts ba WHERE 1=1 {$bw('ba.branch_id')}
  UNION ALL
  SELECT 'expense', x.id, x.expense_date, x.amount, CONVERT(x.purpose USING utf8mb4) COLLATE utf8mb4_unicode_ci, CONVERT(x.note USING utf8mb4) COLLATE utf8mb4_unicode_ci, x.branch_id
    FROM branch_expenses x WHERE 1=1 {$bw('x.branch_id')}
";
$rows = $pdo->query("SELECT t.*, b.name AS branch_name FROM ($sql) t LEFT JOIN branches b ON b.id = t.branch_id ORDER BY t.dt ASC, t.kind = 'given' DESC, t.id ASC")
            ->fetchAll(PDO::FETCH_ASSOC);

$opening = 0; $given = 0; $spent = 0; $list = [];
foreach ($rows as $r) {
    $amt  = (float) $r['amount'];
    $sign = $r['kind'] === 'given' ? 1 : -1;
    if ($r['dt'] < $from) { $opening += $sign * $amt; continue; }
    if ($r['dt'] > $to) continue;
    if ($sign > 0) $given += $amt; else $spent += $amt;
    $list[] = $r;
}
$bal = $opening;
foreach ($list as &$r) {
    $bal += ($r['kind'] === 'given' ? 1 : -1) * (float) $r['amount'];
    $r['balance'] = round($bal, 2);
}
unset($r);

out([
    'success' => true, 'from' => $from, 'to' => $to,
    'opening' => round($opening, 2), 'given' => round($given, 2), 'spent' => round($spent, 2),
    'balance' => round($opening + $given - $spent, 2), 'rows' => $list,
]);
