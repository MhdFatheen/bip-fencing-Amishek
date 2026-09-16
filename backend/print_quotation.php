<?php
define('HTML_RESPONSE', true);
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: text/html; charset=utf-8');

if (isset($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/db.php';

$id = (int)($_GET['id'] ?? 0);
if (!$id) die('Invalid ID');

$conn = getDB();
$quote = $conn->query("SELECT * FROM quotations WHERE id = $id")->fetch_assoc();
if (!$quote) die('Not found');
$items = $conn->query("SELECT * FROM quotation_items WHERE quotation_id = $id")->fetch_all(MYSQLI_ASSOC);
$conn->close();

$subtotal = 0;
foreach ($items as $it) $subtotal += $it['amount'];
$discountAmt = $subtotal * $quote['discount_percent'] / 100;
$taxable = $subtotal - $discountAmt;
$taxAmt = $taxable * $quote['tax_percent'] / 100;
$grandTotal = $taxable + $taxAmt;

// Group items by HSN for tax summary
$hsnGroups = [];
foreach ($items as $it) {
    $hsn = $it['hsn'] ?: '—';
    $total = $it['amount'];
    $cgst = $total * ($quote['tax_percent']/2) / 100;
    $sgst = $total * ($quote['tax_percent']/2) / 100;
    if (!isset($hsnGroups[$hsn])) $hsnGroups[$hsn] = ['taxable'=>0, 'cgst'=>0, 'sgst'=>0];
    $hsnGroups[$hsn]['taxable'] += $total;
    $hsnGroups[$hsn]['cgst'] += $cgst;
    $hsnGroups[$hsn]['sgst'] += $sgst;
}
$company = [
    'name' => 'BIP FENCING CONTRACT WORK',
    'address' => 'NO. 26/A, MAIN ROAD, PAMBANKULAM, KALANTHAPANAI, PANAGUDI - 627109',
    'gst' => '33ABLPI5244C1Z1',
    'state' => 'Tamil Nadu',
    'state_code' => '33',
    'phone' => '9655072445'
];
function fmt($v) { return number_format($v, 2); }
function fmtD($d) { return $d ? date('d-m-Y', strtotime($d)) : '—'; }
?>
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Quotation <?php echo $quote['quote_no']; ?></title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',serif;font-size:11px;padding:10mm}
.invoice-box{max-width:190mm;margin:auto;border:2px solid #000}
.header,.client-section,.totals-section,.bottom-section{display:flex;border-bottom:1px solid #000}
.header-left,.header-right,.client-box,.words-box,.notes-box{padding:8px 12px}
.header-left{border-right:1px solid #000;flex:1}
.header-center{width:120px;text-align:center;border-right:1px solid #000;padding:8px}
.header-right{flex:1}
.company-name{font-size:14px;font-weight:bold;text-transform:uppercase}
.info-row{display:flex;margin-bottom:4px}
.info-row .label{width:90px;font-weight:bold}
.client-box{flex:1;border-right:1px solid #000}
.client-box:last-child{border-right:none}
.items-table{width:100%;border-collapse:collapse;margin:0}
.items-table th,.items-table td{border:1px solid #000;padding:5px;text-align:left}
.items-table th{background:#f0f0f0;text-align:center}
.text-right{text-align:right}
.text-center{text-align:center}
.amt-row{display:flex;justify-content:space-between;margin-bottom:4px}
.grand-total-row{font-weight:bold;font-size:12px;border-top:2px solid #000;margin-top:6px;padding-top:6px}
.sign-box{width:200px;text-align:center;padding:8px 12px}
.sign-line{border-top:1px solid #000;margin-top:30px;padding-top:4px}
.footer{text-align:center;font-size:9px;padding:6px;border-top:1px solid #ccc}
@media print{body{padding:0}.invoice-box{margin:0}}
</style>
</head>
<body>
<div class="invoice-box">
    <div class="header">
        <div class="header-left">
            <div class="company-name"><?php echo $company['name']; ?></div>
            <div><?php echo nl2br($company['address']); ?></div>
            <div>GSTIN: <?php echo $company['gst']; ?></div>
            <div>State: <?php echo $company['state']; ?> (Code: <?php echo $company['state_code']; ?>)</div>
            <div>Phone: <?php echo $company['phone']; ?></div>
        </div>
        <div class="header-center"><h2>Quotation</h2><p>Tax Invoice</p></div>
        <div class="header-right">
            <div class="info-row"><span class="label">Quote No.</span><span><?php echo $quote['quote_no']; ?></span></div>
            <div class="info-row"><span class="label">Dated</span><span><?php echo fmtD($quote['quote_date']); ?></span></div>
            <div class="info-row"><span class="label">Valid Until</span><span><?php echo fmtD($quote['valid_until']); ?></span></div>
            <div class="info-row"><span class="label">PO No.</span><span><?php echo $quote['po_no'] ?: '—'; ?></span></div>
            <div class="info-row"><span class="label">Dispatched</span><span><?php echo $quote['dispatched_through'] ?: '—'; ?></span></div>
            <div class="info-row"><span class="label">Vehicle No.</span><span><?php echo $quote['vehicle_no'] ?: '—'; ?></span></div>
            <?php if($quote['other_ref']): ?><div class="info-row"><span class="label">Other Ref</span><span><?php echo $quote['other_ref']; ?></span></div><?php endif; ?>
        </div>
    </div>
    <div class="client-section">
        <div class="client-box"><strong>Buyer (Bill to)</strong><br><?php echo nl2br($quote['client_name'].'<br>'.$quote['client_address']); ?><br>GSTIN: <?php echo $quote['client_gst']?:'—'; ?><br>State: <?php echo $company['state']; ?> Code: <?php echo $company['state_code']; ?></div>
        <div class="client-box"><strong>Consignee (Ship to)</strong><br><?php echo $quote['ship_name'] ? nl2br($quote['ship_name'].'<br>'.$quote['ship_address']) : '<i>Same as buyer</i>'; ?><br>GSTIN: <?php echo $quote['ship_gst']?:'—'; ?><br>State: <?php echo $quote['ship_state']?:$company['state']; ?> Code: <?php echo $quote['ship_state_code']?:$company['state_code']; ?></div>
    </div>
    <table class="items-table">
        <thead><tr><th>Sl No.</th><th>Description of Goods</th><th>HSN/SAC</th><th>Due on</th><th>Unit</th><th>Qty</th><th>Rate (INR)</th><th>Amount (INR)</th></tr></thead>
        <tbody>
        <?php $i=0; $totalQty=0; foreach($items as $it): $i++; $totalQty += $it['quantity']; ?>
        <tr><td class="text-center"><?php echo $i; ?></td><td><?php echo htmlspecialchars($it['description']); ?></td>
        <td class="text-center"><?php echo $it['hsn'] ?: '—'; ?></td><td class="text-center"><?php echo fmtD($it['due_on']); ?></td>
        <td class="text-center"><?php echo $it['unit']; ?></td><td class="text-center"><?php echo $it['quantity']; ?></td>
        <td class="text-right"><?php echo fmt($it['rate']); ?></td><td class="text-right"><?php echo fmt($it['amount']); ?></td></tr>
        <?php endforeach; ?>
        <tr><td colspan="5" style="text-align:right"><strong>CGST Tax</strong><br><strong>SGST Tax</strong></td><td></td><td></td><td class="text-right"><?php echo fmt($taxAmt/2); ?><br><?php echo fmt($taxAmt/2); ?></td></tr>
        <tr style="background:#fef9f5"><td colspan="5" style="text-align:right"><strong>Total</strong></td><td class="text-center"><?php echo $totalQty; ?></td><td></td><td class="text-right"><strong><?php echo fmt($grandTotal); ?></strong></td></tr>
        </tbody>
    </table>
    <div class="totals-section">
        <div class="words-box"><strong>Amount Chargeable (in words)</strong><br>INR <?php echo fmt($grandTotal); ?> Only<br><?php if($discountAmt>0) echo "Discount (".$quote['discount_percent']."%): ₹".fmt($discountAmt)." deducted"; ?></div>
        <div class="amounts-box" style="width:240px;padding:8px 12px">
            <div class="amt-row"><span>Subtotal</span><span>₹<?php echo fmt($subtotal); ?></span></div>
            <?php if($discountAmt>0): ?><div class="amt-row"><span>Discount</span><span>-₹<?php echo fmt($discountAmt); ?></span></div><?php endif; ?>
            <div class="amt-row"><span>Taxable Value</span><span>₹<?php echo fmt($taxable); ?></span></div>
            <div class="amt-row"><span>CGST (<?php echo $quote['tax_percent']/2; ?>%)</span><span>₹<?php echo fmt($taxAmt/2); ?></span></div>
            <div class="amt-row"><span>SGST (<?php echo $quote['tax_percent']/2; ?>%)</span><span>₹<?php echo fmt($taxAmt/2); ?></span></div>
            <div class="grand-total-row"><span>Grand Total</span><span>₹<?php echo fmt($grandTotal); ?></span></div>
        </div>
    </div>
    <div style="border-bottom:1px solid #000; padding:8px 12px">
        <strong>Tax Amount (in words):</strong> INR <?php echo fmt($taxAmt); ?> Only
        <table class="items-table" style="margin-top:8px"><thead><tr><th>HSN/SAC</th><th>Taxable Value</th><th>CGST Rate</th><th>CGST Amount</th><th>SGST Rate</th><th>SGST Amount</th><th>Total Tax</th></tr></thead>
        <tbody><?php foreach($hsnGroups as $hsn=>$g): ?>
        <tr><td class="center"><?php echo $hsn; ?></td><td class="text-right"><?php echo fmt($g['taxable']); ?></td>
        <td class="center"><?php echo $quote['tax_percent']/2; ?>%</td><td class="text-right"><?php echo fmt($g['cgst']); ?></td>
        <td class="center"><?php echo $quote['tax_percent']/2; ?>%</td><td class="text-right"><?php echo fmt($g['sgst']); ?></td>
        <td class="text-right"><?php echo fmt($g['cgst']+$g['sgst']); ?></td></tr>
        <?php endforeach; ?>
        <tr style="font-weight:bold"><td>Total</td><td class="text-right"><?php echo fmt($taxable); ?></td><td></td><td class="text-right"><?php echo fmt($taxAmt/2); ?></td><td></td><td class="text-right"><?php echo fmt($taxAmt/2); ?></td><td class="text-right"><?php echo fmt($taxAmt); ?></td></tr>
        </tbody></table>
    </div>
    <div class="bottom-section">
        <div class="notes-box"><strong>Terms & Notes</strong><br><?php echo nl2br($quote['notes']?:'No additional terms.'); ?><br><br>Declaration: <?php echo $quote['declaration']?:'We declare that this bill shows the actual price of the goods described and all particulars are true and correct.'; ?></div>
        <div class="sign-box"><div>for <?php echo $company['name']; ?></div><div class="sign-line">Authorised Signatory</div></div>
    </div>
    <div class="footer">This is a Computer Generated Quotation | <?php echo $company['name']; ?> | GSTIN: <?php echo $company['gst']; ?></div>
</div>
<script>window.onload=function(){window.print();}</script>
</body>
</html>