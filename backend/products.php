<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

$conn   = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$action = $_GET['action'] ?? null;
$isDamage = isset($_GET['damage']);

function respond(int $code, $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getBody(): array {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) respond(400, ['error' => 'Invalid JSON body']);
    return $data;
}

function getEffectiveBranchId($user): ?int {
    if ($user['role'] === 'admin' && isset($user['view_branch_id']) && $user['view_branch_id'] !== null) {
        return (int)$user['view_branch_id'];
    }
    if ($user['role'] !== 'admin' && isset($user['branch_id']) && $user['branch_id'] !== null) {
        return (int)$user['branch_id'];
    }
    return null;
}

$effectiveBranch = getEffectiveBranchId($authUser);

// ══════════════════════════════════════════════════════════════
//  DAMAGE LOG  (?damage=1)
// ══════════════════════════════════════════════════════════════
if ($isDamage) {

    // ── GET damage list ───────────────────────────────────────
    if ($method === 'GET') {
        $sql = "SELECT d.id, d.qty, d.damage_date, d.stock_qty, p.product_name
                FROM product_damage d
                JOIN products p ON p.id = d.product_id";
        if ($effectiveBranch !== null) {
            $sql .= " WHERE d.branch_id = " . (int)$effectiveBranch;
        }
        $sql .= " ORDER BY d.damage_date DESC, d.id DESC";

        $res = $conn->query($sql);
        if (!$res) respond(500, ['error' => $conn->error]);
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        respond(200, $rows);
    }

    // ── PUT: edit a damage record ─────────────────────────────
    if ($method === 'PUT') {
        if (!$id) respond(400, ['error' => 'Missing ?id=']);
        $d = getBody();
        $newQty = (int)($d['qty'] ?? 0);
        $date   = $d['damageDate'] ?? date('Y-m-d');
        if ($newQty <= 0) respond(422, ['error' => 'Invalid quantity']);

        $row = $conn->query("SELECT * FROM product_damage WHERE id = $id")->fetch_assoc();
        if (!$row) respond(404, ['error' => 'Damage record not found']);

        $diff = $newQty - (int)$row['qty'];  // extra units to take off stock
        $pid  = (int)$row['product_id'];

        if ($diff > 0) {
            $p = $conn->query("SELECT stock_qty FROM products WHERE id = $pid")->fetch_assoc();
            if ((int)$p['stock_qty'] < $diff) respond(422, ['error' => 'Not enough stock available']);
        }
        $conn->query("UPDATE products SET stock_qty = stock_qty - ($diff) WHERE id = $pid");

        $stmt = $conn->prepare("UPDATE product_damage SET qty = ?, damage_date = ? WHERE id = ?");
        $stmt->bind_param('isi', $newQty, $date, $id);
        $stmt->execute();

        respond(200, ['message' => 'Damage record updated']);
    }

    // ── DELETE: remove record, add qty back to stock ──────────
    if ($method === 'DELETE') {
        if (!$id) respond(400, ['error' => 'Missing ?id=']);

        $row = $conn->query("SELECT * FROM product_damage WHERE id = $id")->fetch_assoc();
        if (!$row) respond(404, ['error' => 'Damage record not found']);

        $pid = (int)$row['product_id'];
        $qty = (int)$row['qty'];

        $conn->query("UPDATE products SET stock_qty = stock_qty + $qty WHERE id = $pid");
        $conn->query("DELETE FROM product_damage WHERE id = $id");

        respond(200, ['message' => 'Damage record deleted']);
    }

    respond(405, ['error' => 'Method not allowed']);
}

