<?php
// =============================================================
//  setup_passwords.php — Run ONCE via browser or CLI
//  php -S localhost:8000  then open:
//  http://localhost:8000/setup_passwords.php
// =============================================================

require_once __DIR__ . '/db_pdo.php';

$users = [
    ['admin',    'Admin@123'],
    ['branch_a', 'BranchA@123'],
    ['branch_b', 'BranchB@123'],
    ['branch_c', 'BranchC@123'],
];

foreach ($users as [$username, $plain]) {
    $hash = password_hash($plain, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE username = ?");
    $stmt->execute([$hash, $username]);
    echo "✅ Hashed password for: $username<br>";
}

echo "<br><b>Done! Delete this file now.</b><br><br>";
echo "Login credentials:<br>";
echo "admin / Admin@123<br>";
echo "branch_a / BranchA@123<br>";
echo "branch_b / BranchB@123<br>";
echo "branch_c / BranchC@123<br>";
