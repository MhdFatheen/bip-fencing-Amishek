<?php
// =============================================================
//  _employee_common.php — shared helpers for add/update employee
//  Adapts to the real `employees` table columns, so it works even
//  after the old migrations (emp_id / department / phone_number…)
// =============================================================

function tableColumns(mysqli $db, string $table): array {
    $cols = [];
    $res = $db->query("SHOW COLUMNS FROM `$table`");
    while ($c = $res->fetch_assoc()) $cols[$c['Field']] = $c;
    return $cols;
}

function jsonFail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

// Branch name -> branches.id
// Must match the ids the frontend uses (utils/branchNames.js / topbar X-Branch-ID)
const BRANCH_IDS = ['vallioor' => 1, 'kadambankulam' => 1, 'nanguneri' => 2, 'panagudi' => 3];

function resolveBranchId(mysqli $db, string $name): int {
    $key = strtolower(trim($name));
    if (!isset(BRANCH_IDS[$key])) jsonFail('Branch must be Vallioor, Kadambankulam, Panagudi or Nanguneri', 422);
    return BRANCH_IDS[$key];
}

// Builds [column => value] for employees from the request body,
// keeping only columns that exist in the table.
function employeeData(mysqli $db, array $body, array $cols, bool $isNew): array {
    $name = trim((string)($body['employee_name'] ?? ''));
    if ($name === '') jsonFail('Employee name is required', 422);

    $gender = trim((string)($body['gender'] ?? 'Male')) ?: 'Male';
    if (!in_array($gender, ['Male', 'Female', 'Other'], true)) jsonFail('Invalid gender', 422);

    $salType = trim((string)($body['salary_type'] ?? ''));
    if (!in_array($salType, ['monthly', 'weekly', 'daily'], true)) jsonFail('Please select a salary type', 422);

    $doj = trim((string)($body['date_of_joining'] ?? '')) ?: date('Y-m-d');

    $phone = preg_replace('/\D/', '', (string)($body['whatsapp_number'] ?? $body['phone_number'] ?? ''));
    $num = fn($k) => (isset($body[$k]) && $body[$k] !== '') ? (float)$body[$k] : null;

    $d = [
        'employee_name'    => $name,
        'gender'           => $gender,
        'address'          => trim((string)($body['address'] ?? '')),
        'salary_type'      => $salType,
        'date_of_joining'  => $doj,
        'salary_amount'    => $num('salary_amount') ?? 0,
        'price_per_bags'   => $num('price_per_bags'),
        'petrol_allowance' => $num('petrol_allowance') ?? 0,
        'tea_allowance'    => $num('tea_allowance') ?? 0,
        'loading_rate'         => $num('loading_rate') ?? 0,
        'unloading_rate'       => $num('unloading_rate') ?? 0,
        'location_change_rate' => $num('location_change_rate') ?? 0,
        'kambi_kattu_rate'     => $num('kambi_kattu_rate') ?? 0,
        'others_rate'          => $num('others_rate') ?? 0,
        'work_rate'            => $num('work_rate') ?? 0,
        'food_rate'            => $num('food_rate') ?? 0,
        'salary_packs'         => $num('salary_packs') ?? 0,
        'ot_rate'              => $num('ot_rate') ?? 0,
    ];
    if (isset($cols['whatsapp_number'])) $d['whatsapp_number'] = $phone;
    elseif (isset($cols['phone_number'])) $d['phone_number'] = $phone;

    if (!empty($body['branch_name'])) {
        $d['branch_id'] = resolveBranchId($db, $body['branch_name']);
    } elseif ($isNew) {
        jsonFail('Please select a branch', 422);
    }

    // Old columns that may still exist and be NOT NULL
    if ($isNew && isset($cols['emp_id']))     $d['emp_id'] = 'EMP' . date('ymdHis') . rand(10, 99);
    if ($isNew && isset($cols['department'])) $d['department'] = trim((string)($body['department'] ?? '')) ?: 'General';

    return array_intersect_key($d, $cols);
}

function bindTypes(array $vals): string {
    $t = '';
    foreach ($vals as $v) $t .= is_int($v) ? 'i' : (is_float($v) ? 'd' : 's');
    return $t;
}