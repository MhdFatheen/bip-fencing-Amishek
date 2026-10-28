import { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { branchLabel } from "../utils/branchNames";

const todayDate = () => new Date().toISOString().slice(0, 10);

const UNITS = ["Pcs", "Kg", "Meter", "Roll", "Box", "Set", "Liter", "Ton", "Nos"];

const emptyForm = {
  productName: "",
  hsn: "",
  unit: "Pcs",
  productDate: todayDate(),
  factoryPrice: "",
  sellingPrice: "",
  stockQty: "",
  minStock: "",
  description: "",
  supplier: "",
  sku: "",
  reference: "",
};

const STOCK_META = {
  out: {
    bg: "#fee2e2",
    color: "#dc2626",
    icon: "bi-x-circle-fill",
    label: "Out of Stock",
  },
  low: {
    bg: "#fef9c3",
    color: "#b45309",
    icon: "bi-exclamation-triangle-fill",
    label: "Low Stock",
  },
  ok: {
    bg: "#dcfce7",
    color: "#15803d",
    icon: "bi-check-circle-fill",
    label: "In Stock",
  },
};

const getStockStatus = (qty, min) => {
  qty = Number(qty);
  min = Number(min);
  if (qty === 0) return "out";
  if (min > 0 && qty <= min) return "low";
  return "ok";
};

// Display only: branches that carry a product with this name (from the loaded list)
function branchesForName(list, name) {
  const key = String(name || "").trim().toLowerCase();
  const ids = [
    ...new Set(
      list
        .filter((x) => String(x.productName || "").trim().toLowerCase() === key)
        .map((x) => (x.branchId === null || x.branchId === undefined ? "" : String(x.branchId))),
    ),
  ];
  return ids
    .sort()
    .map((id) => (id === "" ? "All Branches" : branchLabel(id)))
    .join(", ");
}

function mapFromDB(p) {
  return {
    id: p.id,
    productName: p.product_name,
    hsn: p.hsn,
    unit: p.unit,
    productDate: p.product_date,
    factoryPrice: p.factory_price,
    sellingPrice: p.selling_price,
    stockQty: p.stock_qty,
    minStock: p.min_stock,
    description: p.description,
    branchId: p.branch_id,
    supplier: p.supplier || "",
    sku: p.sku || "",
  };
}

function mapDamageFromDB(d) {
  return {
    id: d.id,
    productName: d.product_name,
    damageDate: d.damage_date,
    stockQty: d.stock_qty,
    qty: d.qty,
  };
}

// mode="own"      -> Product Catalog  (/products.php)          unchanged
// mode="purchase" -> Purchase Catalog (/purchase_products.php) same page, same logic
export default function Products({ mode = "own" }) {
  const isPurchase = mode === "purchase";
  const API = isPurchase ? "/purchase_products.php" : "/products.php";
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addStockQty, setAddStockQty] = useState("");
  const [stockAlert, setStockAlert] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [activeView, setActiveView] = useState("products"); // "products" | "damage"
  const [damageLog, setDamageLog] = useState([]);
  const [damageLoading, setDamageLoading] = useState(false);
  const [stockInOpenId, setStockInOpenId] = useState(null);
  const [stockInQty, setStockInQty] = useState("");
  const [stockOutOpenId, setStockOutOpenId] = useState(null);
  const [stockOutQty, setStockOutQty] = useState("");
  const [editingDamageId, setEditingDamageId] = useState(null);
  const [damageEditForm, setDamageEditForm] = useState({
    qty: "",
    damageDate: "",
  });
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState(null);
  const [deleteConfirmDamage, setDeleteConfirmDamage] = useState(null);

  // Get user role and current branch from localStorage
  const userRole = localStorage.getItem("role");
  const isAdmin = userRole === "admin";
  const currentBranchId =
    localStorage.getItem("admin_view_branch") ||
    localStorage.getItem("branch_id");

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(""), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Check if product name already exists ONLY in the current branch
  const isProductNameDuplicate = (productName, excludeId = null) => {
    if (!productName || !productName.trim()) return false;

    const lowerCaseName = productName.toLowerCase().trim();

    // Only check products that belong to the current branch
    const currentBranchProducts = products.filter(
      (p) => p.branchId === currentBranchId,
    );

    return currentBranchProducts.some(
      (p) =>
        p.productName.toLowerCase().trim() === lowerCaseName &&
        p.id !== excludeId, // Exclude the current product when editing
    );
  };

  async function fetchProducts() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(API);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const loaded = data.map(mapFromDB);
      setProducts(loaded);

      // Stock alert check
      const outItems = loaded.filter((p) => Number(p.stockQty) === 0);
      const lowItems = loaded.filter(
        (p) =>
          Number(p.stockQty) > 0 &&
          Number(p.minStock) > 0 &&
          Number(p.stockQty) <= Number(p.minStock),
      );

      if (outItems.length > 0 || lowItems.length > 0) {
        const msgs = [];
        if (outItems.length)
          msgs.push(
            `Out of Stock: ${outItems.map((p) => p.productName).join(", ")}`,
          );
        if (lowItems.length)
          msgs.push(
            `Low Stock: ${lowItems
              .map((p) => `${p.productName} (${p.stockQty} left)`)
              .join(", ")}`,
          );
        setStockAlert(msgs.join("\n"));
      } else {
        setStockAlert("");
      }
    } catch (err) {
      setError("Could not load products. Is the server running?");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDamageLog() {
    setDamageLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${API}?damage=1`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setDamageLog(data.map(mapDamageFromDB));
    } catch (err) {
      setError("Could not load damage log.");
    } finally {
      setDamageLoading(false);
    }
  }

  const openDamageTab = () => {
    setActiveView("damage");
    fetchDamageLog();
  };

  const openDamageEdit = (d) => {
    setEditingDamageId(d.id);
    setDamageEditForm({
      qty: d.qty,
      damageDate: d.damageDate
        ? String(d.damageDate).slice(0, 10)
        : todayDate(),
    });
  };

  const cancelDamageEdit = () => {
    setEditingDamageId(null);
    setDamageEditForm({ qty: "", damageDate: "" });
  };

  const saveDamageEdit = async (id) => {
    const qty = Number(damageEditForm.qty);
    if (!qty || qty <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    if (!damageEditForm.damageDate) {
      setError("Damage date is required");
      return;
    }
    try {
      const res = await apiFetch(`${API}?damage=1&id=${id}`, {
        method: "PUT",
        body: JSON.stringify({
          qty,
          damageDate: damageEditForm.damageDate,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Update failed");
      }
      await Promise.all([fetchDamageLog(), fetchProducts()]);
      setEditingDamageId(null);
      setDamageEditForm({ qty: "", damageDate: "" });
      setSuccessMsg("Damage record updated");
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmDeleteDamage = async () => {
    if (!deleteConfirmDamage) return;
    const id = deleteConfirmDamage.id;
    try {
      const res = await apiFetch(`${API}?damage=1&id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Delete failed");
      }
      await Promise.all([fetchDamageLog(), fetchProducts()]);
      if (editingDamageId === id) cancelDamageEdit();
      setSuccessMsg("Damage record deleted, quantity added back to stock");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteConfirmDamage(null);
    }
  };

  const openStockIn = (id) => {
    setStockOutOpenId(null);
    setStockOutQty("");
    setStockInOpenId(id);
    setStockInQty("");
  };

  const cancelStockIn = () => {
    setStockInOpenId(null);
    setStockInQty("");
  };

  const confirmStockIn = async (id) => {
    const qty = Number(stockInQty);
    if (!qty || qty <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    try {
      const res = await apiFetch(`${API}?action=stock-in&id=${id}`, {
        method: "POST",
        body: JSON.stringify({ qty }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Stock in failed");
      }
      await fetchProducts();
      setStockInOpenId(null);
      setStockInQty("");
      setSuccessMsg(`Stock added: +${qty}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const openStockOut = (id) => {
    setStockInOpenId(null);
    setStockInQty("");
    setStockOutOpenId(id);
    setStockOutQty("");
  };

  const cancelStockOut = () => {
    setStockOutOpenId(null);
    setStockOutQty("");
  };

  const confirmStockOut = async (p) => {
    const qty = Number(stockOutQty);
    if (!qty || qty <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    if (qty > Number(p.stockQty)) {
      setError("Not enough stock available");
      return;
    }
    setError("");
    try {
      const res = await apiFetch(`${API}?action=stock-out&id=${p.id}`, {
        method: "POST",
        body: JSON.stringify({ qty }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Stock out failed");
      }
      await fetchProducts();
      setStockOutOpenId(null);
      setStockOutQty("");
      setSuccessMsg(`${qty} unit(s) marked damaged: ${p.productName}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate product name
    if (!form.productName.trim()) {
      setError("Product name is required");
      return;
    }

    // Check for duplicate product name only within the same branch
    if (isProductNameDuplicate(form.productName, editingId)) {
      setError(
        `Product "${form.productName}" already exists in this branch. Please use a different product name for this branch.`,
      );
      return;
    }

    const wasEditing = editingId !== null;

    try {
      let res;
      if (editingId !== null) {
        const extra = Number(addStockQty) || 0;
        const finalQty = Number(form.stockQty) + extra;
        res = await apiFetch(`${API}?id=${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            ...form,
            stockQty: finalQty,
          }),
        });
      } else {
        res = await apiFetch(API, {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Save failed");
      }
      await fetchProducts();
      setEditingId(null);
      setForm(emptyForm);
      setAddStockQty("");
      setShowForm(false);
      setSuccessMsg(
        wasEditing
          ? "Product updated successfully"
          : "Product added successfully",
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setAddStockQty("");
    setError("");
    setShowForm(true);
  };

  const handleEdit = (p) => {
    setForm({
      productName: p.productName,
      hsn: p.hsn,
      unit: p.unit,
      productDate: p.productDate
        ? String(p.productDate).slice(0, 10)
        : todayDate(),
      factoryPrice: p.factoryPrice,
      sellingPrice: p.sellingPrice,
      stockQty: p.stockQty,
      minStock: p.minStock,
      description: p.description,
      supplier: p.supplier || "",
      sku: p.sku || "",
      reference: "",
    });
    setEditingId(p.id);
    setAddStockQty("");
    setError("");
    setShowForm(true);
  };

  const confirmDeleteProduct = async () => {
    if (!deleteConfirmProduct) return;
    const id = deleteConfirmProduct.id;
    try {
      const res = await apiFetch(`${API}?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
        setShowForm(false);
      }
      setSuccessMsg("Product deleted");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteConfirmProduct(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAddStockQty("");
    setError("");
    setShowForm(false);
  };

  const totalProducts = products.length;
  const inStockCount = products.filter(
    (p) => getStockStatus(p.stockQty, p.minStock) === "ok",
  ).length;
  const lowStockCount = products.filter(
    (p) => getStockStatus(p.stockQty, p.minStock) === "low",
  ).length;
  const outStockCount = products.filter(
    (p) => getStockStatus(p.stockQty, p.minStock) === "out",
  ).length;

  const hsnDup = error?.toLowerCase().includes("hsn");
  const nameDup = !hsnDup && error?.includes("already exists");

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
        .at-card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .at-card__head-left { display: flex; align-items: center; gap: 10px; }
        .at-card__head i { color: #008b3e; font-size: 17px; }
        .at-card__count { font-size: 12px; color: #64748b; font-weight: 600; }

        .at-form-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin: 0 0 12px; }
        .at-form-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 20px; }
        .at-form-grid--4 { grid-template-columns: repeat(4,1fr); }
        .at-fg { display: flex; flex-direction: column; gap: 7px; }
        .at-fg--2 { grid-column: span 2; }
        .at-fg--full { grid-column: 1 / -1; }
        .at-label { font-size: 13px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 3px; }
        .at-label .req { color: #ef4444; }
        .at-input, .at-select, .at-textarea { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; font-family: inherit; }
        .at-textarea { height: auto; padding: 10px 12px; resize: vertical; }
        .at-input:focus, .at-select:focus, .at-textarea:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
        .at-input.error-field { border-color: #ef4444; background: #fef2f2; }
        .at-input:disabled, .at-select:disabled { background: #f1f5f9; color: #94a3b8; }
        .at-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; cursor: pointer; }
        .at-hint { font-size: 11px; color: #94a3b8; }
        .at-hint.error-hint { color: #ef4444; font-weight: 600; }
        .at-form-actions { display: flex; gap: 10px; padding-top: 8px; }

        .sl-tabs { display: flex; gap: 4px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 24px; }
        .sl-tab { display: flex; align-items: center; gap: 8px; padding: 13px 20px; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; border-radius: 6px 6px 0 0; transition: color .15s, border-color .15s; }
        .sl-tab:hover { background: #f8fafc; color: #1e293b; }
        .sl-tab.active { color: #008b3e; border-bottom-color: #008b3e; }

        .at-alert { display: flex; align-items: flex-start; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; margin-bottom: 20px; white-space: pre-line; position: relative; }
        .at-alert i { margin-top: 2px; flex-shrink: 0; }
        .at-alert-close { position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 14px; cursor: pointer; color: #92400e; }
        .at-error-banner { display: flex; align-items: center; gap: 8px; background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; border-radius: 8px; padding: 10px 16px; font-size: 13px; margin-bottom: 20px; }
        .at-editing-bar { display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 10px 16px; font-size: 13.5px; color: #92400e; font-weight: 600; margin-bottom: 20px; flex-wrap: wrap; }
        .at-editing-bar button { margin-left: auto; }

        .at-status-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }

        .at-timeline { display: flex; flex-direction: column; gap: 10px; }
        .at-bubble { background: #f8fbff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
        .at-bubble-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .at-bubble-name { font-weight: 700; font-size: 14.5px; color: #0f172a; }
        .at-bubble-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .at-bubble-body { display: flex; flex-wrap: wrap; gap: 16px 24px; font-size: 12.5px; color: #475569; margin-bottom: 10px; }
        .at-bubble-stat b { display: block; font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2px; }
        .at-bubble-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px; border-top: 1px solid #eef2f7; flex-wrap: wrap; }
        .at-bubble-actions { display: flex; gap: 6px; flex-wrap: wrap; }

        .at-act-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid transparent; transition: all .12s; }
        .at-act-btn--stockin { background: #dcfce7; color: #15803d; border-color: #86efac; }
        .at-act-btn--stockin:hover { background: #bbf7d0; }
        .at-act-btn--stockout { background: #ffedd5; color: #c2410c; border-color: #fed7aa; }
        .at-act-btn--stockout:hover { background: #fed7aa; }
        .at-act-btn--edit { background: #fef3c7; color: #b45309; border-color: #fde68a; }
        .at-act-btn--edit:hover { background: #fde68a; }
        .at-act-btn--delete { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
        .at-act-btn--delete:hover { background: #fecaca; }

        .at-inline-edit { background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 12px 14px; margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .at-inline-edit__label { font-size: 12.5px; font-weight: 600; color: #1d4ed8; flex-shrink: 0; }
        .at-inline-edit--out { background: #fff7ed; border-color: #fed7aa; }
        .at-inline-edit--out .at-inline-edit__label { color: #c2410c; }
        .at-chip { background: #fff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .at-chip:hover { background: #eff6ff; }
        .at-chip--out { color: #c2410c; border-color: #fed7aa; }
        .at-chip--out:hover { background: #fff7ed; }

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
          .at-form-grid, .at-form-grid--4 { grid-template-columns: 1fr 1fr; }
          .at-fg--2 { grid-column: span 2; }
        }
        @media (max-width: 600px) {
          .at-stats { grid-template-columns: 1fr; }
          .at-form-grid, .at-form-grid--4 { grid-template-columns: 1fr; }
          .at-fg--2 { grid-column: auto; }
          .at-header { align-items: flex-start; }
          .at-header > .at-btn { width: 100%; justify-content: center; }
          .at-editing-bar { flex-direction: column; align-items: flex-start; }
          .at-editing-bar button { margin-left: 0; }
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
              <h1 className="at-header__title">{isPurchase ? "Purchase Catalog" : "Products"}</h1>
              <p className="at-header__sub">
                {isPurchase ? "Products purchased from suppliers" : "Product & Inventory Management"}
              </p>
            </div>
          </div>
          {showForm ? (
            <button className="at-btn at-btn--ghost" onClick={cancelEdit}>
              <i className="bi bi-x-lg"></i> Close
            </button>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {isPurchase ? (
                <>
                  <button className="at-btn at-btn--ghost" onClick={() => navigate("/products")}>
                    <i className="bi bi-box-seam"></i> Product Catalog
                  </button>
                  <button className="at-btn at-btn--primary" onClick={openAddForm}>
                    <i className="bi bi-cart-plus"></i> Add Purchase
                  </button>
                </>
              ) : (
                <>
                  {isAdmin && (
                    <button className="at-btn at-btn--primary" onClick={openAddForm}>
                      <i className="bi bi-plus-lg"></i> Add Product
                    </button>
                  )}
                  <button className="at-btn at-btn--primary" onClick={() => navigate("/purchase-catalog")}>
                    <i className="bi bi-bag-check"></i> Purchase Catalog
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="at-stats">
          {[
            {
              label: "Total Products",
              value: totalProducts,
              sub: `${damageLog.length ? damageLog.length + " damaged" : "catalog size"}`,
              c: "#1e293b",
              bg: "#f1f5f9",
              bd: "#e2e8f0",
              icon: "bi-boxes",
            },
            {
              label: "In Stock",
              value: inStockCount,
              sub: "Healthy stock levels",
              c: "#15803d",
              bg: "#dcfce7",
              bd: "#86efac",
              icon: "bi-check-circle-fill",
            },
            {
              label: "Low Stock",
              value: lowStockCount,
              sub: "At or below minimum",
              c: "#b45309",
              bg: "#fef9c3",
              bd: "#fde68a",
              icon: "bi-exclamation-triangle-fill",
            },
            {
              label: "Out of Stock",
              value: outStockCount,
              sub: "Needs restocking",
              c: "#dc2626",
              bg: "#fee2e2",
              bd: "#fca5a5",
              icon: "bi-x-circle-fill",
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

        {stockAlert && (
          <div className="at-alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <div>
              <strong>Stock Alert</strong>
              <br />
              {stockAlert}
            </div>
            <button
              className="at-alert-close"
              onClick={() => setStockAlert("")}
              title="Dismiss"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        )}

        {error && (
          <div className="at-error-banner">
            <i className="bi bi-exclamation-circle-fill"></i>
            <span>{error}</span>
          </div>
        )}

        {editingId !== null && showForm && (
          <div className="at-editing-bar">
            <i className="bi bi-pencil-fill"></i>
            Editing:{" "}
            <strong>
              {products.find((p) => p.id === editingId)?.productName}
            </strong>
            <button className="at-btn at-btn--ghost" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit}>
            <div className="at-card">
              <div className="at-card__head">
                <div className="at-card__head-left">
                  <i
                    className={`bi ${editingId !== null ? "bi-pencil-fill" : "bi-plus-circle-fill"}`}
                  ></i>
                  <span>
                    {editingId !== null
                      ? isPurchase ? "Edit Purchase Product" : "Edit Product"
                      : isPurchase ? "Add Purchase" : "Add New Product"}
                  </span>
                </div>
              </div>
              <p className="at-form-section">Product Information</p>
              <div className="at-form-grid" style={{ marginBottom: 20 }}>
                <div className="at-fg">
                  <label className="at-label">
                    Product Name <span className="req">*</span>
                  </label>
                  <input
                    className={`at-input ${nameDup ? "error-field" : ""}`}
                    name="productName"
                    value={form.productName}
                    onChange={handleChange}
                    placeholder="e.g. Chain Link Fence Roll"
                    required
                  />
                  {nameDup && (
                    <span className="at-hint error-hint">
                      This product name already exists in this branch
                    </span>
                  )}
                </div>
                <div className="at-fg">
                  <label className="at-label">HSN</label>
                  <input
                    className={`at-input ${hsnDup ? "error-field" : ""}`}
                    name="hsn"
                    value={form.hsn}
                    onChange={handleChange}
                    placeholder="e.g. PRD-001"
                  />
                </div>
                <div className="at-fg">
                  <label className="at-label">{isPurchase ? "Purchase Date" : "Date"}</label>
                  <input
                    type="date"
                    className="at-input"
                    name="productDate"
                    value={form.productDate}
                    onChange={handleChange}
                  />
                </div>
                {isPurchase && (
                  <>
                    <div className="at-fg">
                      <label className="at-label">Supplier</label>
                      <input className="at-input" name="supplier" value={form.supplier} onChange={handleChange} />
                    </div>
                    <div className="at-fg">
                      <label className="at-label">Product Code / SKU</label>
                      <input className="at-input" name="sku" value={form.sku} onChange={handleChange} />
                    </div>
                    {editingId === null && (
                      <div className="at-fg">
                        <label className="at-label">Purchase Bill / Reference</label>
                        <input className="at-input" name="reference" value={form.reference} onChange={handleChange} />
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="at-form-grid at-form-grid--4">
                <div className="at-fg">
                  <label className="at-label">Unit</label>
                  <select
                    className="at-select"
                    name="unit"
                    value={form.unit}
                    onChange={handleChange}
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="at-fg">
                  <label className="at-label">{isPurchase ? "Purchase Price (INR)" : "Factory Price (INR)"}</label>
                  <input
                    type="number"
                    className="at-input"
                    name="factoryPrice"
                    value={form.factoryPrice}
                    onChange={handleChange}
                    onWheel={(e) => e.target.blur()}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="at-fg at-fg--2">
                  <label className="at-label">Selling Price (INR)</label>
                  <input
                    type="number"
                    className="at-input"
                    name="sellingPrice"
                    value={form.sellingPrice}
                    onChange={handleChange}
                    onWheel={(e) => e.target.blur()}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div className="at-card">
              <div className="at-card__head">
                <div className="at-card__head-left">
                  <i className="bi bi-boxes"></i>
                  <span>Stock Information</span>
                </div>
              </div>
              <div
                className={`at-form-grid${editingId !== null ? " at-form-grid--4" : ""}`}
                style={{ marginBottom: 20 }}
              >
                <div className="at-fg">
                  <label className="at-label">{isPurchase && editingId === null ? "Quantity Purchased" : "Current Stock Qty"}</label>
                  {(() => {
                    const extra = Number(addStockQty) || 0;
                    const base = Number(form.stockQty) || 0;
                    const total =
                      editingId !== null && extra > 0 ? base + extra : base;
                    const display =
                      editingId !== null && extra > 0 ? total : form.stockQty;
                    const hasAdded = editingId !== null && extra > 0;
                    const isOut = total === 0 && form.stockQty !== "";
                    const isLow =
                      total > 0 &&
                      total <= Number(form.minStock) &&
                      form.minStock !== "";
                    return (
                      <input
                        type="number"
                        className="at-input"
                        name="stockQty"
                        value={display}
                        onChange={hasAdded ? undefined : handleChange}
                        readOnly={hasAdded}
                        onWheel={(e) => e.target.blur()}
                        placeholder="e.g. 100"
                        min="0"
                        style={
                          hasAdded
                            ? {
                                borderColor: "#22c55e",
                                background: "#f0fdf4",
                                fontWeight: 700,
                                color: "#15803d",
                                cursor: "default",
                              }
                            : isOut
                              ? {
                                  borderColor: "#ef4444",
                                  background: "#fff5f5",
                                }
                              : isLow
                                ? {
                                    borderColor: "#f59e0b",
                                    background: "#fffdf0",
                                  }
                                : {}
                        }
                      />
                    );
                  })()}
                </div>
                {editingId !== null && (
                  <div className="at-fg">
                    <label className="at-label" style={{ color: "#008b3e" }}>
                      + Add Stock Qty
                    </label>
                    <input
                      type="number"
                      className="at-input"
                      value={addStockQty}
                      onChange={(e) => setAddStockQty(e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      placeholder="e.g. 50"
                      min="0"
                      style={{ borderColor: "#008b3e", background: "#f0fdf4" }}
                    />
                  </div>
                )}
                <div className="at-fg at-fg--2">
                  <label className="at-label">Minimum Stock Alert</label>
                  <input
                    type="number"
                    className="at-input"
                    name="minStock"
                    value={form.minStock}
                    onChange={handleChange}
                    onWheel={(e) => e.target.blur()}
                    placeholder="e.g. 10"
                    min="0"
                  />
                  <span className="at-hint">
                    Alert triggers when stock is at or below this value
                  </span>
                </div>
              </div>
              <div className="at-fg" style={{ marginBottom: 20 }}>
                <label className="at-label">Description</label>
                <textarea
                  className="at-textarea"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Product description, specifications, notes..."
                />
              </div>
              <div className="at-form-actions">
                <button type="submit" className="at-btn at-btn--primary">
                  <i
                    className={`bi ${editingId !== null ? "bi-check-circle" : "bi-check-lg"}`}
                  ></i>
                  {editingId !== null
                    ? isPurchase ? "Update Purchase Product" : "Update Product"
                    : isPurchase ? "Save Purchase" : "Save Product"}
                </button>
                <button
                  type="button"
                  className="at-btn at-btn--ghost"
                  onClick={cancelEdit}
                >
                  <i className="bi bi-x-lg"></i> Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {!showForm && (
          <>
            <div className="sl-tabs">
              <button
                className={`sl-tab${activeView === "products" ? " active" : ""}`}
                onClick={() => setActiveView("products")}
              >
                <i className="bi bi-box-seam"></i> Products
              </button>
              <button
                className={`sl-tab${activeView === "damage" ? " active" : ""}`}
                onClick={openDamageTab}
              >
                <i className="bi bi-exclamation-triangle"></i> Damage Log
              </button>
            </div>

            {activeView === "products" && (
              <div className="at-card">
                <div className="at-card__head">
                  <div className="at-card__head-left">
                    <i className="bi bi-box-seam"></i>
                    <span>{isPurchase ? "Purchase Catalog" : "Product Catalog"}</span>
                  </div>
                  <span className="at-card__count">
                    {loading
                      ? "Loading…"
                      : `${products.length} product${products.length !== 1 ? "s" : ""}`}
                  </span>
                </div>

                {loading ? (
                  <div className="at-loading">
                    <div className="at-spinner"></div>
                    <span>Loading products…</span>
                  </div>
                ) : products.length === 0 ? (
                  <div className="at-empty">
                    <i className="bi bi-inbox"></i>
                    <p>No products yet</p>
                    <span>Add your first product to get started.</span>
                  </div>
                ) : (
                  <div className="at-timeline">
                    {products.map((p) => {
                      const status = getStockStatus(p.stockQty, p.minStock);
                      const meta = STOCK_META[status];
                      return (
                        <Fragment key={p.id}>
                          <div className="at-bubble">
                            <div className="at-bubble-head">
                              <div>
                                <div className="at-bubble-name">
                                  {p.productName}
                                </div>
                                {p.description && (
                                  <div className="at-bubble-desc">
                                    {p.description.substring(0, 70)}
                                    {p.description.length > 70 ? "…" : ""}
                                  </div>
                                )}
                              </div>
                              <span
                                className="at-status-badge"
                                style={{
                                  background: meta.bg,
                                  color: meta.color,
                                }}
                              >
                                <i className={`bi ${meta.icon}`}></i>
                                {status === "ok"
                                  ? `${p.stockQty} in stock`
                                  : status === "low"
                                    ? `Low (${p.stockQty})`
                                    : meta.label}
                              </span>
                            </div>
                            <div className="at-bubble-body">
                              {p.hsn && (
                                <div className="at-bubble-stat">
                                  <b>HSN</b>
                                  {p.hsn}
                                </div>
                              )}
                              <div className="at-bubble-stat">
                                <b>Date</b>
                                {p.productDate
                                  ? new Date(p.productDate).toLocaleDateString(
                                      "en-GB",
                                    )
                                  : "—"}
                              </div>
                              <div className="at-bubble-stat">
                                <b>Unit</b>
                                {p.unit}
                              </div>
                              <div className="at-bubble-stat">
                                <b>{isPurchase ? "Purchase Price" : "Factory Price"}</b>
                                &#8377;{Number(p.factoryPrice || 0).toFixed(2)}
                              </div>
                              <div className="at-bubble-stat">
                                <b>Selling Price</b>
                                &#8377;{Number(p.sellingPrice || 0).toFixed(2)}
                              </div>
                              {isPurchase && p.supplier && (
                                <div className="at-bubble-stat">
                                  <b>Supplier</b>
                                  {p.supplier}
                                </div>
                              )}
                              {isPurchase && p.sku && (
                                <div className="at-bubble-stat">
                                  <b>Code / SKU</b>
                                  {p.sku}
                                </div>
                              )}
                              <div className="at-bubble-stat">
                                <b>Branch</b>
                                <span style={{ color: "#047857", fontWeight: 700 }}>
                                  {p.branchId ? branchLabel(p.branchId) : "All Branches"}
                                </span>
                              </div>
                              {(() => {
                                const all = branchesForName(products, p.productName);
                                const own = p.branchId ? branchLabel(p.branchId) : "All Branches";
                                return all && all !== own ? (
                                  <div className="at-bubble-stat">
                                    <b>Available In</b>
                                    {all}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            <div className="at-bubble-foot">
                              <span></span>
                              <div className="at-bubble-actions">
                                <button
                                  className="at-act-btn at-act-btn--stockin"
                                  onClick={() =>
                                    stockInOpenId === p.id
                                      ? cancelStockIn()
                                      : openStockIn(p.id)
                                  }
                                >
                                  <i className="bi bi-plus-lg"></i> Stock In
                                </button>
                                <button
                                  className="at-act-btn"
                                  title="View stock-in / stock-out statement of this product"
                                  onClick={() =>
                                    navigate(
                                      `/statements?type=product&product_id=${p.id}&src=${isPurchase ? "purchase" : "product"}&product=${encodeURIComponent(p.productName || "")}${p.branchId ? `&branch=${p.branchId}` : ""}`,
                                    )
                                  }
                                >
                                  <i className="bi bi-journal-text"></i> Statement
                                </button>
                                {isAdmin && (
                                  <>
                                    <button
                                      className="at-act-btn at-act-btn--stockout"
                                      onClick={() =>
                                        stockOutOpenId === p.id
                                          ? cancelStockOut()
                                          : openStockOut(p.id)
                                      }
                                    >
                                      <i className="bi bi-dash-lg"></i> Stock Out
                                    </button>
                                    <button
                                      className="at-act-btn at-act-btn--edit"
                                      onClick={() => handleEdit(p)}
                                    >
                                      <i className="bi bi-pencil"></i> Edit
                                    </button>
                                    <button
                                      className="at-act-btn at-act-btn--delete"
                                      onClick={() => setDeleteConfirmProduct(p)}
                                    >
                                      <i className="bi bi-trash"></i> Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {stockInOpenId === p.id && (
                              <div className="at-inline-edit">
                                <span className="at-inline-edit__label">
                                  Add stock:
                                </span>
                                <input
                                  type="number"
                                  className="at-input"
                                  style={{ width: 110, height: 34 }}
                                  value={stockInQty}
                                  onChange={(e) =>
                                    setStockInQty(e.target.value)
                                  }
                                  onWheel={(e) => e.target.blur()}
                                  placeholder="Qty"
                                  min="1"
                                  autoFocus
                                />
                                {[10, 50, 100, 500].map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    className="at-chip"
                                    onClick={() => setStockInQty(String(q))}
                                  >
                                    +{q}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className="at-btn at-btn--primary"
                                  style={{
                                    padding: "6px 16px",
                                    fontSize: 12.5,
                                  }}
                                  onClick={() => confirmStockIn(p.id)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="at-btn at-btn--ghost"
                                  style={{
                                    padding: "6px 16px",
                                    fontSize: 12.5,
                                  }}
                                  onClick={cancelStockIn}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            {stockOutOpenId === p.id && (
                              <div className="at-inline-edit at-inline-edit--out">
                                <span className="at-inline-edit__label">
                                  Damaged qty:
                                </span>
                                <input
                                  type="number"
                                  className="at-input"
                                  style={{ width: 110, height: 34 }}
                                  value={stockOutQty}
                                  onChange={(e) =>
                                    setStockOutQty(e.target.value)
                                  }
                                  onWheel={(e) => e.target.blur()}
                                  placeholder="Qty"
                                  min="1"
                                  max={p.stockQty}
                                  autoFocus
                                />
                                {[1, 5, 10].map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    className="at-chip at-chip--out"
                                    onClick={() => setStockOutQty(String(q))}
                                  >
                                    -{q}
                                  </button>
                                ))}
                                <span
                                  style={{ fontSize: 12, color: "#94a3b8" }}
                                >
                                  Available: {p.stockQty}
                                </span>
                                <button
                                  type="button"
                                  className="at-btn at-btn--primary"
                                  style={{
                                    padding: "6px 16px",
                                    fontSize: 12.5,
                                  }}
                                  onClick={() => confirmStockOut(p)}
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="at-btn at-btn--ghost"
                                  style={{
                                    padding: "6px 16px",
                                    fontSize: 12.5,
                                  }}
                                  onClick={cancelStockOut}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeView === "damage" && (
              <div className="at-card">
                <div className="at-card__head">
                  <div className="at-card__head-left">
                    <i className="bi bi-exclamation-triangle"></i>
                    <span>Damage Log</span>
                  </div>
                  <span className="at-card__count">
                    {damageLoading
                      ? "Loading…"
                      : `${damageLog.length} record${damageLog.length !== 1 ? "s" : ""}`}
                  </span>
                </div>

                {damageLoading ? (
                  <div className="at-loading">
                    <div className="at-spinner"></div>
                    <span>Loading damage log…</span>
                  </div>
                ) : damageLog.length === 0 ? (
                  <div className="at-empty">
                    <i className="bi bi-check2-circle"></i>
                    <p>No damage records yet</p>
                    <span>Damaged stock will be logged here.</span>
                  </div>
                ) : (
                  <div className="at-timeline">
                    {damageLog.map((d) => (
                      <Fragment key={d.id}>
                        <div className="at-bubble">
                          <div className="at-bubble-head">
                            <div className="at-bubble-name">
                              {d.productName}
                            </div>
                            <span
                              className="at-status-badge"
                              style={{
                                background: "#fee2e2",
                                color: "#dc2626",
                              }}
                            >
                              <i className="bi bi-x-circle-fill"></i>
                              {d.qty} damaged
                            </span>
                          </div>
                          <div className="at-bubble-body">
                            <div className="at-bubble-stat">
                              <b>Date of Damage</b>
                              {d.damageDate
                                ? new Date(d.damageDate).toLocaleDateString(
                                    "en-GB",
                                  )
                                : "—"}
                            </div>
                            <div className="at-bubble-stat">
                              <b>Total Stock (at time)</b>
                              {d.stockQty}
                            </div>
                          </div>
                          <div className="at-bubble-foot">
                            <span></span>
                            {isAdmin ? (
                              <div className="at-bubble-actions">
                                <button
                                  className="at-act-btn at-act-btn--edit"
                                  onClick={() =>
                                    editingDamageId === d.id
                                      ? cancelDamageEdit()
                                      : openDamageEdit(d)
                                  }
                                >
                                  <i
                                    className={`bi ${editingDamageId === d.id ? "bi-x-lg" : "bi-pencil"}`}
                                  ></i>
                                  {editingDamageId === d.id ? "Close" : "Edit"}
                                </button>
                                <button
                                  className="at-act-btn at-act-btn--delete"
                                  onClick={() => setDeleteConfirmDamage(d)}
                                >
                                  <i className="bi bi-trash"></i> Delete
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                View only
                              </span>
                            )}
                          </div>
                          {editingDamageId === d.id && (
                            <div className="at-inline-edit">
                              <span className="at-inline-edit__label">
                                Edit record:
                              </span>
                              <input
                                type="date"
                                className="at-input"
                                style={{ width: 150, height: 34 }}
                                value={damageEditForm.damageDate}
                                onChange={(e) =>
                                  setDamageEditForm({
                                    ...damageEditForm,
                                    damageDate: e.target.value,
                                  })
                                }
                              />
                              <input
                                type="number"
                                className="at-input"
                                style={{ width: 100, height: 34 }}
                                value={damageEditForm.qty}
                                onChange={(e) =>
                                  setDamageEditForm({
                                    ...damageEditForm,
                                    qty: e.target.value,
                                  })
                                }
                                onWheel={(e) => e.target.blur()}
                                placeholder="Qty"
                                min="1"
                              />
                              <button
                                type="button"
                                className="at-btn at-btn--primary"
                                style={{ padding: "6px 16px", fontSize: 12.5 }}
                                onClick={() => saveDamageEdit(d.id)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="at-btn at-btn--ghost"
                                style={{ padding: "6px 16px", fontSize: 12.5 }}
                                onClick={cancelDamageEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
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
                  Delete <strong>{deleteConfirmProduct.productName}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  This action is permanent and cannot be undone.
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

        {deleteConfirmDamage && (
          <div
            className="at-overlay"
            onClick={() => setDeleteConfirmDamage(null)}
          >
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title">
                  <i className="bi bi-trash"></i> Delete Damage Record
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setDeleteConfirmDamage(null)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="at-modal__body">
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>
                  Delete the damage record for{" "}
                  <strong>{deleteConfirmDamage.productName}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  The {deleteConfirmDamage.qty} unit(s) will be added back to
                  stock. This action is permanent.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--ghost"
                  onClick={() => setDeleteConfirmDamage(null)}
                >
                  Cancel
                </button>
                <button
                  className="at-btn at-btn--danger"
                  onClick={confirmDeleteDamage}
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