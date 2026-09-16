<?php

// JSON by default
if (!defined('HTML_RESPONSE')) {
    header('Content-Type: application/json; charset=utf-8');
}

// Allow your deployed React app
header("Access-Control-Allow-Origin: http://localhost:5173");

// If you use cookies or sessions
header("Access-Control-Allow-Credentials: true");

// Allow methods
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

// Allow headers
header("Access-Control-Allow-Headers: Authorization, Content-Type, X-Branch-ID");

// Expose headers
header("Access-Control-Expose-Headers: Authorization");

// Cache preflight
header("Access-Control-Max-Age: 86400");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}