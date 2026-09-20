import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { BRANCH_LABELS } from "../utils/branchNames";

// ─── COMPANY & BANK DETAILS ──────────────────────────────────────────────────
const COMPANY = {
  name: "BIP FENCING CONTRACT WORK",
  address: "NO. 26/A, MAIN ROAD, PAMBANKULAM, KALANTHAPANAI, PANAGUDI - 627109",
  gst: "33ABLPI5244C1Z1",
  state: "Tamil Nadu",
  stateCode: "33",
  phone: "9655072445",
};

const DEFAULT_BANK = {
  holderName: "BIP FENCING CONTRACT WORK",
  bankName: "CANARA BANK",
  accountNo: "120017946948",
  ifsc: "CNRB0003657",
  branch: "THERKU VALLIOOR",
};

const DECLARATION =
  "We declare that this quotation shows the actual price of the goods described and that all particulars are true and correct.";

// ─── LOGO (Base64) ─────────────────────────────────────────────────────────
const BIP_LOGO_B64 =
  "data:image/jpeg;base64,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";

// ─── UTILITIES ──────────────────────────────────────────────────────────────
const fmt2 = (n) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const inr = (v) => `₹ ${fmt2(v)}`;

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

// Round-off: blank → auto (nearest rupee), otherwise the typed value
const resolveRoundOff = (manual, amount) =>
  manual !== "" && manual != null && !isNaN(parseFloat(manual))
    ? parseFloat(manual)
    : Math.round(amount) - amount;

