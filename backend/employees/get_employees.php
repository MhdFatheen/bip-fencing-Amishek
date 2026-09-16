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

// ✅ SIMPLE MODE (for dropdowns) – now includes salary_type
if (isset($_GET['simple']) && $_GET['simple'] == 1) {
    list($whereClause, $branchParams) = branchFilter($authUser);
    $sql = "SELECT id, employee_name, emp_id, salary_type FROM employees $whereClause ORDER BY employee_name ASC";
    $stmt = $db->prepare($sql);
    if ($branchParams) {
        $types = str_repeat('i', count($branchParams));
        $stmt->bind_param($types, ...$branchParams);
    }
    $stmt->execute();
    $employees = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode($employees);
    $stmt->close();
    $db->close();
    exit;
}

// Otherwise, full paginated response for Employee Details page
$search_name   = isset($_GET['name']) ? trim($_GET['name']) : '';
$search_emp_id = isset($_GET['emp_id']) ? trim($_GET['emp_id']) : '';
$search_salary = isset($_GET['salary_type']) ? trim($_GET['salary_type']) : '';
$search_phone  = isset($_GET['phone']) ? trim($_GET['phone']) : '';
$date_from     = isset($_GET['date_from']) ? $_GET['date_from'] : '';
$date_to       = isset($_GET['date_to']) ? $_GET['date_to'] : '';
$page          = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$limit         = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 10;
$offset        = ($page - 1) * $limit;

list($whereClause, $branchParams) = branchFilter($authUser);

// Build additional filters
$filters = [];
$filterParams = [];
if (!empty($search_name)) {
    $filters[] = "employee_name LIKE ?";
    $filterParams[] = "%$search_name%";
}
if (!empty($search_emp_id)) {
    $filters[] = "emp_id LIKE ?";
    $filterParams[] = "%$search_emp_id%";
}
if (!empty($search_salary)) {
    $filters[] = "salary_type = ?";
    $filterParams[] = $search_salary;
}
if (!empty($search_phone)) {
    $filters[] = "phone_number LIKE ?";
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
$where = '';
if (!empty($whereClause)) {
    $where = $whereClause;
    if (!empty($filters)) {
        $where .= ' AND ' . implode(' AND ', $filters);
    }
} else {
    if (!empty($filters)) {
        $where = 'WHERE ' . implode(' AND ', $filters);
    }
}

// Total count for pagination
$countSql = "SELECT COUNT(*) as total FROM employees $where";
$countStmt = $db->prepare($countSql);
$allParams = array_merge($branchParams, $filterParams);
if (!empty($allParams)) {
    $types = str_repeat('s', count($allParams));
    $countStmt->bind_param($types, ...$allParams);
}
$countStmt->execute();
$total = $countStmt->get_result()->fetch_assoc()['total'];
$countStmt->close();

// Main query
$sql = "SELECT id, employee_name, emp_id, department, destination, gender, email, phone_number, address, salary_type, date_of_joining, created_at 
        FROM employees $where ORDER BY created_at DESC LIMIT ? OFFSET ?";
$stmt = $db->prepare($sql);
$bindParams = array_merge($branchParams, $filterParams, [$limit, $offset]);
$types = str_repeat('s', count($bindParams) - 2) . 'ii';
$stmt->bind_param($types, ...$bindParams);
$stmt->execute();
$employees = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

echo json_encode([
    'data' => $employees,
    'total' => $total,
    'page' => $page,
    'limit' => $limit,
    'total_pages' => ceil($total / $limit)
]);
$stmt->close();
$db->close();
?>