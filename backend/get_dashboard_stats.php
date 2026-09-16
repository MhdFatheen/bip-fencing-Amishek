<?php
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

list($whereClause, $params) = branchFilter($authUser);
$types = str_repeat('i', count($params));

// Revenue from invoices (adjust table/column names)
$sqlRev = "SELECT COALESCE(SUM(total), 0) as revenue FROM invoices $whereClause";
$stmtRev = $conn->prepare($sqlRev);
if ($params) $stmtRev->bind_param($types, ...$params);
$stmtRev->execute();
$revenue = $stmtRev->get_result()->fetch_assoc()['revenue'];
$stmtRev->close();

// Expense from purchase_bills
$sqlExp = "SELECT COALESCE(SUM(grand_total), 0) as expense FROM purchase_bills $whereClause";
$stmtExp = $conn->prepare($sqlExp);
if ($params) $stmtExp->bind_param($types, ...$params);
$stmtExp->execute();
$expense = $stmtExp->get_result()->fetch_assoc()['expense'];
$stmtExp->close();

// Total employees
$sqlEmp = "SELECT COUNT(*) as total FROM employees $whereClause";
$stmtEmp = $conn->prepare($sqlEmp);
if ($params) $stmtEmp->bind_param($types, ...$params);
$stmtEmp->execute();
$totalEmployees = $stmtEmp->get_result()->fetch_assoc()['total'];
$stmtEmp->close();

// Today's attendance
$today = date('Y-m-d');
$sqlAtt = "SELECT status, COUNT(*) as cnt FROM attendance WHERE date = ? $whereClause GROUP BY status";
$stmtAtt = $conn->prepare($sqlAtt);
if ($params) {
    $stmtAtt->bind_param('s' . $types, $today, ...$params);
} else {
    $stmtAtt->bind_param('s', $today);
}
$stmtAtt->execute();
$attRows = $stmtAtt->get_result()->fetch_all(MYSQLI_ASSOC);
$present = 0;
$absent = 0;
foreach ($attRows as $row) {
    if ($row['status'] === 'Present') $present = $row['cnt'];
    if ($row['status'] === 'Absent') $absent = $row['cnt'];
}
$stmtAtt->close();

// Total clients
$sqlClients = "SELECT COUNT(*) as total FROM clients $whereClause";
$stmtClients = $conn->prepare($sqlClients);
if ($params) $stmtClients->bind_param($types, ...$params);
$stmtClients->execute();
$totalClients = $stmtClients->get_result()->fetch_assoc()['total'];
$stmtClients->close();

// Low stock products (stock < 10)
$sqlStock = "SELECT name, stock FROM products $whereClause AND stock < 10 LIMIT 5";
$stmtStock = $conn->prepare($sqlStock);
if ($params) $stmtStock->bind_param($types, ...$params);
$stmtStock->execute();
$lowStock = $stmtStock->get_result()->fetch_all(MYSQLI_ASSOC);
$stmtStock->close();

// Recent invoices (last 3)
$sqlRecentInv = "SELECT invoice_no, total FROM invoices $whereClause ORDER BY id DESC LIMIT 3";
$stmtRecentInv = $conn->prepare($sqlRecentInv);
if ($params) $stmtRecentInv->bind_param($types, ...$params);
$stmtRecentInv->execute();
$recentInvoices = $stmtRecentInv->get_result()->fetch_all(MYSQLI_ASSOC);
$stmtRecentInv->close();

// Recent purchase bills (last 3)
$sqlRecentPur = "SELECT bill_no, grand_total FROM purchase_bills $whereClause ORDER BY id DESC LIMIT 3";
$stmtRecentPur = $conn->prepare($sqlRecentPur);
if ($params) $stmtRecentPur->bind_param($types, ...$params);
$stmtRecentPur->execute();
$recentPurchases = $stmtRecentPur->get_result()->fetch_all(MYSQLI_ASSOC);
$stmtRecentPur->close();

echo json_encode([
    'revenue'         => (float)$revenue,
    'expense'         => (float)$expense,
    'profit'          => (float)($revenue - $expense),
    'totalEmployees'  => (int)$totalEmployees,
    'presentToday'    => (int)$present,
    'absentToday'     => (int)$absent,
    'totalClients'    => (int)$totalClients,
    'lowStock'        => $lowStock,
    'recentInvoices'  => $recentInvoices,
    'recentPurchases' => $recentPurchases,
]);
$conn->close();
?>