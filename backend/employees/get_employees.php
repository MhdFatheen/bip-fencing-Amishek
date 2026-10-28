<?php
// Allow token via GET parameter (for environments where HTTP_AUTHORIZATION is not set)
if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$db = getDB();

// Detect which columns really exist (DB was migrated: phone_number -> whatsapp_number, etc.)
$cols = [];
$res = $db->query("SHOW COLUMNS FROM employees");
while ($c = $res->fetch_assoc()) $cols[$c['Field']] = true;
$phoneCol = isset($cols['whatsapp_number']) ? 'whatsapp_number' : (isset($cols['phone_number']) ? 'phone_number' : null);

// Branch id -> name map (added to every employee row as branch_name)
$branchNames = [];
$bc = [];
$r = $db->query("SHOW COLUMNS FROM branches");
while ($c = $r->fetch_assoc()) $bc[$c['Field']] = true;
$bcol = isset($bc['name']) ? 'name' : 'branch_name';
$r = $db->query("SELECT id, `$bcol` AS n FROM branches");
while ($b = $r->fetch_assoc()) $branchNames[$b['id']] = $b['n'];
$withBranch = function (array $rows) use ($branchNames) {
    foreach ($rows as &$row) $row['branch_name'] = $branchNames[$row['branch_id'] ?? 0] ?? '';
    return $rows;
};

// ✅ SIMPLE MODE (for dropdowns)
if (isset($_GET['simple']) && $_GET['simple'] == 1) {
    list($whereClause, $branchParams) = branchFilter($authUser);
    $sql = "SELECT * FROM employees $whereClause ORDER BY employee_name ASC";
    $stmt = $db->prepare($sql);
    if ($branchParams) {
        $types = str_repeat('i', count($branchParams));
        $stmt->bind_param($types, ...$branchParams);
    }
    $stmt->execute();
    $employees = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode($withBranch($employees));
    $stmt->close();
    $db->close();
    exit;
}

// Otherwise, full paginated response for Employee Details page
$search_name   = isset($_GET['name']) ? trim($_GET['name']) : '';
$search_emp_id = isset($_GET['emp_id']) ? trim($_GET['emp_id']) : '';
$search_salary = isset($_GET['salary_type']) ? trim($_GET['salary_type']) : '';
$search_phone  = trim($_GET['phone'] ?? $_GET['whatsapp'] ?? $_GET['whatsapp_number'] ?? '');
$date_from     = isset($_GET['date_from']) ? $_GET['date_from'] : '';
$date_to       = isset($_GET['date_to']) ? $_GET['date_to'] : '';
$page          = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$limit         = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 10;
$offset        = ($page - 1) * $limit;

list($whereClause, $branchParams) = branchFilter($authUser);

// Build additional filters
$filters = [];
$filterParams = [];
if ($search_name !== '') {
    $filters[] = "employee_name LIKE ?";
    $filterParams[] = "%$search_name%";
}
if ($search_emp_id !== '' && isset($cols['emp_id'])) {
    $filters[] = "emp_id LIKE ?";
    $filterParams[] = "%$search_emp_id%";
}
if ($search_salary !== '') {
    $filters[] = "salary_type = ?";
    $filterParams[] = $search_salary;
}
if ($search_phone !== '' && $phoneCol) {
    $filters[] = "$phoneCol LIKE ?";
    $filterParams[] = "%$search_phone%";
}
if (!empty($date_from)) {
    $filters[] = "date_of_joining >= ?";
    $filterParams[] = $date_from;
}
if (!empty($date_to)) {
    $filters[] = "date_of_joining <= ?";
    $filterParams[] = $date_to;
}

// Combine WHERE
$where = $whereClause;
if ($filters) {
    $where .= ($where ? ' AND ' : 'WHERE ') . implode(' AND ', $filters);
}

// Total count for pagination
$countStmt = $db->prepare("SELECT COUNT(*) as total FROM employees $where");
$allParams = array_merge($branchParams, $filterParams);
if ($allParams) {
    $countStmt->bind_param(str_repeat('s', count($allParams)), ...$allParams);
}
$countStmt->execute();
$total = (int)$countStmt->get_result()->fetch_assoc()['total'];
$countStmt->close();

// Main query
$stmt = $db->prepare("SELECT * FROM employees $where ORDER BY created_at DESC LIMIT ? OFFSET ?");
$bindParams = array_merge($branchParams, $filterParams, [$limit, $offset]);
$stmt->bind_param(str_repeat('s', count($bindParams) - 2) . 'ii', ...$bindParams);
$stmt->execute();
$employees = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

echo json_encode([
    'data'        => $withBranch($employees),
    'total'       => $total,
    'page'        => $page,
    'limit'       => $limit,
    'total_pages' => (int)ceil($total / $limit)
]);
$stmt->close();
$db->close();
