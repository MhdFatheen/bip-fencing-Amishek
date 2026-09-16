<?php
// =============================================================
//  db.php — Database connection (included by every endpoint)
//  Place the entire attendance-api/ folder inside:
//    C:\xampp\htdocs\attendance-api\
// =============================================================

define('DB_HOST', 'localhost');
define('DB_USER', 'root');       // default XAMPP user
define('DB_PASS', '');           // default XAMPP password (blank)
define('DB_NAME', 'bipfencing');

function getDB(): mysqli {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($conn->connect_error) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
        exit;
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

// -------------------------------------------------------------
//  bip_fencing connection (used by admin_feature_* endpoints)
// -------------------------------------------------------------
$host     = "localhost";
$user     = "root";
$password = "";
$database = "bipfencing";

$conn = new mysqli($host, $user, $password, $database);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        "message" => "Database connection failed"
    ]);
    exit();
}