<?php
// =============================================================
//  purchase_products.php — PURCHASE CATALOG
//
//  Same model as products.php (the Product Catalog): one row per
//  product PER BRANCH, same fields, same stock-in / stock-out /
//  damage / edit / delete behaviour. Kept in its OWN tables so the
//  Product Catalog, Purchase Bill and Purchase Inventory are not
//  touched in any way.
//
//  Tables (created on first use):
//    purchase_products        = products
//    purchase_product_damage  = product_damage
//    purchase_product_log     = product_stock_log (+ rate, supplier, reference)
//
//  GET                      list (branch filtered like products.php)
//  POST                     Add Purchase (stock only in the selected branch;
//                           All Branches selected → every branch gets the qty)
//  PUT ?id=                 edit
//  DELETE ?id=              delete
//  POST ?action=stock-in|stock-out&id=
//  POST ?action=sale-deduct&id=   used by Tax Invoice (reduces that branch row)
//  GET/PUT/DELETE ?damage=1       damage log
// =============================================================
error_reporting(E_ALL);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

mysqli_report(MYSQLI_REPORT_OFF);
$conn     = getDB();
$method   = $_SERVER['REQUEST_METHOD'];
$id       = isset($_GET['id']) ? (int)$_GET['id'] : null;
$action   = $_GET['action'] ?? null;
$isDamage = isset($_GET['damage']);
$isAdmin  = ($authUser['role'] ?? '') === 'admin';

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
// null = admin viewing All Branches
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

