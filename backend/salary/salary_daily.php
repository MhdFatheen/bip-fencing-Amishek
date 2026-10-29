<?php
// =============================================================
//  salary_daily.php — Salary v2 (daily earnings, OT, payments)
//  Actions: days, payments, branch_budget, add_ot, delete_ot,
//           delete_day, adjust_bags, update_bags_count,
//           adjust_ot_quantity, update_ot_quantity,
//           add_payment, delete_payment
// =============================================================
require_once __DIR__ . '/../auth_middleware.php';   // includes cors.php + $pdo
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$action = $_GET['action'] ?? '';
$in     = json_decode(file_get_contents('php://input'), true) ?: [];

// Branch scope: null = admin viewing all branches
$scope = ($authUser['role'] === 'admin') ? $authUser['view_branch_id'] : (int)$authUser['branch_id'];

function out($d, $code = 200) { http_response_code($code); echo json_encode($d); exit; }
function fail($m, $code = 400) { out(['error' => $m], $code); }

function scopeSql($col, $scope, &$params) {
    if ($scope === null) return '';
    $params[] = $scope;
    return " AND $col = ?";
}

// emp_id (string used by frontend) -> employees row
function findEmployee(PDO $pdo, $empId, $scope) {
    $p = [$empId];
    $sql = "SELECT * FROM employees WHERE emp_id = ?" . scopeSql('branch_id', $scope, $p) . " LIMIT 1";
    $st = $pdo->prepare($sql); $st->execute($p);
    $e = $st->fetch(PDO::FETCH_ASSOC);
    if (!$e) fail('Employee not found', 404);
    return $e;
}

// Load a salary_days row, enforcing branch scope
function findDay(PDO $pdo, $id, $scope) {
    $p = [(int)$id];
    $st = $pdo->prepare("SELECT * FROM salary_days WHERE id = ?" . scopeSql('branch_id', $scope, $p));
    $st->execute($p);
    $d = $st->fetch(PDO::FETCH_ASSOC);
    if (!$d) fail('Salary day not found', 404);
    return $d;
}

