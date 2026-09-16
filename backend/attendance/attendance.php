<?php
// =============================================================
//  attendance.php — with admin branch impersonation
//  Accepts token from URL ?token= as fallback
// =============================================================

// Allow token via GET parameter (for environments where HTTP_AUTHORIZATION is not set)
if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

function readBody(): array {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        exit;
    }
    return $body;
}

function cleanTime(?string $t): ?string {
    if (!$t || !preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $t)) return null;
    return $t;
}

function getEffectiveBranchId(array $user): ?int {
    if ($user['role'] === 'admin' && $user['view_branch_id'] !== null) {
        return (int)$user['view_branch_id'];
    }
    if ($user['role'] !== 'admin' && $user['branch_id'] !== null) {
        return (int)$user['branch_id'];
    }
    return null;
}

$effectiveBranch = getEffectiveBranchId($authUser);

// ── GET ───────────────────────────────────────────────────────
if ($method === 'GET') {
    $where  = ['1=1'];
    $params = [];
    $types  = '';

    if ($effectiveBranch !== null) {
        $where[]  = 'a.branch_id = ?';
        $params[] = $effectiveBranch;
        $types   .= 'i';
    }

    if (!empty($_GET['date']))   { $where[] = 'a.date = ?';      $params[] = $_GET['date'];   $types .= 's'; }
    if (!empty($_GET['status'])) { $where[] = 'a.status = ?';    $params[] = $_GET['status']; $types .= 's'; }
    if (!empty($_GET['search'])) {
        $like     = '%' . $_GET['search'] . '%';
        $where[]  = '(a.employee_name LIKE ? OR a.employee_id LIKE ?)';
        $params[] = $like; $params[] = $like;
        $types   .= 'ss';
    }
    if (!empty($_GET['tab'])) {
        if ($_GET['tab'] === 'today') $where[] = 'a.date = CURDATE()';
        if ($_GET['tab'] === 'week')  $where[] = 'a.date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)';
    }

    $whereSQL = 'WHERE ' . implode(' AND ', $where);
    $sql = "SELECT a.id, a.employee_id, a.employee_name, a.date, a.status,
                   a.leave_type, a.check_in, a.check_out, a.work_hours,
                   a.branch_id, a.created_at, a.updated_at
            FROM attendance a
            $whereSQL
            ORDER BY a.date DESC, a.created_at DESC";

    $stmt = $db->prepare($sql);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $records = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    // Stats scoped to effective branch
    $branchWhere = $effectiveBranch !== null ? "AND branch_id = $effectiveBranch" : '';
    $today   = [];
    $allTime = [];
    $res = $db->query("SELECT status, COUNT(*) AS cnt FROM attendance WHERE date = CURDATE() $branchWhere GROUP BY status");
    while ($r = $res->fetch_assoc()) $today[$r['status']] = (int)$r['cnt'];
    $res = $db->query("SELECT status, COUNT(*) AS cnt FROM attendance WHERE 1 $branchWhere GROUP BY status");
    while ($r = $res->fetch_assoc()) $allTime[$r['status']] = (int)$r['cnt'];

    $empWhere = $effectiveBranch !== null ? "WHERE branch_id = $effectiveBranch" : '';
    $totalEmp = (int)$db->query("SELECT COUNT(*) AS c FROM employees $empWhere")->fetch_assoc()['c'];

    echo json_encode(['records' => $records, 'stats' => ['total_employees' => $totalEmp, 'today' => $today, 'all_time' => $allTime]]);
    $db->close();
    exit;
}

