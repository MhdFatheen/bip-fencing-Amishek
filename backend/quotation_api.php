<?php
// ============================================================
//  quotation_api.php  –  Unified Quotation API (PDO version)
//
//  GET    /quotation_api.php          → list all quotations
//  GET    /quotation_api.php?id=N     → single quotation + items
//  POST   /quotation_api.php          → create new quotation
//  PUT    /quotation_api.php          → update quotation (body has id)
//  DELETE /quotation_api.php?id=N     → delete quotation
// ============================================================

require_once __DIR__ . '/cors.php';              // MUST be first (handles OPTIONS)
error_reporting(E_ALL);
ini_set('display_errors', 0);                    // don't break JSON with HTML errors
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once __DIR__ . '/auth_middleware.php';   // sets $authUser, uses $pdo

// ── Make sure is_gst / round_off columns exist (runs once) ────
foreach ([
    'is_gst'    => "TINYINT(1) NOT NULL DEFAULT 1",
    'round_off' => "DECIMAL(10,2) NULL",
] as $col => $def) {
    $chk = $pdo->query("SHOW COLUMNS FROM quotations LIKE '$col'");
    if ($chk && !$chk->fetch()) {
        $pdo->exec("ALTER TABLE quotations ADD $col $def");
    }
}

// ── Resolve effective branch ID ───────────────────────────────
function getEffectiveBranchId(array $user): ?int {
    if ($user['role'] === 'admin' && !empty($user['view_branch_id'])) {
        return (int) $user['view_branch_id'];
    }
    if ($user['role'] !== 'admin' && !empty($user['branch_id'])) {
        return (int) $user['branch_id'];
    }
    return null;
}

// ── Branch access check for a specific quotation ─────────────
function checkBranchAccess(PDO $pdo, array $user, int $id): bool {
    $branchId = getEffectiveBranchId($user);
    if ($branchId === null) return true;

    $stmt = $pdo->prepare("SELECT id FROM quotations WHERE id = ? AND branch_id = ?");
    $stmt->execute([$id, $branchId]);
    return (bool) $stmt->fetch();
}

// ── Route ─────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            if (!empty($_GET['id'])) handleGetSingle();
            else                     handleGetAll();
            break;
        case 'POST':   handleCreate(); break;
        case 'PUT':    handleUpdate(); break;
        case 'DELETE': handleDelete(); break;
        default:
            http_response_code(405);
            echo json_encode(['message' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['message' => 'Server error: ' . $e->getMessage()]);
}

// ============================================================
//  GET single quotation with items
// ============================================================
function handleGetSingle(): void {
    global $pdo, $authUser;
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }

    if (!checkBranchAccess($pdo, $authUser, $id)) {
        http_response_code(403); echo json_encode(['error' => 'Access denied']); exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM quotations WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

    $iStmt = $pdo->prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id ASC");
    $iStmt->execute([$id]);
    $row['items'] = $iStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode($row);
}

// ============================================================
//  GET all quotations (branch-filtered)
// ============================================================
function handleGetAll(): void {
    global $pdo, $authUser;
    $branchId = getEffectiveBranchId($authUser);

    $sql = "
        SELECT q.*,
            (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) AS items_count,
            (SELECT COALESCE(SUM(quantity * rate),0) FROM quotation_items WHERE quotation_id = q.id) AS subtotal
        FROM quotations q
    ";
    if ($branchId !== null && empty($_GET['all_branches'])) {
        $stmt = $pdo->prepare($sql . " WHERE q.branch_id = :branch_id ORDER BY q.id DESC");
        $stmt->execute([':branch_id' => $branchId]);
    } else {
        $stmt = $pdo->prepare($sql . " ORDER BY q.id DESC");
        $stmt->execute();
    }

    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $sub        = (float) $row['subtotal'];
        $discAmt    = $sub * (float) $row['discount_percent'] / 100;
        $taxable    = $sub - $discAmt;
        $isGst      = !isset($row['is_gst']) || (int) $row['is_gst'] === 1;
        $taxAmt     = $isGst ? $taxable * (float) $row['tax_percent'] / 100 : 0;
        $roundOff   = ($row['round_off'] !== null && $row['round_off'] !== '')
            ? (float) $row['round_off']
            : round($taxable + $taxAmt) - ($taxable + $taxAmt);
        $grandTotal = $taxable + $taxAmt + $roundOff;

        $row['subtotal']        = round($sub, 2);
        $row['discount_amount'] = round($discAmt, 2);
        $row['tax_amount']      = round($taxAmt, 2);
        $row['grand_total']     = round($grandTotal, 2);
        $rows[] = $row;
    }
    echo json_encode($rows);
}

