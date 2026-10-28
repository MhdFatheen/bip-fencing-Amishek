<?php
// Dashboard numbers from the real database (respects the topbar branch)
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$conn = isset($conn) ? $conn : getDB();
$bid  = ($authUser['role'] === 'admin') ? ($authUser['view_branch_id'] ?? null) : ($authUser['branch_id'] ?? null);
$bid  = $bid ? (int) $bid : null;

// run a query; $branchSql is added when a branch is selected
function rows(mysqli $c, string $sql, ?int $bid, string $branchSql = ' AND branch_id = ?'): array {
    $sql = str_replace('{B}', $bid ? $branchSql : '', $sql);
    $st  = $c->prepare($sql);
    if (!$st) return [];
    if ($bid) {
        $n = substr_count($branchSql, '?');
        $st->bind_param(str_repeat('i', $n), ...array_fill(0, $n, $bid));
    }
    $st->execute();
    $r = $st->get_result();
    $out = $r ? $r->fetch_all(MYSQLI_ASSOC) : [];
    $st->close();
    return $out;
}
function one(mysqli $c, string $sql, ?int $bid, string $b = ' AND branch_id = ?') {
    $r = rows($c, $sql, $bid, $b);
    return $r ? array_values($r[0])[0] : 0;
}

$today = date('Y-m-d');

$revenue = (float) one($conn, "SELECT COALESCE(SUM(net_amount),0) FROM invoices WHERE 1=1 {B}", $bid);
$expense = (float) one($conn, "SELECT COALESCE(SUM(total_amount),0) FROM purchase_bills WHERE 1=1 {B}", $bid);
$totalEmployees = (int) one($conn, "SELECT COUNT(*) FROM employees WHERE 1=1 {B}", $bid);
$present = (int) one($conn, "SELECT COUNT(*) FROM attendance WHERE date = '$today' AND status IN ('Present','Half Day','Late','Work From Site') {B}", $bid);
$absent  = (int) one($conn, "SELECT COUNT(*) FROM attendance WHERE date = '$today' AND status IN ('Absent','On Leave') {B}", $bid);
$totalClients = (int) one($conn, "SELECT COUNT(*) FROM clients WHERE 1=1 {B}", $bid, ' AND (branch_id = ? OR branch_id IS NULL)');

$lowStock = rows($conn, "SELECT product_name AS name, stock_qty AS stock FROM products WHERE stock_qty < 10 {B} ORDER BY stock_qty ASC LIMIT 20", $bid);

$recentInvoices = rows($conn, "SELECT invoice_no, buyer_name, net_amount, invoice_date FROM invoices WHERE 1=1 {B} ORDER BY id DESC LIMIT 4", $bid);
$recentPurchases = rows($conn, "SELECT invoice_no, company_name, total_amount, bill_date FROM purchase_bills WHERE 1=1 {B} ORDER BY id DESC LIMIT 4", $bid);
$recentQuotations = rows($conn, "SELECT quote_no, client_name, quote_date FROM quotations WHERE 1=1 {B} ORDER BY id DESC LIMIT 3", $bid);
$totalQuotes = (int) one($conn, "SELECT COUNT(*) FROM quotations WHERE 1=1 {B}", $bid);

// last 6 months (oldest first)
$monthly = [];
for ($i = 5; $i >= 0; $i--) {
    $ym = date('Y-m', strtotime("first day of -$i month"));
    $monthly[$ym] = ['month' => date('M', strtotime($ym . '-01')), 'revenue' => 0, 'expense' => 0];
}
$from = array_key_first($monthly) . '-01';
foreach (rows($conn, "SELECT DATE_FORMAT(invoice_date,'%Y-%m') ym, SUM(net_amount) s FROM invoices WHERE invoice_date >= '$from' {B} GROUP BY ym", $bid) as $r)
    if (isset($monthly[$r['ym']])) $monthly[$r['ym']]['revenue'] = (float) $r['s'];
foreach (rows($conn, "SELECT DATE_FORMAT(bill_date,'%Y-%m') ym, SUM(total_amount) s FROM purchase_bills WHERE bill_date >= '$from' {B} GROUP BY ym", $bid) as $r)
    if (isset($monthly[$r['ym']])) $monthly[$r['ym']]['expense'] = (float) $r['s'];

echo json_encode([
    'revenue'          => $revenue,
    'expense'          => $expense,
    'profit'           => $revenue - $expense,
    'totalEmployees'   => $totalEmployees,
    'presentToday'     => $present,
    'absentToday'      => $absent,
    'totalClients'     => $totalClients,
    'lowStock'         => $lowStock,
    'recentInvoices'   => $recentInvoices,
    'recentPurchases'  => $recentPurchases,
    'recentQuotations' => $recentQuotations,
    'totalQuotes'      => $totalQuotes,
    'monthly'          => array_values($monthly),
]);