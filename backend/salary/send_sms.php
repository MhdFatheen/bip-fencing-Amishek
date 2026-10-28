<?php
// =============================================================
//  send_sms.php — send salary details to the employee by SMS
//  POST { phone: "9876543210", message: "..." }
//
//  Uses Fast2SMS (www.fast2sms.com). Put your API key below.
//  Runs in the background (no WhatsApp). Empty key = SMS not configured.
// =============================================================
require_once __DIR__ . '/../auth_middleware.php';

// ⬇⬇ Paste your Fast2SMS API key here (Dashboard → Dev API) ⬇⬇
const FAST2SMS_API_KEY = '';

function smsOut(array $d, int $code = 200): void { http_response_code($code); echo json_encode($d); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') smsOut(['sent' => false, 'error' => 'Method not allowed'], 405);

$in      = json_decode(file_get_contents('php://input'), true) ?: [];
$phone   = substr(preg_replace('/\D/', '', (string)($in['phone'] ?? '')), -10);
$message = trim((string)($in['message'] ?? ''));

if (strlen($phone) !== 10) smsOut(['sent' => false, 'error' => 'Invalid mobile number']);
if ($message === '')        smsOut(['sent' => false, 'error' => 'Empty message']);
if (FAST2SMS_API_KEY === '') smsOut(['sent' => false, 'error' => 'SMS not configured']);

$ch = curl_init('https://www.fast2sms.com/dev/bulkV2');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_HTTPHEADER     => [
        'authorization: ' . FAST2SMS_API_KEY,
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS     => json_encode([
        'route'    => 'q',          // Quick SMS route
        'message'  => $message,
        'language' => 'english',
        'flash'    => 0,
        'numbers'  => $phone,
    ]),
]);
$raw  = curl_exec($ch);
$err  = curl_error($ch);
curl_close($ch);

if ($raw === false) smsOut(['sent' => false, 'error' => 'SMS gateway unreachable: ' . $err]);

$resp = json_decode($raw, true);
if (!empty($resp['return'])) {
    smsOut(['sent' => true, 'request_id' => $resp['request_id'] ?? null]);
}
$msg = is_array($resp['message'] ?? null) ? implode(', ', $resp['message']) : ($resp['message'] ?? 'Unknown SMS error');
smsOut(['sent' => false, 'error' => $msg]);