// ══════════════════════════════════════════════════════════════
//  STOCK IN / STOCK OUT  (?action=stock-in | stock-out)
// ══════════════════════════════════════════════════════════════
if ($method === 'POST' && $action) {
    if (!$id) respond(400, ['error' => 'Missing ?id=']);

    $row = $conn->query("SELECT * FROM products WHERE id = $id")->fetch_assoc();
    if (!$row) respond(404, ['error' => 'Product not found']);

    // ── Stock In ──────────────────────────────────────────────
    if ($action === 'stock-in') {
        $b   = getBody();
        $qty = (int)($b['qty'] ?? 0);
        if ($qty <= 0) respond(422, ['error' => 'Invalid quantity']);

        $conn->query("UPDATE products SET stock_qty = stock_qty + $qty WHERE id = $id");
        respond(200, ['message' => 'Stock added', 'qty' => $qty]);
    }

    // ── Stock Out (1 unit damaged) ────────────────────────────
    if ($action === 'stock-out') {
        if ((int)$row['stock_qty'] <= 0) respond(422, ['error' => 'No stock available to remove']);

        $conn->query("UPDATE products SET stock_qty = stock_qty - 1 WHERE id = $id");

        $branchId   = $row['branch_id'];
        $stockAfter = (int)$row['stock_qty'] - 1;
        $today      = date('Y-m-d');
        $one        = 1;

        $stmt = $conn->prepare("
            INSERT INTO product_damage (product_id, qty, damage_date, stock_qty, branch_id)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->bind_param('iisii', $id, $one, $today, $stockAfter, $branchId);
        $stmt->execute();

        respond(200, ['message' => '1 unit marked damaged']);
    }

    respond(400, ['error' => 'Unknown action']);
}

// ══════════════════════════════════════════════════════════════
//  PRODUCTS CRUD
// ══════════════════════════════════════════════════════════════

// ── GET ───────────────────────────────────────────────────────
if ($method === 'GET') {
    $sql = "SELECT * FROM products";
    $params = [];
    $types = '';

    if ($effectiveBranch !== null) {
        $sql .= " WHERE branch_id = ?";
        $params[] = $effectiveBranch;
        $types = 'i';
    }
    $sql .= " ORDER BY created_at DESC";

    $stmt = $conn->prepare($sql);
    if (!$stmt) respond(500, ['error' => 'Prepare failed: ' . $conn->error]);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    respond(200, $rows);
}

// ── POST ──────────────────────────────────────────────────────
if ($method === 'POST') {
    $d = getBody();
    if (empty($d['productName'])) respond(422, ['error' => 'productName is required']);

    $branchId = $effectiveBranch;
    if ($branchId === null && $authUser['role'] === 'admin') {
        $branchId = (int)($d['branch_id'] ?? 0);
    }
    if (!$branchId) respond(400, ['error' => 'No branch selected. Please select a branch.']);

    $productName  = $d['productName'];
    $hsn          = $d['hsn']          ?? '';
    $unit         = $d['unit']         ?? 'Pcs';
    $factoryPrice = $d['factoryPrice'] ?? 0;
    $sellingPrice = $d['sellingPrice'] ?? 0;
    $stockQty     = $d['stockQty']     ?? 0;
    $minStock     = $d['minStock']     ?? 0;
    $description  = $d['description']  ?? '';
    $productDate  = $d['productDate']  ?? date('Y-m-d');

    // admin adds to ALL branches; branch users only to their own
    $targetBranches = [];
    if ($authUser['role'] === 'admin') {
        $res = $conn->query("SELECT id FROM branches");
        while ($b = $res->fetch_assoc()) $targetBranches[] = (int)$b['id'];
    }
    if (!$targetBranches) $targetBranches = [$branchId];

    $stmt = $conn->prepare("
        INSERT INTO products (product_name, hsn, unit, product_date, factory_price, selling_price, stock_qty, min_stock, description, branch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $newId = 0;
    foreach ($targetBranches as $bid) {
        $stmt->bind_param('ssssddiisi', $productName, $hsn, $unit, $productDate, $factoryPrice, $sellingPrice, $stockQty, $minStock, $description, $bid);
        try {
            $stmt->execute();
        } catch (mysqli_sql_exception $e) {
            respond(500, ['error' => $e->getMessage()]);
        }
        if ($bid === $branchId || !$newId) $newId = $conn->insert_id;
    }
    $result = $conn->query("SELECT * FROM products WHERE id = $newId");
    respond(201, $result->fetch_assoc());
}

// ── PUT ───────────────────────────────────────────────────────
if ($method === 'PUT') {
    if (!$id) respond(400, ['error' => 'Missing ?id=']);
    $d = getBody();
    if (empty($d['productName'])) respond(422, ['error' => 'productName is required']);

    if ($effectiveBranch !== null) {
        $chk = $conn->prepare("SELECT id FROM products WHERE id = ? AND branch_id = ?");
        $chk->bind_param('ii', $id, $effectiveBranch);
        $chk->execute();
        if (!$chk->get_result()->fetch_assoc()) respond(403, ['error' => 'Access denied – product not in your branch']);
    }

    $productName  = $d['productName'];
    $hsn          = $d['hsn']          ?? '';
    $unit         = $d['unit']         ?? 'Pcs';
    $factoryPrice = $d['factoryPrice'] ?? 0;
    $sellingPrice = $d['sellingPrice'] ?? 0;
    $stockQty     = $d['stockQty']     ?? 0;
    $minStock     = $d['minStock']     ?? 0;
    $description  = $d['description']  ?? '';
    $productDate  = $d['productDate']  ?? date('Y-m-d');

    $stmt = $conn->prepare("
        UPDATE products SET
            product_name=?, hsn=?, unit=?, product_date=?,
            factory_price=?, selling_price=?, stock_qty=?, min_stock=?, description=?
        WHERE id=?
    ");
    $stmt->bind_param('ssssddiisi', $productName, $hsn, $unit, $productDate, $factoryPrice, $sellingPrice, $stockQty, $minStock, $description, $id);

    try {
        $stmt->execute();
    } catch (mysqli_sql_exception $e) {
        respond(500, ['error' => $e->getMessage()]);
    }
    $result = $conn->query("SELECT * FROM products WHERE id = $id");
    respond(200, $result->fetch_assoc());
}

// ── DELETE ────────────────────────────────────────────────────
if ($method === 'DELETE') {
    if (!$id) respond(400, ['error' => 'Missing ?id=']);

    if ($effectiveBranch !== null) {
        $chk = $conn->prepare("SELECT id FROM products WHERE id = ? AND branch_id = ?");
        $chk->bind_param('ii', $id, $effectiveBranch);
        $chk->execute();
        if (!$chk->get_result()->fetch_assoc()) respond(403, ['error' => 'Access denied – product not in your branch']);
    }

    $conn->query("DELETE FROM product_damage WHERE product_id = $id");

    $stmt = $conn->prepare("DELETE FROM products WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    if ($stmt->affected_rows === 0) respond(404, ['error' => 'Product not found']);
    respond(200, ['message' => 'Product deleted', 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);