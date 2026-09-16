import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";

const BIP_LOGO_B64 =
  "data:image/jpeg;base64,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";

const getRole = () => localStorage.getItem("role");

const getInitials = (name = "") =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "?";

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const inr = (v) => `₹ ${fmt(v)}`;

const getStatusBadge = (pending, totalBilled) => {
  const net = Number(pending);
  // Negative net = the purchase bills outweigh the invoices, so WE owe them.
  if (net < 0) return { label: "You Owe", cls: "cl-tag--unpaid" };
  if (net === 0) return { label: "Settled", cls: "cl-tag--paid" };
  if (net >= Number(totalBilled))
    return { label: "Unpaid", cls: "cl-tag--unpaid" };
  return { label: "Partial", cls: "cl-tag--partial" };
};

// Net balance shown as a positive number plus a direction label.
const balanceView = (net) => {
  const v = Number(net) || 0;
  return v < 0
    ? { label: "You Owe", amount: Math.abs(v), cls: "cl-amount--red", weOwe: true }
    : { label: "Balance Due", amount: v, cls: "cl-amount--red", weOwe: false };
};

// ── Number to words ───────────────────────────────────────────
function numberToWords(num) {
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  if (num === 0) return "Zero";
  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return (
        a[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + inWords(n % 100) : "")
      );
    if (n < 100000)
      return (
        inWords(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + inWords(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        inWords(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 ? " " + inWords(n % 100000) : "")
      );
    return (
      inWords(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 ? " " + inWords(n % 10000000) : "")
    );
  }
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = "INR " + inWords(rupees) + " Rupees";
  if (paise > 0) result += " and " + inWords(paise) + " Paise";
  return result + " Only";
}

// ── Tax Invoice Print View ────────────────────────────────────
// ── Tax Invoice Print View (A4 print-optimized) ─────────────────
function TaxInvoiceView({ inv, onBack }) {
  const items = inv.items || [];
  const B = "1px solid #000";

  const COMPANY = {
    name: "BIP FENCING CONTRACT WORK",
    address: "NO. 26/A, MAIN ROAD, PAMBANKULAM, KALANTHAPANAI, PANAGUDI - 627109",
    gst: "33ABLPI5244C1Z1",
    state: "Tamil Nadu",
    stateCode: "33",
    phone: "9655072445",
  };
  const DECLARATION =
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";

  const fmt2 = fmt;

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(String(d).slice(0, 10) + "T00:00:00");
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  };

  const sectionHead = {
    fontWeight: "bold",
    fontSize: 15,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
    borderBottom: "1px dashed #999",
    paddingBottom: 1,
  };

  const printStyles = `
    @media print {
      html, body { width: 210mm; margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body * { visibility: hidden !important; }
      #invoice-print, #invoice-print * { visibility: visible !important; }
      #invoice-print { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: 2px solid #000 !important; }
      .no-print { display: none !important; }
      table { border-collapse: collapse !important; }
      .inv-product-row { page-break-inside: avoid; }
      .inv-footer { page-break-inside: avoid; }
      .inv-thead { display: table-header-group !important; }
      @page { size: A4 portrait; margin: 5mm; }
    }
  `;

  const rows = items.map((it) => {
    const qty = parseFloat(it.qty) || 0;
    const rateIncl = parseFloat(it.rate_incl) || 0;
    const rateExcl =
      parseFloat(it.rate_excl) || (qty ? (parseFloat(it.taxable_amt) || 0) / qty : 0);
    const taxableAmt = parseFloat(it.taxable_amt) || rateExcl * qty;
    return {
      desc: it.description || "",
      hsn: it.hsn || "",
      per: it.per || "NOS",
      qty,
      rateIncl,
      rateExcl,
      taxableAmt,
    };
  });

  const itemCount = rows.length;
  const dynFont = itemCount <= 10 ? 11 : itemCount <= 20 ? 12 : itemCount <= 30 ? 11 : 10;
  const dynPad = itemCount <= 20 ? "3px 6px" : "2px 5px";
  const MIN_ROWS = itemCount >= 15 ? 0 : Math.max(0, 15 - itemCount);

  const dc = (extra = {}) => ({
    border: "none",
    borderLeft: B,
    borderRight: B,
    padding: dynPad,
    fontSize: dynFont,
    verticalAlign: "middle",
    lineHeight: "1.2",
    ...extra,
  });
  const dhc = (extra = {}) => ({
    ...dc(),
    borderTop: B,
    borderBottom: B,
    fontWeight: "bold",
    background: "#e8e8e8",
    ...extra,
  });

  const cgstRate = Number(inv.cgst_rate || 0);
  const sgstRate = Number(inv.sgst_rate || 0);
  const subtotal = Number(inv.subtotal || 0);
  const cgstAmt = Number(inv.cgst_amount || 0);
  const sgstAmt = Number(inv.sgst_amount || 0);
  const totalTax = cgstAmt + sgstAmt;
  const netAmount = Number(inv.net_amount || 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const openBalance = Number(inv.open_balance || 0);
  const closingBalance = openBalance + netAmount;

  const hsnGroups = {};
  rows.forEach((r) => {
    const key = r.hsn || "–";
    if (!hsnGroups[key]) hsnGroups[key] = { taxableValue: 0, cgst: 0, sgst: 0 };
    hsnGroups[key].taxableValue += r.taxableAmt;
    hsnGroups[key].cgst += r.taxableAmt * (cgstRate / 100);
    hsnGroups[key].sgst += r.taxableAmt * (sgstRate / 100);
  });

  const leftMetaFields = [
    { label: "Invoice No.", value: inv.invoice_no },
    inv.reference_no ? { label: "Reference No. & Date", value: inv.reference_no } : null,
    inv.buyers_order_no ? { label: "Buyer's Order No.", value: inv.buyers_order_no } : null,
    inv.dated ? { label: "Dated", value: formatDate(inv.dated) } : null,
  ].filter(Boolean);

  const rightMetaFields = [
    inv.dispatch_doc_no ? { label: "Dispatch Doc No.", value: inv.dispatch_doc_no } : null,
    inv.delivery_note_date
      ? { label: "Delivery Note Date", value: formatDate(inv.delivery_note_date) }
      : null,
  ].filter(Boolean);

  const buyerRightDetails = [
    { label: "Payment", value: inv.payment_mode || "Credit" },
    inv.dispatched_through ? { label: "Transport", value: inv.dispatched_through } : null,
    inv.eway_number ? { label: "E-Way Bill No.", value: inv.eway_number } : null,
    inv.destination ? { label: "Delivery To", value: inv.destination } : null,
    inv.bill_of_lading ? { label: "Bill of Lading/LR-RR No.", value: inv.bill_of_lading } : null,
    inv.motor_vehicle_no ? { label: "Motor Vehicle No.", value: inv.motor_vehicle_no } : null,
  ].filter(Boolean);

  return (
    <div style={{ background: "#f0f0f0", minHeight: "100vh", padding: "20px" }}>
      <style>{printStyles}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "center", gap: 12, paddingBottom: 16 }}>
        <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>
          ← Back to Customers
        </button>
        <button className="btn btn-success btn-sm" onClick={() => window.print()}>
          🖨️ Print
        </button>
      </div>

      <div
        id="invoice-print"
        style={{
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto 30px",
          padding: "8mm",
          fontFamily: "'Times New Roman', Times, serif",
          color: "#000",
          background: "#fff",
          border: "2px solid #000",
          fontSize: dynFont + 2,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ textAlign: "right", padding: "2px 8px", fontStyle: "italic", fontSize: 10, borderBottom: "1px solid #000" }}>
          ({inv.copy_type || "ORIGINAL FOR RECIPIENT"})
        </div>

        {/* HEADER */}
        <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: B }}>
          <tbody>
            <tr>
              <td style={{ width: 80, borderRight: B, padding: "4px", textAlign: "center", verticalAlign: "middle" }}>
                <img src={BIP_LOGO_B64} alt="BIP Fencing" style={{ width: 68, height: 68, objectFit: "contain", display: "block", margin: "0 auto" }} />
              </td>
              <td style={{ padding: "4px 10px", textAlign: "center", verticalAlign: "middle" }}>
                <div style={{ fontSize: 24, fontWeight: "bold", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {COMPANY.name}
                </div>
                <div style={{ fontSize: 10, marginTop: 1 }}>{COMPANY.address}</div>
                <div style={{ fontSize: 10 }}>
                  GSTIN/UIN: <strong>{COMPANY.gst}</strong>&nbsp;&nbsp;State: {COMPANY.state}, Code: {COMPANY.stateCode}
                </div>
                <div style={{ fontSize: 10 }}>Ph: {COMPANY.phone}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* CONSIGNEE + META */}
        <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: B }}>
          <tbody>
            <tr>
              <td style={{ width: "50%", borderRight: B, padding: "6px 7px", verticalAlign: "top" }}>
                <div style={sectionHead}>Consignee (Ship to)</div>
                <div style={{ fontWeight: "bold", fontSize: 16 }}>
                  {inv.consignee_name || inv.buyer_name}
                </div>
                <div style={{ fontSize: 14 }}>{inv.consignee_address || inv.buyer_address}</div>
                <div style={{ fontSize: 14 }}>
                  State Name: {inv.consignee_state || inv.buyer_state}, Code:{" "}
                  {inv.consignee_state_code || inv.buyer_state_code}
                </div>
              </td>
              <td style={{ width: "50%", padding: "6px 7px", verticalAlign: "top" }}>
                {[...leftMetaFields, ...rightMetaFields].map(({ label, value }, idx) => (
                  <div key={label + idx} style={{ display: "flex", marginBottom: 2 }}>
                    <span style={{ fontWeight: "normal", minWidth: 130, whiteSpace: "nowrap", fontSize: 13 }}>
                      {label}
                    </span>
                    <span style={{ fontWeight: "bold", fontSize: 13 }}> : {value}</span>
                  </div>
                ))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* BUYER + PAYMENT */}
        <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: B }}>
          <tbody>
            <tr>
              <td style={{ width: "50%", borderRight: B, padding: "6px 7px", verticalAlign: "top" }}>
                <div style={sectionHead}>Buyer (Bill to)</div>
                <div style={{ fontWeight: "bold", fontSize: 16 }}>{inv.buyer_name}</div>
                <div style={{ fontSize: 14 }}>{inv.buyer_address}</div>
                {inv.buyer_phone && <div style={{ fontSize: 14 }}>Ph: {inv.buyer_phone}</div>}
                {inv.buyer_gst && <div style={{ fontSize: 14 }}>GSTIN/UIN: {inv.buyer_gst}</div>}
                <div style={{ fontSize: 14 }}>
                  State Name: {inv.buyer_state}, Code: {inv.buyer_state_code}
                </div>
              </td>
              <td style={{ padding: "6px 7px", verticalAlign: "top", width: "50%" }}>
                {buyerRightDetails.map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", marginBottom: 2 }}>
                    <span style={{ fontWeight: "normal", minWidth: 95, whiteSpace: "nowrap", fontSize: 14 }}>
                      {label}
                    </span>
                    <span style={{ fontWeight: "bold", fontSize: 14 }}> : {value}</span>
                  </div>
                ))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* PRODUCT TABLE */}
        <div style={{ flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderTop: B, borderBottom: B }}>
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "48%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead className="inv-thead">
              <tr>
                {[
                  ["Sl\nNo.", "center"],
                  ["Description of Goods", "left"],
                  ["HSN/\nSAC", "center"],
                  ["Quantity", "center"],
                  ["Rate\n(Incl. Tax)", "right"],
                  ["Rate\n(Excl. Tax)", "right"],
                  ["Per", "center"],
                  ["Taxable\nAmount", "right"],
                ].map(([label, align], i) => (
                  <th key={i} style={dhc({ textAlign: align, whiteSpace: "pre-line", padding: dynPad })}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="inv-product-row">
                  <td style={dc({ textAlign: "center" })}>{i + 1}</td>
                  <td style={dc({ fontWeight: "bold", fontSize: 18 })}>{r.desc}</td>
                  <td style={dc({ textAlign: "center", fontWeight: "bold" })}>{r.hsn || "–"}</td>
                  <td style={dc({ textAlign: "center", fontWeight: "bold" })}>{fmt2(r.qty)}</td>
                  <td style={dc({ textAlign: "right" })}>{fmt2(r.rateIncl)}</td>
                  <td style={dc({ textAlign: "right" })}>{fmt2(r.rateExcl)}</td>
                  <td style={dc({ textAlign: "center" })}>{r.per}</td>
                  <td style={dc({ textAlign: "right" })}>{fmt2(r.taxableAmt)}</td>
                </tr>
              ))}
              {Array.from({ length: MIN_ROWS }).map((_, i) => (
                <tr key={`blank_${i}`} style={{ height: 18 }}>
                  {Array(8).fill(null).map((__, j) => (
                    <td key={j} style={dc()}>&nbsp;</td>
                  ))}
                </tr>
              ))}

              {(openBalance !== 0 || netAmount !== 0) && (
                <tr>
                  <td colSpan={8} style={dc({ borderTop: "1px dashed #999", padding: "3px 7px" })}>
                    <div style={{ fontWeight: "bold", fontSize: dynFont + 2 }}>
                      Open Balance: ₹ {fmt2(openBalance)}
                    </div>
                    <div style={{ fontWeight: "bold", fontSize: dynFont + 2 }}>
                      Closing Balance: ₹ {fmt2(closingBalance)}
                    </div>
                  </td>
                </tr>
              )}

              <tr>
                <td colSpan={7} style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B })}>
                  Total Taxable Amount
                </td>
                <td style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B })}>
                  {fmt2(subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={7} style={dc({ textAlign: "right", fontStyle: "italic", fontWeight: "bold", borderTop: B })}>
                  CGST TAX
                </td>
                <td style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B })}>
                  {fmt2(cgstAmt)}
                </td>
              </tr>
              <tr>
                <td colSpan={7} style={dc({ textAlign: "right", fontStyle: "italic", fontWeight: "bold" })}>
                  SGST TAX
                </td>
                <td style={dc({ textAlign: "right", fontWeight: "bold" })}>{fmt2(sgstAmt)}</td>
              </tr>

              <tr style={{ background: "#f0f0f0" }}>
                <td style={dc({ borderTop: B, borderBottom: B })}></td>
                <td style={dc({ fontWeight: "bold", borderTop: B, borderBottom: B, fontSize: dynFont + 1 })}>
                  Total
                </td>
                <td style={dc({ borderTop: B, borderBottom: B })}></td>
                <td style={dc({ textAlign: "center", fontWeight: "bold", borderTop: B, borderBottom: B, fontSize: dynFont + 1 })}>
                  {totalQty.toFixed(2)}
                </td>
                <td style={dc({ borderTop: B, borderBottom: B })}></td>
                <td style={dc({ borderTop: B, borderBottom: B })}></td>
                <td style={dc({ borderTop: B, borderBottom: B })}></td>
                <td style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B, borderBottom: B, fontSize: dynFont + 3 })}>
                  ₹ {fmt2(netAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AMOUNT IN WORDS */}
        <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: B }}>
          <tbody>
            <tr>
              <td style={{ width: "58%", borderRight: B, padding: "3px 7px", verticalAlign: "middle", fontSize: 10 }}>
                <span style={{ fontWeight: "bold" }}>Amount Chargeable (in words): </span>
                <em style={{ fontWeight: "bold" }}>{numberToWords(netAmount)}</em>
              </td>
              <td style={{ padding: "3px 7px", verticalAlign: "middle", textAlign: "right" }}>
                <div style={{ fontSize: 10 }}>E. &amp; O.E</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* HSN TAX TABLE */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderBottom: B }} className="inv-footer">
          <colgroup>
            <col style={{ width: "14%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              {[
                ["HSN/SAC", "center"],
                ["Taxable\nValue", "right"],
                ["CGST\nRate", "center"],
                ["CGST\nAmount", "right"],
                ["SGST/UTGST\nRate", "center"],
                ["SGST/UTGST\nAmount", "right"],
                ["Total Tax\nAmount", "right"],
              ].map(([label, align]) => (
                <th key={label} style={dhc({ textAlign: align, whiteSpace: "pre-line", padding: "2px 6px", fontSize: 10 })}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(hsnGroups).map(([hsn, d]) => (
              <tr key={hsn}>
                <td style={dc({ textAlign: "center", fontSize: 11 })}>{hsn}</td>
                <td style={dc({ textAlign: "right", fontSize: 11 })}>{fmt2(d.taxableValue)}</td>
                <td style={dc({ textAlign: "center", fontSize: 10 })}>{cgstRate}%</td>
                <td style={dc({ textAlign: "right", fontSize: 10 })}>{fmt2(d.cgst)}</td>
                <td style={dc({ textAlign: "center", fontSize: 10 })}>{sgstRate}%</td>
                <td style={dc({ textAlign: "right", fontSize: 10 })}>{fmt2(d.sgst)}</td>
                <td style={dc({ textAlign: "right", fontSize: 10 })}>{fmt2(d.cgst + d.sgst)}</td>
              </tr>
            ))}
            <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
              <td style={dc({ borderTop: B, borderBottom: B, fontSize: 10 })}>Total</td>
              <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(subtotal)}</td>
              <td style={dc({ borderTop: B, borderBottom: B })}></td>
              <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(cgstAmt)}</td>
              <td style={dc({ borderTop: B, borderBottom: B })}></td>
              <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(sgstAmt)}</td>
              <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(totalTax)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ padding: "2px 7px", borderBottom: B, fontSize: 10 }}>
          <strong>Tax Amount (in words):</strong>&nbsp;
          <em style={{ fontWeight: "bold" }}>{numberToWords(totalTax)}</em>
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }} className="inv-footer">
            <tbody>
              <tr>
                <td style={{ width: "44%", borderRight: B, padding: "4px 7px", verticalAlign: "top", fontSize: 10 }}>
                  <div style={{ fontWeight: "bold", marginBottom: 2, fontSize: 15 }}>
                    Company's Bank Details
                  </div>
                  {[
                    ["A/c Holder's Name", inv.bank_holder_name],
                    ["Bank Name", inv.bank_name],
                    ["A/c No.", inv.bank_account_no],
                    ["Branch & IFS Code", `${inv.bank_branch || ""} & ${inv.bank_ifsc || ""}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ marginBottom: 2, fontSize: 12 }}>
                      <strong>{k}</strong>: {v}
                    </div>
                  ))}
                </td>
                <td style={{ padding: "4px 7px", verticalAlign: "top" }}>
                  <div style={{ fontSize: 9, marginBottom: 4 }}>
                    <strong>Declaration:</strong> {DECLARATION}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: "bold", fontSize: 10, marginBottom: 2 }}>
                    for {COMPANY.name}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
                    <div style={{ textAlign: "center", width: "42%" }}>
                      <div style={{ borderTop: B, paddingTop: 2, fontSize: 10 }}>Receiver's Signature</div>
                    </div>
                    <div style={{ textAlign: "center", width: "42%" }}>
                      <div style={{ borderTop: B, paddingTop: 2, fontSize: 10 }}>Authorised Signatory</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "center", marginTop: 4, fontSize: 9, color: "#666" }}>
                    This is a Computer Generated Invoice
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Quotation Print View ──────────────────────────────────────
function QuotationView({ data, onBack }) {
  const d = data;
  const items = d.items || [];
  const isGst = d.is_gst == null ? true : !!Number(d.is_gst);

  const subtotal = items.reduce(
    (s, i) => s + Number(i.quantity || 0) * Number(i.rate || 0),
    0,
  );
  const discPct = Number(d.discount_percent || 0);
  const discAmt = (subtotal * discPct) / 100;
  const taxable = subtotal - discAmt;
  const taxRate = isGst ? Number(d.tax_percent || 0) : 0;
  const taxAmt = (taxable * taxRate) / 100;
  const cgstAmt = taxAmt / 2;
  const sgstAmt = taxAmt / 2;
  const roundOff = Math.round(taxable + taxAmt) - (taxable + taxAmt);
  const grandTotal = taxable + taxAmt + roundOff;

  const printStyles = `
      @media print {
        .no-print { display: none !important; }
        body { margin: 0; }
        .invoice-wrapper { padding: 0 !important; background: white !important; }
      }
    `;

  return (
    <div
      className="invoice-wrapper"
      style={{ background: "#f0f0f0", minHeight: "100vh", padding: "20px" }}
    >
      <style>{printStyles}</style>
      <div className="no-print d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Quotation — {d.quote_no}</h5>
        <div className="d-flex gap-2">
          <button
            className="btn text-white btn-sm"
            style={{ background: "#1a1a2e" }}
            onClick={() => window.print()}
          >
            🖨️ Print
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>
            ← Back to Customers
          </button>
        </div>
      </div>

      <div
        id="quotation-print"
        style={{
          background: "white",
          maxWidth: "900px",
          margin: "0 auto",
          border: "2px solid #000",
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: "12px",
            fontWeight: "bold",
            padding: "2px 8px",
            borderBottom: "1px solid #000",
          }}
        >
          QUOTATION
        </div>

        {/* Company Header */}
        <div style={{ display: "flex", borderBottom: "2px solid #000" }}>
          <div
            style={{
              width: "80px",
              minWidth: "80px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              margin: "6px",
            }}
          >
            <img
              src={BIP_LOGO_B64}
              alt="BIP Fencing"
              style={{ width: "68px", height: "68px", objectFit: "contain" }}
            />
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: "8px 0" }}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              BIP FENCING CONTRACT WORK
            </div>
            <div style={{ fontSize: "11px" }}>
              NO: 26/A, MAIN ROAD, PAMBANKULAM, KALANTHAPANAI, PANAGUDI - 627109
            </div>
            {isGst && (
              <div style={{ fontSize: "11px" }}>
                GSTIN/UIN: <strong>33ABLPI5244C1Z1</strong>&nbsp;|&nbsp; State:
                Tamil Nadu, Code: 33
              </div>
            )}
            <div style={{ fontSize: "11px" }}>Ph: 9655072445</div>
          </div>
        </div>

        {/* Consignee + Quotation Details */}
        <div style={{ display: "flex", borderBottom: "1px solid #000" }}>
          <div
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRight: "1px solid #000",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                fontSize: "10px",
                marginBottom: "2px",
              }}
            >
              CONSIGNEE (SHIP TO)
            </div>
            <div style={{ fontWeight: "bold" }}>
              {d.ship_name || d.client_name}
            </div>
            {(d.ship_address || d.client_address) && (
              <div>{d.ship_address || d.client_address}</div>
            )}
            <div>
              State Name: {d.ship_state || d.client_state || "Tamil Nadu"},
              Code: {d.ship_state_code || d.client_state_code || "33"}
            </div>
          </div>
          <div style={{ width: "320px", fontSize: "11px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Quotation No.", d.quote_no],
                  ["Date", d.quote_date],
                  ["Valid Until", d.valid_until || "—"],
                  ["PO/Order No.", d.po_no || "—"],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: "1px solid #ccc" }}>
                    <td
                      style={{
                        padding: "2px 6px",
                        color: "#555",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </td>
                    <td style={{ padding: "2px 6px" }}>: {value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              width: "220px",
              fontSize: "11px",
              borderLeft: "1px solid #000",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Dispatched Through", d.dispatched_through || "—"],
                  ["Vehicle No.", d.vehicle_no || "—"],
                  ["Other Ref.", d.other_ref || "—"],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: "1px solid #ccc" }}>
                    <td
                      style={{
                        padding: "2px 6px",
                        color: "#555",
                        whiteSpace: "nowrap",
                        fontSize: "10px",
                      }}
                    >
                      {label}
                    </td>
                    <td style={{ padding: "2px 4px", fontSize: "10px" }}>
                      : {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Buyer */}
        <div style={{ display: "flex", borderBottom: "1px solid #000" }}>
          <div
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRight: "1px solid #000",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                fontSize: "10px",
                marginBottom: "2px",
              }}
            >
              BUYER (BILL TO)
            </div>
            <div style={{ fontWeight: "bold", fontSize: "13px" }}>
              {d.client_name}
            </div>
            {d.client_address && <div>{d.client_address}</div>}
            {d.client_phone && <div>Ph: {d.client_phone}</div>}
            {d.client_email && <div>Email: {d.client_email}</div>}
            {isGst && d.client_gst && <div>GSTIN/UIN: {d.client_gst}</div>}
            <div>
              State Name: {d.client_state || "Tamil Nadu"}, Code:{" "}
              {d.client_state_code || "33"}
            </div>
          </div>
          <div style={{ width: "320px", fontSize: "11px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Payment", "Credit"],
                  ["Discount", `${discPct}%`],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: "1px solid #ccc" }}>
                    <td
                      style={{
                        padding: "2px 6px",
                        color: "#555",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </td>
                    <td style={{ padding: "2px 6px" }}>: {value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Items Table */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            borderBottom: "1px solid #000",
          }}
        >
          <thead>
            <tr
              style={{ background: "#f5f5f5", borderBottom: "1px solid #000" }}
            >
              <th style={thStyle}>Sl No.</th>
              <th style={{ ...thStyle, textAlign: "left" }}>
                Description of Goods
              </th>
              <th style={thStyle}>
                HSN/
                <br />
                SAC
              </th>
              <th style={thStyle}>Quantity</th>
              <th style={thStyle}>Unit</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id || idx}
                style={{ borderBottom: "1px solid #eee" }}
              >
                <td style={tdCenter}>{idx + 1}</td>
                <td style={{ ...tdStyle, textAlign: "left" }}>
                  {item.description}
                </td>
                <td style={tdCenter}>{item.hsn}</td>
                <td style={tdCenter}>{item.quantity}</td>
                <td style={tdCenter}>{item.unit}</td>
                <td style={tdRight}>{fmt(item.rate)}</td>
                <td style={tdRight}>
                  {fmt(Number(item.quantity || 0) * Number(item.rate || 0))}
                </td>
              </tr>
            ))}
            {items.length < 6 &&
              Array(6 - items.length)
                .fill(0)
                .map((_, i) => (
                  <tr
                    key={`empty-${i}`}
                    style={{
                      height: "22px",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <td colSpan={7}>&nbsp;</td>
                  </tr>
                ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid #ccc" }}>
              <td
                colSpan={6}
                style={{
                  textAlign: "right",
                  padding: "3px 8px",
                  fontSize: "11px",
                }}
              >
                Taxable Amount
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "3px 8px",
                  fontWeight: "bold",
                }}
              >
                {fmt(taxable)}
              </td>
            </tr>
            {isGst && (
              <>
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "right",
                      padding: "3px 8px",
                      fontSize: "11px",
                    }}
                  >
                    CGST TAX
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "3px 8px",
                      fontWeight: "bold",
                    }}
                  >
                    {fmt(cgstAmt)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "right",
                      padding: "3px 8px",
                      fontSize: "11px",
                    }}
                  >
                    SGST TAX
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "3px 8px",
                      fontWeight: "bold",
                    }}
                  >
                    {fmt(sgstAmt)}
                  </td>
                </tr>
              </>
            )}
            {roundOff !== 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "right",
                    padding: "3px 8px",
                    fontSize: "11px",
                  }}
                >
                  ROUNDING OFF
                </td>
                <td style={{ textAlign: "right", padding: "3px 8px" }}>
                  {roundOff > 0 ? "+" : ""}
                  {fmt(roundOff)}
                </td>
              </tr>
            )}
            <tr style={{ borderTop: "2px solid #000" }}>
              <td
                colSpan={3}
                style={{
                  padding: "4px 8px",
                  fontWeight: "bold",
                  fontSize: "11px",
                }}
              >
                Total &nbsp;&nbsp;
                {items.reduce((s, i) => s + Number(i.quantity || 0), 0)}
              </td>
              <td
                colSpan={4}
                style={{
                  textAlign: "right",
                  padding: "4px 8px",
                  fontWeight: "bold",
                  fontSize: "13px",
                }}
              >
                ₹{fmt(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Amount in Words */}
        <div style={{ display: "flex", borderBottom: "1px solid #000" }}>
          <div
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRight: "1px solid #000",
            }}
          >
            <div style={{ fontSize: "10px", color: "#555" }}>
              Amount Chargeable (in words)
            </div>
            <div
              style={{
                fontStyle: "italic",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              {numberToWords(grandTotal)}
            </div>
          </div>
          <div
            style={{
              width: "200px",
              textAlign: "right",
              padding: "6px 8px",
              fontWeight: "bold",
              fontSize: "20px",
            }}
          >
            ₹ {fmt(grandTotal)}
          </div>
          <div
            style={{
              width: "80px",
              textAlign: "center",
              padding: "6px 4px",
              fontSize: "10px",
              borderLeft: "1px solid #000",
            }}
          >
            E. &amp; O.E.
          </div>
        </div>

        {/* Bank Details + Declaration */}
        <div style={{ display: "flex", borderBottom: "1px solid #000" }}>
          <div
            style={{
              flex: 1,
              padding: "8px",
              borderRight: "1px solid #000",
              fontSize: "11px",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
              Company's Bank Details
            </div>
            <div>
              A/c Holder's Name : <strong>BIP FENCING CONTRACT WORK</strong>
            </div>
            <div>Bank Name : CANARA BANK</div>
            <div>A/C No. : 120017946948</div>
            <div>Branch &amp; IFS Code: THERKU VALLIOOR &amp; CNRB0003657</div>
          </div>
          <div style={{ flex: 1, padding: "8px", fontSize: "11px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
              Declaration:
            </div>
            <div>
              {d.declaration ||
                "We declare that this quotation shows the actual price of the goods described and that all particulars are true and correct."}
            </div>
            <div
              style={{
                textAlign: "right",
                marginTop: "20px",
                fontWeight: "bold",
              }}
            >
              for BIP FENCING CONTRACT WORK
            </div>
          </div>
        </div>

        {/* Signature Row */}
        <div style={{ display: "flex", borderBottom: "1px solid #000" }}>
          <div
            style={{
              flex: 1,
              padding: "30px 8px 6px",
              fontSize: "11px",
              borderRight: "1px solid #000",
              textAlign: "center",
            }}
          >
            Receiver's Signature
          </div>
          <div
            style={{
              flex: 1,
              padding: "30px 8px 6px",
              fontSize: "11px",
              textAlign: "center",
            }}
          >
            Authorised Signatory
          </div>
        </div>
        <div
          style={{
            textAlign: "center",
            padding: "4px",
            fontSize: "10px",
            color: "#555",
          }}
        >
          This is a Computer Generated Quotation
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  padding: "4px 6px",
  textAlign: "center",
  borderRight: "1px solid #ccc",
  borderBottom: "1px solid #000",
  fontSize: "10px",
  fontWeight: "bold",
};
const tdStyle = {
  padding: "3px 6px",
  borderRight: "1px solid #eee",
  fontSize: "11px",
};
const tdCenter = { ...tdStyle, textAlign: "center" };
const tdRight = { ...tdStyle, textAlign: "right" };

// ── Main Component ────────────────────────────────────────────
export default function Clients() {
  const isAdmin = getRole()?.toLowerCase() === "admin";
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: "",
    payment_date: "",
    note: "",
  });
  const [payLoading, setPayLoading] = useState(false);

  const [viewInvoice, setViewInvoice] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Page-level tab: Customer Directory vs Quotations
  const [pageView, setPageView] = useState("clients");
  const [quotations, setQuotations] = useState([]);
  const [quotationsLoading, setQuotationsLoading] = useState(false);
  const [quotationSearch, setQuotationSearch] = useState("");
  const [viewQuotation, setViewQuotation] = useState(null);
  const [viewQuotationLoading, setViewQuotationLoading] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    address: "",
    gst: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Settlement of what WE owe the party (cash or product) ──
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleForm, setSettleForm] = useState({
    mode: "cash",
    amount: "",
    settle_date: new Date().toISOString().slice(0, 10),
    product_id: "",
    product_name: "",
    quantity: "",
    rate: "",
    note: "",
  });
  const [settleLoading, setSettleLoading] = useState(false);
  const [stockProducts, setStockProducts] = useState([]);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/client.php");
      const data = await res.json();
      if (data.success) {
        setClients(data.clients);
      }
    } catch (err) {
      console.error("Failed to fetch clients:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (!selected) return;
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await apiFetch(`/client.php?client_id=${selected.id}`);
        const data = await res.json();
        if (data.success) setClientDetail(data);
      } catch (err) {
        console.error("Failed to fetch client detail:", err);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selected]);

  const fetchQuotations = useCallback(async () => {
    setQuotationsLoading(true);
    try {
      const res = await apiFetch("/quotation_api.php?all_branches=1");
      const data = await res.json();
      setQuotations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch quotations:", err);
    } finally {
      setQuotationsLoading(false);
    }
  }, []);

  const openQuotationsView = () => {
    setPageView("quotations");
    fetchQuotations();
  };

  const handleViewQuotation = async (id) => {
    setViewQuotationLoading(true);
    try {
      const res = await apiFetch(`/quotation_api.php?id=${id}`);
      const data = await res.json();
      if (!data.error) setViewQuotation(data);
    } catch (err) {
      console.error("Failed to fetch quotation:", err);
    } finally {
      setViewQuotationLoading(false);
    }
  };

  const handleViewInvoice = async (invoice_no) => {
    setViewLoading(true);
    try {
      const res = await apiFetch(`/client.php?invoice_no=${invoice_no}`);
      const data = await res.json();
      if (data.success) setViewInvoice(data.invoice);
    } catch (err) {
      console.error("Failed to fetch invoice:", err);
    } finally {
      setViewLoading(false);
    }
  };

  // Render the invoice off-screen, snapshot it, and share/download as an image.
  const handleShareInvoicePDF = async (invoice_no) => {
    try {
      const res = await apiFetch(`/client.php?invoice_no=${invoice_no}`);
      const data = await res.json();
      if (!data.success) return showToast("Invoice not found", "error");
      const inv = data.invoice;

      setViewInvoice(inv);
      setTimeout(async () => {
        const html2canvas = (await import("html2canvas")).default;
        const el = document.getElementById("invoice-print");
        if (!el) return;
        const canvas = await html2canvas(el, { scale: 2 });
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        const file = new File([blob], `${inv.invoice_no}.png`, {
          type: "image/png",
        });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: inv.invoice_no });
        } else {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `${inv.invoice_no}.png`;
          link.click();
          const raw = (inv.buyer_phone || selected?.phone || "").replace(/\D/g, "");
          const phone = raw.length === 10 ? `91${raw}` : raw;
          const text = encodeURIComponent(
            `Dear ${inv.buyer_name},\n\nInvoice ${inv.invoice_no} — ₹${fmt(inv.net_amount)}\n\nThank you,\nBIP Fencing`,
          );
          window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
        }
      }, 500);
    } catch (err) {
      console.error(err);
      showToast("Failed to share invoice", "error");
    }
  };

  // Load stock so a product settlement can pick from real inventory
  const loadStockProducts = useCallback(async () => {
    try {
      const res = await apiFetch("/get_inventory_products.php");
      const data = await res.json();
      setStockProducts(Array.isArray(data) ? data : data.products || []);
    } catch (err) {
      console.error("Failed to load stock products", err);
      setStockProducts([]);
    }
  }, []);

  const openSettleModal = () => {
    const owed = Math.abs(Number(clientDetail?.net_balance ?? 0));
    setSettleForm({
      mode: "cash",
      amount: owed ? String(owed) : "",
      settle_date: new Date().toISOString().slice(0, 10),
      product_id: "",
      product_name: "",
      quantity: "",
      rate: "",
      note: "",
    });
    loadStockProducts();
    setShowSettleModal(true);
  };

  const handleSettle = async () => {
    if (settleForm.mode === "cash" && !(Number(settleForm.amount) > 0)) {
      showToast("Enter an amount greater than zero", "error");
      return;
    }
    if (
      settleForm.mode === "product" &&
      (!settleForm.product_id || !(Number(settleForm.quantity) > 0))
    ) {
      showToast("Pick a product and enter a quantity", "error");
      return;
    }

    setSettleLoading(true);
    try {
      const res = await apiFetch("/client.php?action=settle", {
        method: "POST",
        body: JSON.stringify({
          client_id: selected.id,
          settle_date: settleForm.settle_date,
          mode: settleForm.mode,
          amount: settleForm.amount,
          product_id: settleForm.product_id,
          product_name: settleForm.product_name,
          quantity: settleForm.quantity,
          rate: settleForm.rate,
          note: settleForm.note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Settlement recorded");
        setShowSettleModal(false);
        const d = await apiFetch(`/client.php?client_id=${selected.id}`);
        setClientDetail(await d.json());
        fetchClients();
      } else {
        showToast(data.message || "Settlement failed", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server error", "error");
    } finally {
      setSettleLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!payForm.amount || !payForm.payment_date) {
      showToast("Amount and date required", "error");
      return;
    }
    setPayLoading(true);
    try {
      const res = await apiFetch("/client.php", {
        method: "POST",
        body: JSON.stringify({
          client_id: selected.id,
          ...payForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowPayModal(false);
        setPayForm({ amount: "", payment_date: "", note: "" });
        showToast("Payment recorded successfully");
        fetchClients();
        setSelected((prev) => ({ ...prev }));
      } else {
        showToast(data.message || "Failed to record payment", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server error", "error");
    } finally {
      setPayLoading(false);
    }
  };

  const openEditModal = (e, client) => {
    e.stopPropagation();
    setSelected(client);
    setEditForm({
      name: client.name || "",
      phone: client.phone || "",
      address: client.address || "",
      gst: client.gst || "",
    });
    setShowEditModal(true);
  };

  const handleEditClient = async () => {
    if (!editForm.name) {
      showToast("Name is required", "error");
      return;
    }
    setEditLoading(true);
    try {
      const res = await apiFetch("/client.php", {
        method: "PUT",
        body: JSON.stringify({
          client_id: selected.id,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        showToast("Customer updated successfully");
        fetchClients();
        setSelected((prev) => ({ ...prev, ...editForm }));
      } else {
        showToast(data.message || "Update failed", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server error", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const openDeleteModal = (e, client) => {
    e.stopPropagation();
    setSelected(client);
    setShowDeleteModal(true);
  };

  const handleDeleteClient = async () => {
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/client.php?client_id=${selected.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setShowDeleteModal(false);
        setSelected(null);
        showToast("Customer deleted");
        fetchClients();
      } else {
        showToast(data.message || "Delete failed", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server error", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const sendInvoiceWhatsApp = () => {
    if (!selected || !clientDetail) return;
    const phone = selected.phone?.replace(/\D/g, "");
    const invoiceList = (clientDetail.invoices || [])
      .map(
        (i) => `• ${i.invoice_no} | ${i.invoice_date} | ₹${fmt(i.net_amount)}`,
      )
      .join("\n");
    const text = encodeURIComponent(
      `Dear ${selected.name},\n\nHere are your invoice details:\n${invoiceList}\n\nTotal Billed: ₹${fmt(clientDetail.total_billed)}\n\nThank you,\nBIP Fencing`,
    );
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  };

  const sendPaymentReminder = () => {
    if (!selected || !clientDetail) return;
    const phone = selected.phone?.replace(/\D/g, "");
    const text = encodeURIComponent(
      `Dear ${selected.name},\n\nThis is a gentle payment reminder:\n\nTotal Billed: ₹${fmt(clientDetail.total_billed)}\nTotal Paid:   ₹${fmt(clientDetail.total_paid)}\nPending:      ₹${fmt(clientDetail.pending)}\n\nPlease clear the pending amount at your earliest convenience.\n\nThank you,\nBIP Fencing`,
    );
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.gst?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q);
    const status = getStatusBadge(
      c.pending,
      c.total_billed,
    ).label.toLowerCase();
    const matchStatus = statusFilter
      ? status.includes(statusFilter.toLowerCase())
      : true;
    return matchSearch && matchStatus;
  });

  const filteredQuotations = quotations.filter((q) => {
    const s = quotationSearch.toLowerCase();
    return (
      q.client_name?.toLowerCase().includes(s) ||
      q.quote_no?.toLowerCase().includes(s)
    );
  });

  const totalBilled = clients.reduce(
    (s, c) => s + Number(c.total_billed || 0),
    0,
  );
  const totalPaid = clients.reduce((s, c) => s + Number(c.total_paid || 0), 0);
  const totalPending = clients.reduce((s, c) => s + Number(c.pending || 0), 0);
  const paidPct = totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0;

  const statCards = [
    {
      label: "Total Customers",
      value: clients.length,
      icon: "bi-people",
      color: "#1d4ed8",
      bg: "#dbeafe",
      border: "#93c5fd",
    },
    {
      label: "Total Billed",
      value: inr(totalBilled),
      icon: "bi-receipt-cutoff",
      color: "#b45309",
      bg: "#fef3c7",
      border: "#fcd34d",
    },
    {
      label: "Total Collected",
      value: `${inr(totalPaid)} (${paidPct}%)`,
      icon: "bi-cash-stack",
      color: "#15803d",
      bg: "#dcfce7",
      border: "#86efac",
    },
    {
      label: "Pending Amount",
      value: inr(totalPending),
      icon: "bi-exclamation-circle",
      color: "#dc2626",
      bg: "#fee2e2",
      border: "#fca5a5",
    },
  ];

  if (viewInvoice)
    return (
      <TaxInvoiceView inv={viewInvoice} onBack={() => setViewInvoice(null)} />
    );

  if (viewQuotation)
    return (
      <QuotationView
        data={viewQuotation}
        onBack={() => setViewQuotation(null)}
      />
    );

  return (
    <div className="cl-root">
      {/* Toast */}
      {toast.show && (
        <div className={`cl-toast cl-toast--${toast.type}`}>
          <i
            className={
              toast.type === "success"
                ? "bi bi-check-circle-fill"
                : "bi bi-exclamation-triangle-fill"
            }
          ></i>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="cl-header">
        <div className="cl-header__icon">
          <i className="bi bi-people-fill"></i>
        </div>
        <div>
          <h1 className="cl-header__title">Customers</h1>
          <p className="cl-header__sub">
            Manage customer accounts, payments and billing
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="cl-stats">
        {statCards.map((card, i) => (
          <div
            key={i}
            className="cl-stat"
            style={{ "--c": card.color, "--bg": card.bg, "--bd": card.border }}
          >
            <div className="cl-stat__icon">
              <i className={`bi ${card.icon}`}></i>
            </div>
            <div className="cl-stat__body">
              <div className="cl-stat__label">{card.label}</div>
              <div className="cl-stat__value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs: Customer Directory / Quotations */}
      <div className="cl-tabs">
        <button
          type="button"
          className={`cl-tab${pageView === "clients" ? " cl-tab--active" : ""}`}
          onClick={() => setPageView("clients")}
        >
          <i className="bi bi-people"></i>
          <span>Customer Directory</span>
          <span className="cl-tab__badge">{clients.length}</span>
        </button>
        <button
          type="button"
          className={`cl-tab${pageView === "quotations" ? " cl-tab--active" : ""}`}
          onClick={openQuotationsView}
        >
          <i className="bi bi-file-earmark-text"></i>
          <span>Quotations</span>
          <span className="cl-tab__badge">{quotations.length}</span>
        </button>
      </div>

      {/* QUOTATIONS TAB */}
      {pageView === "quotations" && (
        <div className="cl-card">
          <div className="cl-card__head">
            <i className="bi bi-file-earmark-text"></i>
            <span>All Quotations</span>
            <span className="cl-count">
              {filteredQuotations.length} records
            </span>
          </div>

          <div className="cl-filters">
            <div className="cl-fgrp">
              <i className="bi bi-search cl-ficon"></i>
              <input
                className="cl-finput cl-finput--icon"
                type="text"
                placeholder="Search customer or quote no…"
                value={quotationSearch}
                onChange={(e) => setQuotationSearch(e.target.value)}
              />
            </div>
          </div>

          {quotationsLoading ? (
            <div className="cl-loading">
              <div className="cl-spinner"></div>
              <span>Loading quotations…</span>
            </div>
          ) : (
            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th>Quote No</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotations.length > 0 ? (
                    filteredQuotations.map((q) => (
                      <tr key={q.id} className="cl-tr">
                        <td>
                          <span className="cl-tag cl-tag--neutral">
                            {q.quote_no}
                          </span>
                        </td>
                        <td>{q.client_name}</td>
                        <td>
                          <span className="cl-date">{q.quote_date}</span>
                        </td>
                        <td>
                          <span className="cl-amount">
                            {inr(q.grand_total)}
                          </span>
                        </td>
                        <td>
                          <div className="cl-actions">
                            <button
                              className="cl-btn cl-btn--tiny cl-btn--ghost"
                              onClick={() => handleViewQuotation(q.id)}
                              disabled={viewQuotationLoading}
                            >
                              {viewQuotationLoading ? "…" : "👁 View"}
                            </button>
                            <button
                              className="cl-btn cl-btn--tiny cl-btn--ghost"
                              onClick={() =>
                                navigate("/quotation", {
                                  state: { continueQuoteId: q.id },
                                })
                              }
                              title="Modify this quotation"
                            >
                              ➕ Continue
                            </button>
                            <button
                              className="cl-btn cl-btn--tiny cl-btn--ghost"
                              onClick={() =>
                                navigate("/tax-invoice", {
                                  state: { fromQuotationId: q.id },
                                })
                              }
                              title="Quick-fill a Tax Invoice from this quotation"
                            >
                              🧾 To Invoice
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">
                        <div className="cl-empty">
                          <i className="bi bi-inbox"></i>
                          <p>No quotations found</p>
                          <span>Try a different search</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CLIENTS TAB — directory (list view) */}
      {pageView === "clients" && !selected && (
        <div className="cl-card">
          <div className="cl-card__head">
            <i className="bi bi-people"></i>
            <span>Customer Directory</span>
            <span className="cl-count">{filtered.length} customers</span>
          </div>

          <div className="cl-filters">
            <div className="cl-fgrp">
              <i className="bi bi-search cl-ficon"></i>
              <input
                className="cl-finput cl-finput--icon"
                type="text"
                placeholder="Search name, phone, GST…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="cl-finput"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="paid">Fully Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {loading ? (
            <div className="cl-loading">
              <div className="cl-spinner"></div>
              <span>Loading customers…</span>
            </div>
          ) : (
            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Billed</th>
                    <th>Paid</th>
                    <th>Purchases</th>
                    <th>Net Balance</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length > 0 ? (
                    filtered.map((client) => {
                      const status = getStatusBadge(
                        client.net_balance ?? client.pending,
                        client.total_billed,
                      );
                      return (
                        <tr
                          key={client.id}
                          className="cl-tr cl-tr--clickable"
                          onClick={() => {
                            setSelected(client);
                            setActiveTab("overview");
                          }}
                        >
                          <td>
                            <div className="cl-client-cell">
                              <div className="cl-avatar">
                                {getInitials(client.name)}
                              </div>
                              <span className="cl-client-name">
                                {client.name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="cl-phone">
                              {client.phone || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={`cl-tag ${status.cls}`}>
                              {status.label}
                            </span>
                          </td>
                          <td>
                            <span className="cl-amount">
                              {inr(client.total_billed)}
                            </span>
                          </td>
                          <td>
                            <span className="cl-amount cl-amount--green">
                              {inr(client.total_paid)}
                            </span>
                          </td>
                          <td>
                            <span className="cl-amount">
                              {inr(client.total_purchased || 0)}
                            </span>
                            {client.is_dual_party && (
                              <span
                                className="cl-tag cl-tag--neutral"
                                style={{ marginLeft: 6 }}
                              >
                                Both
                              </span>
                            )}
                          </td>
                          <td>
                            {(() => {
                              const b = balanceView(client.net_balance);
                              return (
                                <span
                                  className="cl-amount cl-amount--red"
                                  title={b.label}
                                >
                                  {b.weOwe && (
                                    <small
                                      style={{
                                        display: "block",
                                        fontWeight: 600,
                                        fontSize: 11,
                                      }}
                                    >
                                      You Owe
                                    </small>
                                  )}
                                  {inr(b.amount)}
                                </span>
                              );
                            })()}
                          </td>
                          {isAdmin && (
                            <td>
                              <div
                                className="cl-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="cl-act cl-act--edit"
                                  title="Edit"
                                  onClick={(e) => openEditModal(e, client)}
                                >
                                  <i className="bi bi-pencil-fill"></i>
                                </button>
                                <button
                                  className="cl-act cl-act--del"
                                  title="Delete"
                                  onClick={(e) => openDeleteModal(e, client)}
                                >
                                  <i className="bi bi-trash-fill"></i>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6}>
                        <div className="cl-empty">
                          <i className="bi bi-inbox"></i>
                          <p>No customers found</p>
                          <span>Try adjusting your search or filters</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CLIENTS TAB — selected client detail */}
      {pageView === "clients" && selected && (
        <>
          <div className="cl-card cl-detail">
            <div className="cl-detail__head">
              <button
                type="button"
                className="cl-back"
                onClick={() => setSelected(null)}
              >
                <i className="bi bi-arrow-left"></i>
              </button>
              <div className="cl-avatar cl-avatar--lg">
                {getInitials(selected.name)}
              </div>
              <div className="cl-detail__info">
                <h3>{selected.name}</h3>
                <p>{selected.phone || "—"}</p>
                <span
                  className={`cl-tag ${getStatusBadge(selected.net_balance ?? selected.pending, selected.total_billed).cls}`}
                >
                  {
                    getStatusBadge(
                      selected.net_balance ?? selected.pending,
                      selected.total_billed,
                    ).label
                  }
                </span>
              </div>
              {isAdmin && (
                <div className="cl-actions">
                  <button
                    className="cl-act cl-act--edit"
                    title="Edit"
                    onClick={(e) => openEditModal(e, selected)}
                  >
                    <i className="bi bi-pencil-fill"></i>
                  </button>
                  <button
                    className="cl-act cl-act--del"
                    title="Delete"
                    onClick={(e) => openDeleteModal(e, selected)}
                  >
                    <i className="bi bi-trash-fill"></i>
                  </button>
                </div>
              )}
            </div>

            {/* Sub-tabs */}
            <div className="cl-subtabs">
              {["overview", "invoices", "purchases", "payments"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`cl-subtab${activeTab === tab ? " cl-subtab--active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="cl-detail__body">
              {detailLoading && (
                <div className="cl-loading">
                  <div className="cl-spinner"></div>
                  <span>Loading…</span>
                </div>
              )}

              {/* Overview */}
              {!detailLoading && activeTab === "overview" && clientDetail && (
                <div>
                  {/* ── SECTION 1 — SALES (we billed them) ── */}
                  <div className="cl-section-head">
                    <i className="bi bi-receipt"></i> Sales — Tax Invoices
                  </div>
                  <div className="cl-detail-rows">
                    <div className="cl-detail-row">
                      <span>Total Invoiced</span>
                      <strong>{inr(clientDetail.total_billed)}</strong>
                    </div>
                    <div className="cl-detail-row">
                      <span>Received from them</span>
                      <strong style={{ color: "#16a34a" }}>
                        {inr(clientDetail.total_paid)}
                      </strong>
                    </div>
                    <div className="cl-detail-row cl-detail-row--sum">
                      <span>They owe you</span>
                      <strong>{inr(clientDetail.they_owe)}</strong>
                    </div>
                  </div>

                  {/* ── SECTION 2 — PURCHASES (they billed us) ── */}
                  <div className="cl-section-head">
                    <i className="bi bi-bag-check"></i> Purchases — Purchase
                    Bills
                  </div>
                  <div className="cl-detail-rows">
                    <div className="cl-detail-row">
                      <span>Total Purchased</span>
                      <strong>{inr(clientDetail.total_purchased)}</strong>
                    </div>
                    <div className="cl-detail-row">
                      <span>Paid to them</span>
                      <strong style={{ color: "#16a34a" }}>
                        {inr(clientDetail.purchase_paid)}
                      </strong>
                    </div>
                    <div className="cl-detail-row">
                      <span>Settled (cash / product)</span>
                      <strong style={{ color: "#16a34a" }}>
                        {inr(clientDetail.settled)}
                      </strong>
                    </div>
                    <div className="cl-detail-row cl-detail-row--sum">
                      <span>You owe them</span>
                      <strong>{inr(clientDetail.we_owe)}</strong>
                    </div>
                  </div>

                  {/* ── NET TOTAL ── */}
                  {(() => {
                    const b = balanceView(clientDetail.net_balance);
                    return (
                      <div
                        className={`cl-net-total${b.weOwe ? " cl-net-total--owe" : ""}`}
                      >
                        <span className="cl-net-total__label">{b.label}</span>
                        <span className="cl-net-total__value">
                          {inr(b.amount)}
                        </span>
                        <span className="cl-net-total__hint">
                          {b.weOwe
                            ? "Purchases exceed invoices — settle in cash or product"
                            : "Invoices exceed purchases — collect from the party"}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="cl-detail-rows">
                    {[
                      ["Total Billed", inr(clientDetail.total_billed)],
                      ["Phone", selected.phone || "—"],
                      ["Address", selected.address || "—"],
                      ["GST", selected.gst || "—"],
                      [
                        "Last Invoice",
                        clientDetail.invoices?.[0]?.invoice_no || "—",
                      ],
                      [
                        "Last Invoice Date",
                        clientDetail.invoices?.[0]?.invoice_date || "—",
                      ],
                      [
                        "Customer Since",
                        selected.created_at?.slice(0, 10) || "—",
                      ],
                    ].map(([key, value]) => (
                      <div key={key} className="cl-detail-row">
                        <span>{key}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <button
                    className="cl-btn cl-btn--primary cl-btn--block"
                    onClick={() => setShowPayModal(true)}
                  >
                    <i className="bi bi-plus-circle"></i> Recieve Payment
                  </button>

                  {Number(clientDetail.net_balance) < 0 && (
                    <button
                      className="cl-btn cl-btn--block"
                      style={{
                        background: "#dc2626",
                        color: "#fff",
                        marginTop: 8,
                      }}
                      onClick={openSettleModal}
                    >
                      <i className="bi bi-arrow-left-right"></i> Settle What You
                      Owe
                    </button>
                  )}
                </div>
              )}

              {/* Purchases tab */}
              {!detailLoading && activeTab === "purchases" && clientDetail && (
                <div>
                  <p className="cl-subhint">
                    Purchase bills raised by this party against you
                  </p>
                  {(clientDetail.purchases || []).length === 0 && (
                    <div className="cl-empty cl-empty--small">
                      <i className="bi bi-inbox"></i>
                      <p>No purchase bills from this party</p>
                    </div>
                  )}
                  {(clientDetail.purchases || []).map((pb) => (
                    <div key={pb.id} className="cl-list-item">
                      <div>
                        <p className="cl-list-item__title">{pb.invoice_no}</p>
                        <p className="cl-list-item__sub">{pb.bill_date}</p>
                        {pb.notes && (
                          <p className="cl-list-item__sub">{pb.notes}</p>
                        )}
                      </div>
                      <div className="cl-list-item__right">
                        <p className="cl-amount cl-amount--red">
                          {inr(pb.total_amount)}
                        </p>
                        <p className="cl-list-item__sub">
                          Paid {inr(pb.paid_amount || 0)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {(clientDetail.settlements || []).length > 0 && (
                    <>
                      <div className="cl-section-head">Settlements</div>
                      {clientDetail.settlements.map((st) => (
                        <div key={st.id} className="cl-list-item">
                          <div>
                            <p className="cl-list-item__title">
                              {st.mode === "product"
                                ? `${st.product_name} × ${parseFloat(st.quantity)}`
                                : "Cash settlement"}
                            </p>
                            <p className="cl-list-item__sub">
                              {st.settle_date}
                            </p>
                            {st.note && (
                              <p className="cl-list-item__sub">{st.note}</p>
                            )}
                          </div>
                          <div className="cl-list-item__right">
                            <p className="cl-amount cl-amount--green">
                              {inr(st.amount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Invoices */}
              {!detailLoading && activeTab === "invoices" && clientDetail && (
                <div>
                  <p className="cl-subhint">All invoices for this customer</p>
                  {(clientDetail.invoices || []).length === 0 && (
                    <div className="cl-empty cl-empty--small">
                      <i className="bi bi-inbox"></i>
                      <p>No invoices yet</p>
                    </div>
                  )}
                  {(clientDetail.invoices || []).map((inv) => (
                    <div key={inv.id} className="cl-list-item">
                      <div>
                        <p className="cl-list-item__title">{inv.invoice_no}</p>
                        <p className="cl-list-item__sub">{inv.invoice_date}</p>
                        {inv.payment_mode && (
                          <span className="cl-tag cl-tag--neutral">
                            {inv.payment_mode}
                          </span>
                        )}
                      </div>
                      <div className="cl-list-item__right">
                        <p className="cl-amount cl-amount--green">
                          {inr(inv.net_amount)}
                        </p>
                        <div className="cl-actions">
                          <button
                            className="cl-btn cl-btn--tiny cl-btn--ghost"
                            onClick={() => handleViewInvoice(inv.invoice_no)}
                            disabled={viewLoading}
                          >
                            {viewLoading ? "…" : "👁 View"}
                          </button>
                          <button
                            className="cl-btn cl-btn--tiny cl-btn--ghost"
                            onClick={() =>
                              navigate("/tax-invoice", {
                                state: { continueInvoiceNo: inv.invoice_no },
                              })
                            }
                            title="Add items from another branch to this same bill"
                          >
                            ➕ Continue
                          </button>
                          <button
                            className="cl-btn cl-btn--tiny cl-btn--ghost"
                            onClick={() => handleShareInvoicePDF(inv.invoice_no)}
                            title="Share as image via WhatsApp"
                          >
                            📤 Send  invoice
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payments */}
              {!detailLoading && activeTab === "payments" && clientDetail && (
                <div>
                  <p className="cl-subhint">Payment history</p>
                  {(clientDetail.payments || []).length === 0 && (
                    <div className="cl-empty cl-empty--small">
                      <i className="bi bi-inbox"></i>
                      <p>No payments recorded yet</p>
                    </div>
                  )}
                  {(clientDetail.payments || []).map((pay) => (
                    <div key={pay.id} className="cl-list-item">
                      <div>
                        <p className="cl-amount cl-amount--green">
                          {inr(pay.amount)}
                        </p>
                        <p className="cl-list-item__sub">{pay.payment_date}</p>
                        {pay.note && (
                          <p className="cl-list-item__sub">{pay.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    className="cl-btn cl-btn--primary cl-btn--block"
                    onClick={() => setShowPayModal(true)}
                  >
                    <i className="bi bi-plus-circle"></i> Add Payment
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="cl-card">
            <div className="cl-card__head">
              <i className="bi bi-lightning-charge"></i>
              <span>Quick Actions</span>
            </div>
            <div className="cl-quick-actions">
              <button
                className="cl-btn cl-btn--ghost"
                onClick={sendInvoiceWhatsApp}
              >
                <i className="bi bi-whatsapp"></i> Send Invoice
              </button>
              <button
                className="cl-btn cl-btn--ghost"
                onClick={sendPaymentReminder}
              >
                <i className="bi bi-bell"></i> Payment Reminder
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Settle Modal (what WE owe the party) ── */}
      {showSettleModal && (
        <div className="cl-overlay" onClick={() => setShowSettleModal(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal__header">
              <div className="cl-modal__title">
                <i className="bi bi-arrow-left-right"></i> Settle —{" "}
                {selected?.name}
              </div>
              <button
                className="cl-modal__close"
                onClick={() => setShowSettleModal(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="cl-modal__body cl-modal__body--col">
              <div className="cl-fg">
                <label className="cl-label">Settle by</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["cash", "product"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`cl-btn ${settleForm.mode === m ? "cl-btn--primary" : "cl-btn--ghost"}`}
                      style={{ flex: 1 }}
                      onClick={() => setSettleForm({ ...settleForm, mode: m })}
                    >
                      {m === "cash" ? "Cash" : "Product"}
                    </button>
                  ))}
                </div>
              </div>

              {settleForm.mode === "cash" ? (
                <div className="cl-fg">
                  <label className="cl-label">
                    Amount (₹) <span className="cl-req">*</span>
                  </label>
                  <input
                    className="cl-input"
                    type="number"
                    placeholder="0.00"
                    value={settleForm.amount}
                    onChange={(e) =>
                      setSettleForm({ ...settleForm, amount: e.target.value })
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="cl-fg">
                    <label className="cl-label">
                      Product <span className="cl-req">*</span>
                    </label>
                    <select
                      className="cl-input"
                      value={settleForm.product_id}
                      onChange={(e) => {
                        const prod = stockProducts.find(
                          (x) => String(x.product_id) === e.target.value,
                        );
                        setSettleForm({
                          ...settleForm,
                          product_id: e.target.value,
                          product_name: prod?.product_name || "",
                          rate: prod?.rate ? String(prod.rate) : "",
                        });
                      }}
                    >
                      <option value="">— Select product —</option>
                      {stockProducts.map((prod) => (
                        <option key={prod.product_id} value={prod.product_id}>
                          {prod.product_name} (stock {prod.current_stock})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cl-fg">
                    <label className="cl-label">
                      Quantity <span className="cl-req">*</span>
                    </label>
                    <input
                      className="cl-input"
                      type="number"
                      value={settleForm.quantity}
                      onChange={(e) =>
                        setSettleForm({
                          ...settleForm,
                          quantity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="cl-fg">
                    <label className="cl-label">Rate (₹)</label>
                    <input
                      className="cl-input"
                      type="number"
                      value={settleForm.rate}
                      onChange={(e) =>
                        setSettleForm({ ...settleForm, rate: e.target.value })
                      }
                    />
                    <small style={{ color: "#6b7280", fontSize: 12 }}>
                      Value settled ={" "}
                      {inr(
                        (Number(settleForm.quantity) || 0) *
                          (Number(settleForm.rate) || 0),
                      )}
                      . This quantity is deducted from your stock.
                    </small>
                  </div>
                </>
              )}

              <div className="cl-fg">
                <label className="cl-label">Date</label>
                <input
                  className="cl-input"
                  type="date"
                  value={settleForm.settle_date}
                  onChange={(e) =>
                    setSettleForm({
                      ...settleForm,
                      settle_date: e.target.value,
                    })
                  }
                />
              </div>
              <div className="cl-fg">
                <label className="cl-label">Note</label>
                <input
                  className="cl-input"
                  type="text"
                  placeholder="Optional"
                  value={settleForm.note}
                  onChange={(e) =>
                    setSettleForm({ ...settleForm, note: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="cl-modal__footer">
              <button
                className="cl-btn cl-btn--ghost"
                onClick={() => setShowSettleModal(false)}
              >
                Cancel
              </button>
              <button
                className="cl-btn cl-btn--primary"
                onClick={handleSettle}
                disabled={settleLoading}
              >
                {settleLoading ? "Saving…" : "Save Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ── */}
      {showPayModal && (
        <div className="cl-overlay" onClick={() => setShowPayModal(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal__header">
              <div className="cl-modal__title">
                <i className="bi bi-cash-coin"></i> Record Payment —{" "}
                {selected?.name}
              </div>
              <button
                className="cl-modal__close"
                onClick={() => setShowPayModal(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="cl-modal__body cl-modal__body--col">
              <div className="cl-fg">
                <label className="cl-label">
                  Amount (₹) <span className="cl-req">*</span>
                </label>
                <input
                  className="cl-input"
                  type="number"
                  placeholder="0.00"
                  value={payForm.amount}
                  onChange={(e) =>
                    setPayForm({ ...payForm, amount: e.target.value })
                  }
                />
              </div>
              <div className="cl-fg">
                <label className="cl-label">
                  Payment Date <span className="cl-req">*</span>
                </label>
                <input
                  className="cl-input"
                  type="date"
                  value={payForm.payment_date}
                  onChange={(e) =>
                    setPayForm({ ...payForm, payment_date: e.target.value })
                  }
                />
              </div>
              <div className="cl-fg">
                <label className="cl-label">Note (optional)</label>
                <input
                  className="cl-input"
                  type="text"
                  placeholder="e.g. UPI payment"
                  value={payForm.note}
                  onChange={(e) =>
                    setPayForm({ ...payForm, note: e.target.value })
                  }
                />
              </div>
              {clientDetail && (
                <div className="cl-note-box">
                  Pending:{" "}
                  <strong className="cl-amount--red">
                    {inr(clientDetail.pending)}
                  </strong>
                </div>
              )}
            </div>
            <div className="cl-modal__footer">
              <button
                className="cl-btn cl-btn--ghost"
                onClick={() => setShowPayModal(false)}
              >
                Cancel
              </button>
              <button
                className="cl-btn cl-btn--primary"
                onClick={handleRecordPayment}
                disabled={payLoading}
              >
                <i className="bi bi-check-circle"></i>{" "}
                {payLoading ? "Saving…" : "Save Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Client Modal ── */}
      {showEditModal && (
        <div className="cl-overlay" onClick={() => setShowEditModal(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal__header">
              <div className="cl-modal__title">
                <i className="bi bi-pencil-square"></i> Edit Customer
              </div>
              <button
                className="cl-modal__close"
                onClick={() => setShowEditModal(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="cl-modal__body cl-modal__body--col">
              <div className="cl-fg">
                <label className="cl-label">
                  Name <span className="cl-req">*</span>
                </label>
                <input
                  className="cl-input"
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>
              <div className="cl-fg">
                <label className="cl-label">Phone</label>
                <input
                  className="cl-input"
                  type="text"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                />
              </div>
              <div className="cl-fg">
                <label className="cl-label">Address</label>
                <input
                  className="cl-input"
                  type="text"
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm({ ...editForm, address: e.target.value })
                  }
                />
              </div>
              <div className="cl-fg">
                <label className="cl-label">GST Number</label>
                <input
                  className="cl-input"
                  type="text"
                  value={editForm.gst}
                  onChange={(e) =>
                    setEditForm({ ...editForm, gst: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="cl-modal__footer">
              <button
                className="cl-btn cl-btn--ghost"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button
                className="cl-btn cl-btn--primary"
                onClick={handleEditClient}
                disabled={editLoading}
              >
                <i className="bi bi-check-circle"></i>{" "}
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {showDeleteModal && (
        <div className="cl-overlay" onClick={() => setShowDeleteModal(false)}>
          <div
            className="cl-modal cl-modal--sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cl-modal__header">
              <div className="cl-modal__title" style={{ color: "#dc2626" }}>
                <i className="bi bi-trash"></i> Delete Customer
              </div>
              <button
                className="cl-modal__close"
                onClick={() => setShowDeleteModal(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="cl-modal__confirm">
              <div className="cl-modal__confirm-icon">
                <i className="bi bi-exclamation-triangle-fill"></i>
              </div>
              <p className="cl-modal__confirm-title">
                Delete {selected?.name}?
              </p>
              <p className="cl-modal__confirm-sub">
                This will permanently delete the customer and all associated
                payment records. This action cannot be undone.
              </p>
            </div>
            <div className="cl-modal__footer">
              <button
                className="cl-btn cl-btn--ghost"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="cl-btn cl-btn--danger"
                onClick={handleDeleteClient}
                disabled={deleteLoading}
              >
                <i className="bi bi-trash"></i>{" "}
                {deleteLoading ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .cl-section-head {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .4px; color: #4b5563;
          margin: 18px 0 8px;
        }
        .cl-detail-row--sum {
          border-top: 1px solid #e5e7eb;
          font-weight: 700;
        }
        .cl-net-total {
          margin: 18px 0 12px; padding: 16px; border-radius: 12px;
          background: #ecfdf5; border: 1px solid #a7f3d0;
          display: flex; flex-direction: column; gap: 2px;
        }
        .cl-net-total--owe {
          background: #fef2f2; border-color: #fecaca;
        }
        .cl-net-total__label {
          font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .5px; color: #047857;
        }
        .cl-net-total--owe .cl-net-total__label { color: #b91c1c; }
        .cl-net-total__value {
          font-size: 26px; font-weight: 800; color: #065f46;
        }
        .cl-net-total--owe .cl-net-total__value { color: #dc2626; }
        .cl-net-total__hint { font-size: 12px; color: #6b7280; }
        * {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        *::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .cl-root { width: 100%; max-width: 100%; min-width: 0; color: #0f172a; position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; background: #f8fafc; min-height: 100vh; box-sizing: border-box; }

        /* Toast */
        .cl-toast { position: fixed; top: 24px; right: 24px; z-index: 1200; display: flex; align-items: center; gap: 10px; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.18); color: #fff; min-width: 240px; animation: cl-slide .28s cubic-bezier(.4,0,.2,1); }
        .cl-toast--success { background: #008b3e; }
        .cl-toast--error   { background: #dc2626; }
        @keyframes cl-slide { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        /* Header */
        .cl-header { display: flex; align-items: center; gap: 14px; padding-bottom: 28px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 28px; }
        .cl-header__icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #008b3e, #00b84f); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,139,62,.25); }
        .cl-header__title { margin: 0 0 2px; font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
        .cl-header__sub { margin: 0; font-size: 13px; color: #64748b; }

        /* Stats */
        .cl-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
        .cl-stat { display: flex; align-items: center; gap: 14px; background: #fff; border: 1.5px solid var(--bd); border-radius: 12px; padding: 16px 18px; min-width: 0; }
        .cl-stat__icon { width: 44px; height: 44px; border-radius: 10px; background: var(--bg); color: var(--c); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .cl-stat__body { min-width: 0; }
        .cl-stat__label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 4px; }
        .cl-stat__value { font-size: 16px; font-weight: 800; color: var(--c); font-family: "SF Mono", "Fira Code", monospace; overflow-wrap: anywhere; }

        /* Page-level tabs */
        .cl-tabs { display: flex; align-items: center; gap: 32px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 24px; overflow-x: auto; }
        .cl-tab { display: inline-flex; align-items: center; gap: 8px; background: none; border: none; padding: 14px 2px; font-size: 14.5px; font-weight: 700; color: #94a3b8; cursor: pointer; position: relative; white-space: nowrap; transition: color .15s; }
        .cl-tab i { font-size: 16px; color: #cbd5e1; transition: color .15s; }
        .cl-tab:hover { color: #475569; }
        .cl-tab:hover i { color: #94a3b8; }
        .cl-tab--active { color: #008b3e; }
        .cl-tab--active i { color: #008b3e; }
        .cl-tab--active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1.5px; height: 2.5px; background: #008b3e; border-radius: 2px; }
        .cl-tab__badge { background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 1px 9px; border-radius: 20px; }

        /* Card */
        .cl-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 24px; margin-bottom: 24px; }
        .cl-card__head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .cl-card__head i { color: #008b3e; font-size: 17px; }
        .cl-count { margin-left: auto; font-size: 12px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 2px 10px; border-radius: 20px; }

        /* Filters */
        .cl-filters { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .cl-fgrp { position: relative; flex: 2; min-width: 200px; }
        .cl-ficon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 13px; pointer-events: none; }
        .cl-finput { height: 38px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13px; color: #1e293b; background: #fafbfc; box-sizing: border-box; outline: none; transition: border-color .15s; flex: 1; min-width: 130px; }
        .cl-finput--icon { padding-left: 30px; width: 100%; }
        .cl-finput:focus { border-color: #008b3e; background: #fff; }

        /* Table */
        .cl-table-wrap { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow-x: auto; }
        .cl-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .cl-table thead tr { background: #f8fafc; }
        .cl-table th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .6px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
        .cl-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: middle; }
        .cl-tr:last-child td { border-bottom: none; }
        .cl-tr--clickable { cursor: pointer; }
        .cl-tr--clickable:hover td { background: #f8fffe; }

        .cl-client-cell { display: flex; align-items: center; gap: 10px; }
        .cl-avatar { width: 34px; height: 34px; border-radius: 50%; background: #dcfce7; color: #15803d; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink: 0; }
        .cl-avatar--lg { width: 48px; height: 48px; font-size: 16px; }
        .cl-client-name { font-weight: 600; }
        .cl-phone { color: #475569; font-size: 13px; }

        .cl-tag { border-radius: 6px; padding: 3px 10px; font-size: 12px; font-weight: 700; display: inline-block; }
        .cl-tag--paid { background: #dcfce7; color: #15803d; }
        .cl-tag--partial { background: #fef3c7; color: #b45309; }
        .cl-tag--unpaid { background: #fee2e2; color: #dc2626; }
        .cl-tag--neutral { background: #f1f5f9; color: #475569; }

        .cl-amount { font-family: "SF Mono", "Fira Code", monospace; font-weight: 700; color: #1e293b; font-size: 13px; }
        .cl-amount--green { color: #15803d; }
        .cl-amount--red { color: #dc2626; }
        .cl-date { color: #374151; font-size: 13px; white-space: nowrap; }

        .cl-actions { display: flex; gap: 6px; }
        .cl-act { width: 30px; height: 30px; border: none; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: transform .12s; }
        .cl-act:hover { transform: scale(1.08); }
        .cl-act--edit { background: #eff6ff; color: #2563eb; }
        .cl-act--edit:hover { background: #dbeafe; }
        .cl-act--del { background: #fef2f2; color: #dc2626; }
        .cl-act--del:hover { background: #fee2e2; }

        /* Buttons */
        .cl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 20px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: opacity .15s, box-shadow .15s; }
        .cl-btn--primary { background: linear-gradient(135deg, #008b3e, #009e46); color: #fff; box-shadow: 0 2px 8px rgba(0,139,62,.3); }
        .cl-btn--primary:hover { box-shadow: 0 4px 16px rgba(0,139,62,.38); }
        .cl-btn--primary:disabled { opacity: .6; cursor: not-allowed; }
        .cl-btn--ghost { background: #f8fafc; color: #374151; border: 1.5px solid #e2e8f0; }
        .cl-btn--ghost:hover { background: #f1f5f9; }
        .cl-btn--danger { background: #dc2626; color: #fff; box-shadow: 0 2px 8px rgba(220,38,38,.25); }
        .cl-btn--danger:disabled { opacity: .6; cursor: not-allowed; }
        .cl-btn--block { width: 100%; margin-top: 16px; }
        .cl-btn--tiny { padding: 4px 10px; font-size: 11px; }

        .cl-quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        /* Detail panel */
        .cl-detail__head { display: flex; align-items: center; gap: 14px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; margin-bottom: 0; }
        .cl-back { width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #e2e8f0; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #374151; flex-shrink: 0; }
        .cl-back:hover { background: #f1f5f9; }
        .cl-detail__info { flex: 1; min-width: 0; }
        .cl-detail__info h3 { margin: 0 0 2px; font-size: 16px; font-weight: 800; }
        .cl-detail__info p { margin: 0 0 6px; font-size: 13px; color: #64748b; }

        .cl-subtabs { display: flex; gap: 24px; border-bottom: 1px solid #f1f5f9; margin: 16px 0; }
        .cl-subtab { background: none; border: none; padding: 10px 2px; font-size: 13px; font-weight: 700; color: #94a3b8; cursor: pointer; position: relative; }
        .cl-subtab:hover { color: #475569; }
        .cl-subtab--active { color: #008b3e; }
        .cl-subtab--active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: #008b3e; border-radius: 2px; }

        .cl-mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .cl-mini-stat { border-radius: 10px; padding: 14px; text-align: center; }
        .cl-mini-stat--paid { background: #dcfce7; }
        .cl-mini-stat--pending { background: #fee2e2; }
        .cl-mini-stat__label { display: block; font-size: 12px; margin-bottom: 4px; font-weight: 600; }
        .cl-mini-stat--paid .cl-mini-stat__label { color: #15803d; }
        .cl-mini-stat--pending .cl-mini-stat__label { color: #dc2626; }
        .cl-mini-stat__value { display: block; font-size: 16px; font-weight: 800; }
        .cl-mini-stat--paid .cl-mini-stat__value { color: #15803d; }
        .cl-mini-stat--pending .cl-mini-stat__value { color: #dc2626; }

        .cl-detail-rows { border-top: 1px solid #f1f5f9; }
        .cl-detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .cl-detail-row span { color: #64748b; }
        .cl-detail-row strong { font-weight: 600; text-align: right; }

        .cl-subhint { font-size: 13px; color: #64748b; margin-bottom: 10px; }
        .cl-list-item { background: #f8fafc; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .cl-list-item__title { margin: 0; font-size: 13px; font-weight: 700; }
        .cl-list-item__sub { margin: 0; font-size: 12px; color: #64748b; }
        .cl-list-item__right { text-align: right; }

        /* Empty / loading */
        .cl-empty { display: flex; flex-direction: column; align-items: center; padding: 52px 20px; color: #94a3b8; }
        .cl-empty i { font-size: 40px; margin-bottom: 10px; }
        .cl-empty p { margin: 0 0 4px; font-weight: 600; color: #64748b; font-size: 15px; }
        .cl-empty span { font-size: 13px; }
        .cl-empty--small { padding: 24px 12px; }
        .cl-empty--small i { font-size: 28px; }

        .cl-loading { display: flex; align-items: center; gap: 12px; padding: 40px; justify-content: center; color: #64748b; font-size: 14px; }
        .cl-spinner { width: 20px; height: 20px; border: 3px solid #e2e8f0; border-top-color: #008b3e; border-radius: 50%; animation: cl-spin .7s linear infinite; }
        @keyframes cl-spin { to { transform: rotate(360deg); } }

        /* Form fields (modals) */
        .cl-fg { display: flex; flex-direction: column; gap: 7px; }
        .cl-label { font-size: 13px; font-weight: 600; color: #374151; }
        .cl-req { color: #ef4444; margin-left: 3px; }
        .cl-input { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; }
        .cl-input:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
        .cl-note-box { background: #f8fafc; border-radius: 8px; padding: 10px 12px; font-size: 13px; }

        /* Modal */
        .cl-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: cl-fi .18s ease; padding: 16px; }
        @keyframes cl-fi { from { opacity: 0; } to { opacity: 1; } }
        .cl-modal { background: #fff; border-radius: 16px; width: 480px; max-width: 92vw; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.22); animation: cl-mi .22s cubic-bezier(.4,0,.2,1); }
        .cl-modal--sm { width: 380px; }
        @keyframes cl-mi { from { transform: translateY(18px) scale(.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        .cl-modal__header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f1f5f9; }
        .cl-modal__title { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 800; color: #0f172a; }
        .cl-modal__title i { color: #008b3e; }
        .cl-modal__close { width: 30px; height: 30px; border: none; background: #f1f5f9; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 13px; flex-shrink: 0; }
        .cl-modal__close:hover { background: #e2e8f0; }
        .cl-modal__body { padding: 20px 22px; overflow-y: auto; flex: 1; display: grid; gap: 14px; }
        .cl-modal__body--col { grid-template-columns: 1fr; }
        .cl-modal__footer { padding: 14px 22px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }

        .cl-modal__confirm { padding: 24px; text-align: center; }
        .cl-modal__confirm-icon { width: 56px; height: 56px; border-radius: 50%; background: #fef2f2; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 24px; color: #dc2626; }
        .cl-modal__confirm-title { margin: 0 0 6px; font-weight: 700; font-size: 16px; color: #0f172a; }
        .cl-modal__confirm-sub { margin: 0; font-size: 13px; color: #64748b; }

        /* Responsive */
        @media (max-width: 1100px) {
          .cl-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cl-table { min-width: 800px; }
        }

        @media (max-width: 768px) {
          .cl-root { padding: 16px; }
          .cl-header { align-items: flex-start; gap: 12px; padding-bottom: 20px; margin-bottom: 20px; }
          .cl-header__title { font-size: 20px; }
          .cl-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 20px; }
          .cl-stat { padding: 12px; gap: 10px; }
          .cl-stat__icon { width: 36px; height: 36px; font-size: 16px; }
          .cl-stat__value { font-size: 13px; }
          .cl-card { padding: 16px; border-radius: 12px; margin-bottom: 16px; }
          .cl-filters { flex-direction: column; }
          .cl-fgrp { min-width: 0; }
          .cl-quick-actions { grid-template-columns: 1fr; }
          .cl-detail__info h3 { font-size: 15px; }
          .cl-modal { width: 100%; }
        }

        @media (max-width: 480px) {
          .cl-stats { grid-template-columns: 1fr; }
          .cl-card { padding: 14px 12px; }
        }
      `}</style>
    </div>
  );
}