// Recalculate base / ot / total for one day
function recalc(PDO $pdo, $dayId) {
    $pdo->prepare("
        UPDATE salary_days sd
        SET sd.base_amount  = IF(sd.branch_id IN (1, 2, 3),
                                  sd.pack_count * sd.pack_rate,
                                  IF(sd.attendance_status = 'Present', sd.bags_count * (SELECT COALESCE(e.price_per_bags, 0) FROM employees e WHERE e.id = sd.employee_id), 0)),
            sd.ot_amount    = (SELECT COALESCE(SUM(o.amount * o.quantity), 0) FROM salary_ot_entries o WHERE o.salary_day_id = sd.id),
            sd.total_amount = sd.salary_amount + sd.base_amount + sd.ot_amount + sd.loading_amount + sd.unloading_amount + sd.location_change + sd.kambi_amount + sd.others_amount + sd.petrol + sd.tea + sd.food_amount + sd.ot_day_amount + IF(sd.work_yes = 1, sd.work_amount, 0) + sd.extra_amount - sd.advance
        WHERE sd.id = ?")->execute([(int)$dayId]);
}

// Create missing salary_days rows from attendance + refresh status
function syncFromAttendance(PDO $pdo, $scope) {
    $p = [];
    $w = scopeSql('a.branch_id', $scope, $p);
    $pdo->prepare("
        INSERT INTO salary_days (employee_id, date, attendance_status, branch_id)
        SELECT e.id, a.date, a.status, a.branch_id
        FROM attendance a
        JOIN employees e ON (CAST(e.emp_id AS CHAR) COLLATE utf8mb4_unicode_ci = CAST(a.employee_id AS CHAR) COLLATE utf8mb4_unicode_ci OR CAST(a.employee_id AS CHAR) COLLATE utf8mb4_unicode_ci = CAST(e.id AS CHAR) COLLATE utf8mb4_unicode_ci)
        LEFT JOIN salary_days sd ON sd.employee_id = e.id AND sd.date = a.date
        WHERE sd.id IS NULL $w")->execute($p);

    $p = [];
    $w = scopeSql('sd.branch_id', $scope, $p);
    $pdo->prepare("
        UPDATE salary_days sd
        JOIN employees e ON e.id = sd.employee_id
        JOIN attendance a ON (CAST(a.employee_id AS CHAR) COLLATE utf8mb4_unicode_ci = CAST(e.emp_id AS CHAR) COLLATE utf8mb4_unicode_ci OR CAST(a.employee_id AS CHAR) COLLATE utf8mb4_unicode_ci = CAST(e.id AS CHAR) COLLATE utf8mb4_unicode_ci) AND a.date = sd.date
        SET sd.attendance_status = a.status
        WHERE (sd.attendance_status IS NULL OR BINARY sd.attendance_status <> BINARY a.status) $w")->execute($p);

    $p = [];
    $w = scopeSql('sd.branch_id', $scope, $p);
    $pdo->prepare("
        UPDATE salary_days sd
        SET sd.base_amount  = IF(sd.branch_id IN (1, 2, 3),
                                  sd.pack_count * sd.pack_rate,
                                  IF(sd.attendance_status = 'Present', sd.bags_count * (SELECT COALESCE(e.price_per_bags, 0) FROM employees e WHERE e.id = sd.employee_id), 0)),
            sd.ot_amount    = (SELECT COALESCE(SUM(o.amount * o.quantity), 0) FROM salary_ot_entries o WHERE o.salary_day_id = sd.id),
            sd.total_amount = sd.salary_amount + sd.base_amount + sd.ot_amount + sd.loading_amount + sd.unloading_amount + sd.location_change + sd.kambi_amount + sd.others_amount + sd.petrol + sd.tea + sd.food_amount + sd.ot_day_amount + IF(sd.work_yes = 1, sd.work_amount, 0) + sd.extra_amount - sd.advance
        WHERE 1=1 $w")->execute($p);
}

// ── Permissions: branch users may ADD records only ─────────────
//    Editing / deleting salary records is administrator-only (checked on the
//    authenticated user's role from the session, not on any name or header).
$ADMIN_ONLY_ACTIONS = [
    'delete_day', 'delete_ot', 'delete_payment',
    'update_sale', 'adjust_bags', 'update_bags_count',
    'adjust_ot_quantity', 'update_ot_quantity',
];
if (($authUser['role'] ?? '') !== 'admin' && in_array($action, $ADMIN_ONLY_ACTIONS, true)) {
    fail('Only an administrator can edit or delete salary records', 403);
}

// An entry that already holds saved salary data cannot be overwritten by a branch user
function dayIsFilled(PDO $pdo, int $employeeId, string $date): bool {
    $st = $pdo->prepare("SELECT * FROM salary_days WHERE employee_id = ? AND date = ? LIMIT 1");
    $st->execute([$employeeId, $date]);
    $d = $st->fetch(PDO::FETCH_ASSOC);
    if (!$d) return false;
    foreach (['salary_amount','pack_count','total_amount','petrol','tea','advance','kambi_amount','others_amount',
              'loading_amount','unloading_amount','location_change','food_amount','ot_day_amount','extra_amount',
              'work_amount','ot_amount'] as $k) {
        if (isset($d[$k]) && (float)$d[$k] != 0.0) return true;
    }
    return false;
}

try {
    switch ($action) {

    // ── GET days (with OT entries) ─────────────────────────────
    case 'days':
        syncFromAttendance($pdo, $scope);
        $p = [];
        $w = scopeSql('sd.branch_id', $scope, $p);
        $st = $pdo->prepare("
            SELECT sd.id, e.emp_id AS employee_id, e.employee_name, sd.date, sd.attendance_status,
                   sd.bags_count, sd.base_amount, sd.ot_amount, sd.total_amount, sd.branch_id,
                   sd.pack_count, sd.loading, sd.unloading, sd.location_change, sd.advance, sd.pack_rate, sd.loading_rate, sd.unloading_rate, sd.loading_amount, sd.unloading_amount, sd.loading_qty, sd.unloading_qty, sd.location_qty, sd.petrol, sd.tea, sd.kambi_qty, sd.kambi_amount, sd.others_qty, sd.others_amount, sd.work_yes, sd.work_amount, sd.extra_amount, sd.salary_amount, sd.food_amount, sd.ot_day_amount
            FROM salary_days sd JOIN employees e ON e.id = sd.employee_id
            WHERE 1=1 $w ORDER BY sd.date DESC");
        $st->execute($p);
        $days = $st->fetchAll(PDO::FETCH_ASSOC);

        $byDay = [];
        if ($days) {
            $ids = array_column($days, 'id');
            $q = $pdo->prepare("SELECT id, salary_day_id, ot_work_type_id, work_name, amount, quantity
                                FROM salary_ot_entries WHERE salary_day_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ") ORDER BY id");
            $q->execute($ids);
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $o) {
                $o['id'] = (int)$o['id'];
                $o['quantity'] = (int)$o['quantity'];
                $byDay[$o['salary_day_id']][] = $o;
            }
        }
        foreach ($days as &$d) {
            $d['ot_entries'] = $byDay[$d['id']] ?? [];
            $d['id'] = (int)$d['id'];
            $d['bags_count'] = (int)$d['bags_count'];
            $d['pack_count'] = (int)$d['pack_count'];
            $d['loading']    = (int)$d['loading'];
            $d['unloading']  = (int)$d['unloading'];
        }
        out($days);

    // ── GET payments ───────────────────────────────────────────
    case 'payments':
        $p = [];
        $w = scopeSql('sp.branch_id', $scope, $p);
        $st = $pdo->prepare("
            SELECT sp.id, e.emp_id AS employee_id, e.employee_name, sp.amount, sp.payment_date, sp.note, sp.branch_id
            FROM salary_payments sp JOIN employees e ON e.id = sp.employee_id
            WHERE 1=1 $w ORDER BY sp.payment_date DESC, sp.id DESC");
        $st->execute($p);
        out($st->fetchAll(PDO::FETCH_ASSOC));

    // ── GET branch budget ──────────────────────────────────────
    case 'branch_budget':
        $p = [];
        $w = scopeSql('branch_id', $scope, $p);
        $st = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM branch_amounts WHERE 1=1 $w");
        $st->execute($p);
        out(['total_branch_amount' => (float)$st->fetchColumn()]);

    // ── POST add OT ────────────────────────────────────────────
    case 'add_ot':
        if (empty($in['employee_id']) || empty($in['date']) || empty($in['ot_work_type_id'])) fail('Employee, date and OT type are required');
        $emp = findEmployee($pdo, $in['employee_id'], $scope);

        $st = $pdo->prepare("SELECT name, amount FROM ot_work_types WHERE id = ?");
        $st->execute([(int)$in['ot_work_type_id']]);
        $type = $st->fetch(PDO::FETCH_ASSOC);
        if (!$type) fail('OT work type not found', 404);
        $amount = (isset($in['amount']) && $in['amount'] !== '') ? (float)$in['amount'] : (float)$type['amount'];

        $pdo->beginTransaction();
        $st = $pdo->prepare("SELECT id FROM salary_days WHERE employee_id = ? AND date = ?");
        $st->execute([$emp['id'], $in['date']]);
        $dayId = $st->fetchColumn();
        if (!$dayId) {
            $st = $pdo->prepare("SELECT status FROM attendance WHERE CAST(employee_id AS CHAR) COLLATE utf8mb4_unicode_ci IN (?, ?) AND date = ?");
            $st->execute([$emp['emp_id'], $emp['id'], $in['date']]);
            $pdo->prepare("INSERT INTO salary_days (employee_id, date, attendance_status, branch_id) VALUES (?,?,?,?)")
                ->execute([$emp['id'], $in['date'], $st->fetchColumn() ?: null, $emp['branch_id']]);
            $dayId = $pdo->lastInsertId();
        }
        $pdo->prepare("INSERT INTO salary_ot_entries (salary_day_id, ot_work_type_id, work_name, amount, quantity) VALUES (?,?,?,?,1)")
            ->execute([$dayId, (int)$in['ot_work_type_id'], $type['name'], $amount]);
        recalc($pdo, $dayId);
        $pdo->commit();
        out(['success' => true, 'salary_day_id' => (int)$dayId]);

    // ── DELETE OT entry ────────────────────────────────────────
    case 'delete_ot':
        $st = $pdo->prepare("SELECT salary_day_id FROM salary_ot_entries WHERE id = ?");
        $st->execute([(int)($_GET['id'] ?? 0)]);
        $dayId = $st->fetchColumn();
        if (!$dayId) fail('OT entry not found', 404);
        findDay($pdo, $dayId, $scope);
        $pdo->prepare("DELETE FROM salary_ot_entries WHERE id = ?")->execute([(int)$_GET['id']]);
        recalc($pdo, $dayId);
        out(['success' => true]);

    // ── Save one entry (Employee + Date + Attendance + Packs …) ─
    case 'save_entry':
        $status = $in['status'] ?? 'Present';
        if (!in_array($status, ['Present', 'Absent', 'Half Day'], true)) fail('Status must be Present, Half Day or Absent');
        if (empty($in['employee_id']) || empty($in['date'])) fail('Employee and date are required');
        $emp = findEmployee($pdo, $in['employee_id'], $scope);
        if (($authUser['role'] ?? '') !== 'admin' && dayIsFilled($pdo, (int)$emp['id'], (string)$in['date'])) {
            fail('Only an administrator can edit saved salary records', 403);
        }
        // Amounts are auto-calculated on the page from the employee's rates (editable there)
        // Loading / Unloading = qty typed on the page × employee rate
        $loadQty   = max(0, (float)($in['loading_qty'] ?? 0));
        $unloadQty = max(0, (float)($in['unloading_qty'] ?? 0));
        $loadAmt   = round($loadQty * (float)($emp['loading_rate'] ?? 0), 2);
        $unloadAmt = round($unloadQty * (float)($emp['unloading_rate'] ?? 0), 2);
        $locQty    = max(0, (float)($in['location_qty'] ?? 0));
        $locAmt    = round($locQty * (float)($emp['location_change_rate'] ?? 0), 2);
        $kambiQty  = max(0, (float)($in['kambi_qty'] ?? 0));
        $kambiAmt  = round($kambiQty * (float)($emp['kambi_kattu_rate'] ?? 0), 2);
        $othersQty = max(0, (float)($in['others_qty'] ?? 0));
        $othersAmt = round($othersQty * (float)($emp['others_rate'] ?? 0), 2);
        $vals = [
            max(0, (int)($in['pack_count'] ?? 0)),
            $loadAmt > 0 ? 1 : 0,
            $unloadAmt > 0 ? 1 : 0,
            $locAmt,
            max(0, (float)($in['advance'] ?? 0)),
            (isset($in['pack_rate']) && (float)$in['pack_rate'] > 0) ? round((float)$in['pack_rate'], 4) : (float)($emp['price_per_bags'] ?? 0),
            (float)($emp['loading_rate'] ?? 0),
            (float)($emp['unloading_rate'] ?? 0),
            $loadAmt,
            $unloadAmt,
            $loadQty,
            $unloadQty,
            $locQty,
            max(0, (float)($in['petrol'] ?? 0)),
            max(0, (float)($in['tea'] ?? 0)),
            $kambiQty, $kambiAmt, $othersQty, $othersAmt,
            empty($in['work_yes']) ? 0 : 1,
            empty($in['work_yes']) ? 0 : max(0, (float)($in['work_amount'] ?? 0)),
            max(0, (float)($in['extra_amount'] ?? 0)),
            max(0, (float)($in['salary_amount'] ?? 0)),
            max(0, (float)($in['food_amount'] ?? 0)),
            max(0, (float)($in['ot_day_amount'] ?? 0)),
        ];
        $pdo->prepare("INSERT INTO salary_days (employee_id, date, attendance_status, branch_id, pack_count, loading, unloading, location_change, advance, pack_rate, loading_rate, unloading_rate, loading_amount, unloading_amount, loading_qty, unloading_qty, location_qty, petrol, tea, kambi_qty, kambi_amount, others_qty, others_amount, work_yes, work_amount, extra_amount, salary_amount, food_amount, ot_day_amount)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON DUPLICATE KEY UPDATE attendance_status = VALUES(attendance_status), pack_count = VALUES(pack_count),
                         loading = VALUES(loading), unloading = VALUES(unloading),
                         location_change = VALUES(location_change), advance = VALUES(advance),
                         pack_rate = VALUES(pack_rate), loading_rate = VALUES(loading_rate), unloading_rate = VALUES(unloading_rate),
                         loading_amount = VALUES(loading_amount), unloading_amount = VALUES(unloading_amount),
                         loading_qty = VALUES(loading_qty), unloading_qty = VALUES(unloading_qty), location_qty = VALUES(location_qty),
                         petrol = VALUES(petrol), tea = VALUES(tea),
                         kambi_qty = VALUES(kambi_qty), kambi_amount = VALUES(kambi_amount),
                         others_qty = VALUES(others_qty), others_amount = VALUES(others_amount),
                         work_yes = VALUES(work_yes), work_amount = VALUES(work_amount), extra_amount = VALUES(extra_amount), salary_amount = VALUES(salary_amount), food_amount = VALUES(food_amount), ot_day_amount = VALUES(ot_day_amount)")
            ->execute(array_merge([$emp['id'], $in['date'], $status, $emp['branch_id']], $vals));
        $pdo->prepare("UPDATE attendance SET status = ? WHERE CAST(employee_id AS CHAR) COLLATE utf8mb4_unicode_ci IN (?, ?) AND date = ?")
            ->execute([$status, $emp['emp_id'], (string)$emp['id'], $in['date']]);
        $st = $pdo->prepare("SELECT id FROM salary_days WHERE employee_id = ? AND date = ?");
        $st->execute([$emp['id'], $in['date']]);
        $dayId = $st->fetchColumn();
        recalc($pdo, $dayId);
        out(['success' => true, 'salary_day_id' => (int)$dayId]);

    // ── Mark Present / Absent from the Salary page ─────────────
    case 'mark_attendance':
        $status = $in['status'] ?? '';
        if (!in_array($status, ['Present', 'Absent', 'Half Day'], true)) fail('Status must be Present, Half Day or Absent');
        if (empty($in['employee_id']) || empty($in['date'])) fail('Employee and date are required');
        $emp = findEmployee($pdo, $in['employee_id'], $scope);
        if (($authUser['role'] ?? '') !== 'admin' && dayIsFilled($pdo, (int)$emp['id'], (string)$in['date'])) {
            fail('Only an administrator can edit saved salary records', 403);
        }
        $pdo->prepare("INSERT INTO salary_days (employee_id, date, attendance_status, branch_id) VALUES (?,?,?,?)
                       ON DUPLICATE KEY UPDATE attendance_status = VALUES(attendance_status)")
            ->execute([$emp['id'], $in['date'], $status, $emp['branch_id']]);
        // keep any old attendance row in sync so it doesn't overwrite this
        $pdo->prepare("UPDATE attendance SET status = ? WHERE CAST(employee_id AS CHAR) COLLATE utf8mb4_unicode_ci IN (?, ?) AND date = ?")
            ->execute([$status, $emp['emp_id'], (string)$emp['id'], $in['date']]);
        $st = $pdo->prepare("SELECT id FROM salary_days WHERE employee_id = ? AND date = ?");
        $st->execute([$emp['id'], $in['date']]);
        $dayId = $st->fetchColumn();
        recalc($pdo, $dayId);
        out(['success' => true, 'salary_day_id' => (int)$dayId]);

    // ── Packs / Loading / Unloading / Location change / Advance ─
    case 'update_sale':
        $d = findDay($pdo, $in['salary_day_id'] ?? 0, $scope);
        $pdo->prepare("UPDATE salary_days SET pack_count = ?, loading = ?, unloading = ?, location_change = ?, advance = ? WHERE id = ?")
            ->execute([
                max(0, (int)($in['pack_count'] ?? 0)),
                empty($in['loading']) ? 0 : 1,
                empty($in['unloading']) ? 0 : 1,
                max(0, (float)($in['location_change'] ?? 0)),
                max(0, (float)($in['advance'] ?? 0)),
                $d['id'],
            ]);
        recalc($pdo, $d['id']);
        out(['success' => true]);

    // ── DELETE day ─────────────────────────────────────────────
    case 'delete_day':
        $d = findDay($pdo, $_GET['id'] ?? 0, $scope);
        $pdo->prepare("DELETE FROM salary_days WHERE id = ?")->execute([$d['id']]);
        out(['success' => true]);

    // ── Bags +/- and set ───────────────────────────────────────
    case 'adjust_bags':
    case 'update_bags_count':
        $d = findDay($pdo, $in['salary_day_id'] ?? 0, $scope);
        if ($d['attendance_status'] !== 'Present') fail('Bags can only be changed for Present days');
        if ($action === 'adjust_bags') {
            $bags = ($in['direction'] ?? '') === 'inc' ? $d['bags_count'] + 1 : max(0, $d['bags_count'] - 1);
        } else {
            $bags = max(0, (int)($in['bags_count'] ?? 0));
        }
        $pdo->prepare("UPDATE salary_days SET bags_count = ? WHERE id = ?")->execute([$bags, $d['id']]);
        recalc($pdo, $d['id']);
        out(['success' => true, 'bags_count' => $bags]);

    // ── OT quantity +/- and set ────────────────────────────────
    case 'adjust_ot_quantity':
    case 'update_ot_quantity':
        $st = $pdo->prepare("SELECT id, salary_day_id, quantity FROM salary_ot_entries WHERE id = ?");
        $st->execute([(int)($in['ot_entry_id'] ?? 0)]);
        $o = $st->fetch(PDO::FETCH_ASSOC);
        if (!$o) fail('OT entry not found', 404);
        findDay($pdo, $o['salary_day_id'], $scope);
        if ($action === 'adjust_ot_quantity') {
            $qty = ($in['direction'] ?? '') === 'inc' ? $o['quantity'] + 1 : max(1, $o['quantity'] - 1);
        } else {
            $qty = max(1, (int)($in['quantity'] ?? 1));
        }
        $pdo->prepare("UPDATE salary_ot_entries SET quantity = ? WHERE id = ?")->execute([$qty, $o['id']]);
        recalc($pdo, $o['salary_day_id']);
        out(['success' => true, 'quantity' => $qty]);

    // ── Payments ───────────────────────────────────────────────
    case 'add_payment':
        $amt = (float)($in['amount'] ?? 0);
        if ($amt <= 0 || empty($in['employee_id']) || empty($in['payment_date'])) fail('Employee, amount and date are required');
        $emp = findEmployee($pdo, $in['employee_id'], $scope);
        $pdo->prepare("INSERT INTO salary_payments (employee_id, amount, payment_date, note, branch_id) VALUES (?,?,?,?,?)")
            ->execute([$emp['id'], $amt, $in['payment_date'], ($in['note'] ?? '') ?: null, $emp['branch_id']]);
        out(['success' => true, 'id' => (int)$pdo->lastInsertId()]);

    case 'delete_payment':
        $p = [(int)($_GET['id'] ?? 0)];
        $st = $pdo->prepare("DELETE FROM salary_payments WHERE id = ?" . scopeSql('branch_id', $scope, $p));
        $st->execute($p);
        if (!$st->rowCount()) fail('Payment not found', 404);
        out(['success' => true]);

    default:
        fail('Invalid action');
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail($e->getMessage(), 500);
}