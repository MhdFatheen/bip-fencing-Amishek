<?php
require_once __DIR__ . '/../auth_middleware.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
if (!$id) {
    http_response_code(400);
    echo json_encode(['error' => 'Employee ID required']);
    exit;
}

$db = getDB();

// Load employee (and check branch permission for non-admins)
$sql = "SELECT id, emp_id FROM employees WHERE id = ?";
if ($authUser['role'] !== 'admin') $sql .= " AND branch_id = " . (int)$authUser['branch_id'];
$st = $db->prepare($sql);
$st->bind_param('i', $id);
$st->execute();
$emp = $st->get_result()->fetch_assoc();
$st->close();
if (!$emp) {
    http_response_code(403);
    echo json_encode(['error' => 'Employee not found or access denied']);
    exit;
}
$empCode = (string)($emp['emp_id'] ?? '');
$idStr   = (string)$id;

$tableExists = function (string $t) use ($db): bool {
    $t = $db->real_escape_string($t);
    return $db->query("SHOW TABLES LIKE '$t'")->num_rows > 0;
};

// Remove this employee's linked rows first (they block the delete via foreign keys)
$db->begin_transaction();
try {
    if ($tableExists('salary_days')) {
        if ($tableExists('salary_ot_entries')) {
            $q = $db->prepare("DELETE o FROM salary_ot_entries o JOIN salary_days d ON d.id = o.salary_day_id WHERE d.employee_id = ?");
            $q->bind_param('i', $id); $q->execute(); $q->close();
        }
        $q = $db->prepare("DELETE FROM salary_days WHERE employee_id = ?");
        $q->bind_param('i', $id); $q->execute(); $q->close();
    }
    if ($tableExists('salary_payments')) {
        $q = $db->prepare("DELETE FROM salary_payments WHERE employee_id = ?");
        $q->bind_param('i', $id); $q->execute(); $q->close();
    }
    // Legacy `salaries` table has FK fk_sal_emp -> employees.emp_id (no ON DELETE) and blocks the delete
    if ($tableExists('salaries') && $empCode !== '') {
        $q = $db->prepare("DELETE FROM salaries WHERE employeeId = ?");
        $q->bind_param('s', $empCode); $q->execute(); $q->close();
    }
    if ($tableExists('attendance')) {
        $q = $db->prepare("DELETE FROM attendance WHERE employee_id = ? OR employee_id = ?");
        $q->bind_param('ss', $empCode, $idStr); $q->execute(); $q->close();
    }

    $q = $db->prepare("DELETE FROM employees WHERE id = ?");
    $q->bind_param('i', $id);
    $q->execute();
    $deleted = $q->affected_rows;
    $q->close();

    if ($deleted < 1) {
        throw new RuntimeException('Employee row was not deleted (id ' . $id . ')');
    }
    $db->commit();
    echo json_encode(['success' => true, 'message' => 'Employee deleted']);
} catch (Throwable $e) {
    $db->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Delete failed: ' . $e->getMessage()]);
}
$db->close();