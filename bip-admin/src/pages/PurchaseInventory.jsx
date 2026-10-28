import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { branchLabel } from "../utils/branchNames";

const safeFetchJSON = async (path, options = {}) => {
  const response = await apiFetch(path, options);
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return { ok: response.ok, status: response.status, data };
  } catch {
    throw new Error(`Invalid JSON response: ${text.substring(0, 300)}`);
  }
};

// Read the logged-in user saved at login time.
// NOTE: change "user" if your app stores it under a different key.
const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user")) || {};
  } catch {
    return {};
  }
};

export default function PurchaseInventory() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const isAdmin = storedUser?.role === "admin";

  // ── Tabs: "inventory" | "history" ─────────────────────────
  const [activeTab, setActiveTab] = useState("inventory");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [search, setSearch] = useState("");

  // Deduct panel (collapsed by default)
  const [showDeduct, setShowDeduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [deductQty, setDeductQty] = useState("");
  const [deductNote, setDeductNote] = useState("");
  const [deductDate, setDeductDate] = useState(() => {
    const now = new Date();
    const tz = now.getTimezoneOffset() * 60000;
    return new Date(now - tz).toISOString().slice(0, 16);
  });
  const [branchSelected, setBranchSelected] = useState(true);

  // Inline "set low stock alert" editor
  const [alertEditKey, setAlertEditKey] = useState(null); // `${product_id}_${branch_id}`
  const [alertValue, setAlertValue] = useState("");

  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState(null);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(""), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const fetchProducts = async (searchTerm = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      const { data } = await safeFetchJSON(
        `/get_inventory_products.php?${params.toString()}`,
      );
      if (data.error && data.error.includes("No branch selected")) {
        setBranchSelected(false);
        setError(
          "Please select a specific branch from the topbar to manage stock.",
        );
        setProducts([]);
        return;
      }
      setProducts(Array.isArray(data) ? data : []);
      setBranchSelected(true);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load inventory");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams();
      if (historySearch) params.append("search", historySearch);
      if (historyFrom) params.append("date_from", historyFrom);
      if (historyTo) params.append("date_to", historyTo);
      const { data } = await safeFetchJSON(
        `/get_stock_deductions.php?${params.toString()}`,
      );
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchHistory();
  }, []);

  const handleSearch = () => fetchProducts(search);
  const clearSearch = () => {
    setSearch("");
    fetchProducts("");
  };
  const handleHistorySearch = () => fetchHistory();
  const clearHistoryFilters = () => {
    setHistorySearch("");
    setHistoryFrom("");
    setHistoryTo("");
    fetchHistory();
  };

  const handleDeduct = async () => {
    if (!branchSelected) {
      setError(
        "Please select a specific branch from the topbar to deduct stock.",
      );
      return;
    }
    if (!selectedProduct) {
      setError("Select a product first");
      return;
    }
    const qty = parseFloat(deductQty);
    if (isNaN(qty) || qty <= 0) {
      setError("Enter a valid deduction quantity");
      return;
    }
    // Frontend guard: never allow deduction beyond available stock
    const prod = products.find((p) => p.product_id === selectedProduct);
    if (prod && qty > parseFloat(prod.current_stock)) {
      setError(
        `Cannot deduct ${qty}. Only ${parseFloat(prod.current_stock)} in stock — stock cannot go below 0.`,
      );
      return;
    }
    try {
      const { ok, data } = await safeFetchJSON("/deduct_stock.php", {
        method: "POST",
        body: JSON.stringify({
          product_id: selectedProduct,
          deduct_qty: qty,
          note: deductNote,
          deducted_at: deductDate ? deductDate.replace("T", " ") : "",
        }),
      });
      if (!ok || data.error) throw new Error(data.error || "Deduction failed");
      setSuccessMsg(`Stock deducted. New stock: ${data.new_stock}`);
      setDeductQty("");
      setDeductNote("");
      setError("");
      setShowDeduct(false);
      setSelectedProduct("");
      fetchProducts();
      fetchHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Set low stock alert ───────────────────────────────────
  const rowKey = (p) => `${p.product_id}_${p.branch_id}`;

  const openAlertEdit = (p) => {
    setAlertEditKey(rowKey(p));
    setAlertValue(
      parseFloat(p.min_stock) > 0 ? String(parseFloat(p.min_stock)) : "",
    );
  };

  const saveAlert = async (p) => {
    const val = parseFloat(alertValue);
    if (isNaN(val) || val < 0) {
      setError("Enter a valid alert level (0 removes the alert)");
      return;
    }
    try {
      const { ok, data } = await safeFetchJSON("/set_low_stock.php", {
        method: "POST",
        body: JSON.stringify({
          product_id: p.product_id,
          branch_id: p.branch_id,
          min_stock: val,
        }),
      });
      if (!ok || data.error) throw new Error(data.error || "Failed");
      setAlertEditKey(null);
      setSuccessMsg(
        val > 0 ? `Low stock alert set to ${val}` : "Low stock alert removed",
      );
      fetchProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Admin: delete product ─────────────────────────────────
  const confirmDeleteProduct = async () => {
    if (!deleteConfirmProduct) return;
    const p = deleteConfirmProduct;
    try {
      const { ok, data } = await safeFetchJSON("/delete_stock_product.php", {
        method: "POST",
        body: JSON.stringify({
          product_id: p.product_id,
          branch_id: p.branch_id,
        }),
      });
      if (!ok || data.error) throw new Error(data.error || "Delete failed");
      setSuccessMsg(data.message || "Product deleted");
      fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteConfirmProduct(null);
    }
  };

  const isLow = (p) => Number(p.is_low_stock) === 1;
  const lowCount = products.filter(isLow).length;
  const totalStockUnits = products.reduce(
    (s, p) => s + (parseFloat(p.current_stock) || 0),
    0,
  );

  const selectedProductData = products.find(
    (p) => p.product_id === selectedProduct,
  );

  return (
    <>
      <style>{`
        .at-root { color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .at-toast { position: fixed; top: 24px; right: 24px; z-index: 1200; display: flex; align-items: center; gap: 10px; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.18); color: #fff; min-width: 240px; animation: at-toast-in .28s cubic-bezier(.4,0,.2,1); }
        .at-toast.success { background: #008b3e; }
        @keyframes at-toast-in { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        .at-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1.5px solid #e2e8f0; flex-wrap: wrap; gap: 14px; }
        .at-header__left { display: flex; align-items: center; gap: 14px; }
        .at-header__icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #008b3e, #00b84f); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,139,62,.25); }
        .at-header__title { margin: 0 0 2px; font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
        .at-header__sub { margin: 0; font-size: 13px; color: #64748b; }

        .at-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 24px; }
        .at-stat { background: #fff; border: 1.5px solid var(--bd); border-radius: 12px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; }
        .at-stat__icon { width: 44px; height: 44px; border-radius: 10px; background: var(--bg); color: var(--c); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .at-stat__label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 4px; }
        .at-stat__value { font-size: 22px; font-weight: 800; color: var(--c); }
        .at-stat__sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }

        .at-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: box-shadow .15s, opacity .15s; }
        .at-btn--primary { background: linear-gradient(135deg,#008b3e,#00b84f); color: #fff; box-shadow: 0 2px 10px rgba(0,139,62,.3); }
        .at-btn--primary:hover { box-shadow: 0 4px 16px rgba(0,139,62,.38); }
        .at-btn--ghost { background: #f8fafc; color: #374151; border: 1.5px solid #e2e8f0; }
        .at-btn--ghost:hover { background: #f1f5f9; }
        .at-btn--danger { background: #dc2626; color: #fff; }
        .at-btn:disabled { opacity: .5; cursor: not-allowed; }

        .at-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 24px; margin-bottom: 24px; }
        .at-card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
        .at-card__head-left { display: flex; align-items: center; gap: 10px; }
        .at-card__head i { color: #008b3e; font-size: 17px; }
        .at-card__count { font-size: 12px; color: #64748b; font-weight: 600; }

        .sl-tabs { display: flex; gap: 4px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 24px; }
        .sl-tab { display: flex; align-items: center; gap: 8px; padding: 13px 20px; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; border-radius: 6px 6px 0 0; transition: color .15s, border-color .15s; }
        .sl-tab:hover { background: #f8fafc; color: #1e293b; }
        .sl-tab.active { color: #008b3e; border-bottom-color: #008b3e; }
        .sl-tab-dot { background: #dc2626; color: #fff; border-radius: 999px; min-width: 18px; height: 18px; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; }

        .at-alert { display: flex; align-items: flex-start; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; margin-bottom: 20px; }
        .at-alert i { margin-top: 2px; flex-shrink: 0; }
        .at-alert--danger { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
        .at-alert--danger i { color: #dc2626; }
        .at-error-banner { display: flex; align-items: center; gap: 8px; background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; border-radius: 8px; padding: 10px 16px; font-size: 13px; margin-bottom: 20px; }

        .at-form-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin: 0 0 12px; }
        .at-form-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 20px; }
        .at-fg { display: flex; flex-direction: column; gap: 7px; }
        .at-label { font-size: 13px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 3px; }
        .at-label .req { color: #ef4444; }
        .at-input, .at-select { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; font-family: inherit; }
        .at-input:focus, .at-select:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
        .at-input[readonly] { background: #f1f5f9; color: #475569; font-weight: 600; cursor: default; }
        .at-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; cursor: pointer; }
        .at-form-actions { display: flex; gap: 10px; padding-top: 8px; justify-content: flex-end; }

        .at-finput { height: 36px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13px; color: #1e293b; background: #fafbfc; outline: none; transition: border-color .15s; box-sizing: border-box; }
        .at-finput:focus { border-color: #008b3e; }
        .at-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; }

        .at-status-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }

        .at-timeline { display: flex; flex-direction: column; gap: 10px; }
        .at-bubble { background: #f8fbff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
        .at-bubble.low-bubble { background: #fef8f8; border-color: #fecaca; }
        .at-bubble-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
        .at-bubble-name { font-weight: 700; font-size: 14.5px; color: #0f172a; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .at-bubble-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .at-bubble-body { display: flex; flex-wrap: wrap; gap: 16px 24px; font-size: 12.5px; color: #475569; margin-bottom: 10px; }
        .at-bubble-stat b { display: block; font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2px; }
        .at-bubble-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px; border-top: 1px solid #eef2f7; flex-wrap: wrap; }
        .at-bubble-actions { display: flex; gap: 6px; flex-wrap: wrap; }

        .at-act-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid transparent; transition: all .12s; }
        .at-act-btn--bell { background: #fef3c7; color: #b45309; border-color: #fde68a; }
        .at-act-btn--bell:hover { background: #fde68a; }
        .at-act-btn--delete { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
        .at-act-btn--delete:hover { background: #fecaca; }

        .at-inline-edit { background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 12px 14px; margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .at-inline-edit__label { font-size: 12.5px; font-weight: 600; color: #1d4ed8; flex-shrink: 0; }

        .at-empty { display: flex; flex-direction: column; align-items: center; padding: 52px 20px; color: #94a3b8; }
        .at-empty i { font-size: 40px; margin-bottom: 10px; }
        .at-empty p { margin: 0 0 4px; font-weight: 600; color: #64748b; font-size: 14px; }
        .at-loading { display: flex; align-items: center; gap: 12px; padding: 40px; justify-content: center; color: #64748b; }
        .at-spinner { width: 22px; height: 22px; border: 3px solid #e2e8f0; border-top-color: #008b3e; border-radius: 50%; animation: at-spin .7s linear infinite; }
        @keyframes at-spin { to { transform: rotate(360deg); } }

        .at-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .at-modal { background: #fff; border-radius: 16px; width: 440px; max-width: 92vw; box-shadow: 0 24px 60px rgba(15,23,42,.22); animation: at-mi .22s cubic-bezier(.4,0,.2,1); overflow: hidden; }
        @keyframes at-mi { from { transform: translateY(18px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
        .at-modal__hd { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f1f5f9; }
        .at-modal__title { font-size: 16px; font-weight: 800; color: #dc2626; display: flex; align-items: center; gap: 8px; }
        .at-modal__close { width: 30px; height: 30px; border: none; background: #f1f5f9; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 13px; }
        .at-modal__body { padding: 22px; text-align: center; }
        .at-modal__ft { padding: 14px 22px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }

        @media (max-width: 900px) {
          .at-stats { grid-template-columns: 1fr 1fr; }
          .at-form-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .at-stats { grid-template-columns: 1fr; }
          .at-form-grid { grid-template-columns: 1fr; }
          .at-header { align-items: flex-start; }
          .sl-tabs { flex-direction: column; }
          .at-card__head { flex-direction: column; align-items: stretch; }
          .at-filters { flex-direction: column; align-items: stretch; }
          .at-filters .at-finput, .at-filters .at-btn { width: 100%; justify-content: center; }
          .at-form-actions { flex-direction: column; }
          .at-form-actions .at-btn { width: 100%; justify-content: center; }
          .at-bubble-foot { flex-direction: column; align-items: stretch; }
          .at-bubble-actions button { flex: 1 1 calc(50% - 6px); justify-content: center; }
        }
      `}</style>

      <div className="at-root">
        {successMsg && (
          <div className="at-toast success">
            <i className="bi bi-check-circle-fill"></i>
            <span>{successMsg}</span>
          </div>
        )}

        <div className="at-header">
          <div className="at-header__left">
            <div className="at-header__icon">
              <i className="bi bi-box-seam-fill"></i>
            </div>
            <div>
              <h1 className="at-header__title">Purchase Inventory</h1>
              <p className="at-header__sub">
                Manage product stock — total purchased, current stock, and
                deductions
              </p>
            </div>
          </div>
          <button
            type="button"
            className="at-btn at-btn--ghost"
            title="View stock movements and balance"
            onClick={() => navigate("/statements?type=inventory")}
          >
            <i className="bi bi-journal-text"></i> View Statement
          </button>
        </div>

        <div className="at-stats">
          {[
            {
              label: "Total Products",
              value: products.length,
              sub: "In current view",
              c: "#1e293b",
              bg: "#f1f5f9",
              bd: "#e2e8f0",
              icon: "bi-boxes",
            },
            {
              label: "Low Stock",
              value: lowCount,
              sub: lowCount > 0 ? "Needs attention" : "All healthy",
              c: "#dc2626",
              bg: "#fee2e2",
              bd: "#fca5a5",
              icon: "bi-exclamation-triangle-fill",
            },
            {
              label: "Total Stock Units",
              value: totalStockUnits.toLocaleString(),
              sub: "Across listed products",
              c: "#15803d",
              bg: "#dcfce7",
              bd: "#86efac",
              icon: "bi-stack",
            },
            {
              label: "Deduction Records",
              value: history.length,
              sub: "Logged so far",
              c: "#1d4ed8",
              bg: "#eff6ff",
              bd: "#bfdbfe",
              icon: "bi-clock-history",
            },
          ].map((card) => (
            <div
              className="at-stat"
              key={card.label}
              style={{ "--c": card.c, "--bg": card.bg, "--bd": card.bd }}
            >
              <div className="at-stat__icon">
                <i className={`bi ${card.icon}`}></i>
              </div>
              <div>
                <div className="at-stat__label">{card.label}</div>
                <div className="at-stat__value">{card.value}</div>
                <div className="at-stat__sub">{card.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {lowCount > 0 && (
          <div className="at-alert at-alert--danger">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <div>
              <strong>{lowCount}</strong> product
              {lowCount > 1 ? "s are" : " is"} at or below the low stock alert
              level — highlighted below.
            </div>
          </div>
        )}

        {error && (
          <div className="at-error-banner">
            <i className="bi bi-exclamation-circle-fill"></i>
            <span>{error}</span>
          </div>
        )}

        <div className="sl-tabs">
          <button
            type="button"
            className={`sl-tab${activeTab === "inventory" ? " active" : ""}`}
            onClick={() => setActiveTab("inventory")}
          >
            <i className="bi bi-list-ul"></i> Product Inventory
            {lowCount > 0 && <span className="sl-tab-dot">{lowCount}</span>}
          </button>
          <button
            type="button"
            className={`sl-tab${activeTab === "history" ? " active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <i className="bi bi-clock-history"></i> Stock Deduction History
          </button>
        </div>

        {/* ══════════ TAB 1: PRODUCT INVENTORY ══════════ */}
        {activeTab === "inventory" && (
          <>
            <div className="at-card">
              <div className="at-card__head">
                <div className="at-card__head-left">
                  <i className="bi bi-list-ul"></i>
                  <span>Product Inventory</span>
                </div>
                <button
                  type="button"
                  className={`at-btn ${showDeduct ? "at-btn--ghost" : "at-btn--primary"}`}
                  onClick={() => setShowDeduct(!showDeduct)}
                  disabled={!branchSelected}
                  title={
                    branchSelected
                      ? "Deduct stock"
                      : "Select a specific branch first"
                  }
                >
                  <i
                    className={`bi ${showDeduct ? "bi-x-lg" : "bi-dash-circle"}`}
                  ></i>
                  {showDeduct ? "Close" : "Deduct Stock"}
                </button>
              </div>

              {!branchSelected && (
                <div className="at-alert">
                  <i className="bi bi-building"></i>
                  <div>
                    Viewing all branches. Select a specific branch from the
                    topbar (Kadambankulam, Nanguneri or Kadambankulam) to deduct stock.
                  </div>
                </div>
              )}

              {showDeduct && branchSelected && (
                <>
                  <p className="at-form-section">Deduct Stock</p>
                  <div className="at-form-grid">
                    <div className="at-fg">
                      <label className="at-label">Select Product</label>
                      <select
                        className="at-select"
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                      >
                        <option value="">-- Choose Product --</option>
                        {products.map((p) => (
                          <option key={rowKey(p)} value={p.product_id}>
                            {p.product_name} (ID: {p.product_id}) – Stock:{" "}
                            {p.current_stock}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedProductData && (
                      <>
                        <div className="at-fg">
                          <label className="at-label">Current Stock</label>
                          <input
                            type="text"
                            className="at-input"
                            value={selectedProductData.current_stock}
                            readOnly
                          />
                        </div>
                        <div className="at-fg">
                          <label className="at-label">Avg. Rate (₹)</label>
                          <input
                            type="text"
                            className="at-input"
                            value={`₹ ${parseFloat(selectedProductData.rate).toFixed(2)}`}
                            readOnly
                          />
                        </div>
                        <div className="at-fg">
                          <label className="at-label">
                            Quantity to Deduct <span className="req">*</span>
                          </label>
                          <input
                            type="number"
                            className="at-input"
                            min="0"
                            max={selectedProductData.current_stock}
                            step="any"
                            value={deductQty}
                            onChange={(e) => setDeductQty(e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            placeholder="e.g., 5"
                          />
                        </div>
                        <div className="at-fg">
                          <label className="at-label">Date &amp; Time</label>
                          <input
                            type="datetime-local"
                            className="at-input"
                            value={deductDate}
                            onChange={(e) => setDeductDate(e.target.value)}
                          />
                        </div>
                        <div className="at-fg">
                          <label className="at-label">Reason / Note</label>
                          <input
                            type="text"
                            className="at-input"
                            value={deductNote}
                            onChange={(e) => setDeductNote(e.target.value)}
                            placeholder="Optional (e.g., issued to site)"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="at-form-actions">
                    <button
                      className="at-btn at-btn--primary"
                      onClick={handleDeduct}
                    >
                      <i className="bi bi-dash-circle"></i> Deduct Stock
                    </button>
                  </div>
                </>
              )}

              <div className="at-filters">
                <input
                  className="at-finput"
                  style={{ flex: 1, minWidth: 200 }}
                  type="text"
                  placeholder="Search by product name or ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  className="at-btn at-btn--primary"
                  onClick={handleSearch}
                >
                  <i className="bi bi-search"></i> Search
                </button>
                <button className="at-btn at-btn--ghost" onClick={clearSearch}>
                  <i className="bi bi-x-circle"></i> Clear
                </button>
              </div>

              {loading ? (
                <div className="at-loading">
                  <div className="at-spinner"></div>
                  <span>Loading inventory…</span>
                </div>
              ) : products.length === 0 ? (
                <div className="at-empty">
                  <i className="bi bi-inbox"></i>
                  <p>No products found</p>
                  <span>Try adjusting your search.</span>
                </div>
              ) : (
                <div className="at-timeline">
                  {products.map((p) => {
                    const low = isLow(p);
                    return (
                      <div
                        className={`at-bubble${low ? " low-bubble" : ""}`}
                        key={rowKey(p)}
                      >
                        <div className="at-bubble-head">
                          <div className="at-bubble-name">
                            {p.product_name}
                            {low && (
                              <span
                                className="at-status-badge"
                                style={{
                                  background: "#fee2e2",
                                  color: "#dc2626",
                                }}
                              >
                                <i className="bi bi-exclamation-triangle-fill"></i>{" "}
                                LOW
                              </span>
                            )}
                          </div>
                          <span
                            className="at-status-badge"
                            style={
                              low
                                ? { background: "#fee2e2", color: "#dc2626" }
                                : { background: "#dcfce7", color: "#15803d" }
                            }
                          >
                            {parseFloat(p.current_stock).toLocaleString()} in
                            stock
                          </span>
                        </div>
                        <div className="at-bubble-body">
                          <div className="at-bubble-stat">
                            <b>Product ID</b>
                            {p.product_id}
                          </div>
                          {isAdmin && (
                            <div className="at-bubble-stat">
                              <b>Branch</b>
                              {branchLabel(p.branch_name) || "—"}
                            </div>
                          )}
                          <div className="at-bubble-stat">
                            <b>Total Purchased</b>
                            {parseFloat(p.total_purchased).toLocaleString()}
                          </div>
                          <div className="at-bubble-stat">
                            <b>Avg. Rate</b>₹{parseFloat(p.rate).toFixed(2)}
                          </div>
                          <div className="at-bubble-stat">
                            <b>Low Alert</b>
                            {parseFloat(p.min_stock) > 0
                              ? `≤ ${parseFloat(p.min_stock).toLocaleString()}`
                              : "—"}
                          </div>
                        </div>
                        <div className="at-bubble-foot">
                          <span></span>
                          <div className="at-bubble-actions">
                            <button
                              className="at-act-btn at-act-btn--bell"
                              onClick={() =>
                                alertEditKey === rowKey(p)
                                  ? setAlertEditKey(null)
                                  : openAlertEdit(p)
                              }
                            >
                              <i className="bi bi-bell"></i> Set Alert
                            </button>
                            <button
                              className="at-act-btn"
                              onClick={() =>
                                navigate(
                                  `/statements?type=product&product_id=${p.product_id}&src=purchase&product=${encodeURIComponent(p.product_name)}${p.branch_id ? `&branch=${p.branch_id}` : ""}`,
                                )
                              }
                            >
                              <i className="bi bi-journal-text"></i> Statement
                            </button>
                            {isAdmin && (
                              <button
                                className="at-act-btn at-act-btn--delete"
                                onClick={() => setDeleteConfirmProduct(p)}
                              >
                                <i className="bi bi-trash"></i> Delete
                              </button>
                            )}
                          </div>
                        </div>
                        {alertEditKey === rowKey(p) && (
                          <div className="at-inline-edit">
                            <span className="at-inline-edit__label">
                              Low stock alert level:
                            </span>
                            <input
                              type="number"
                              className="at-input"
                              style={{ width: 110, height: 34 }}
                              min="0"
                              step="any"
                              value={alertValue}
                              onChange={(e) => setAlertValue(e.target.value)}
                              placeholder="e.g., 5"
                              autoFocus
                            />
                            <button
                              type="button"
                              className="at-btn at-btn--primary"
                              style={{ padding: "6px 16px", fontSize: 12.5 }}
                              onClick={() => saveAlert(p)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="at-btn at-btn--ghost"
                              style={{ padding: "6px 16px", fontSize: 12.5 }}
                              onClick={() => setAlertEditKey(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════ TAB 2: STOCK DEDUCTION HISTORY ══════════ */}
        {activeTab === "history" && (
          <div className="at-card">
            <div className="at-card__head">
              <div className="at-card__head-left">
                <i className="bi bi-clock-history"></i>
                <span>Stock Deduction History</span>
              </div>
              <span className="at-card__count">
                {history.length} record{history.length !== 1 ? "s" : ""}
              </span>
            </div>

            <p className="at-form-section">Filters</p>
            <div className="at-form-grid">
              <div className="at-fg">
                <label className="at-label">Search Product</label>
                <input
                  type="text"
                  className="at-input"
                  placeholder="Product name / ID"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
              <div className="at-fg">
                <label className="at-label">From Date</label>
                <input
                  type="date"
                  className="at-input"
                  value={historyFrom}
                  onChange={(e) => setHistoryFrom(e.target.value)}
                />
              </div>
              <div className="at-fg">
                <label className="at-label">To Date</label>
                <input
                  type="date"
                  className="at-input"
                  value={historyTo}
                  onChange={(e) => setHistoryTo(e.target.value)}
                />
              </div>
            </div>
            <div className="at-form-actions" style={{ marginBottom: 20 }}>
              <button
                className="at-btn at-btn--primary"
                onClick={handleHistorySearch}
              >
                <i className="bi bi-search"></i> Search
              </button>
              <button
                className="at-btn at-btn--ghost"
                onClick={clearHistoryFilters}
              >
                <i className="bi bi-x-circle"></i> Clear
              </button>
            </div>

            {history.length === 0 ? (
              <div className="at-empty">
                <i className="bi bi-inbox"></i>
                <p>No deduction records found</p>
                <span>Deductions will be logged here.</span>
              </div>
            ) : (
              <div className="at-timeline">
                {history.map((h) => (
                  <div className="at-bubble" key={h.id}>
                    <div className="at-bubble-head">
                      <div className="at-bubble-name">
                        {h.product_name || "—"}
                      </div>
                      <span
                        className="at-status-badge"
                        style={{ background: "#fee2e2", color: "#dc2626" }}
                      >
                        <i className="bi bi-dash-circle-fill"></i>{" "}
                        {parseFloat(h.deducted_qty).toLocaleString()} deducted
                      </span>
                    </div>
                    <div className="at-bubble-body">
                      <div className="at-bubble-stat">
                        <b>Date / Time</b>
                        {h.deducted_at}
                      </div>
                      <div className="at-bubble-stat">
                        <b>Product ID</b>
                        {h.product_id}
                      </div>
                      <div className="at-bubble-stat">
                        <b>Note</b>
                        {h.note || "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {deleteConfirmProduct && (
          <div
            className="at-overlay"
            onClick={() => setDeleteConfirmProduct(null)}
          >
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title">
                  <i className="bi bi-trash"></i> Delete Product
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setDeleteConfirmProduct(null)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="at-modal__body">
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "#fef2f2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 14px",
                    fontSize: 22,
                    color: "#dc2626",
                  }}
                >
                  <i className="bi bi-exclamation-triangle-fill"></i>
                </div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>
                  Delete <strong>{deleteConfirmProduct.product_name}</strong>{" "}
                  (ID: {deleteConfirmProduct.product_id})?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Bill history and deduction history will be kept. This action
                  cannot be undone.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--ghost"
                  onClick={() => setDeleteConfirmProduct(null)}
                >
                  Cancel
                </button>
                <button
                  className="at-btn at-btn--danger"
                  onClick={confirmDeleteProduct}
                >
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}