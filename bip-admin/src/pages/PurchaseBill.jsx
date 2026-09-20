import React, { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";

// ── Helpers ─────────────────────────────────────────────────
const emptyItem = () => ({
  product_id: "",
  product_name: "",
  quantity: "",
  rate: "",
  amount: "0.00",
});

const emptyForm = () => ({
  company_name: "",
  supplier_phone: "",
  invoice_no: "",
  bill_date: new Date().toISOString().slice(0, 10),
  notes: "",
  gst_enabled: false,
  gst_rate: "18",
  round_off_mode: "auto", // "none" | "auto" | "manual"
  round_off: "", // manual round-off value (+ or −)
  opening_balance: "",
  paid_amount: "",
  items: [emptyItem()],
});

// 2-decimal rounding that avoids 0.1 + 0.2 style errors
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Signed rupee amount for round off: +₹0.40 / −₹0.60
const signed = (n) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${Math.abs(Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const ROUND_OFF_MODES = [
  { value: "none", label: "Off" },
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manual" },
];

// Phone key used to identify the same party: last 10 digits only.
const phoneKey = (p) => String(p || "").replace(/\D/g, "").slice(-10);

// Read the logged-in user saved at login time.
// NOTE: change "user" if your app stores it under a different key.
const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user")) || {};
  } catch {
    return {};
  }
};

export default function PurchaseBill() {
  const storedUser = getStoredUser();
  const isAdmin = storedUser?.role === "admin";

  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  // Form is HIDDEN by default — records show first
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Which bill (by id) is currently expanded to show full details
  const [expandedId, setExpandedId] = useState(null);

  // Per-bill "add payment" mini form
  const [payingBillId, setPayingBillId] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  // Search filters (date range removed per request — company / product / invoice only)
  const [filters, setFilters] = useState({
    company: "",
    product: "",
    invoice: "",
  });

  const fetchBills = async (activeFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      const res = await apiFetch(
        `/get_purchase_bills.php?${params.toString()}`,
      );
      const data = await res.json();
      setBills(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError("Failed to load purchase bills");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  // Existing parties (from Tax Invoices / earlier bills) — used to link by phone
  const [parties, setParties] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/client.php");
        const data = await res.json();
        if (data.success) setParties(data.clients || []);
      } catch (_) {}
    })();
  }, []);

  // Same phone number = same party, whatever the invoice number is
  const supplierKey = phoneKey(form.supplier_phone);
  const linkedParty =
    supplierKey.length === 10
      ? parties.find((p) => phoneKey(p.phone) === supplierKey)
      : null;

  useEffect(() => {
    if (linkedParty && !form.company_name.trim()) {
      setForm((prev) => ({ ...prev, company_name: linkedParty.name || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedParty?.id]);

  const handleFilterChange = (e) =>
    setFilters({ ...filters, [e.target.name]: e.target.value });

  const applyFilters = () => fetchBills(filters);

  const clearFilters = () => {
    const cleared = {
      company: "",
      product: "",
      invoice: "",
    };
    setFilters(cleared);
    fetchBills(cleared);
  };

  // ── Form field handlers ───────────────────────────────────
  const handleHeaderChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const handleItemChange = (index, e) => {
    const { name, value } = e.target;
    const items = [...form.items];
    items[index] = { ...items[index], [name]: value };
    const qty = parseFloat(items[index].quantity) || 0;
    const rate = parseFloat(items[index].rate) || 0;
    items[index].amount = (qty * rate).toFixed(2);
    setForm({ ...form, items });
  };

  const addItemRow = () =>
    setForm({ ...form, items: [...form.items, emptyItem()] });

  const removeItemRow = (index) => {
    if (form.items.length === 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const resetForm = () => {
    setForm(emptyForm());
    setFormError("");
    setEditingId(null);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  // ── Live totals (GST + payment) ───────────────────────────
  const subtotal = form.items.reduce(
    (sum, it) => sum + (parseFloat(it.amount) || 0),
    0,
  );
  const gstRate = form.gst_enabled ? parseFloat(form.gst_rate) || 0 : 0;
  const gstAmount = form.gst_enabled ? (subtotal * gstRate) / 100 : 0;
  // Bill amount before round off = subtotal + GST
  const billAmount = r2(subtotal + gstAmount);

  // Round off: Auto → nearest whole rupee, Manual → typed value (+/−)
  const autoRoundOff = r2(Math.round(billAmount) - billAmount);
  const manualRoundOffValid =
    form.round_off !== "" && !isNaN(parseFloat(form.round_off));
  const roundOff =
    form.round_off_mode === "auto"
      ? autoRoundOff
      : form.round_off_mode === "manual" && manualRoundOffValid
        ? r2(parseFloat(form.round_off))
        : 0;

  // Final payable for this bill (after round off)
  const totalAmount = r2(billAmount + roundOff);
  const openingBalance = parseFloat(form.opening_balance) || 0;
  const paidAmount = parseFloat(form.paid_amount) || 0;
  const closingBalance = r2(openingBalance + totalAmount - paidAmount);


  // ── Save (create or admin update) ─────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    // Invoice number is optional — the phone number links the customer
    if (!form.company_name || !form.bill_date) {
      setFormError("Company name and date are required");
      return;
    }
    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      if (!it.product_id || !it.product_name || !it.quantity || !it.rate) {
        setFormError(
          `Item #${i + 1}: product ID, name, quantity and rate are required`,
        );
        return;
      }
    }
    if (form.round_off_mode === "manual" && !manualRoundOffValid) {
      setFormError("Enter the manual round off amount (e.g. 0.40 or -0.60)");
      return;
    }
    if (totalAmount < 0) {
      setFormError("Round off cannot make the bill amount negative");
      return;
    }
    if (form.gst_enabled && (gstRate < 0 || gstRate > 100)) {
      setFormError("GST rate must be between 0 and 100");
      return;
    }

    const payload = {
      ...form,
      gst_enabled: form.gst_enabled ? 1 : 0,
      gst_rate: gstRate,
      opening_balance: openingBalance,
      paid_amount: paidAmount,
      round_off_mode: form.round_off_mode,
      round_off: roundOff,
    };

    const endpoint = editingId
      ? "/update_purchase_bill.php"
      : "/add_purchase_bill.php";
    if (editingId) payload.bill_id = editingId;

    setSaving(true);
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Non-JSON response:", text);
        setFormError(
          `Server returned an unexpected response (HTTP ${res.status}). Check console.`,
        );
        return;
      }

      if (res.ok) {
        alert(data.message || "Saved successfully");
        closeForm();
        fetchBills();
      } else {
        setFormError(
          data.message || data.error || `Save failed (HTTP ${res.status})`,
        );
      }
    } catch (err) {
      console.error(err);
      setFormError("Server error");
    } finally {
      setSaving(false);
    }
  };

  // ── Admin: edit ───────────────────────────────────────────
  const startEdit = (bill) => {
    setForm({
      company_name: bill.company_name || "",
      supplier_phone: bill.supplier_phone || "",
      invoice_no: bill.invoice_no || "",
      bill_date: bill.bill_date || "",
      notes: bill.notes || "",
      gst_enabled: Number(bill.gst_enabled) === 1,
      gst_rate: String(parseFloat(bill.gst_rate) || 18),
      // Old bills (saved before round off existed) open with round off "Off"
      round_off_mode: bill.round_off_mode || "none",
      round_off:
        bill.round_off_mode === "manual" ? String(parseFloat(bill.round_off) || 0) : "",
      opening_balance: String(parseFloat(bill.opening_balance) || ""),
      paid_amount: String(parseFloat(bill.paid_amount) || ""),
      items: (bill.items || []).map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: String(parseFloat(it.quantity)),
        rate: String(parseFloat(it.rate)),
        amount: parseFloat(it.amount).toFixed(2),
      })),
    });
    setEditingId(bill.id);
    setFormError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Admin: delete ─────────────────────────────────────────
  const handleDelete = async (bill) => {
    if (
      !window.confirm(
        `Delete bill ${bill.invoice_no || "(no invoice no.)"} (${bill.company_name})?\nStock added by this bill will be reversed.`,
      )
    )
      return;
    try {
      const res = await apiFetch("/delete_purchase_bill.php", {
        method: "POST",
        body: JSON.stringify({ bill_id: bill.id }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Deleted");
        fetchBills();
      } else {
        alert(data.message || data.error || "Delete failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server error while deleting");
    }
  };

  // ── Record a later payment ────────────────────────────────
  const openPayForm = (billId) => {
    setPayingBillId(billId);
    setPayForm({
      amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      note: "",
    });
  };

  const submitPayment = async (bill) => {
    const amt = parseFloat(payForm.amount);
    if (isNaN(amt) || amt <= 0) {
      alert("Enter a valid payment amount");
      return;
    }
    try {
      const res = await apiFetch("/add_purchase_payment.php", {
        method: "POST",
        body: JSON.stringify({
          bill_id: bill.id,
          amount: amt,
          payment_date: payForm.payment_date,
          note: payForm.note,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Payment recorded");
        setPayingBillId(null);
        fetchBills();
      } else {
        alert(data.message || data.error || "Payment failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server error while recording payment");
    }
  };

  // ── Expand / collapse a record ─────────────────────────────
  const toggleExpand = (billId) => {
    setExpandedId((prev) => (prev === billId ? null : billId));
    // closing the card should also close any open inline payment form
    setPayingBillId(null);
  };

  const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

  return (
    <div
      className="at-root"
      onKeyDown={(e) => {
        // Enter → next field is handled app-wide (hooks/useEnterNavigation)
        if (e.key === "Escape") {
          e.target.blur();
        }
      }}
    >
      <style>{screenStyles}</style>

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="at-header">
        <div className="at-header__left">
          <div className="at-header__icon">
            <i className="bi bi-bag-check-fill"></i>
          </div>
          <div>
            <h1 className="at-header__title">Purchase Bill</h1>
            <p className="at-header__sub">
              Record purchase bills with multiple products from one company
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            type="button"
            className="at-btn at-btn--primary"
            onClick={openAddForm}
          >
            <i className="bi bi-plus-circle"></i> Add Purchase
          </button>
        )}
      </div>

      {/* ── Add / Edit form ─────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="at-card">
          <div
            className="at-card__head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <i
                className={
                  editingId ? "bi bi-pencil-square" : "bi bi-plus-circle"
                }
              ></i>
              {editingId
                ? `Edit Purchase Bill #${editingId}`
                : "Add Purchase Bill"}
            </span>
            <button
              type="button"
              className="at-remove-btn"
              onClick={closeForm}
              title="Close form"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          <div className="at-form-grid">
            <div className="at-fg">
              <label className="at-label">
                Company Name <span className="req">*</span>
              </label>
              <input
                type="text"
                name="company_name"
                placeholder="Supplier / Company name"
                className="at-input"
                value={form.company_name}
                onChange={handleHeaderChange}
                required
              />
            </div>
            <div className="at-fg">
              <label className="at-label">
                Supplier Phone
              </label>
              <input
                type="tel"
                name="supplier_phone"
                placeholder="10-digit mobile number"
                className="at-input"
                value={form.supplier_phone}
                onChange={handleHeaderChange}
              />
              {linkedParty ? (
                <small style={{ color: "#008b3e", fontSize: 12, fontWeight: 600 }}>
                  <i className="bi bi-link-45deg"></i> Linked to existing
                  customer: {linkedParty.name} ({linkedParty.total_invoices || 0}{" "}
                  invoice{Number(linkedParty.total_invoices) === 1 ? "" : "s"})
                </small>
              ) : (
                <small style={{ color: "#6b7280", fontSize: 12 }}>
                  Enter the same number used on their tax invoice to net the
                  balances together on the Client page.
                </small>
              )}
            </div>
            <div className="at-fg">
              <label className="at-label">
                Invoice No. <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                name="invoice_no"
                placeholder="INV-001 (leave empty if none)"
                className="at-input"
                value={form.invoice_no}
                onChange={handleHeaderChange}
              />
            </div>
            <div className="at-fg">
              <label className="at-label">
                Bill Date <span className="req">*</span>
              </label>
              <input
                type="date"
                name="bill_date"
                className="at-input"
                value={form.bill_date}
                onChange={handleHeaderChange}
                required
              />
            </div>
            <div className="at-fg at-fg--span3">
              <label className="at-label">Notes</label>
              <input
                type="text"
                name="notes"
                placeholder="Optional notes"
                className="at-input"
                value={form.notes}
                onChange={handleHeaderChange}
              />
            </div>
          </div>

          <div className="at-subhead">
            <i className="bi bi-list-ul"></i> Products
          </div>

          <div className="at-table-wrap">
            <table className="at-table" style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th>Product ID *</th>
                  <th>Product Name *</th>
                  <th>Quantity *</th>
                  <th>Rate (₹) *</th>
                  <th>Amount (₹)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => (
                  <tr key={idx}>
                    <td data-label="Product ID">
                      <input
                        type="text"
                        name="product_id"
                        placeholder="HSN / Code"
                        className="at-input-t"
                        value={item.product_id}
                        onChange={(e) => handleItemChange(idx, e)}
                      />
                    </td>
                    <td data-label="Product Name">
                      <input
                        type="text"
                        name="product_name"
                        placeholder="Product name"
                        className="at-input-t"
                        value={item.product_name}
                        onChange={(e) => handleItemChange(idx, e)}
                      />
                    </td>
                    <td data-label="Quantity">
                      <input
                        type="number"
                        name="quantity"
                        placeholder="0"
                        min="0"
                        step="any"
                        className="at-input-t"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, e)}
                        onWheel={(e) => e.target.blur()}
                      />
                    </td>
                    <td data-label="Rate (₹)">
                      <input
                        type="number"
                        name="rate"
                        placeholder="0.00"
                        min="0"
                        step="any"
                        className="at-input-t"
                        value={item.rate}
                        onChange={(e) => handleItemChange(idx, e)}
                        onWheel={(e) => e.target.blur()}
                      />
                    </td>
                    <td data-label="Amount (₹)">
                      <input
                        type="text"
                        value={`₹ ${item.amount}`}
                        readOnly
                        className="at-input-t"
                        style={{ background: "#f1f5f9", fontWeight: 700 }}
                      />
                    </td>
                    <td data-label="" style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="at-remove-btn"
                        onClick={() => removeItemRow(idx)}
                        disabled={form.items.length === 1}
                        title="Remove row"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="at-btn at-btn--ghost"
              onClick={addItemRow}
            >
              <i className="bi bi-plus-lg"></i> Add Product
            </button>
          </div>

          {/* ── GST section ─────────────────────────────────── */}
          <div
            className="at-alert"
            style={{ alignItems: "center", flexWrap: "wrap", gap: 20 }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                color: "#1e293b",
              }}
            >
              <input
                type="checkbox"
                name="gst_enabled"
                checked={form.gst_enabled}
                onChange={handleHeaderChange}
                style={{
                  width: 18,
                  height: 18,
                  accentColor: "#008b3e",
                  cursor: "pointer",
                }}
              />
              Include GST
            </label>
            {form.gst_enabled && (
              <div className="at-fg" style={{ minWidth: 160 }}>
                <label className="at-label">GST Rate (%)</label>
                <select
                  name="gst_rate"
                  className="at-select"
                  value={form.gst_rate}
                  onChange={handleHeaderChange}
                >
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
            )}
          </div>

          {/* ── Round off ───────────────────────────────────── */}
          <div className="at-subhead">
            <i className="bi bi-calculator"></i> Round Off
          </div>
          <div className="pb-round-row">
            <div className="pb-seg" role="radiogroup" aria-label="Round off mode">
              {ROUND_OFF_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={form.round_off_mode === m.value}
                  className={`pb-seg-btn${form.round_off_mode === m.value ? " active" : ""}`}
                  onClick={() => setForm({ ...form, round_off_mode: m.value })}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {form.round_off_mode === "auto" && (
              <div className="pb-round-info">
                {inr(billAmount.toFixed(2))} → <b>{inr(totalAmount.toFixed(2))}</b>
                <span className="pb-round-tag">Round off {signed(autoRoundOff)}</span>
              </div>
            )}

            {form.round_off_mode === "manual" && (
              <div className="at-fg" style={{ minWidth: 200, margin: 0 }}>
                <label className="at-label">Round Off Amount (₹)</label>
                <input
                  type="number"
                  name="round_off"
                  step="0.01"
                  placeholder="e.g. 0.40 or -0.60"
                  className="at-input"
                  value={form.round_off}
                  onChange={handleHeaderChange}
                  onWheel={(e) => e.target.blur()}
                />
                <small style={{ color: "#6b7280", fontSize: 12 }}>
                  Use − to reduce the amount. Auto would be {signed(autoRoundOff)}
                </small>
              </div>
            )}

            {form.round_off_mode === "none" && (
              <div className="pb-round-info">No round off — exact amount is used.</div>
            )}
          </div>

          {/* ── Payment section ─────────────────────────────── */}
          <div className="at-subhead">
            <i className="bi bi-cash-stack"></i> Payment Details
          </div>
          <div className="at-form-grid--2">
            <div className="at-fg">
              <label className="at-label">Opening Balance (₹)</label>
              <input
                type="number"
                name="opening_balance"
                placeholder="Previous outstanding (0 if none)"
                min="0"
                step="any"
                className="at-input"
                value={form.opening_balance}
                onChange={handleHeaderChange}
                onWheel={(e) => e.target.blur()}
              />
            </div>
            <div className="at-fg">
              <label className="at-label">Paid Amount (₹)</label>
              <input
                type="number"
                name="paid_amount"
                placeholder="Advance / amount paid now"
                min="0"
                step="any"
                className="at-input"
                value={form.paid_amount}
                onChange={handleHeaderChange}
                onWheel={(e) => e.target.blur()}
              />
            </div>
          </div>

          {/* ── Live summary ────────────────────────────────── */}
          <div
            className="at-totals-row"
            style={{ justifyContent: "flex-end", marginTop: 16 }}
          >
            <div className="at-totals-box">
              <div>
                Subtotal: <strong>{inr(subtotal.toFixed(2))}</strong>
              </div>
              {form.gst_enabled && (
                <div className="muted">
                  GST ({gstRate}%): {inr(gstAmount.toFixed(2))}
                </div>
              )}
              <div
                style={{ borderTop: "1px solid #e2e8f0", margin: "6px 0" }}
              ></div>
              <div>
                Total Amount: <strong>{inr(billAmount.toFixed(2))}</strong>
              </div>
              {form.round_off_mode !== "none" && (
                <div className="muted">
                  Round Off ({form.round_off_mode === "auto" ? "Auto" : "Manual"}):{" "}
                  {signed(roundOff)}
                </div>
              )}
              <div className="net" style={{ color: "#1e293b", marginTop: 2 }}>
                Final Payable: {inr(totalAmount.toFixed(2))}
              </div>
              <div
                style={{ borderTop: "1px dashed #e2e8f0", margin: "6px 0" }}
              ></div>
              <div className="muted">
                Opening Balance: {inr(openingBalance.toFixed(2))}
              </div>
              <div
                className="muted"
                style={{ color: "#008b3e", fontWeight: 700 }}
              >
                Paid Amount: {inr(paidAmount.toFixed(2))}
              </div>
              <div
                className={closingBalance > 0 ? "net" : "net"}
                style={{ color: closingBalance > 0 ? "#dc2626" : "#008b3e" }}
              >
                Closing Balance: {inr(closingBalance.toFixed(2))}
              </div>
            </div>
          </div>

          {formError && <div className="at-error-banner">{formError}</div>}

          <div className="at-form-actions">
            <button
              type="button"
              className="at-btn at-btn--ghost"
              onClick={closeForm}
            >
              <i className="bi bi-x-circle"></i> Cancel
            </button>
            <button
              type="button"
              className="at-btn at-btn--ghost"
              onClick={resetForm}
            >
              <i className="bi bi-arrow-counterclockwise"></i> Reset
            </button>
            <button
              type="submit"
              className="at-btn at-btn--primary at-btn--lg"
              disabled={saving}
            >
              <i className="bi bi-check-circle"></i>{" "}
              {saving
                ? "Saving..."
                : editingId
                  ? "Update Purchase Bill"
                  : "Save Purchase Bill"}
            </button>
          </div>
        </form>
      )}

      {/* ── Search Filters ───────────────────────────────────── */}
      <div className="at-card">
        <div className="at-card__head">
          <i className="bi bi-search"></i>
          <span>Search Purchase Bills</span>
        </div>
        <div className="at-form-grid">
          <div className="at-fg">
            <label className="at-label">Company</label>
            <input
              type="text"
              name="company"
              placeholder="Company name"
              className="at-input"
              value={filters.company}
              onChange={handleFilterChange}
            />
          </div>
          <div className="at-fg">
            <label className="at-label">Product</label>
            <input
              type="text"
              name="product"
              placeholder="Product name / ID"
              className="at-input"
              value={filters.product}
              onChange={handleFilterChange}
            />
          </div>
          <div className="at-fg">
            <label className="at-label">Invoice No.</label>
            <input
              type="text"
              name="invoice"
              placeholder="Invoice number"
              className="at-input"
              value={filters.invoice}
              onChange={handleFilterChange}
            />
          </div>
        </div>
        <div
          className="at-form-actions"
          style={{ marginTop: 4, marginBottom: 0 }}
        >
          <button
            type="button"
            className="at-btn at-btn--ghost"
            onClick={clearFilters}
          >
            <i className="bi bi-x-circle"></i> Clear
          </button>
          <button
            type="button"
            className="at-btn at-btn--primary"
            onClick={applyFilters}
          >
            <i className="bi bi-search"></i> Search
          </button>
        </div>
      </div>

      {/* ── Records ──────────────────────────────────────────── */}
      <div className="at-card">
        <div className="at-card__head">
          <i className="bi bi-table"></i>
          <span>Purchase Bill Records</span>
        </div>

        {loading && (
          <p style={{ textAlign: "center", padding: 20, color: "#64748b" }}>
            Loading...
          </p>
        )}
        {error && !loading && <div className="at-error-banner">{error}</div>}

        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {bills.length === 0 ? (
              <p style={{ textAlign: "center", padding: 28, color: "#64748b" }}>
                No purchase bill records found
              </p>
            ) : (
              bills.map((bill) => {
                const balance = parseFloat(bill.closing_balance) || 0;
                const hasDue = balance > 0;
                const isOpen = expandedId === bill.id;
                return (
                  <div
                    className={`bill-block${isOpen ? " open" : ""}`}
                    key={bill.id}
                  >
                    {/* ── Collapsed summary row ── */}
                    <div
                      className="bill-header"
                      onClick={() => toggleExpand(bill.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(bill.id);
                        }
                      }}
                    >
                      <div className="bill-header-left">
                        <i
                          className={`bi bi-chevron-right expand-caret${isOpen ? " rotated" : ""}`}
                        ></i>
                        <strong className={hasDue ? "company-due" : ""}>
                          {bill.company_name}
                          {hasDue && (
                            <span
                              className="due-dot"
                              title="Balance payment pending"
                            ></span>
                          )}
                        </strong>
                        <span className="bill-invoice">
                          Invoice: {bill.invoice_no || "—"}
                        </span>
                      </div>
                      <div className="bill-header-right">
                        {hasDue ? (
                          <span className="balance-pill due">
                            Due {inr(bill.closing_balance)}
                          </span>
                        ) : (
                          <span className="balance-pill settled">Settled</span>
                        )}
                      </div>
                    </div>

                    {/* ── Expanded details ── */}
                    {isOpen && (
                      <div
                        className="bill-details"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="bill-meta-row">
                          <span className="bill-date">
                            <i className="bi bi-calendar3"></i> {bill.bill_date}
                          </span>
                          <span className="bill-total">
                            {inr(bill.total_amount)}
                          </span>
                          {isAdmin && bill.branch_name && (
                            <span className="bill-branch">
                              <i className="bi bi-building"></i>{" "}
                              {bill.branch_name}
                            </span>
                          )}
                          {Number(bill.gst_enabled) === 1 && (
                            <span className="gst-badge">
                              GST {parseFloat(bill.gst_rate)}%
                            </span>
                          )}
                          {isAdmin && (
                            <span className="admin-actions">
                              <button
                                type="button"
                                className="edit-btn"
                                onClick={() => startEdit(bill)}
                                title="Edit bill (admin)"
                              >
                                <i className="bi bi-pencil-square"></i>
                              </button>
                              <button
                                type="button"
                                className="delete-btn"
                                onClick={() => handleDelete(bill)}
                                title="Delete bill (admin)"
                              >
                                <i className="bi bi-trash"></i>
                              </button>
                            </span>
                          )}
                        </div>

                        {bill.notes && (
                          <div className="bill-notes">{bill.notes}</div>
                        )}

                        {/* Payment summary strip */}
                        <div className="pay-summary">
                          <div className="pay-chip">
                            <span>Subtotal</span>
                            <b>{inr(bill.subtotal)}</b>
                          </div>
                          {Number(bill.gst_enabled) === 1 && (
                            <div className="pay-chip">
                              <span>GST</span>
                              <b>{inr(bill.gst_amount)}</b>
                            </div>
                          )}
                          {Number(bill.round_off) !== 0 && (
                            <div className="pay-chip">
                              <span>
                                Round Off
                                {bill.round_off_mode === "manual" ? " (M)" : " (A)"}
                              </span>
                              <b>{signed(Number(bill.round_off))}</b>
                            </div>
                          )}
                          {bill.final_amount !== undefined && (
                            <div className="pay-chip">
                              <span>Bill Payable</span>
                              <b>{inr(bill.final_amount)}</b>
                            </div>
                          )}
                          <div className="pay-chip">
                            <span>Total</span>
                            <b>{inr(bill.total_amount)}</b>
                          </div>
                          <div className="pay-chip">
                            <span>Opening Bal.</span>
                            <b>{inr(bill.opening_balance)}</b>
                          </div>
                          <div className="pay-chip green">
                            <span>Paid</span>
                            <b>{inr(bill.paid_amount)}</b>
                          </div>
                          <div
                            className={`pay-chip ${hasDue ? "red" : "green"}`}
                          >
                            <span>Balance</span>
                            <b>{inr(bill.closing_balance)}</b>
                          </div>
                          {hasDue && (
                            <button
                              type="button"
                              className="at-btn at-btn--primary"
                              style={{ padding: "9px 16px", fontSize: 13 }}
                              onClick={() => openPayForm(bill.id)}
                            >
                              <i className="bi bi-plus-circle"></i> Add Payment
                            </button>
                          )}
                        </div>

                        {/* Inline add-payment form */}
                        {payingBillId === bill.id && (
                          <div className="pay-form">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Amount (₹)"
                              className="at-input-t"
                              style={{ flex: 1, minWidth: 130 }}
                              value={payForm.amount}
                              onChange={(e) =>
                                setPayForm({
                                  ...payForm,
                                  amount: e.target.value,
                                })
                              }
                            />
                            <input
                              type="date"
                              className="at-input-t"
                              style={{ flex: 1, minWidth: 130 }}
                              value={payForm.payment_date}
                              onChange={(e) =>
                                setPayForm({
                                  ...payForm,
                                  payment_date: e.target.value,
                                })
                              }
                            />
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              className="at-input-t"
                              style={{ flex: 1, minWidth: 130 }}
                              value={payForm.note}
                              onChange={(e) =>
                                setPayForm({ ...payForm, note: e.target.value })
                              }
                            />
                            <button
                              type="button"
                              className="at-btn at-btn--primary"
                              style={{ padding: "8px 14px", fontSize: 13 }}
                              onClick={() => submitPayment(bill)}
                            >
                              <i className="bi bi-check-circle"></i> Save
                            </button>
                            <button
                              type="button"
                              className="at-btn at-btn--ghost"
                              style={{ padding: "8px 14px", fontSize: 13 }}
                              onClick={() => setPayingBillId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* Items */}
                        <div className="at-table-wrap">
                          <table className="at-table">
                            <thead>
                              <tr>
                                <th>Product ID</th>
                                <th>Product Name</th>
                                <th>Quantity</th>
                                <th>Rate (₹)</th>
                                <th>Amount (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(bill.items || []).map((it) => (
                                <tr key={it.id}>
                                  <td data-label="Product ID">
                                    {it.product_id}
                                  </td>
                                  <td data-label="Product Name">
                                    {it.product_name}
                                  </td>
                                  <td data-label="Quantity">{it.quantity}</td>
                                  <td data-label="Rate (₹)">{inr(it.rate)}</td>
                                  <td data-label="Amount (₹)">
                                    {inr(it.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Payment history */}
                        {(bill.payments || []).length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div className="ph-title">
                              <i className="bi bi-clock-history"></i> Payment
                              History
                            </div>
                            <div className="at-table-wrap">
                              <table className="at-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Amount (₹)</th>
                                    <th>Note</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bill.payments.map((p) => (
                                    <tr key={p.id}>
                                      <td data-label="Date">
                                        {p.payment_date}
                                      </td>
                                      <td data-label="Amount (₹)">
                                        {inr(p.amount)}
                                      </td>
                                      <td data-label="Note">{p.note || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SCREEN STYLES (matches Tax Invoice / Quotation's at-* design system) ──
const screenStyles = `
  .at-root { color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

  .at-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1.5px solid #e2e8f0; flex-wrap: wrap; gap: 14px; }
  .at-header__left { display: flex; align-items: center; gap: 14px; }
  .at-header__icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #008b3e, #00b84f); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,139,62,.25); }
  .at-header__title { margin: 0 0 2px; font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
  .at-header__sub { margin: 0; font-size: 13px; color: #64748b; }

  .at-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: box-shadow .15s, opacity .15s; }
  .at-btn--primary { background: linear-gradient(135deg,#008b3e,#00b84f); color: #fff; box-shadow: 0 2px 10px rgba(0,139,62,.3); }
  .at-btn--primary:hover { box-shadow: 0 4px 16px rgba(0,139,62,.38); }
  .at-btn--ghost { background: #f8fafc; color: #374151; border: 1.5px solid #e2e8f0; }
  .at-btn--ghost:hover { background: #f1f5f9; }
  .at-btn--lg { padding: 13px 32px; font-size: 15px; }
  .at-btn:disabled { opacity: .55; cursor: not-allowed; }

  .at-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
  .at-card__head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #f1f5f9; }
  .at-card__head i { color: #008b3e; font-size: 17px; }

  .at-subhead { font-size: 15px; font-weight: 800; color: #1e293b; margin: 22px 0 14px; display: flex; align-items: center; gap: 8px; }
  .at-subhead i { color: #008b3e; }

  .at-form-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 4px; }
  .at-form-grid--2 { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; margin-bottom: 4px; }
  .at-fg { display: flex; flex-direction: column; gap: 6px; }
  .at-fg--span3 { grid-column: span 3; }
  .at-label { font-size: 12px; font-weight: 700; color: #374151; }
  .at-label .req { color: #ef4444; }
  .at-input, .at-select { height: 38px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13.5px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; font-family: inherit; }
  .at-input:focus, .at-select:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
  .at-input[readonly] { background: #f1f5f9; color: #475569; cursor: default; }
  .at-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; cursor: pointer; }

  .at-alert { display: flex; align-items: flex-start; gap: 10px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 10px; padding: 12px 16px; font-size: 13px; margin: 18px 0; }

  .at-table-wrap { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow-x: auto; margin-bottom: 16px; }
  .at-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 560px; }
  .at-table thead tr { background: #f8fafc; }
  .at-table th { padding: 10px 8px; text-align: left; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
  .at-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .at-table tbody tr:last-child td { border-bottom: none; }
  .at-table tbody tr:hover td { background: #f9fdfb; }
  .at-input-t { height: 34px; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 0 8px; font-size: 12.5px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; font-family: inherit; }
  .at-input-t:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 2px rgba(0,139,62,.1); }
  .at-remove-btn { width: 32px; height: 32px; border-radius: 7px; border: 1.5px solid #fca5a5; background: #fee2e2; color: #dc2626; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
  .at-remove-btn:hover:not(:disabled) { background: #fecaca; }
  .at-remove-btn:disabled { opacity: .4; cursor: not-allowed; }

  .at-totals-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .at-totals-box { background: #f8fbff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; font-size: 13px; text-align: right; min-width: 280px; }
  .at-totals-box .muted { color: #64748b; font-size: 12px; margin-top: 2px; }
  .at-totals-box .net { font-size: 16px; font-weight: 800; margin-top: 6px; }
  .pb-round-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 8px; }
  .pb-seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
  .pb-seg-btn { border: none; background: #fff; padding: 8px 18px; font-size: 13px; font-weight: 700; color: #475569; cursor: pointer; }
  .pb-seg-btn + .pb-seg-btn { border-left: 1px solid #cbd5e1; }
  .pb-seg-btn.active { background: #008b3e; color: #fff; }
  .pb-seg-btn:focus-visible { outline: 2px solid #008b3e; outline-offset: -2px; }
  .pb-round-info { font-size: 14px; color: #334155; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pb-round-tag { background: #ecfdf5; color: #047857; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 700; }

  .at-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

  .at-error-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 16px; color: #dc2626; font-size: 13px; font-weight: 600; margin-top: 16px; }

  /* ── Bill records list ─────────────────────────────────── */
  .bill-block { border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; }
  .bill-block.open { border-color: #b8e3c8; box-shadow: 0 2px 10px rgba(0,139,62,.08); }
  .bill-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; user-select: none; flex-wrap: wrap; }
  .bill-header:hover { background: #f8fafc; }
  .bill-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
  .expand-caret { font-size: 13px; color: #64748b; transition: transform 0.15s ease; flex-shrink: 0; }
  .expand-caret.rotated { transform: rotate(90deg); color: #008b3e; }
  .bill-header-left strong { font-size: 14.5px; }
  .bill-header-left strong.company-due { color: #dc2626; display: inline-flex; align-items: center; gap: 6px; }
  .due-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc2626; display: inline-block; }
  .bill-invoice { color: #64748b; font-size: 13px; }
  .bill-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .balance-pill { border-radius: 999px; padding: 4px 12px; font-size: 11.5px; font-weight: 800; }
  .balance-pill.due { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
  .balance-pill.settled { background: #ecfdf5; border: 1px solid #a7f3d0; color: #166534; }

  .bill-details { padding: 4px 16px 16px; border-top: 1px solid #f1f5f9; cursor: default; }
  .bill-meta-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 0 4px; }
  .bill-branch { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 999px; padding: 2px 10px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; }
  .gst-badge { background: #fefce8; border: 1px solid #fde68a; color: #a16207; border-radius: 999px; padding: 2px 10px; font-size: 11.5px; font-weight: 700; }
  .bill-date { color: #64748b; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
  .bill-total { font-weight: 800; color: #008b3e; font-size: 14.5px; }
  .bill-notes { color: #64748b; font-size: 13px; margin-bottom: 8px; }

  .admin-actions { display: inline-flex; gap: 6px; margin-left: auto; }
  .edit-btn, .delete-btn { border-radius: 6px; width: 32px; height: 32px; cursor: pointer; }
  .edit-btn { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }
  .delete-btn { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

  .pay-summary { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 10px 0 12px; }
  .pay-chip { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; display: flex; flex-direction: column; min-width: 90px; }
  .pay-chip span { font-size: 10.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .pay-chip b { font-size: 13.5px; }
  .pay-chip.green { background: #ecfdf5; border-color: #a7f3d0; }
  .pay-chip.green b { color: #166534; }
  .pay-chip.red { background: #fef2f2; border-color: #fecaca; }
  .pay-chip.red b { color: #dc2626; }

  .pay-form { display: flex; gap: 10px; flex-wrap: wrap; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px; align-items: center; }

  .ph-title { font-size: 12.5px; font-weight: 800; color: #475569; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }

  @media (max-width: 900px) {
    .at-form-grid { grid-template-columns: repeat(2,1fr); }
    .at-fg--span3 { grid-column: span 2; }
  }
  @media (max-width: 600px) {
    .at-form-grid, .at-form-grid--2 { grid-template-columns: 1fr; }
    .at-fg--span3 { grid-column: auto; }
    .at-header { align-items: flex-start; }
    .at-header > .at-btn { width: 100%; justify-content: center; }
    .at-form-actions { flex-direction: column-reverse; }
    .at-form-actions .at-btn { width: 100%; justify-content: center; }
    .at-totals-box { width: 100%; text-align: left; }
    .bill-header-left strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pay-summary .pay-chip { flex: 1 1 calc(50% - 10px); min-width: 0; }
  }
`;