// ── Tables ────────────────────────────────────────────────────
$conn->query("
    CREATE TABLE IF NOT EXISTS purchase_products (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      product_name  VARCHAR(255)  NOT NULL,
      hsn           VARCHAR(50)   NOT NULL DEFAULT '',
      unit          VARCHAR(30)   NOT NULL DEFAULT 'Pcs',
      product_date  DATE          DEFAULT NULL,
      factory_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      selling_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      stock_qty     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      min_stock     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      description   TEXT          DEFAULT NULL,
      supplier      VARCHAR(255)  NOT NULL DEFAULT '',
      sku           VARCHAR(100)  NOT NULL DEFAULT '',
      branch_id     INT UNSIGNED  NOT NULL,
      created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY (branch_id), KEY (product_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");
$conn->query("
    CREATE TABLE IF NOT EXISTS purchase_product_damage (
      id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      product_id  INT UNSIGNED  NOT NULL,
      qty         DECIMAL(12,2) NOT NULL,
      damage_date DATE          NOT NULL,
      stock_qty   DECIMAL(12,2) NOT NULL DEFAULT 0,
      branch_id   INT UNSIGNED  DEFAULT NULL,
      PRIMARY KEY (id), KEY (product_id), KEY (branch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");
$conn->query("
    CREATE TABLE IF NOT EXISTS purchase_product_log (
      id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      product_id   INT UNSIGNED  NOT NULL,
      product_name VARCHAR(255)  NOT NULL DEFAULT '',
      branch_id    INT UNSIGNED  DEFAULT NULL,
      log_type     VARCHAR(30)   NOT NULL DEFAULT 'stock_in',
      qty          DECIMAL(12,2) NOT NULL DEFAULT 0,
      rate         DECIMAL(12,2) NOT NULL DEFAULT 0,
      supplier     VARCHAR(255)  NOT NULL DEFAULT '',
      reference    VARCHAR(100)  NOT NULL DEFAULT '',
      note         TEXT          DEFAULT NULL,
      logged_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY (product_id), KEY (branch_id), KEY (logged_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

function pp_log(mysqli $conn, array $row, int $branch, float $qty, float $rate, string $supplier, string $ref, string $note, string $when): void {
    $st = $conn->prepare(
        "INSERT INTO purchase_product_log (product_id, product_name, branch_id, log_type, qty, rate, supplier, reference, note, logged_at)
         VALUES (?, ?, ?, 'stock_in', ?, ?, ?, ?, ?, ?)"
    );
    $pid = (int)$row['id']; $name = $row['product_name'];
    $st->bind_param('isiddssss', $pid, $name, $branch, $qty, $rate, $supplier, $ref, $note, $when);
    $st->execute();
    $st->close();
}

// Branch users may only touch their own branch's rows
function pp_check_branch(mysqli $conn, int $id, ?int $effectiveBranch): array {
    $r = $conn->query("SELECT * FROM purchase_products WHERE id = " . (int)$id)->fetch_assoc();
    if (!$r) respond(404, ['error' => 'Product not found']);
    if ($effectiveBranch !== null && (int)$r['branch_id'] !== $effectiveBranch) {
        respond(403, ['error' => 'Access denied – product not in your branch']);
    }
    return $r;
}

// ══════════════════════════════════════════════════════════════
//  DAMAGE LOG  (?damage=1)
// ══════════════════════════════════════════════════════════════
if ($isDamage) {
    if ($method === 'GET') {
        $sql = "SELECT d.id, d.qty, d.damage_date, d.stock_qty, p.product_name
                  FROM purchase_product_damage d
                  JOIN purchase_products p ON p.id = d.product_id";
        if ($effectiveBranch !== null) $sql .= " WHERE d.branch_id = " . (int)$effectiveBranch;
        $sql .= " ORDER BY d.damage_date DESC, d.id DESC";
        $res = $conn->query($sql);
        if (!$res) respond(500, ['error' => $conn->error]);
        respond(200, $res->fetch_all(MYSQLI_ASSOC));
    }
    if ($method === 'PUT') {
        if (!$id) respond(400, ['error' => 'Missing ?id=']);
        $d = getBody();
        $newQty = (float)($d['qty'] ?? 0);
        $date   = $d['damageDate'] ?? date('Y-m-d');
        if ($newQty <= 0) respond(422, ['error' => 'Invalid quantity']);
        $row = $conn->query("SELECT * FROM purchase_product_damage WHERE id = $id")->fetch_assoc();
        if (!$row) respond(404, ['error' => 'Damage record not found']);
        $diff = $newQty - (float)$row['qty'];
        $pid  = (int)$row['product_id'];
        if ($diff > 0) {
            $p = $conn->query("SELECT stock_qty FROM purchase_products WHERE id = $pid")->fetch_assoc();
            if ((float)$p['stock_qty'] < $diff) respond(422, ['error' => 'Not enough stock available']);
        }
        $conn->query("UPDATE purchase_products SET stock_qty = stock_qty - ($diff) WHERE id = $pid");
        $st = $conn->prepare("UPDATE purchase_product_damage SET qty = ?, damage_date = ? WHERE id = ?");
        $st->bind_param('dsi', $newQty, $date, $id);
        $st->execute();
        respond(200, ['message' => 'Damage record updated']);
    }
    if ($method === 'DELETE') {
        if (!$id) respond(400, ['error' => 'Missing ?id=']);
        $row = $conn->query("SELECT * FROM purchase_product_damage WHERE id = $id")->fetch_assoc();
        if (!$row) respond(404, ['error' => 'Damage record not found']);
        $pid = (int)$row['product_id'];
        $qty = (float)$row['qty'];
        $conn->query("UPDATE purchase_products SET stock_qty = stock_qty + $qty WHERE id = $pid");
        $conn->query("DELETE FROM purchase_product_damage WHERE id = $id");
        respond(200, ['message' => 'Damage record deleted']);
    }
    respond(405, ['error' => 'Method not allowed']);
}

// ══════════════════════════════════════════════════════════════
//  STOCK IN / STOCK OUT / SALE DEDUCT
// ══════════════════════════════════════════════════════════════
if ($method === 'POST' && $action) {
    if (!$id) respond(400, ['error' => 'Missing ?id=']);
    $row = pp_check_branch($conn, $id, $effectiveBranch);
    $b   = getBody();
    $qty = (float)($b['qty'] ?? 0);

    if ($action === 'stock-in') {
        if ($qty <= 0) respond(422, ['error' => 'Invalid quantity']);
        $conn->query("UPDATE purchase_products SET stock_qty = stock_qty + $qty WHERE id = $id");
        pp_log($conn, $row, (int)$row['branch_id'], $qty, (float)$row['factory_price'], (string)$row['supplier'], '', 'Manual Stock In', date('Y-m-d H:i:s'));
        respond(200, ['message' => 'Stock added', 'qty' => $qty]);
    }

    // Stock Out = marked damaged (same as the Product Catalog)
    if ($action === 'stock-out') {
        if ($qty <= 0) $qty = 1;
        if ((float)$row['stock_qty'] < $qty) respond(422, ['error' => 'Not enough stock available']);
        $conn->query("UPDATE purchase_products SET stock_qty = stock_qty - $qty WHERE id = $id");
        $after = (float)$row['stock_qty'] - $qty;
        $today = date('Y-m-d');
        $bid   = (int)$row['branch_id'];
        $st = $conn->prepare("INSERT INTO purchase_product_damage (product_id, qty, damage_date, stock_qty, branch_id) VALUES (?, ?, ?, ?, ?)");
        $st->bind_param('idsdi', $id, $qty, $today, $after, $bid);
        $st->execute();
        respond(200, ['message' => "$qty unit(s) marked damaged"]);
    }

    // Tax Invoice sale — the sale itself reaches statements through the invoice item
    if ($action === 'sale-deduct') {
        if ($qty <= 0) respond(422, ['error' => 'Invalid quantity']);
        if (isset($b['branch_id']) && $b['branch_id'] !== '' && (int)$b['branch_id'] !== (int)$row['branch_id']) {
            respond(409, ['error' => 'Product does not belong to the invoice branch']);
        }
        $st = $conn->prepare("UPDATE purchase_products SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?");
        $st->bind_param('did', $qty, $id, $qty);
        $st->execute();
        if ($st->affected_rows === 0) {
            respond(409, ['error' => "Insufficient stock for \"{$row['product_name']}\". Available: " . (float)$row['stock_qty'] . ", Required: $qty"]);
        }
        respond(200, ['success' => true, 'new_stock' => (float)$row['stock_qty'] - $qty]);
    }
    respond(400, ['error' => 'Unknown action']);
}

// ══════════════════════════════════════════════════════════════
//  CRUD
// ══════════════════════════════════════════════════════════════
if ($method === 'GET') {
    $sql = "SELECT * FROM purchase_products";
    $params = []; $types = '';
    if ($effectiveBranch !== null) { $sql .= " WHERE branch_id = ?"; $params[] = $effectiveBranch; $types = 'i'; }
    $sql .= " ORDER BY created_at DESC, id DESC";
    $st = $conn->prepare($sql);
    if (!$st) respond(500, ['error' => 'Prepare failed: ' . $conn->error]);
    if ($params) $st->bind_param($types, ...$params);
    $st->execute();
    respond(200, $st->get_result()->fetch_all(MYSQLI_ASSOC));
}

if ($method === 'POST') {
    $d = getBody();
    $name = trim((string)($d['productName'] ?? ''));
    if ($name === '') respond(422, ['error' => 'productName is required']);

    $hsn      = trim((string)($d['hsn'] ?? ''));
    $unit     = trim((string)($d['unit'] ?? '')) ?: 'Pcs';
    $rate     = (float)($d['factoryPrice'] ?? 0);   // purchase price
    $sell     = (float)($d['sellingPrice'] ?? 0);
    $qty      = (float)($d['stockQty'] ?? 0);
    $min      = (float)($d['minStock'] ?? 0);
    $desc     = (string)($d['description'] ?? '');
    $date     = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['productDate'] ?? '')) ? $d['productDate'] : date('Y-m-d');
    $supplier = trim((string)($d['supplier'] ?? ''));
    $sku      = trim((string)($d['sku'] ?? ''));
    $ref      = trim((string)($d['reference'] ?? ''));
    if ($qty < 0 || $rate < 0 || $sell < 0) respond(422, ['error' => 'Values cannot be negative']);

    // Own products (Add Product) are never duplicated here
    $own = $conn->prepare("SELECT id FROM products WHERE LOWER(TRIM(product_name)) = LOWER(?) LIMIT 1");
    $own->bind_param('s', $name);
    $own->execute();
    if ($own->get_result()->fetch_assoc()) {
        respond(409, ['error' => "\"$name\" already exists in the Product Catalog. Use Stock In on the Product page for it."]);
    }
    $own->close();

    // Admin: the product is listed in every branch (like Add Product);
    // branch user: own branch only.
    $targets = [];
    if ($isAdmin) {
        $res = $conn->query("SELECT id FROM branches ORDER BY id");
        while ($b = $res->fetch_assoc()) $targets[] = (int)$b['id'];
    }
    if (!$targets) {
        if ($effectiveBranch === null) respond(400, ['error' => 'No branch selected. Please select a branch.']);
        $targets = [$effectiveBranch];
    }
    // Stock goes only to the selected branch; "All Branches" → every branch
    $stockBranches = $effectiveBranch !== null ? [$effectiveBranch] : $targets;

    $conn->begin_transaction();
    try {
        $returnRow = null;
        foreach ($targets as $bid) {
            $addQty = in_array($bid, $stockBranches, true) ? $qty : 0.0;

            $st = $conn->prepare("SELECT * FROM purchase_products WHERE LOWER(TRIM(product_name)) = LOWER(?) AND branch_id = ? LIMIT 1");
            $st->bind_param('si', $name, $bid);
            $st->execute();
            $ex = $st->get_result()->fetch_assoc();
            $st->close();

            if ($ex) {                      // same product again → add stock, no duplicate row
                $st = $conn->prepare(
                    "UPDATE purchase_products SET
                        stock_qty = stock_qty + ?,
                        factory_price = IF(? > 0, ?, factory_price),
                        selling_price = IF(? > 0, ?, selling_price),
                        min_stock     = IF(? > 0, ?, min_stock),
                        hsn      = IF(? <> '', ?, hsn),
                        supplier = IF(? <> '', ?, supplier),
                        sku      = IF(? <> '', ?, sku),
                        unit = ?
                      WHERE id = ?"
                );
                $exId = (int)$ex['id'];
                $st->bind_param('dddddddsssssssi', $addQty, $rate, $rate, $sell, $sell, $min, $min,
                    $hsn, $hsn, $supplier, $supplier, $sku, $sku, $unit, $exId);
                $st->execute();
                $st->close();
                $rowId = $exId;
            } else {
                $st = $conn->prepare(
                    "INSERT INTO purchase_products
                        (product_name, hsn, unit, product_date, factory_price, selling_price, stock_qty, min_stock, description, supplier, sku, branch_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                $st->bind_param('ssssddddsssi', $name, $hsn, $unit, $date, $rate, $sell, $addQty, $min, $desc, $supplier, $sku, $bid);
                $st->execute();
                $rowId = (int)$conn->insert_id;
                $st->close();
            }
            $rowNow = $conn->query("SELECT * FROM purchase_products WHERE id = $rowId")->fetch_assoc();
            if ($addQty > 0) {
                pp_log($conn, $rowNow, $bid, $addQty, $rate, $supplier, $ref,
                    $ex ? 'Purchase' : 'Initial Purchase', $date . ' ' . date('H:i:s'));
            }
            if ($returnRow === null || $bid === $effectiveBranch) $returnRow = $rowNow;
        }
        $conn->commit();
        respond(201, $returnRow);
    } catch (Throwable $e) {
        $conn->rollback();
        respond(500, ['error' => $e->getMessage()]);
    }
}

if ($method === 'PUT') {
    if (!$id) respond(400, ['error' => 'Missing ?id=']);
    $d = getBody();
    $name = trim((string)($d['productName'] ?? ''));
    if ($name === '') respond(422, ['error' => 'productName is required']);
    pp_check_branch($conn, $id, $effectiveBranch);

    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['productDate'] ?? '')) ? $d['productDate'] : date('Y-m-d');
    $hsn = (string)($d['hsn'] ?? ''); $unit = (string)($d['unit'] ?? 'Pcs');
    $rate = (float)($d['factoryPrice'] ?? 0); $sell = (float)($d['sellingPrice'] ?? 0);
    $qty = (float)($d['stockQty'] ?? 0); $min = (float)($d['minStock'] ?? 0);
    $desc = (string)($d['description'] ?? '');
    $supplier = (string)($d['supplier'] ?? ''); $sku = (string)($d['sku'] ?? '');

    $st = $conn->prepare(
        "UPDATE purchase_products SET product_name=?, hsn=?, unit=?, product_date=?, factory_price=?, selling_price=?,
                stock_qty=?, min_stock=?, description=?, supplier=?, sku=? WHERE id=?"
    );
    $st->bind_param('ssssddddsssi', $name, $hsn, $unit, $date, $rate, $sell, $qty, $min, $desc, $supplier, $sku, $id);
    if (!$st->execute()) respond(500, ['error' => $st->error]);
    respond(200, $conn->query("SELECT * FROM purchase_products WHERE id = $id")->fetch_assoc());
}

if ($method === 'DELETE') {
    if (!$id) respond(400, ['error' => 'Missing ?id=']);
    pp_check_branch($conn, $id, $effectiveBranch);
    $conn->query("DELETE FROM purchase_product_damage WHERE product_id = $id");
    $conn->query("DELETE FROM purchase_products WHERE id = $id");
    respond(200, ['message' => 'Product deleted', 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);