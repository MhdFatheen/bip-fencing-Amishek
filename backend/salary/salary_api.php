<?php
// =============================================================
//  salary_api.php
//  Actions: employees, records, branch_total, save, update, delete
// =============================================================

error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json');

require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

function getEffectiveBranchId($user): ?int {
    if ($user['role'] === 'admin' && isset($user['view_branch_id']) && $user['view_branch_id'] !== null) {
        return (int)$user['view_branch_id'];
    }
    if ($user['role'] !== 'admin' && isset($user['branch_id']) && $user['branch_id'] !== null) {
        return (int)$user['branch_id'];
    }
    return null;
}

$action          = $_GET['action'] ?? '';
$effectiveBranch = getEffectiveBranchId($authUser);
$conn            = getDB();

// ─────────────────────────────────────────────────────────────
// 1. GET employees (filtered by branch)
// ─────────────────────────────────────────────────────────────
if ($action === 'employees') {
    if ($effectiveBranch !== null) {
        $stmt = $conn->prepare(
            'SELECT emp_id, employee_name AS emp_name
               FROM employees
              WHERE branch_id = ?
              ORDER BY employee_name'
        );
        $stmt->bind_param('i', $effectiveBranch);
    } else {
        $stmt = $conn->prepare(
            'SELECT emp_id, employee_name AS emp_name
               FROM employees
              ORDER BY employee_name'
        );
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $employees = $result->fetch_all(MYSQLI_ASSOC);
    echo json_encode($employees);
    exit;
}

// ─────────────────────────────────────────────────────────────
// 2. GET salary records (filtered by branch)
// ─────────────────────────────────────────────────────────────
if ($action === 'records') {
    if ($effectiveBranch !== null) {
        $stmt = $conn->prepare(
            'SELECT id, employeeName, employeeId, salary,
                    paid, balance, type, salary_date, created_at
               FROM salaries
              WHERE branch_id = ?
              ORDER BY id DESC'
        );
        $stmt->bind_param('i', $effectiveBranch);
    } else {
        $stmt = $conn->prepare(
            'SELECT id, employeeName, employeeId, salary,
                    paid, balance, type, salary_date, created_at
               FROM salaries
              ORDER BY id DESC'
        );
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $records = $result->fetch_all(MYSQLI_ASSOC);
    echo json_encode($records);
    exit;
}

// ─────────────────────────────────────────────────────────────
// 3. GET branch budget totals
// ─────────────────────────────────────────────────────────────
if ($action === 'branch_total') {
    if ($effectiveBranch === null) {
        $totalBranch = $conn->query(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM branch_amounts"
        )->fetch_assoc()['total'];
        $totalPaid = $conn->query(
            "SELECT COALESCE(SUM(paid), 0) AS total FROM salaries"
        )->fetch_assoc()['total'];
    } else {
        $stmt = $conn->prepare(
            "SELECT COALESCE(SUM(amount), 0) AS total
               FROM branch_amounts WHERE branch_id = ?"
        );
        $stmt->bind_param('i', $effectiveBranch);
        $stmt->execute();
        $totalBranch = $stmt->get_result()->fetch_assoc()['total'];
        $stmt->close();

        $stmt = $conn->prepare(
            "SELECT COALESCE(SUM(paid), 0) AS total
               FROM salaries WHERE branch_id = ?"
        );
        $stmt->bind_param('i', $effectiveBranch);
        $stmt->execute();
        $totalPaid = $stmt->get_result()->fetch_assoc()['total'];
        $stmt->close();
    }

    $available = $totalBranch - $totalPaid;
    echo json_encode([
        'total_branch_amount' => (float)$totalBranch,
        'total_paid_salaries' => (float)$totalPaid,
        'available_balance'   => (float)$available,
    ]);
    exit;
}

// ─────────────────────────────────────────────────────────────
// 4. POST save salary (branch_id taken from employee)
// ─────────────────────────────────────────────────────────────
if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) {
        echo json_encode(['success' => false, 'message' => 'No data received']);
        exit;
    }

    $employeeId = trim($data['employeeId'] ?? '');
    if (!$employeeId) {
        echo json_encode(['success' => false, 'message' => 'No employee selected.']);
        exit;
    }

    // Get branch_id from employee record
    $stmt = $conn->prepare(
        "SELECT branch_id FROM employees WHERE emp_id = ? LIMIT 1"
    );
    $stmt->bind_param('s', $employeeId);
    $stmt->execute();
    $empRow = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$empRow) {
        echo json_encode(['success' => false, 'message' => 'Employee not found.']);
        exit;
    }
    if (empty($empRow['branch_id'])) {
        echo json_encode(['success' => false, 'message' => 'This employee has no branch assigned. Please assign a branch to the employee first.']);
        exit;
    }

    $branchId = (int)$empRow['branch_id'];

    // Budget check
    $stmt = $conn->prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM branch_amounts WHERE branch_id = ?"
    );
    $stmt->bind_param('i', $branchId);
    $stmt->execute();
    $branchTotal = (float)$stmt->get_result()->fetch_assoc()['total'];
    $stmt->close();

    $stmt = $conn->prepare(
        "SELECT COALESCE(SUM(paid), 0) AS total FROM salaries WHERE branch_id = ?"
    );
    $stmt->bind_param('i', $branchId);
    $stmt->execute();
    $totalPaid = (float)$stmt->get_result()->fetch_assoc()['total'];
    $stmt->close();

    $available = $branchTotal - $totalPaid;
    $paid      = (float)($data['paid'] ?? 0);

    if ($paid > $available) {
        echo json_encode([
            'success' => false,
            'message' => 'Insufficient branch budget. Available: ₹' . number_format($available, 2),
        ]);
        exit;
    }

    $employeeName = $conn->real_escape_string($data['employeeName'] ?? '');
    $salary       = (float)($data['salary'] ?? 0);
    $balance      = (float)($data['balance'] ?? 0);
    $type         = $conn->real_escape_string($data['type'] ?? '');
    $date         = $conn->real_escape_string($data['date'] ?? '');

    $stmt = $conn->prepare(
        "INSERT INTO salaries
            (employeeName, employeeId, salary, paid, balance, type, salary_date, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param(
        'ssdddssi',
        $employeeName, $employeeId, $salary, $paid, $balance, $type, $date, $branchId
    );

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Salary saved']);
    } else {
        echo json_encode(['success' => false, 'message' => $stmt->error]);
    }
    $stmt->close();
    exit;
}