const _ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const _tens = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];
function numToWords(n) {
  const num = Math.round(n);
  if (num === 0) return "Zero";
  if (num < 0) return "Minus " + numToWords(-num);
  if (num < 20) return _ones[num];
  if (num < 100)
    return _tens[Math.floor(num / 10)] + (num % 10 ? " " + _ones[num % 10] : "");
  if (num < 1000)
    return (
      _ones[Math.floor(num / 100)] +
      " Hundred" +
      (num % 100 ? " " + numToWords(num % 100) : "")
    );
  if (num < 100000)
    return (
      numToWords(Math.floor(num / 1000)) +
      " Thousand" +
      (num % 1000 ? " " + numToWords(num % 1000) : "")
    );
  if (num < 10000000)
    return (
      numToWords(Math.floor(num / 100000)) +
      " Lakh" +
      (num % 100000 ? " " + numToWords(num % 100000) : "")
    );
  return (
    numToWords(Math.floor(num / 10000000)) +
    " Crore" +
    (num % 10000000 ? " " + numToWords(num % 10000000) : "")
  );
}
function amountInWords(amount) {
  const n = Math.round(amount * 100);
  const rupees = Math.floor(n / 100);
  const paise = n % 100;
  return paise > 0
    ? "INR " + numToWords(rupees) + " and " + numToWords(paise) + " Paise Only"
    : "INR " + numToWords(rupees) + " Only";
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const B = "1px solid #000";
const sectionHead = {
  fontWeight: "bold",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  marginBottom: 2,
  borderBottom: "1px dashed #999",
  paddingBottom: 1,
};

const PRINT_STYLES = `
@media print {
  html, body {
    width: 210mm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body * { visibility: hidden !important; }
  #qt-print-area, #qt-print-area * { visibility: visible !important; }
  #qt-print-area {
    position: absolute !important;
    top: 0 !important; left: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border: 2px solid #000 !important;
    -webkit-box-decoration-break: clone !important;
    box-decoration-break: clone !important;
  }
  .qt-no-print { display: none !important; }
  table { border-collapse: collapse !important; }
  .inv-product-row { page-break-inside: avoid; }
  .inv-footer { page-break-inside: avoid; }
  .inv-thead { display: table-header-group !important; }
  @page { size: A4 portrait; margin: 5mm; }
}
`;

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

  .at-form-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
  .at-form-grid--2 { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
  .at-fg { display: flex; flex-direction: column; gap: 6px; }
  .at-fg--span2 { grid-column: span 2; }
  .at-label { font-size: 12px; font-weight: 700; color: #374151; }
  .at-label .req { color: #ef4444; }
  .at-input, .at-select { height: 38px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13.5px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; font-family: inherit; }
  textarea.at-input { height: auto; padding: 9px 11px; resize: vertical; }
  .at-input:focus, .at-select:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
  .at-input[readonly], .at-input:disabled { background: #f1f5f9; color: #475569; font-weight: 600; cursor: not-allowed; }
  .at-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; cursor: pointer; }

  .at-alert { display: flex; align-items: flex-start; gap: 10px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 10px; padding: 12px 16px; font-size: 13px; margin-bottom: 18px; }
  .at-alert i { margin-top: 2px; flex-shrink: 0; }

  .at-table-wrap { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow-x: auto; margin-bottom: 16px; }
  .at-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 780px; }
  .at-table thead tr { background: #f8fafc; }
  .at-table th { padding: 10px 8px; text-align: left; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
  .at-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .at-table tbody tr:last-child td { border-bottom: none; }
  .at-table tbody tr:hover td { background: #f9fdfb; }
  .at-input-t, .at-select-t { height: 34px; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 0 8px; font-size: 12.5px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; font-family: inherit; }
  .at-input-t:focus, .at-select-t:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 2px rgba(0,139,62,.1); }
  .at-select-t { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; padding-right: 24px; cursor: pointer; }
  .at-remove-btn { width: 30px; height: 30px; border-radius: 7px; border: 1.5px solid #fca5a5; background: #fee2e2; color: #dc2626; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
  .at-remove-btn:hover:not(:disabled) { background: #fecaca; }
  .at-remove-btn:disabled { opacity: .4; cursor: not-allowed; }

  .at-totals-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .at-totals-box { background: #f8fbff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; font-size: 13px; text-align: right; min-width: 260px; }
  .at-totals-box .muted { color: #64748b; font-size: 12px; margin-top: 2px; }
  .at-totals-box .net { font-size: 17px; font-weight: 800; color: #008b3e; margin-top: 6px; }

  .at-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; margin-bottom: 40px; }

  @media (max-width: 900px) {
    .at-form-grid { grid-template-columns: 1fr 1fr; }
    .at-fg--span2 { grid-column: span 2; }
  }
  @media (max-width: 600px) {
    .at-form-grid, .at-form-grid--2 { grid-template-columns: 1fr; }
    .at-fg--span2 { grid-column: auto; }
    .at-header { align-items: flex-start; }
    .at-header > .at-btn { width: 100%; justify-content: center; }
    .at-form-actions { flex-direction: column-reverse; }
    .at-form-actions .at-btn { width: 100%; justify-content: center; }
    .at-totals-box { width: 100%; text-align: left; }
  }
`;

// ─── UNIT MAP ──────────────────────────────────────────────────────────────
const UNIT_MAP = {
  Pcs: "NOS", Pieces: "NOS",
  Kg: "KGS", Kgs: "KGS", Kilogram: "KGS", Kilograms: "KGS",
  Meter: "MTR", Meters: "MTR",
  Roll: "RFT",
  Box: "SET", Set: "SET", Sets: "SET",
  Liter: "LTR", Litre: "LTR",
  Nos: "NOS", Number: "NOS", No: "NOS",
};

const UNITS = ["NOS", "KGS", "MTR", "SQM", "RFT", "SET", "PCS", "LTR", "FEET"];

const emptyItem = () => ({
  description: "",
  hsn: "",
  dueOn: "",
  unit: "NOS",
  qty: 1,
  rateIncl: 0,
});

const emptyForm = () => ({
  quoteNo: "",
  quoteDate: new Date().toISOString().split("T")[0],
  validUntil: "",
  poNo: "",
  dispatchedThrough: "",
  vehicleNo: "",
  otherRef: "",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  clientGst: "",
  clientAddress: "",
  clientState: "Tamil Nadu",
  clientStateCode: "33",
  shipName: "",
  shipAddress: "",
  shipGst: "",
  shipState: "Tamil Nadu",
  shipStateCode: "33",
  discount: 0,
  manualRoundOff: "",
  priceUnit: "NOS",
  unitQty: "",
  isGst: true,
  taxPercent: 18,
  notes: "",
  declaration: DECLARATION,
  bankHolderName: DEFAULT_BANK.holderName,
  bankName: DEFAULT_BANK.bankName,
  bankAccountNo: DEFAULT_BANK.accountNo,
  bankIfsc: DEFAULT_BANK.ifsc,
  bankBranch: DEFAULT_BANK.branch,
  items: [emptyItem()],
});

// ─── ONE formula used by form, list & bill ─────────────────────────────────
// rate is entered WITHOUT tax; discount then GST are applied on top.
const calcTotals = (items, discount, tax, manualRound) => {
  const subtotal = items.reduce(
    (s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rateIncl) || 0),
    0,
  );
  const discountAmt = subtotal * ((parseFloat(discount) || 0) / 100);
  const taxable = subtotal - discountAmt;
  const taxAmt = taxable * ((parseFloat(tax) || 0) / 100);
  const cgst = taxAmt / 2;
  const sgst = taxAmt / 2;
  const roundOff = resolveRoundOff(manualRound, taxable + taxAmt);
  const grandTotal = taxable + taxAmt + roundOff;
  return { subtotal, discountAmt, taxable, taxAmt, cgst, sgst, roundOff, grandTotal };
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function Quotation() {
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState("table");
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [sameAsClient, setSameAsClient] = useState(true);
  const [products, setProducts] = useState([]);
  const [previewRec, setPreviewRec] = useState(null);
  const [gstRates, setGstRates] = useState([18, 12, 5, 28, 0]);

  useEffect(() => {
    fetchQuotations();
    fetchProducts();
  }, []);

  // ── Arrived from Clients page "View"/"Continue" button ────────────────
  useEffect(() => {
    const { viewQuoteId, continueQuoteId } = location.state || {};
    if (!viewQuoteId && !continueQuoteId) return;
    (async () => {
      try {
        if (continueQuoteId) await handleEdit({ id: continueQuoteId });
        else if (viewQuoteId) await handleViewBill({ id: viewQuoteId });
      } finally {
        navigate(location.pathname, { replace: true, state: {} });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNextQuoteNo = async () => {
    try {
      const res = await apiFetch(`/quotation_api.php?all_branches=1&_=${Date.now()}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      let max = 0;
      list.forEach((r) => {
        const m = String(r.quote_no || "").match(/(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return `BIP-QT-${String(max + 1).padStart(3, "0")}`;
    } catch (_) {
      return "BIP-QT-001";
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await apiFetch("/products.php?all_branches=1");
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch (_) {}
  };

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/quotation_api.php?_=${Date.now()}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleQuotation = async (id) => {
    const res = await apiFetch(`/quotation_api.php?id=${id}&_=${Date.now()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const T = calcTotals(
    form.items,
    form.discount,
    form.isGst ? form.taxPercent : 0,
    form.manualRoundOff,
  );

  // ── Central customer database: phone is the key ─────────────
  const [customerStatus, setCustomerStatus] = useState({ state: "", name: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const lookupCustomerByPhone = async (phone) => {
    const key = String(phone || "").replace(/\D/g, "").slice(-10);
    if (key.length !== 10) {
      setCustomerStatus({ state: "", name: "" });
      return;
    }
    try {
      const res = await apiFetch(`/client.php?phone=${key}`);
      const data = await res.json();
      if (data.found && data.client) {
        const c = data.client;
        setForm((prev) => ({
          ...prev,
          clientName: c.name || prev.clientName,
          clientAddress: c.address || prev.clientAddress,
          clientGst: c.gst || prev.clientGst,
          clientState: c.state || prev.clientState,
          clientStateCode: c.state_code || prev.clientStateCode,
          clientEmail: c.email || prev.clientEmail,
        }));
        setCustomerStatus({ state: "found", name: c.name || "" });
      } else {
        setCustomerStatus({ state: "new", name: "" });
      }
    } catch (_) {
      setCustomerStatus({ state: "", name: "" });
    }
  };

  const saveClientAsCustomer = async () => {
    if (!form.clientName.trim()) {
      alert("⚠️ Enter the customer name first.");
      return;
    }
    setSavingCustomer(true);
    try {
      const res = await apiFetch("/client.php?action=save_customer", {
        method: "POST",
        body: JSON.stringify({
          name: form.clientName,
          phone: form.clientPhone,
          address: form.clientAddress,
          gst: form.clientGst,
          state: form.clientState,
          state_code: form.clientStateCode,
          email: form.clientEmail,
        }),
      });
      const data = await res.json();
      if (data.success) setCustomerStatus({ state: "found", name: form.clientName });
      else alert("⚠️ " + (data.message || "Could not save the customer."));
    } catch (_) {
      alert("⚠️ Server error while saving the customer.");
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleItemChange = (i, field, value) =>
    setForm((prev) => {
      const items = [...prev.items];
      items[i] = { ...items[i], [field]: value };
      return { ...prev, items };
    });

  const handleProductSelect = (i, product) =>
    setForm((prev) => {
      const items = [...prev.items];
      items[i] = product
        ? {
            ...items[i],
            description: product.product_name,
            hsn: product.hsn || product.sku || "",
            unit: UNIT_MAP[product.unit] || "NOS",
            rateIncl: parseFloat(product.selling_price) || 0,
          }
        : { ...items[i], description: "" };
      return { ...prev, items };
    });

  const addItem = () =>
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  const removeItem = (i) =>
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
    setSameAsClient(true);
  };

  const copyClientToShip = () => {
    setForm((prev) => ({
      ...prev,
      shipName: prev.clientName,
      shipAddress: prev.clientAddress,
      shipGst: prev.clientGst,
      shipState: prev.clientState,
      shipStateCode: prev.clientStateCode,
    }));
    setSameAsClient(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.quoteNo || !form.quoteDate || !form.clientName || form.items.length === 0) {
      alert("Fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const payload = editId ? { ...form, id: editId } : form;
      const res = await apiFetch("/quotation_api.php", {
        method,
        body: JSON.stringify(payload),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = { message: `Server returned ${res.status}` };
      }
      if (res.ok) {
        alert(data.message || "Saved");
        const savedId = editId || data.id;
        resetForm();
        await fetchQuotations();
        // Show the fresh bill straight away so the update is visible
        if (savedId) await handleViewBill({ id: savedId });
        else setView("table");
      } else {
        alert(data.message || "Save failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (rec) => {
    try {
      const data = await fetchSingleQuotation(rec.id);
      setForm({
        ...emptyForm(),
        quoteNo: data.quote_no,
        quoteDate: String(data.quote_date || "").slice(0, 10),
        validUntil: data.valid_until ? String(data.valid_until).slice(0, 10) : "",
        poNo: data.po_no || "",
        dispatchedThrough: data.dispatched_through || "",
        vehicleNo: data.vehicle_no || "",
        otherRef: data.other_ref || "",
        clientName: data.client_name,
        clientPhone: data.client_phone || "",
        clientEmail: data.client_email || "",
        clientGst: data.client_gst || "",
        clientAddress: data.client_address || "",
        clientState: data.client_state || "Tamil Nadu",
        clientStateCode: data.client_state_code || "33",
        shipName: data.ship_name || "",
        shipAddress: data.ship_address || "",
        shipGst: data.ship_gst || "",
        shipState: data.ship_state || "Tamil Nadu",
        shipStateCode: data.ship_state_code || "33",
        discount: data.discount_percent ?? 0,
        isGst: data.is_gst == null ? true : !!Number(data.is_gst),
        taxPercent: data.tax_percent ?? 18,
        manualRoundOff: data.round_off ?? "",
        notes: data.notes || "",
        declaration: data.declaration || DECLARATION,
        unitQty: data.unit_qty ?? "",
        priceUnit: data.price_unit || "NOS",
        items: data.items?.length
          ? data.items.map((i) => ({
              description: i.description,
              hsn: i.hsn || "",
              dueOn: i.due_on || "",
              unit: i.unit || "NOS",
              qty: parseFloat(i.quantity) || 0,
              rateIncl: parseFloat(i.rate) || 0,
            }))
          : [emptyItem()],
      });
      if (data.tax_percent != null) {
        const t = parseFloat(data.tax_percent);
        setGstRates((r) => (r.includes(t) ? r : [...r, t].sort((a, b) => a - b)));
      }
      setSameAsClient(!data.ship_name && !data.ship_address);
      setEditId(rec.id);
      setView("form");
    } catch (err) {
      alert("Could not load quotation");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await apiFetch(`/quotation_api.php?id=${deleteId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchQuotations();
      } else alert(data.message || "Delete failed");
    } catch (err) {
      alert("Server error");
    } finally {
      setDeleteId(null);
    }
  };

  const handleViewBill = async (rec) => {
    try {
      const data = await fetchSingleQuotation(rec.id);
      setPreviewRec(data);
      setView("preview");
      window.scrollTo(0, 0);
    } catch (err) {
      alert("Could not load bill");
    }
  };

  const filtered = records.filter(
    (r) =>
      (r.client_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.quote_no || "").toLowerCase().includes(search.toLowerCase()),
  );

  const summary = filtered.reduce(
    (a, r) => {
      a.subtotal += Number(r.subtotal) || 0;
      a.discount += Number(r.discount_amount) || 0;
      a.revenue += Number(r.grand_total) || 0;
      return a;
    },
    { subtotal: 0, discount: 0, revenue: 0 },
  );

  // ─── RENDER: PREVIEW ──────────────────────────────────────────────────────
  if (view === "preview" && previewRec) {
    const d = previewRec;
    const isGst = d.is_gst == null ? true : !!Number(d.is_gst);
    const disc = parseFloat(d.discount_percent) || 0;
    const tax = isGst ? parseFloat(d.tax_percent) || 0 : 0;
    const rows = (d.items || []).map((i) => ({
      ...i,
      qty: parseFloat(i.quantity) || 0,
      rate: parseFloat(i.rate) || 0,
    }));

    // Same formula as the form and the list
    const P = calcTotals(
      rows.map((r) => ({ qty: r.qty, rateIncl: r.rate })),
      disc,
      tax,
      d.round_off,
    );
    const taxable = P.taxable;
    const cgstRate = tax / 2;
    const sgstRate = tax / 2;
    const cgstAmt = P.cgst;
    const sgstAmt = P.sgst;
    const totalTax = P.taxAmt;
    const roundOff = P.roundOff;
    const netAmount = P.grandTotal;

    const hsnGroups = {};
    rows.forEach((r) => {
      const key = r.hsn || "–";
      const t = r.qty * r.rate * (1 - disc / 100);
      if (!hsnGroups[key]) hsnGroups[key] = { taxable: 0, cgst: 0, sgst: 0 };
      hsnGroups[key].taxable += t;
      hsnGroups[key].cgst += t * (cgstRate / 100);
      hsnGroups[key].sgst += t * (sgstRate / 100);
    });

    const dynFont = rows.length <= 10 ? 11 : rows.length <= 20 ? 12 : rows.length <= 30 ? 11 : 10;
    const dynPad = rows.length <= 20 ? "3px 6px" : "2px 5px";

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

    const MIN_ROWS = rows.length >= 15 ? 0 : Math.max(0, 15 - rows.length);

    const topBtn = {
      padding: "8px 20px",
      borderRadius: 8,
      border: "1px solid #d0d7de",
      background: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    };
    const printBtn = {
      padding: "8px 20px",
      borderRadius: 8,
      border: "none",
      background: "#1a1a2e",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    };
    const actionBar = (extra) => (
      <div
        className="qt-no-print"
        style={{ display: "flex", justifyContent: "center", gap: 12, ...extra }}
      >
        <button onClick={() => setView("table")} style={topBtn}>
          ← Back to List
        </button>
        <button onClick={() => handleEdit({ id: d.id })} style={topBtn}>
          ✏️ Edit
        </button>
        <button onClick={() => window.print()} style={printBtn}>
          🖨️ Print Quotation
        </button>
        <button onClick={() => sendWhatsApp(d)} style={waBtn}>
          🟢 WhatsApp
        </button>
      </div>
    );
        const waBtn = {
      padding: "8px 20px",
      borderRadius: 8,
      border: "none",
      background: "#25D366",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    };

    const sendWhatsApp = async (d) => {
      const phone = (d.client_phone || "").replace(/\D/g, "");
      const html2canvas = (await import("html2canvas")).default;
      const node = document.getElementById("qt-print-area");
      const canvas = await html2canvas(node, { scale: 2 });
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `${d.quote_no}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `Quotation ${d.quote_no}` });
        } else {
          window.open(`https://wa.me/${phone}?text=Quotation ${d.quote_no}`, "_blank");
        }
      });
    };

    const uq = Number(d.unit_qty ?? 0);
    const pu = d.price_unit || "NOS";

    return (
      <>
        <style>{PRINT_STYLES}</style>

        {actionBar({ padding: "16px 0", background: "#f6f8fa" })}

        <div
          id="qt-print-area"
          style={{
            width: "210mm",
            minHeight: "297mm",
            margin: "0 auto 30px",
            padding: "8mm",
            fontFamily: "'Times New Roman', Times, serif",
            color: "#000",
            background: "#fff",
            border: "2px solid #000",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "2px 8px",
              fontWeight: "bold",
              fontSize: 14,
              borderBottom: B,
            }}
          >
            ESTIMATE
          </div>

          {/* HEADER */}
          <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: B }}>
            <tbody>
              <tr>
                <td style={{ width: 80, borderRight: B, padding: "4px", textAlign: "center", verticalAlign: "middle" }}>
                  <img
                    src={BIP_LOGO_B64}
                    alt="BIP Fencing"
                    style={{ width: 68, height: 68, objectFit: "contain", display: "block", margin: "0 auto" }}
                  />
                </td>
                <td style={{ padding: "4px 10px", textAlign: "center", verticalAlign: "middle" }}>
                  <div style={{ fontSize: 24, fontWeight: "bold", letterSpacing: 1.5, textTransform: "uppercase" }}>
                    {COMPANY.name}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 1 }}>{COMPANY.address}</div>
                  {isGst && (
                    <div style={{ fontSize: 10 }}>
                      GSTIN/UIN: <strong>{COMPANY.gst}</strong>&nbsp;&nbsp;State: {COMPANY.state}, Code:{" "}
                      {COMPANY.stateCode}
                    </div>
                  )}
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
                  <div style={{ fontWeight: "bold", fontSize: 16 }}>{d.ship_name || d.client_name}</div>
                  <div style={{ fontSize: 14 }}>{d.ship_address || d.client_address}</div>
                  <div style={{ fontSize: 14 }}>
                    State Name: {d.ship_state || d.client_state || "Tamil Nadu"}, Code:{" "}
                    {d.ship_state_code || d.client_state_code || "33"}
                  </div>
                </td>
                <td style={{ padding: "6px 7px", verticalAlign: "top" }}>
                  {[
                    ["Quotation No.", d.quote_no],
                    ["Date", formatDate(d.quote_date)],
                    ["Valid Until", d.valid_until ? formatDate(d.valid_until) : ""],
                    ["PO/Order No.", d.po_no],
                    ["Dispatched Through", d.dispatched_through],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div key={label} style={{ display: "flex", marginBottom: 2 }}>
                        <span style={{ minWidth: 130, whiteSpace: "nowrap", fontSize: 13 }}>{label}</span>
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
                  <div style={{ fontWeight: "bold", fontSize: 16 }}>{d.client_name}</div>
                  <div style={{ fontSize: 14 }}>{d.client_address}</div>
                  {d.client_phone && <div style={{ fontSize: 14 }}>Ph: {d.client_phone}</div>}
                  {d.client_email && <div style={{ fontSize: 14 }}>Email: {d.client_email}</div>}
                  {isGst && d.client_gst && <div style={{ fontSize: 14 }}>GSTIN/UIN: {d.client_gst}</div>}
                  <div style={{ fontSize: 14 }}>
                    State Name: {d.client_state || "Tamil Nadu"}, Code: {d.client_state_code || "33"}
                  </div>
                </td>
                <td style={{ padding: "6px 7px", verticalAlign: "top" }}>
                  {[
                    ["Payment", "Credit"],
                    ["Transport", d.dispatched_through],
                    ["Vehicle No.", d.vehicle_no],
                    ["Other Ref.", d.other_ref],
                    ["Discount", disc ? `${disc}%` : ""],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div key={label} style={{ display: "flex", marginBottom: 2 }}>
                        <span style={{ minWidth: 95, whiteSpace: "nowrap", fontSize: 14 }}>{label}</span>
                        <span style={{ fontWeight: "bold", fontSize: 14 }}> : {value}</span>
                      </div>
                    ))}
                </td>
              </tr>
            </tbody>
          </table>

          {/* PRODUCT TABLE */}
          <div style={{ flex: 1 }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderTop: B, borderBottom: B }}
            >
              <colgroup>
                <col style={{ width: "10%" }} />
                <col style={{ width: "70%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead className="inv-thead">
                <tr>
                  {[
                    ["Sl\nNo.", "center"],
                    ["Description of Goods", "left"],
                    ["Amount", "right"],
                  ].map(([label, align]) => (
                    <th key={label} style={dhc({ textAlign: align, whiteSpace: "pre-line", padding: dynPad })}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="inv-product-row">
                    <td style={dc({ textAlign: "center" })}>{i + 1}</td>
                    <td style={dc({ fontWeight: "bold", fontSize: 14 })}>{r.description}</td>
                    <td style={dc({ textAlign: "right" })}>
                      {fmt2(r.qty * r.rate * (1 - disc / 100))}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: MIN_ROWS }).map((_, i) => (
                  <tr key={`blank_${i}`} style={{ height: 18 }}>
                    {[0, 1, 2].map((j) => (
                      <td key={j} style={dc()}>
                        &nbsp;
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B })}>
                    Total Taxable Amount
                  </td>
                  <td style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B })}>{fmt2(taxable)}</td>
                </tr>
                {isGst && (
                  <>
                    <tr>
                      <td colSpan={2} style={dc({ textAlign: "right", fontStyle: "italic", fontWeight: "bold", borderTop: B })}>
                        CGST TAX
                      </td>
                      <td style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B })}>{fmt2(cgstAmt)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={dc({ textAlign: "right", fontStyle: "italic", fontWeight: "bold" })}>
                        SGST TAX
                      </td>
                      <td style={dc({ textAlign: "right", fontWeight: "bold" })}>{fmt2(sgstAmt)}</td>
                    </tr>
                  </>
                )}
                {Math.abs(roundOff) >= 0.005 && (
                  <tr>
                    <td colSpan={2} style={dc({ textAlign: "right", fontStyle: "italic", fontWeight: "bold" })}>
                      ROUNDING OFF
                    </td>
                    <td style={dc({ textAlign: "right", fontWeight: "bold" })}>
                      {roundOff >= 0 ? "(+) " : "(-) "}
                      {fmt2(Math.abs(roundOff))}
                    </td>
                  </tr>
                )}
                <tr style={{ background: "#f0f0f0" }}>
                  <td style={dc({ borderTop: B, borderBottom: B })}></td>
                  <td style={dc({ fontWeight: "bold", borderTop: B, borderBottom: B, fontSize: dynFont + 1 })}>
                    Total
                  </td>
                  <td
                    style={dc({ textAlign: "right", fontWeight: "bold", borderTop: B, borderBottom: B, fontSize: dynFont + 3 })}
                  >
                    ₹ {fmt2(netAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* UNIT PRICE LINE */}
          {uq > 0 && (
            <div style={{ padding: "8px 8px 0", fontSize: 18, fontWeight: "bold", color: "#333" }}>
              {uq} {pu} — ₹{fmt2(netAmount / uq)} per {pu}
            </div>
          )}

          {/* AMOUNT IN WORDS */}
          <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: B }}>
            <tbody>
              <tr>
                <td style={{ width: "58%", borderRight: B, padding: "3px 7px", verticalAlign: "middle", fontSize: 10 }}>
                  <span style={{ fontWeight: "bold" }}>Amount Chargeable (in words): </span>
                  <em style={{ fontWeight: "bold" }}>{amountInWords(netAmount)}</em>
                </td>
                <td style={{ padding: "3px 7px", verticalAlign: "middle", textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: "bold" }}>₹ {fmt2(netAmount)}</div>
                  <div style={{ fontSize: 10 }}>E. &amp; O.E</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* HSN TAX TABLE */}
          {isGst && (
            <table
              style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", borderBottom: B }}
              className="inv-footer"
            >
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
                    <th
                      key={label}
                      style={dhc({ textAlign: align, whiteSpace: "pre-line", padding: "2px 6px", fontSize: 10 })}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(hsnGroups).map(([hsn, g]) => (
                  <tr key={hsn}>
                    <td style={dc({ textAlign: "center", fontSize: 11 })}>{hsn}</td>
                    <td style={dc({ textAlign: "right", fontSize: 11 })}>{fmt2(g.taxable)}</td>
                    <td style={dc({ textAlign: "center", fontSize: 10 })}>{cgstRate}%</td>
                    <td style={dc({ textAlign: "right", fontSize: 10 })}>{fmt2(g.cgst)}</td>
                    <td style={dc({ textAlign: "center", fontSize: 10 })}>{sgstRate}%</td>
                    <td style={dc({ textAlign: "right", fontSize: 10 })}>{fmt2(g.sgst)}</td>
                    <td style={dc({ textAlign: "right", fontSize: 10 })}>{fmt2(g.cgst + g.sgst)}</td>
                  </tr>
                ))}
                <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
                  <td style={dc({ borderTop: B, borderBottom: B, fontSize: 10 })}>Total</td>
                  <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(taxable)}</td>
                  <td style={dc({ borderTop: B, borderBottom: B })}></td>
                  <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(cgstAmt)}</td>
                  <td style={dc({ borderTop: B, borderBottom: B })}></td>
                  <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(sgstAmt)}</td>
                  <td style={dc({ textAlign: "right", borderTop: B, borderBottom: B, fontSize: 10 })}>{fmt2(totalTax)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {isGst && (
            <div style={{ padding: "2px 7px", borderBottom: B, fontSize: 10 }}>
              <strong>Tax Amount (in words):</strong>&nbsp;
              <em style={{ fontWeight: "bold" }}>{amountInWords(totalTax)}</em>
            </div>
          )}

          {/* FOOTER */}
          <div style={{ marginTop: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }} className="inv-footer">
              <tbody>
                <tr>
                  <td style={{ width: "44%", borderRight: B, padding: "4px 7px", verticalAlign: "top", fontSize: 10 }}>
                    <div style={{ fontWeight: "bold", marginBottom: 2, fontSize: 15 }}>Company's Bank Details</div>
                    {[
                      ["A/c Holder's Name", d.bank_holder_name || DEFAULT_BANK.holderName],
                      ["Bank Name", d.bank_name || DEFAULT_BANK.bankName],
                      ["A/c No.", d.bank_account_no || DEFAULT_BANK.accountNo],
                      [
                        "Branch & IFS Code",
                        `${d.bank_branch || DEFAULT_BANK.branch} & ${d.bank_ifsc || DEFAULT_BANK.ifsc}`,
                      ],
                    ].map(([k, v]) => (
                      <div key={k} style={{ marginBottom: 2, fontSize: 12 }}>
                        <strong>{k}</strong>: {v}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: "4px 7px", verticalAlign: "top" }}>
                    {d.notes && (
                      <div style={{ fontSize: 10, marginBottom: 4 }}>
                        <strong>Terms:</strong> {d.notes}
                      </div>
                    )}
                    <div style={{ fontSize: 9, marginBottom: 4 }}>
                      <strong>Declaration:</strong> {d.declaration || DECLARATION}
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
                      This is a Computer Generated Quotation
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {actionBar({ paddingBottom: 30 })}
      </>
    );
  }

  // ─── RENDER: TABLE ───────────────────────────────────────────────────────
  if (view === "table") {
    return (
      <>
        <style>{screenStyles}</style>
        <div className="at-root">
          <div className="at-header">
            <div className="at-header__left">
              <div className="at-header__icon">
                <i className="bi bi-file-earmark-text"></i>
              </div>
              <div>
                <h1 className="at-header__title">Quotations</h1>
                <p className="at-header__sub">BIP Fencing – Quotation / Estimate Manager</p>
              </div>
            </div>
            <button
              type="button"
              className="at-btn at-btn--primary"
              onClick={async () => {
                const no = await fetchNextQuoteNo();
                setEditId(null);
                setSameAsClient(true);
                setForm({ ...emptyForm(), quoteNo: no });
                setView("form");
              }}
            >
              <i className="bi bi-plus-lg"></i> New Quotation
            </button>
          </div>

          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-search"></i>
              <span>Search</span>
            </div>
            <input
              className="at-input"
              placeholder="Search by client name or quote no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 340 }}
            />
          </div>

          <div className="at-form-grid" style={{ marginBottom: 20 }}>
            {[
              ["Total Quotes", filtered.length],
              ["Total Subtotal", inr(summary.subtotal)],
              ["Total Discount", inr(summary.discount)],
              ["Total Revenue", inr(summary.revenue)],
            ].map(([label, value]) => (
              <div className="at-card" key={label} style={{ marginBottom: 0, padding: 16 }}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                  {label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: "#008b3e" }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-list-ul"></i>
              <span>All Quotations</span>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Loading…</div>
            ) : (
              <div className="at-table-wrap">
                <table className="at-table">
                  <thead>
                    <tr>
                      <th>Quote No</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Valid Until</th>
                      <th>Items</th>
                      <th>Discount</th>
                      <th>Tax</th>
                      <th>Grand Total</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rec) => (
                      <tr key={rec.id}>
                        <td style={{ fontWeight: 700, color: "#008b3e" }}>{rec.quote_no}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{rec.client_name}</div>
                          {rec.client_phone && (
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>{rec.client_phone}</div>
                          )}
                        </td>
                        <td>{formatDate(rec.quote_date)}</td>
                        <td>{rec.valid_until ? formatDate(rec.valid_until) : "—"}</td>
                        <td>{rec.items_count || 0} items</td>
                        <td style={{ color: "#dc2626" }}>{inr(rec.discount_amount)}</td>
                        <td>{Number(rec.is_gst) === 0 ? "—" : inr(rec.tax_amount)}</td>
                        <td style={{ color: "#008b3e", fontWeight: 700 }}>{inr(rec.grand_total)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <button
                              className="at-btn at-btn--ghost"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                              onClick={() => handleViewBill(rec)}
                            >
                              <i className="bi bi-eye"></i> View
                            </button>
                            <button
                              className="at-btn at-btn--ghost"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                              onClick={() => handleEdit(rec)}
                            >
                              <i className="bi bi-pencil"></i> Edit
                            </button>
                            <button
                              className="at-btn at-btn--ghost"
                              style={{ padding: "6px 12px", fontSize: 12 }}
                              onClick={() => handleViewBill(rec)}
                            >
                              <i className="bi bi-printer"></i> Print
                            </button>
                            <button
                              className="at-btn at-btn--ghost"
                              style={{ padding: "6px 12px", fontSize: 12, color: "#dc2626", borderColor: "#fca5a5" }}
                              onClick={() => setDeleteId(rec.id)}
                            >
                              <i className="bi bi-trash"></i> Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                          No quotations found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {deleteId && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setDeleteId(null)}
            >
              <div
                className="at-card"
                style={{ maxWidth: 380, textAlign: "center", marginBottom: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: "2rem", marginBottom: 8, color: "#dc2626" }}>
                  <i className="bi bi-trash3-fill"></i>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Delete Quotation?</div>
                <div style={{ color: "#64748b", margin: "8px 0 20px" }}>This action cannot be undone.</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button className="at-btn at-btn--ghost" onClick={() => setDeleteId(null)}>
                    Cancel
                  </button>
                  <button
                    className="at-btn at-btn--primary"
                    style={{ background: "#dc2626", boxShadow: "none" }}
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ─── RENDER: FORM ────────────────────────────────────────────────────────
  return (
    <>
      <style>{screenStyles}</style>
      <div className="at-root">
        <div className="at-header">
          <div className="at-header__left">
            <div className="at-header__icon">
              <i className="bi bi-file-earmark-text"></i>
            </div>
            <div>
              <h1 className="at-header__title">{editId ? "Edit Quotation" : "New Quotation"}</h1>
              <p className="at-header__sub">BIP Fencing – Quotation / Estimate Generator</p>
            </div>
          </div>
          <button
            type="button"
            className="at-btn at-btn--ghost"
            onClick={() => {
              resetForm();
              setView("table");
            }}
          >
            <i className="bi bi-arrow-left"></i> Back to List
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Quotation Details */}
          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-sliders"></i>
              <span>Quotation Details</span>
            </div>
            <div className="at-form-grid">
              <div className="at-fg">
                <label className="at-label">
                  Quote No <span className="req">*</span>
                </label>
                <input name="quoteNo" value={form.quoteNo} onChange={handleChange} className="at-input" required />
              </div>
              <div className="at-fg">
                <label className="at-label">
                  Quote Date <span className="req">*</span>
                </label>
                <input
                  type="date"
                  name="quoteDate"
                  value={form.quoteDate}
                  onChange={handleChange}
                  className="at-input"
                  required
                />
              </div>
              <div className="at-fg">
                <label className="at-label">Valid Until</label>
                <input type="date" name="validUntil" value={form.validUntil} onChange={handleChange} className="at-input" />
              </div>
              <div className="at-fg">
                <label className="at-label">PO / Order No.</label>
                <input name="poNo" value={form.poNo} onChange={handleChange} className="at-input" />
              </div>
              <div className="at-fg">
                <label className="at-label">Dispatched Through</label>
                <input
                  name="dispatchedThrough"
                  value={form.dispatchedThrough}
                  onChange={handleChange}
                  className="at-input"
                />
              </div>
              <div className="at-fg">
                <label className="at-label">Vehicle No.</label>
                <input name="vehicleNo" value={form.vehicleNo} onChange={handleChange} className="at-input" />
              </div>
              <div className="at-fg at-fg--span2">
                <label className="at-label">Other References</label>
                <input name="otherRef" value={form.otherRef} onChange={handleChange} className="at-input" />
              </div>
              <div className="at-fg">
                <label className="at-label">Discount %</label>
                <input
                  type="number"
                  name="discount"
                  value={form.discount}
                  onChange={handleChange}
                  className="at-input"
                  min="0"
                  step="any"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
              <div className="at-fg">
                <label className="at-label">GST Applicable?</label>
                <select
                  value={form.isGst ? "yes" : "no"}
                  onChange={(e) => setForm((p) => ({ ...p, isGst: e.target.value === "yes" }))}
                  className="at-select"
                >
                  <option value="yes">Yes — GST Bill</option>
                  <option value="no">No — Non-GST Bill</option>
                </select>
              </div>
              {form.isGst && (
                <div className="at-fg">
                  <label className="at-label">GST Rate %</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      name="taxPercent"
                      value={form.taxPercent}
                      onChange={handleChange}
                      className="at-select"
                      style={{ flex: 1 }}
                    >
                      {gstRates.map((r) => (
                        <option key={r} value={r}>
                          {r}% (CGST {r / 2}% + SGST {r / 2}%)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="at-input"
                      placeholder="New %"
                      style={{ width: 100 }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const v = parseFloat(e.target.value);
                        if (isNaN(v) || v < 0) return;
                        if (!gstRates.includes(v)) setGstRates([...gstRates, v].sort((a, b) => a - b));
                        setForm((p) => ({ ...p, taxPercent: v }));
                        e.target.value = "";
                      }}
                      onWheel={(e) => e.target.blur()}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Buyer */}
          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-person-badge"></i>
              <span>Buyer (Bill to) *</span>
            </div>
            <div className="at-form-grid">
              <div className="at-fg">
                <label className="at-label">
                  Customer Name <span className="req">*</span>
                </label>
                <input name="clientName" value={form.clientName} onChange={handleChange} className="at-input" required />
              </div>
              <div className="at-fg">
                <label className="at-label">Phone</label>
                <input
                  name="clientPhone"
                  value={form.clientPhone}
                  onChange={(e) => {
                    handleChange(e);
                    const key = e.target.value.replace(/\D/g, "").slice(-10);
                    if (key.length === 10) lookupCustomerByPhone(key);
                    else setCustomerStatus({ state: "", name: "" });
                  }}
                  onBlur={(e) => lookupCustomerByPhone(e.target.value)}
                  className="at-input"
                />
                {customerStatus.state === "found" && (
                  <small style={{ color: "#008b3e", fontSize: 12, fontWeight: 600 }}>
                    <i className="bi bi-check-circle"></i> Saved customer
                    {customerStatus.name ? `: ${customerStatus.name}` : ""}
                  </small>
                )}
                {customerStatus.state === "new" && (
                  <small style={{ color: "#6b7280", fontSize: 12 }}>
                    New number —{" "}
                    <button
                      type="button"
                      onClick={saveClientAsCustomer}
                      disabled={savingCustomer}
                      style={{
                        border: "none",
                        background: "none",
                        padding: 0,
                        color: "#008b3e",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {savingCustomer ? "saving…" : "save as customer"}
                    </button>
                  </small>
                )}
              </div>
              <div className="at-fg">
                <label className="at-label">Email</label>
                <input name="clientEmail" value={form.clientEmail} onChange={handleChange} className="at-input" />
              </div>
              {form.isGst && (
                <div className="at-fg">
                  <label className="at-label">GSTIN</label>
                  <input name="clientGst" value={form.clientGst} onChange={handleChange} className="at-input" />
                </div>
              )}
              <div className="at-fg">
                <label className="at-label">State</label>
                <input name="clientState" value={form.clientState} onChange={handleChange} className="at-input" />
              </div>
              <div className="at-fg">
                <label className="at-label">State Code</label>
                <input
                  name="clientStateCode"
                  value={form.clientStateCode}
                  onChange={handleChange}
                  className="at-input"
                />
              </div>
              <div className="at-fg at-fg--span2">
                <label className="at-label">Address</label>
                <input name="clientAddress" value={form.clientAddress} onChange={handleChange} className="at-input" />
              </div>
            </div>
          </div>

          {/* Consignee */}
          <div className="at-card">
            <div className="at-card__head" style={{ justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <i className="bi bi-truck"></i>Consignee (Ship to)
              </span>
              {sameAsClient ? (
                <button
                  type="button"
                  className="at-btn at-btn--primary"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={copyClientToShip}
                >
                  Same as Buyer →
                </button>
              ) : (
                <button
                  type="button"
                  className="at-btn at-btn--ghost"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={() => {
                    setSameAsClient(true);
                    setForm((p) => ({
                      ...p,
                      shipName: "",
                      shipAddress: "",
                      shipGst: "",
                      shipState: "Tamil Nadu",
                      shipStateCode: "33",
                    }));
                  }}
                >
                  Clear Ship-to
                </button>
              )}
            </div>
            {!sameAsClient ? (
              <div className="at-form-grid">
                <div className="at-fg at-fg--span2">
                  <label className="at-label">Name</label>
                  <input name="shipName" value={form.shipName} onChange={handleChange} className="at-input" />
                </div>
                <div className="at-fg">
                  <label className="at-label">Address</label>
                  <input name="shipAddress" value={form.shipAddress} onChange={handleChange} className="at-input" />
                </div>
                {form.isGst && (
                  <div className="at-fg">
                    <label className="at-label">GSTIN</label>
                    <input name="shipGst" value={form.shipGst} onChange={handleChange} className="at-input" />
                  </div>
                )}
                <div className="at-fg">
                  <label className="at-label">State</label>
                  <input name="shipState" value={form.shipState} onChange={handleChange} className="at-input" />
                </div>
                <div className="at-fg">
                  <label className="at-label">State Code</label>
                  <input name="shipStateCode" value={form.shipStateCode} onChange={handleChange} className="at-input" />
                </div>
              </div>
            ) : (
              <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                Ship-to same as Buyer. Click the button above to add a separate address.
              </p>
            )}
          </div>

          {/* Items */}
          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-box-seam"></i>
              <span>Items</span>
            </div>

            <div className="at-alert">
              <i className="bi bi-info-circle-fill"></i>
              <div>
                {products.length > 0 ? (
                  <>
                    <strong>{products.length} products</strong> in catalog — pick from the dropdown to auto-fill
                    HSN, unit &amp; rate. Enter rate <strong>without GST</strong>; GST is added on top. Stock is not
                    reduced.
                  </>
                ) : (
                  <>No products in catalog yet. Add products in Stock → Products to enable quick-fill.</>
                )}
              </div>
            </div>

            <div className="at-table-wrap">
              <table className="at-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th style={{ minWidth: 240 }}>Description</th>
                    <th style={{ width: 80 }}>HSN/SAC</th>
                    <th style={{ width: 110 }}>Due On</th>
                    <th style={{ width: 75 }}>Unit</th>
                    <th style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 100 }}>Rate (₹)</th>
                    <th style={{ width: 110 }}>Amount (₹)</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, i) => (
                    <ItemRow
                      key={i}
                      item={item}
                      idx={i}
                      products={products}
                      onChange={handleItemChange}
                      onProductSelect={handleProductSelect}
                      onRemove={removeItem}
                      canRemove={form.items.length > 1}
                      units={UNITS}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="at-totals-row">
              <button type="button" className="at-btn at-btn--primary" onClick={addItem}>
                <i className="bi bi-plus-lg"></i> Add Item
              </button>
              <div className="at-totals-box">
                <div>
                  Subtotal: <strong>₹ {fmt2(T.subtotal)}</strong>
                </div>
                {T.discountAmt > 0 && (
                  <div className="muted">
                    Discount ({form.discount}%): - ₹ {fmt2(T.discountAmt)}
                  </div>
                )}
                <div className="muted">Taxable Value: ₹ {fmt2(T.taxable)}</div>
                {form.isGst && (
                  <div className="muted">
                    CGST {Number(form.taxPercent) / 2}%: ₹ {fmt2(T.cgst)} | SGST {Number(form.taxPercent) / 2}%: ₹{" "}
                    {fmt2(T.sgst)}
                  </div>
                )}
                <div
                  className="muted"
                  style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}
                >
                  <span>Round Off:</span>
                  <input
                    type="number"
                    step="any"
                    className="at-input"
                    style={{ width: 120, height: 30, textAlign: "right" }}
                    placeholder={`auto (${T.roundOff >= 0 ? "+" : ""}${fmt2(
                      Math.round(T.taxable + T.taxAmt) - (T.taxable + T.taxAmt),
                    )})`}
                    value={form.manualRoundOff}
                    onChange={(e) => setForm((p) => ({ ...p, manualRoundOff: e.target.value }))}
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
                <div className="net">Grand Total: ₹ {fmt2(T.grandTotal)}</div>
              </div>
            </div>
          </div>

          {/* Unit Price */}
          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-rulers"></i>
              <span>Unit Price</span>
            </div>
            <div className="at-form-grid">
              <div className="at-fg">
                <label className="at-label">Select Unit</label>
                <select
                  className="at-select"
                  value={form.priceUnit}
                  onChange={(e) => setForm((p) => ({ ...p, priceUnit: e.target.value }))}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="at-fg">
                <label className="at-label">Quantity</label>
                <input
                  type="number"
                  className="at-input"
                  placeholder="e.g. 500"
                  value={form.unitQty}
                  onChange={(e) => setForm((p) => ({ ...p, unitQty: e.target.value }))}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
              <div className="at-fg">
                <label className="at-label">Price per {form.priceUnit}</label>
                <input
                  className="at-input"
                  readOnly
                  value={Number(form.unitQty) > 0 ? inr(T.grandTotal / Number(form.unitQty)) : inr(0)}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="at-card">
            <div className="at-card__head">
              <i className="bi bi-card-text"></i>
              <span>Terms &amp; Declaration</span>
            </div>
            <div className="at-form-grid--2">
              <div className="at-fg">
                <label className="at-label">Terms &amp; Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} className="at-input" rows={2} />
              </div>
              <div className="at-fg">
                <label className="at-label">Declaration</label>
                <textarea
                  name="declaration"
                  value={form.declaration}
                  onChange={handleChange}
                  className="at-input"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="at-form-actions">
            <button type="button" className="at-btn at-btn--ghost" onClick={resetForm} disabled={saving}>
              <i className="bi bi-arrow-clockwise"></i> Reset
            </button>
            <button type="submit" className="at-btn at-btn--primary at-btn--lg" disabled={saving}>
              {saving ? "Saving…" : `${editId ? "Update" : "Save"} Quotation`} <i className="bi bi-check2"></i>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── ITEM ROW ────────────────────────────────────────────────────────────────
const BRANCH_NAMES = BRANCH_LABELS; // display names only

function ItemRow({ item, idx, products, onChange, onProductSelect, onRemove, canRemove, units }) {
  const handleDropdown = (e) => {
    const id = e.target.value;
    onProductSelect(idx, id ? products.find((p) => String(p.id) === id) || null : null);
  };

  const amount = (parseFloat(item.qty) || 0) * (parseFloat(item.rateIncl) || 0);

  return (
    <tr>
      <td style={{ textAlign: "center", color: "#94a3b8" }}>{idx + 1}</td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {products.length > 0 && (
            <select className="at-select-t" value="" onChange={handleDropdown} style={{ fontSize: 12 }}>
              <option value="">— Select from catalog —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name}
                  {p.selling_price ? `  ₹${parseFloat(p.selling_price).toFixed(2)}` : ""}
                  {p.stock_qty != null ? `  (Stock: ${p.stock_qty})` : ""}
                  {p.branch_id ? `  [${BRANCH_NAMES[p.branch_id] || `Branch ${p.branch_id}`}]` : ""}
                </option>
              ))}
            </select>
          )}
          <input
            className="at-input-t"
            value={item.description}
            onChange={(e) => onChange(idx, "description", e.target.value)}
            placeholder={products.length > 0 ? "Or type custom description…" : "Product / Service"}
          />
        </div>
      </td>
      <td>
        <input
          className="at-input-t"
          value={item.hsn}
          onChange={(e) => onChange(idx, "hsn", e.target.value)}
          placeholder="HSN"
        />
      </td>
      <td>
        <input
          type="date"
          className="at-input-t"
          value={item.dueOn}
          onChange={(e) => onChange(idx, "dueOn", e.target.value)}
        />
      </td>
      <td>
        <select className="at-select-t" value={item.unit} onChange={(e) => onChange(idx, "unit", e.target.value)}>
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          className="at-input-t"
          value={item.qty}
          min="0"
          step="any"
          onChange={(e) => onChange(idx, "qty", e.target.value)}
          onWheel={(e) => e.target.blur()}
        />
      </td>
      <td>
        <input
          type="number"
          className="at-input-t"
          value={item.rateIncl}
          min="0"
          step="any"
          onChange={(e) => onChange(idx, "rateIncl", e.target.value)}
          onWheel={(e) => e.target.blur()}
        />
      </td>
      <td style={{ textAlign: "right", fontWeight: 700 }}>₹ {fmt2(amount)}</td>
      <td style={{ textAlign: "center" }}>
        <button type="button" className="at-remove-btn" onClick={() => onRemove(idx)} disabled={!canRemove}>
          <i className="bi bi-x-lg"></i>
        </button>
      </td>
    </tr>
  );
}