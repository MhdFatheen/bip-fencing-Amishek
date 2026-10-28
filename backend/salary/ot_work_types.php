<?php
// =============================================================
//  ot_work_types.php — OT work type catalog
//  GET            → active types (?all=1 includes inactive)
//  POST   {name, amount}
//  PUT    ?id=    {name, amount, is_active}
//  DELETE ?id=
// =============================================================
require_once __DIR__ . '/../auth_middleware.php';   // includes cors.php + $pdo
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$method = $_SERVER['REQUEST_METHOD'];
$in     = json_decode(file_get_contents('php://input'), true) ?: [];
$id     = (int)($_GET['id'] ?? $in['id'] ?? 0);

function out($d, $code = 200) { http_response_code($code); echo json_encode($d); exit; }
function fail($m, $code = 400) { out(['error' => $m], $code); }

try {
    if ($method === 'GET') {
        $sql = "SELECT id, name, amount, is_active FROM ot_work_types"
             . (!empty($_GET['all']) ? "" : " WHERE is_active = 1")
             . " ORDER BY name";
        $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['is_active'] = (int)$r['is_active']; }
        out($rows);
    }

    if ($authUser['role'] !== 'admin') fail('Admin access required', 403);

    if ($method === 'POST') {
        $name = trim($in['name'] ?? '');
        $amt  = (float)($in['amount'] ?? -1);
        if ($name === '' || $amt < 0) fail('Valid name and amount required');
        $pdo->prepare("INSERT INTO ot_work_types (name, amount) VALUES (?, ?)")->execute([$name, $amt]);
        out(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
    }

    if ($method === 'PUT') {
        if (!$id) fail('ID required');
        $name = trim($in['name'] ?? '');
        $amt  = (float)($in['amount'] ?? -1);
        if ($name === '' || $amt < 0) fail('Valid name and amount required');
        $st = $pdo->prepare("UPDATE ot_work_types SET name = ?, amount = ?, is_active = ? WHERE id = ?");
        $st->execute([$name, $amt, empty($in['is_active']) ? 0 : 1, $id]);
        out(['success' => true]);
    }

    if ($method === 'DELETE') {
        if (!$id) fail('ID required');
        $pdo->prepare("DELETE FROM ot_work_types WHERE id = ?")->execute([$id]);
        out(['success' => true]);
    }

    fail('Method not allowed', 405);
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