// ── POST ──────────────────────────────────────────────────────
if ($method === 'POST') {
    $body    = readBody();
    $empId   = trim($body['employee_id']   ?? '');
    $empName = trim($body['employee_name'] ?? '');
    $date    = trim($body['date']          ?? '');
    $status  = trim($body['status']        ?? 'Present');
    $leave   = trim($body['leave_type']    ?? '') ?: null;
    $checkIn = cleanTime($body['check_in']  ?? null);
    $checkOut= cleanTime($body['check_out'] ?? null);
    $wh      = is_numeric($body['work_hours'] ?? '') ? (float)$body['work_hours'] : null;

    $branchId = $effectiveBranch;
    if ($branchId === null && $authUser['role'] === 'admin') {
        $branchId = (int)($body['branch_id'] ?? 0);
    }
    if (!$branchId) {
        http_response_code(400);
        echo json_encode(['error' => 'No branch selected (admin must set X-Branch-ID or provide branch_id)']);
        exit;
    }

    if (!$empId || !$empName || !$date) {
        http_response_code(422);
        echo json_encode(['error' => 'employee_id, employee_name and date are required']);
        exit;
    }

    $stmt = $db->prepare(
        'INSERT INTO attendance (employee_id, employee_name, date, status, leave_type, check_in, check_out, work_hours, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param('sssssssdi', $empId, $empName, $date, $status, $leave, $checkIn, $checkOut, $wh, $branchId);

    if ($stmt->execute()) {
        http_response_code(201);
        echo json_encode(['success' => true, 'id' => $db->insert_id]);
    } else {
        $code = $db->errno === 1062 ? 409 : 500;
        http_response_code($code);
        echo json_encode(['error' => $db->errno === 1062 ? "Attendance already exists for this employee on this date" : $db->error]);
    }
    $stmt->close(); $db->close(); exit;
}

// ── PUT ───────────────────────────────────────────────────────
if ($method === 'PUT') {
    $id   = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'id required']); exit; }

    $checkSql = "SELECT id FROM attendance WHERE id = ?";
    $checkParams = [$id];
    $checkTypes = 'i';
    if ($effectiveBranch !== null) {
        $checkSql .= " AND branch_id = ?";
        $checkParams[] = $effectiveBranch;
        $checkTypes .= 'i';
    }
    $checkStmt = $db->prepare($checkSql);
    $checkStmt->bind_param($checkTypes, ...$checkParams);
    $checkStmt->execute();
    if (!$checkStmt->get_result()->fetch_assoc()) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied – record not in your branch view']);
        exit;
    }

    $body    = readBody();
    $empId   = trim($body['employee_id']   ?? '');
    $empName = trim($body['employee_name'] ?? '');
    $date    = trim($body['date']          ?? '');
    $status  = trim($body['status']        ?? 'Present');
    $leave   = trim($body['leave_type']    ?? '') ?: null;
    $checkIn = cleanTime($body['check_in']  ?? null);
    $checkOut= cleanTime($body['check_out'] ?? null);
    $wh      = is_numeric($body['work_hours'] ?? '') ? (float)$body['work_hours'] : null;

    $stmt = $db->prepare('UPDATE attendance SET employee_id=?, employee_name=?, date=?, status=?, leave_type=?, check_in=?, check_out=?, work_hours=? WHERE id=?');
    $stmt->bind_param('sssssssdi', $empId, $empName, $date, $status, $leave, $checkIn, $checkOut, $wh, $id);

    if ($stmt->execute()) { echo json_encode(['success' => true]); }
    else { http_response_code(500); echo json_encode(['error' => $db->error]); }
    $stmt->close(); $db->close(); exit;
}

// ── DELETE ────────────────────────────────────────────────────
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'id required']); exit; }

    $checkSql = "SELECT id FROM attendance WHERE id = ?";
    $checkParams = [$id];
    $checkTypes = 'i';
    if ($effectiveBranch !== null) {
        $checkSql .= " AND branch_id = ?";
        $checkParams[] = $effectiveBranch;
        $checkTypes .= 'i';
    }
    $checkStmt = $db->prepare($checkSql);
    $checkStmt->bind_param($checkTypes, ...$checkParams);
    $checkStmt->execute();
    if (!$checkStmt->get_result()->fetch_assoc()) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied – record not in your branch view']);
        exit;
    }

    $stmt = $db->prepare('DELETE FROM attendance WHERE id = ?');
    $stmt->bind_param('i', $id);
    if ($stmt->execute()) { echo json_encode(['success' => true]); }
    else { http_response_code(500); echo json_encode(['error' => $db->error]); }
    $stmt->close(); $db->close(); exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>