// ============================================================
//  POST – create quotation
// ============================================================
function handleCreate(): void {
    global $pdo, $authUser;

    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) { http_response_code(400); echo json_encode(['message' => 'Invalid JSON']); exit; }

    // All Branches mode → X-Branch-ID header → admin's own branch → first branch
    $branchId = getEffectiveBranchId($authUser);
    if ($branchId === null && !empty($_SERVER['HTTP_X_BRANCH_ID'])) {
        $branchId = (int) $_SERVER['HTTP_X_BRANCH_ID'];
    }
    if ($branchId === null && !empty($authUser['branch_id'])) {
        $branchId = (int) $authUser['branch_id'];
    }
    if ($branchId === null) {
        $first = $pdo->query("SELECT id FROM branches ORDER BY id ASC LIMIT 1");
        $branchId = $first ? (int) $first->fetchColumn() : 1;
        if (!$branchId) $branchId = 1;
    }

    $f = sanitiseFields($data);
    if (!$f[':quote_no'] || !$f[':quote_date'] || !$f[':client_name'] || empty($data['items'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Quote No, Date, Client Name and at least one item are required']);
        exit;
    }

    $chk = $pdo->prepare("SELECT id FROM quotations WHERE quote_no = ? AND branch_id = ?");
    $chk->execute([$f[':quote_no'], $branchId]);
    if ($chk->fetch()) {
        http_response_code(409);
        echo json_encode(['message' => 'Quote number already exists for this branch']);
        exit;
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO quotations
            (quote_no, quote_date, valid_until, po_no, dispatched_through, vehicle_no, other_ref,
             client_name, client_phone, client_email, client_gst, client_address, client_state, client_state_code,
             ship_name, ship_address, ship_gst, ship_state, ship_state_code,
             discount_percent, tax_percent, notes, declaration, unit_qty, price_unit,
             is_gst, round_off, branch_id)
        VALUES
            (:quote_no, :quote_date, :valid_until, :po_no, :dispatched_through, :vehicle_no, :other_ref,
             :client_name, :client_phone, :client_email, :client_gst, :client_address, :client_state, :client_state_code,
             :ship_name, :ship_address, :ship_gst, :ship_state, :ship_state_code,
             :discount_percent, :tax_percent, :notes, :declaration, :unit_qty, :price_unit,
             :is_gst, :round_off, :branch_id)
    ");
    $stmt->execute(array_merge($f, [':branch_id' => $branchId]));
    $quotationId = (int) $pdo->lastInsertId();

    insertItems($pdo, $quotationId, $data['items']);

    $pdo->commit();

    echo json_encode(['message' => 'Quotation saved successfully', 'id' => $quotationId]);
}

// ============================================================
//  PUT – update quotation
// ============================================================
function handleUpdate(): void {
    global $pdo, $authUser;

    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data || empty($data['id'])) {
        http_response_code(400); echo json_encode(['message' => 'Invalid data or missing ID']); exit;
    }

    $id = (int) $data['id'];
    if (!checkBranchAccess($pdo, $authUser, $id)) {
        http_response_code(403); echo json_encode(['message' => 'Access denied']); exit;
    }

    $f = sanitiseFields($data);
    if (!$f[':quote_no'] || !$f[':quote_date'] || !$f[':client_name'] || empty($data['items'])) {
        http_response_code(400); echo json_encode(['message' => 'Missing required fields']); exit;
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        UPDATE quotations SET
            quote_no=:quote_no, quote_date=:quote_date, valid_until=:valid_until,
            po_no=:po_no, dispatched_through=:dispatched_through, vehicle_no=:vehicle_no, other_ref=:other_ref,
            client_name=:client_name, client_phone=:client_phone, client_email=:client_email,
            client_gst=:client_gst, client_address=:client_address,
            client_state=:client_state, client_state_code=:client_state_code,
            ship_name=:ship_name, ship_address=:ship_address, ship_gst=:ship_gst,
            ship_state=:ship_state, ship_state_code=:ship_state_code,
            discount_percent=:discount_percent, tax_percent=:tax_percent,
            notes=:notes, declaration=:declaration,
            unit_qty=:unit_qty, price_unit=:price_unit,
            is_gst=:is_gst, round_off=:round_off
        WHERE id=:id
    ");
    $stmt->execute(array_merge($f, [':id' => $id]));

    $pdo->prepare("DELETE FROM quotation_items WHERE quotation_id = ?")->execute([$id]);
    insertItems($pdo, $id, $data['items']);

    $pdo->commit();

    echo json_encode(['message' => 'Quotation updated successfully']);
}

// ============================================================
//  DELETE
// ============================================================
function handleDelete(): void {
    global $pdo, $authUser;

    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['message' => 'ID required']); exit; }

    if (!checkBranchAccess($pdo, $authUser, $id)) {
        http_response_code(403); echo json_encode(['message' => 'Access denied']); exit;
    }

    $pdo->prepare("DELETE FROM quotation_items WHERE quotation_id = ?")->execute([$id]);
    $stmt = $pdo->prepare("DELETE FROM quotations WHERE id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() > 0) echo json_encode(['message' => 'Quotation deleted successfully']);
    else { http_response_code(404); echo json_encode(['message' => 'Not found']); }
}

// ============================================================
//  Helpers
// ============================================================

// Returns ONLY named placeholders (":key") so PDO execute() never gets extra keys.
function sanitiseFields(array $data): array {
    $s = fn($k) => trim((string) ($data[$k] ?? ''));
    return [
        ':quote_no'           => $s('quoteNo'),
        ':quote_date'         => $s('quoteDate'),
        ':valid_until'        => $s('validUntil')        ?: null,
        ':po_no'              => $s('poNo')              ?: null,
        ':dispatched_through' => $s('dispatchedThrough') ?: null,
        ':vehicle_no'         => $s('vehicleNo')         ?: null,
        ':other_ref'          => $s('otherRef')          ?: null,
        ':client_name'        => $s('clientName'),
        ':client_phone'       => $s('clientPhone')       ?: null,
        ':client_email'       => $s('clientEmail')       ?: null,
        ':client_gst'         => $s('clientGst')         ?: null,
        ':client_address'     => $s('clientAddress')     ?: null,
        ':client_state'       => $s('clientState')       ?: 'Tamil Nadu',
        ':client_state_code'  => $s('clientStateCode')   ?: '33',
        ':ship_name'          => $s('shipName')          ?: null,
        ':ship_address'       => $s('shipAddress')       ?: null,
        ':ship_gst'           => $s('shipGst')           ?: null,
        ':ship_state'         => $s('shipState')         ?: null,
        ':ship_state_code'    => $s('shipStateCode')     ?: null,
        ':discount_percent'   => (float) ($data['discount']   ?? 0),
        ':tax_percent'        => (float) ($data['taxPercent'] ?? 18),
        ':notes'              => $s('notes')             ?: null,
        ':declaration'        => $s('declaration')       ?: null,
        ':unit_qty'           => (isset($data['unitQty']) && $data['unitQty'] !== '') ? (float) $data['unitQty'] : null,
        ':price_unit'         => $s('priceUnit')         ?: null,
        ':is_gst'             => array_key_exists('isGst', $data) ? ($data['isGst'] ? 1 : 0) : 1,
        ':round_off'          => (isset($data['manualRoundOff']) && $data['manualRoundOff'] !== '' && is_numeric($data['manualRoundOff']))
                                    ? round((float) $data['manualRoundOff'], 2) : null,
    ];
}

function insertItems(PDO $pdo, int $quotationId, array $items): void {
    $stmt = $pdo->prepare("
        INSERT INTO quotation_items (quotation_id, description, hsn, due_on, unit, quantity, rate, amount)
        VALUES (:quotation_id, :description, :hsn, :due_on, :unit, :quantity, :rate, :amount)
    ");
    foreach ($items as $item) {
        $desc = trim((string) ($item['description'] ?? ''));
        $qty  = (float) ($item['qty'] ?? 0);
        $rate = (float) ($item['rateIncl'] ?? $item['rate'] ?? 0);
        if (!$desc || $qty <= 0) continue;

        $stmt->execute([
            ':quotation_id' => $quotationId,
            ':description'  => $desc,
            ':hsn'          => trim((string) ($item['hsn'] ?? '')) ?: null,
            ':due_on'       => trim((string) ($item['dueOn'] ?? '')) ?: null,
            ':unit'         => trim((string) ($item['unit'] ?? 'NOS')),
            ':quantity'     => $qty,
            ':rate'         => $rate,
            ':amount'       => round($qty * $rate, 2),
        ]);
    }
}