// ─────────────────────────────────────────────────────────────
// 5. UPDATE salary record (admin only)
// ─────────────────────────────────────────────────────────────
if ($action === 'update' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
    // Only admin can update
    if ($authUser['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Admin access required']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data || !isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid data']);
        exit;
    }

    $id   = (int)$data['id'];
    $paid = (float)($data['paid'] ?? 0);
    $salary = (float)($data['salary'] ?? 0);
    $type = $conn->real_escape_string($data['type'] ?? '');
    $date = $conn->real_escape_string($data['date'] ?? '');

    // Recalculate balance
    $balance = $salary - $paid;

    $stmt = $conn->prepare(
        "UPDATE salaries SET salary=?, paid=?, balance=?, type=?, salary_date=? WHERE id=?"
    );
    $stmt->bind_param('dddssi', $salary, $paid, $balance, $type, $date, $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Salary updated']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $stmt->error]);
    }
    $stmt->close();
    exit;
}

// ─────────────────────────────────────────────────────────────
// 6. DELETE salary record (admin only)
// ─────────────────────────────────────────────────────────────
if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if ($authUser['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Admin access required']);
        exit;
    }

    $id = (int)($_GET['id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Record ID required']);
        exit;
    }

    $stmt = $conn->prepare("DELETE FROM salaries WHERE id = ?");
    $stmt->bind_param('i', $id);
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Salary record deleted']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $stmt->error]);
    }
    $stmt->close();
    exit;
}

// If no valid action
echo json_encode(['success' => false, 'message' => 'Invalid action']);
$conn->close();
?>