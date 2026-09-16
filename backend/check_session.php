<?php
// =============================================================
//  check_session.php
//  GET → returns the currently logged-in user.
//  Used by TaxInvoice.jsx (and others) for role checks.
//  This file was MISSING from the project — that is why the
//  Tax Invoice page showed "Access Denied" for admin users.
// =============================================================

require_once __DIR__ . '/auth_middleware.php';

echo json_encode([
    'success' => true,
    'user' => [
        'id'             => (int) $authUser['id'],
        'username'       => $authUser['username'],
        'full_name'      => $authUser['full_name'],
        'role'           => $authUser['role'],
        'branch_id'      => $authUser['branch_id'],
        'branch_name'    => $authUser['branch_name'],
        'branch_code'    => $authUser['branch_code'],
        'view_branch_id' => $authUser['view_branch_id'],
    ],
]);