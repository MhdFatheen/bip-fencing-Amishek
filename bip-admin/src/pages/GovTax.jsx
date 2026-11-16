// =============================================================
//  GovTax.jsx — Sales Register · Purchase Register · Monthly adjustment
//  A separate reporting layer. Everything edited here is stored by
//  backend/govtax_api.php in its own tables — the original Tax Invoices,
//  Purchase Bills, payments and customer balances are never changed.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../utils/api";
import { branchLabel } from "../utils/branchNames";

const COMPANY = {
  name: "BIP FENCING CONTRACT WORK",
  address: "NO. 26/A, MAIN ROAD, PAMBANKULAM, KALANTHAPANAI, PANAGUDI - 627109",
  gst: "33ABLPI5244C1Z1",
};

const money = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d) => (d ? d.split("-").reverse().join("-") : "");
const monthStart = (ym) => `${ym}-01`;
const monthEnd = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const monthName = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const SALES_COLS = [
  { k: "date", l: "Date", t: "date" },
  { k: "particulars", l: "Particulars", t: "text" },
  { k: "voucher", l: "Voucher Type", t: "text" },
  { k: "bill_no", l: "Bill No.", t: "text" },
  { k: "gstin", l: "GSTIN/UIN", t: "text" },
  { k: "value", l: "Value", t: "num" },
  { k: "gross", l: "Gross Total", t: "num" },
  { k: "gst_sales", l: "GST Sales", t: "num" },
  { k: "cgst", l: "CGST Tax", t: "num" },
  { k: "sgst", l: "SGST Tax", t: "num" },
  { k: "igst", l: "IGST Tax", t: "num" },
  { k: "round_off", l: "Rounding Off", t: "num" },
];
const PURCHASE_COLS = [
  { k: "date", l: "Date", t: "date" },
  { k: "particulars", l: "Particulars", t: "text" },
  { k: "voucher", l: "Voucher Type", t: "text" },
  { k: "bill_no", l: "Bill No.", t: "text" },
  { k: "gstin", l: "GSTIN/UIN", t: "text" },
  { k: "value", l: "Value", t: "num" },
  { k: "additional_cost", l: "Additional Cost", t: "num" },
  { k: "gross", l: "Gross Total", t: "num" },
  { k: "gst_purchase", l: "GST Purchase", t: "num" },
  { k: "cgst", l: "CGST Tax", t: "num" },
  { k: "sgst", l: "SGST Tax", t: "num" },
  { k: "igst", l: "IGST Tax", t: "num" },
  { k: "round_off", l: "Rounding Off", t: "num" },
];

export default function GovTax() {
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [tab, setTab] = useState("sales");
  const [month, setMonth] = useState(thisMonth);
  const [from, setFrom] = useState(monthStart(thisMonth));
  const [to, setTo] = useState(monthEnd(thisMonth));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const [autoJumped, setAutoJumped] = useState(false);

  // adjustment form
  const [manual, setManual] = useState("0");
  const [carry, setCarry] = useState("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);

  // purchase edit modal
  const [edit, setEdit] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editHistory, setEditHistory] = useState([]);

  const branchName = branchLabel(localStorage.getItem("admin_view_branch") || "") || "All Branches";

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({ action: "data", from, to, month });
      const res = await apiFetch(`/govtax_api.php?${q.toString()}`);
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.error || "Could not load Gov Tax data");
      setData(d);
      // First open: if this month has nothing but older GST records exist, show the latest month with data
      if (!autoJumped) {
        setAutoJumped(true);
        const empty = d.sales.rows.length === 0 && d.purchase.rows.length === 0;
        const lm = d.meta?.latest_month;
        if (empty && lm && lm !== month) {
          setMonth(lm);
          setFrom(monthStart(lm));
          setTo(monthEnd(lm));
          return;
        }
      }
      if (d.adjustment) {
        setManual(String(d.adjustment.manual_adjustment));
        setCarry(String(d.adjustment.balance_used));
        setNote(d.adjustment.note || "");
      }
    } catch (e) {
      setErr(e.message || "Could not load Gov Tax data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, month, autoJumped]);

  useEffect(() => {
    load();
    // reload when the topbar branch changes (stored in localStorage by the topbar)
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("branchChanged", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("branchChanged", onStorage);
    };
  }, [load]);

  const pickMonth = (ym) => {
    if (!ym) return;
    setMonth(ym);
    setFrom(monthStart(ym));
    setTo(monthEnd(ym));
  };
  const changeFrom = (v) => {
    setFrom(v);
    if (v) setMonth(v.slice(0, 7));
  };

  const adj = data?.adjustment;
  const multiMonth = from && to && from.slice(0, 7) !== to.slice(0, 7);
  const partialMonth = from && to && !multiMonth && (from !== monthStart(month) || to !== monthEnd(month));

  const saveAdjustment = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/govtax_api.php", {
        method: "POST",
        body: JSON.stringify({
          action: "save_adjustment",
          month,
          manual: Number(manual || 0),
          carry_used: Number(carry || 0),
          note,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || "Could not save adjustment");
      showToast("Adjustment saved");
      load();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    try {
      const res = await apiFetch(`/govtax_api.php?action=history&month=${month}`);
      const d = await res.json();
      setHistory(d.adjustments || []);
    } catch {
      setHistory([]);
    }
  };

  const openEdit = async (row) => {
    setEdit({
      id: row.id,
      bill_no: row.bill_no,
      gst_rate: row.gst_rate,
      gst_type: row.gst_type,
      original: row.original,
      f: {
        particulars: row.particulars,
        gstin: row.gstin,
        taxable: String(row.value),
        additional_cost: String(row.additional_cost),
        cgst: String(row.cgst),
        sgst: String(row.sgst),
        igst: String(row.igst),
        round_off: String(row.round_off),
      },
      edited: row.edited,
    });
    setEditNote("");
    setEditHistory([]);
    try {
      const res = await apiFetch(`/govtax_api.php?action=history&purchase_bill_id=${row.id}`);
      const d = await res.json();
      setEditHistory(d.purchase_edits || []);
    } catch {
      /* history is optional */
    }
  };

  const setF = (k, v) =>
    setEdit((e) => {
      const f = { ...e.f, [k]: v };
      // changing the taxable value re-computes the tax at the bill's GST rate (still editable)
      if (k === "taxable" && v !== "" && !isNaN(Number(v))) {
        const gst = Math.round(Number(v) * e.gst_rate) / 100;
        if (e.gst_type === "igst") {
          f.igst = gst.toFixed(2);
          f.cgst = "0";
          f.sgst = "0";
        } else {
          const half = Math.round(gst * 50) / 100;
          f.cgst = half.toFixed(2);
          f.sgst = (Math.round((gst - half) * 100) / 100).toFixed(2);
          f.igst = "0";
        }
      }
      return { ...e, f };
    });

  const editGross = useMemo(() => {
    if (!edit) return 0;
    const n = (v) => Number(v || 0);
    return n(edit.f.taxable) + n(edit.f.additional_cost) + n(edit.f.cgst) + n(edit.f.sgst) + n(edit.f.igst) + n(edit.f.round_off);
  }, [edit]);

  const saveEdit = async () => {
    try {
      const res = await apiFetch("/govtax_api.php", {
        method: "POST",
        body: JSON.stringify({ action: "purchase_override", purchase_bill_id: edit.id, ...edit.f, note: editNote }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || "Could not save");
      setEdit(null);
      showToast("Gov Tax purchase register updated (original bill unchanged)");
      load();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const resetEdit = async () => {
    try {
      const res = await apiFetch("/govtax_api.php", {
        method: "POST",
        body: JSON.stringify({ action: "purchase_reset", purchase_bill_id: edit.id }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || "Could not reset");
      setEdit(null);
      showToast("Restored to the original bill values");
      load();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const cols = tab === "sales" ? SALES_COLS : PURCHASE_COLS;
  const rows = data ? (tab === "sales" ? data.sales.rows : data.purchase.rows) : [];
  const totals = data ? (tab === "sales" ? data.sales.totals : data.purchase.totals) : {};
  const sumCols = tab === "sales" ? ["value", "gross", "gst_sales", "cgst", "sgst", "igst", "round_off"] : ["value", "additional_cost", "gross", "gst_purchase", "cgst", "sgst", "igst", "round_off"];
  const labelSpan = 5; // Date … GSTIN/UIN

  const val = (r, c) => {
    if (c.t === "date") return dmy(r[c.k]);
    if (c.t === "num") return money(r[c.k]);
    return r[c.k] || (c.k === "gstin" ? "" : "—");
  };

  return (
    <div className="gt-root">
      <div className="gt-head">
        <div>
          <h1 className="gt-title">Gov Tax</h1>
          <p className="gt-sub">GST registers and monthly adjustment — a separate layer, original bills are never changed.</p>
        </div>
        <span className="gt-branch">{branchName}</span>
      </div>

      <div className="gt-tabs">
        <button className={`gt-tab${tab === "sales" ? " gt-tab--on" : ""}`} onClick={() => setTab("sales")}>
          Sales Register {data && <span className="gt-badge">{data.sales.rows.length}</span>}
        </button>
        <button className={`gt-tab${tab === "purchase" ? " gt-tab--on" : ""}`} onClick={() => setTab("purchase")}>
          Purchase Register {data && <span className="gt-badge">{data.purchase.rows.length}</span>}
        </button>
      </div>

      <div className="gt-filters">
        <label>
          <span>Month</span>
          <input type="month" value={month} onChange={(e) => pickMonth(e.target.value)} />
        </label>
        <label>
          <span>Start Date</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => changeFrom(e.target.value)} />
        </label>
        <label>
          <span>End Date</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="gt-btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {err && <div className="gt-err">{err}</div>}

      <div className="gt-paper">
        <div className="gt-paper__top">
          <div className="gt-co">{COMPANY.name}</div>
          <div className="gt-addr">{COMPANY.address}</div>
          <div className="gt-addr">GSTIN: {COMPANY.gst}</div>
          <div className="gt-reg">{tab === "sales" ? "Sales Register" : "Purchase Register"}</div>
          <div className="gt-addr">
            {dmy(from)} to {dmy(to)}
          </div>
        </div>

        <div className="gt-scroll">
          <table className="gt-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.k} className={c.t === "num" ? "r" : ""}>
                    {c.l}
                  </th>
                ))}
                {tab === "purchase" && <th className="gt-noprint">Edit</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + (tab === "purchase" ? 1 : 0)} className="gt-empty">
                    {loading ? (
                      "Loading…"
                    ) : (
                      <EmptyHint tab={tab} meta={data?.meta} month={month} onJump={pickMonth} />
                    )}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={`${tab}-${r.id}`} className={r.edited ? "gt-edited" : ""}>
                  {cols.map((c) => (
                    <td key={c.k} className={c.t === "num" ? "r" : ""}>
                      {val(r, c)}
                      {c.k === "bill_no" && r.edited && <span className="gt-tag">Edited</span>}
                      {c.k === "igst" && Number(r.igst) !== 0 ? "" : ""}
                    </td>
                  ))}
                  {tab === "purchase" && (
                    <td className="gt-noprint">
                      <button className="gt-btn gt-btn--sm" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="gt-total">
                  <td colSpan={labelSpan}>Grand Total{tab === "sales" ? " (Actual)" : ""}</td>
                  {cols.slice(labelSpan).map((c) => (
                    <td key={c.k} className="r">
                      {sumCols.includes(c.k) ? money(totals[c.k]) : ""}
                    </td>
                  ))}
                  {tab === "purchase" && <td className="gt-noprint"></td>}
                </tr>
                {tab === "sales" && adj && !multiMonth && !partialMonth && (
                  <tr className="gt-total gt-total--adj">
                    <td colSpan={labelSpan}>Adjusted Grand Total — GST Sales ({monthName(month)})</td>
                    {cols.slice(labelSpan).map((c) => (
                      <td key={c.k} className="r">
                        {c.k === "gst_sales" ? money(adj.final_sales) : ""}
                      </td>
                    ))}
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {tab === "purchase" && (
        <p className="gt-note">
          Edits made here change only the Gov Tax Purchase Register (and the monthly sales adjustment). The original
          Purchase Bill is not modified.
        </p>
      )}

      {tab === "sales" && adj && (
        <div className="gt-adj">
          <div className="gt-adj__head">
            <div>
              <h2>Monthly Sales Adjustment — {monthName(month)}</h2>
              <p>
                Adjusted sales never exceed the month's GST purchases. This is a Gov Tax figure only; invoices are not
                changed.
                {(multiMonth || partialMonth) && " The adjustment always covers the whole selected month, whatever date range is shown above."}
              </p>
            </div>
            <button className="gt-btn gt-btn--ghost" onClick={openHistory}>
              History
            </button>
          </div>

          <div className="gt-grid">
            <Stat l="Actual Sales Total" v={adj.actual_sales} />
            <Stat l="Purchase Total" v={adj.purchase_total} />
            <Stat l="Automatic Adjustment" v={adj.auto_adjustment} c="amber" />
            <Stat l="Manual Adjustment" v={adj.manual_adjustment} c="amber" />
            <Stat l="Final Adjusted Sales Total" v={adj.final_sales} c="green" big />
            <Stat l="Previous Month Carry Forward" v={adj.prev_carry_forward} />
            <Stat l="Adjustment Balance Used" v={adj.balance_used} />
            <Stat l="Remaining Adjustment Balance" v={adj.remaining} />
            <Stat l="Current Month Carry Forward" v={adj.carry_forward} c="blue" big />
          </div>

          <div className="gt-form">
            <label>
              <span>
                Manual adjustment (max ₹{money(adj.max_manual)})
              </span>
              <input type="number" min="0" step="0.01" value={manual} onChange={(e) => setManual(e.target.value)} />
            </label>
            <label>
              <span>
                Use carry-forward balance (available ₹{money(adj.prev_carry_forward)})
              </span>
              <input type="number" min="0" step="0.01" value={carry} onChange={(e) => setCarry(e.target.value)} />
            </label>
            <label className="gt-form__note">
              <span>Note (optional)</span>
              <input type="text" maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="gt-btn gt-btn--primary" onClick={saveAdjustment} disabled={saving}>
              {saving ? "Saving…" : "Save Adjustment"}
            </button>
          </div>
          {adj.clamped && (
            <div className="gt-warn">
              Saved manual / carry-forward amounts were reduced automatically because the underlying sales or purchases
              changed.
            </div>
          )}
          <p className="gt-note">
            Unused balance (automatic difference not used + unused carry-forward) moves to next month as its opening
            balance. Use it there with “Use carry-forward balance”.
          </p>
        </div>
      )}

      {tab === "sales" && data?.months?.length > 0 && (
        <div className="gt-months">
          <h3>Month-wise summary</h3>
          <div className="gt-scroll">
            <table className="gt-table gt-table--sm">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="r">Actual Sales</th>
                  <th className="r">Purchase</th>
                  <th className="r">Auto Adj.</th>
                  <th className="r">Manual Adj.</th>
                  <th className="r">Opening Bal.</th>
                  <th className="r">Used</th>
                  <th className="r">Final Sales</th>
                  <th className="r">Carry Forward</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className={m.month === month ? "gt-edited" : ""} onClick={() => pickMonth(m.month)} style={{ cursor: "pointer" }}>
                    <td>{monthName(m.month)}</td>
                    <td className="r">{money(m.actual_sales)}</td>
                    <td className="r">{money(m.purchase_total)}</td>
                    <td className="r">{money(m.auto_adjustment)}</td>
                    <td className="r">{money(m.manual_adjustment)}</td>
                    <td className="r">{money(m.prev_carry_forward)}</td>
                    <td className="r">{money(m.balance_used)}</td>
                    <td className="r">{money(m.final_sales)}</td>
                    <td className="r">{money(m.carry_forward)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "purchase" && data && (
        <div className="gt-actions">
          <button className="gt-btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}
      {tab === "sales" && data && (
        <div className="gt-actions">
          <button className="gt-btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}

      {edit && (
        <div className="gt-overlay" onClick={() => setEdit(null)}>
          <div className="gt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Gov Tax edit — {edit.bill_no} {edit.edited && <span className="gt-tag">Edited</span>}
            </h3>
            <p className="gt-note" style={{ marginTop: 0 }}>
              Changes apply to the Gov Tax Purchase Register only. Original: taxable ₹{money(edit.original.taxable)}, gross ₹
              {money(edit.original.gross)}.
            </p>
            <div className="gt-mgrid">
              <label className="full">
                <span>Particulars (Supplier)</span>
                <input value={edit.f.particulars} onChange={(e) => setF("particulars", e.target.value)} />
              </label>
              <label className="full">
                <span>GSTIN/UIN</span>
                <input value={edit.f.gstin} onChange={(e) => setF("gstin", e.target.value)} />
              </label>
              <label>
                <span>Value (Taxable)</span>
                <input type="number" min="0" step="0.01" value={edit.f.taxable} onChange={(e) => setF("taxable", e.target.value)} />
              </label>
              <label>
                <span>Additional Cost</span>
                <input type="number" min="0" step="0.01" value={edit.f.additional_cost} onChange={(e) => setF("additional_cost", e.target.value)} />
              </label>
              <label>
                <span>CGST Tax</span>
                <input type="number" min="0" step="0.01" value={edit.f.cgst} disabled={edit.gst_type === "igst"} onChange={(e) => setF("cgst", e.target.value)} />
              </label>
              <label>
                <span>SGST Tax</span>
                <input type="number" min="0" step="0.01" value={edit.f.sgst} disabled={edit.gst_type === "igst"} onChange={(e) => setF("sgst", e.target.value)} />
              </label>
              <label>
                <span>IGST Tax</span>
                <input type="number" min="0" step="0.01" value={edit.f.igst} disabled={edit.gst_type !== "igst"} onChange={(e) => setF("igst", e.target.value)} />
              </label>
              <label>
                <span>Rounding Off</span>
                <input type="number" step="0.01" value={edit.f.round_off} onChange={(e) => setF("round_off", e.target.value)} />
              </label>
              <label className="full">
                <span>Reason / note (optional)</span>
                <input value={editNote} maxLength={250} onChange={(e) => setEditNote(e.target.value)} />
              </label>
            </div>
            <div className="gt-gross">Gross Total: ₹{money(editGross)}</div>
            {editHistory.length > 0 && (
              <details className="gt-hist">
                <summary>Edit history ({editHistory.length})</summary>
                {editHistory.map((h) => (
                  <div key={h.id}>
                    {h.changed_at} · {h.changed_by} · {h.action}
                    {h.note ? ` · ${h.note}` : ""}
                  </div>
                ))}
              </details>
            )}
            <div className="gt-mfoot">
              {edit.edited && (
                <button className="gt-btn gt-btn--ghost" onClick={resetEdit}>
                  Restore original
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="gt-btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="gt-btn gt-btn--primary" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="gt-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="gt-modal gt-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3>Adjustment history — {monthName(month)}</h3>
            <div className="gt-scroll">
              <table className="gt-table gt-table--sm">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>By</th>
                    <th className="r">Manual</th>
                    <th className="r">Carry used</th>
                    <th className="r">Auto</th>
                    <th className="r">Opening</th>
                    <th className="r">Closing</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={8} className="gt-empty">
                        No saved adjustments yet
                      </td>
                    </tr>
                  )}
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{h.changed_at}</td>
                      <td>{h.changed_by}</td>
                      <td className="r">
                        {money(h.old_manual)} → {money(h.new_manual)}
                      </td>
                      <td className="r">
                        {money(h.old_carry_used)} → {money(h.new_carry_used)}
                      </td>
                      <td className="r">{money(h.auto_adjustment)}</td>
                      <td className="r">{money(h.opening_balance)}</td>
                      <td className="r">{money(h.closing_balance)}</td>
                      <td>{h.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="gt-mfoot">
              <span style={{ flex: 1 }} />
              <button className="gt-btn" onClick={() => setHistoryOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {data && <PrintSheet tab={tab} rows={rows} from={from} to={to} />}

      {toast && <div className={`gt-toast gt-toast--${toast.type}`}>{toast.msg}</div>}

      <style>{`
        .gt-root { padding: 24px; background: #f8fafc; min-height: 100vh; box-sizing: border-box; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-width: 0; }
        .gt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .gt-title { margin: 0; font-size: 24px; font-weight: 800; }
        .gt-sub { margin: 4px 0 0; color: #64748b; font-size: 13px; }
        .gt-branch { background: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; padding: 5px 12px; border-radius: 999px; }
        .gt-tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .gt-tab { border: 1.5px solid #e2e8f0; background: #fff; color: #475569; font-weight: 700; font-size: 14px; padding: 9px 16px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .gt-tab--on { background: #16a34a; border-color: #16a34a; color: #fff; }
        .gt-badge { background: rgba(0,0,0,.12); border-radius: 999px; padding: 0 8px; font-size: 12px; }
        .gt-filters { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
        .gt-filters label, .gt-form label, .gt-mgrid label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #64748b; }
        .gt-filters input, .gt-form input, .gt-mgrid input { border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 14px; color: #0f172a; background: #fff; min-width: 0; box-sizing: border-box; }
        .gt-mgrid input:disabled { background: #f1f5f9; color: #94a3b8; }
        .gt-btn { border: 1.5px solid #e2e8f0; background: #fff; color: #334155; font-weight: 700; font-size: 13px; padding: 9px 14px; border-radius: 8px; cursor: pointer; }
        .gt-btn:disabled { opacity: .6; cursor: default; }
        .gt-btn--sm { padding: 4px 10px; font-size: 12px; }
        .gt-btn--primary { background: #16a34a; border-color: #16a34a; color: #fff; }
        .gt-btn--ghost { background: #f8fafc; }
        .gt-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
        .gt-paper { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .gt-paper__top { text-align: center; padding: 16px 12px 10px; border-bottom: 1.5px solid #e2e8f0; }
        .gt-co { font-weight: 800; font-size: 18px; }
        .gt-addr { color: #475569; font-size: 12.5px; margin-top: 2px; }
        .gt-reg { font-weight: 800; font-size: 15px; margin-top: 8px; }
        .gt-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: #94a3b8 #f1f5f9; }
        .gt-scroll::-webkit-scrollbar { display: block; height: 10px; width: 10px; }
        .gt-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
        .gt-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 8px; }
        .gt-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 1000px; }
        .gt-table th { background: #f1f5f9; text-align: left; padding: 9px 10px; font-size: 12px; font-weight: 700; color: #334155; border: 1px solid #e2e8f0; white-space: nowrap; }
        .gt-table td { padding: 8px 10px; border: 1px solid #eef2f7; white-space: nowrap; }
        .gt-table .r { text-align: right; font-variant-numeric: tabular-nums; }
        .gt-table--sm { min-width: 760px; }
        .gt-edited td { background: #fffbeb; }
        .gt-tag { margin-left: 6px; background: #fef3c7; color: #b45309; font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 6px; }
        .gt-empty { text-align: center; color: #94a3b8; padding: 28px !important; }
        .gt-total td { font-weight: 800; background: #f8fafc; border-top: 2px solid #cbd5e1; }
        .gt-total--adj td { background: #ecfdf5; color: #065f46; }
        .gt-note { color: #64748b; font-size: 12.5px; margin: 10px 2px; }
        .gt-adj { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-top: 16px; }
        .gt-adj__head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .gt-adj h2 { margin: 0; font-size: 16px; }
        .gt-adj p { margin: 4px 0 12px; color: #64748b; font-size: 12.5px; max-width: 720px; }
        .gt-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .gt-stat { border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #f8fafc; }
        .gt-stat span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; font-weight: 700; }
        .gt-stat b { font-size: 17px; font-variant-numeric: tabular-nums; }
        .gt-stat--green { background: #ecfdf5; border-color: #a7f3d0; } .gt-stat--green b { color: #047857; }
        .gt-stat--amber { background: #fffbeb; border-color: #fde68a; } .gt-stat--amber b { color: #b45309; }
        .gt-stat--blue { background: #eff6ff; border-color: #bfdbfe; } .gt-stat--blue b { color: #1d4ed8; }
        .gt-form { display: grid; grid-template-columns: 1fr 1fr 1.4fr auto; gap: 12px; align-items: end; margin-top: 14px; }
        .gt-warn { margin-top: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; }
        .gt-months { margin-top: 16px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px 14px 6px; }
        .gt-months h3 { margin: 0 0 10px; font-size: 14px; }
        .gt-actions { margin-top: 14px; display: flex; gap: 8px; }
        .gt-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
        .gt-modal { background: #fff; border-radius: 14px; padding: 18px 20px; width: min(560px, 100%); max-height: 90vh; overflow-y: auto; }
        .gt-modal--wide { width: min(900px, 100%); }
        .gt-modal h3 { margin: 0 0 8px; font-size: 16px; }
        .gt-mgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .gt-mgrid .full { grid-column: 1 / -1; }
        .gt-gross { margin-top: 12px; font-weight: 800; font-size: 15px; text-align: right; }
        .gt-hist { margin-top: 10px; font-size: 12px; color: #475569; }
        .gt-mfoot { display: flex; gap: 8px; margin-top: 14px; align-items: center; flex-wrap: wrap; }
        .gt-toast { position: fixed; bottom: 24px; right: 24px; background: #16a34a; color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 600; z-index: 300; max-width: 90vw; }
        .gt-toast--error { background: #dc2626; }
        @media (max-width: 900px) {
          .gt-root { padding: 14px; }
          .gt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .gt-form { grid-template-columns: 1fr; }
        }
        @media (max-width: 520px) {
          .gt-grid { grid-template-columns: 1fr; }
          .gt-mgrid { grid-template-columns: 1fr; }
          .gt-filters > label, .gt-filters > button { flex: 1 1 100%; }
        }
      `}</style>
    </div>
  );
}


// ── Print sheet: spreadsheet-style register (original values only, no adjustments) ──
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pDate = (d) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}-${MON[Number(m) - 1]}-${y.slice(2)}`;
};
const pRange = (d) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${Number(dd)}-${MON[Number(m) - 1]}-${y.slice(2)}`;
};
const f2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
// blank for zero, otherwise "1234.50 Cr" style like the reference sheet
const amt = (n, side, blankZero = true) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (blankZero && v === 0) return "";
  return `${f2(Math.abs(v))}${side ? " " + side : ""}`;
};

function PrintSheet({ tab, rows, from, to }) {
  const sales = tab === "sales";
  // Purchase rows print the ORIGINAL bill values (Gov Tax edits are never printed)
  const list = rows.map((r) => {
    if (sales) {
      const ig = r.gst_type === "igst";
      return {
        date: r.date, part: r.particulars, voucher: r.voucher, no: r.bill_no, gstin: r.gstin,
        value: r.value, add: 0, gross: r.gross,
        main: ig ? 0 : r.gst_sales, igMain: ig ? r.gst_sales : 0,
        cgst: r.cgst, sgst: r.sgst, igst: r.igst, round: r.round_off,
      };
    }
    const o = r.original;
    const ig = r.gst_type === "igst";
    return {
      date: r.date, part: o.particulars, voucher: r.voucher, no: r.bill_no, gstin: o.gstin,
      value: o.taxable, add: o.additional_cost, gross: o.gross,
      main: ig ? 0 : o.taxable, igMain: ig ? o.taxable : 0,
      cgst: o.cgst, sgst: o.sgst, igst: o.igst, round: o.round_off,
    };
  });
  const tot = list.reduce(
    (t, r) => {
      ["value", "add", "gross", "main", "igMain", "cgst", "sgst", "igst", "round"].forEach((k) => (t[k] += Number(r[k]) || 0));
      return t;
    },
    { value: 0, add: 0, gross: 0, main: 0, igMain: 0, cgst: 0, sgst: 0, igst: 0, round: 0 }
  );

  // Tally-style Dr/Cr: sales → gross Dr, sales & taxes Cr; purchase → gross Cr, purchase & taxes Dr
  const gSide = sales ? "Dr" : "Cr";
  const tSide = sales ? "Cr" : "Dr";
  const roundTxt = (v) => {
    const x = Math.round((Number(v) || 0) * 100) / 100;
    if (x === 0) return "";
    const pos = x > 0;
    const side = sales ? (pos ? "Cr" : "Dr") : pos ? "Dr" : "Cr";
    return `${f2(Math.abs(x))} ${side}`;
  };

  const head = sales
    ? ["Date", "Particulars", "Voucher Type", "Voucher No.", "GSTIN/UIN", "Value", "Gross Total", "GST SALES", "CGST TAX", "SGST TAX", "ROUNDING OFF", "IGST SALES", "IGST TAX"]
    : ["Date", "Particulars", "Voucher Type", "Bill No.", "GSTIN/UIN", "Value", "Addl. Cost", "Gross Total", "GST PURCHASE", "SGST TAX", "CGST TAX", "ROUNDING OFF", "IGST PURCHASE", "IGST TAX"];

  const cells = (r) =>
    sales
      ? [pDate(r.date), r.part, r.voucher, r.no, r.gstin, f2(r.value), amt(r.gross, gSide, false), amt(r.main, tSide), amt(r.cgst, tSide), amt(r.sgst, tSide), roundTxt(r.round), amt(r.igMain, tSide), amt(r.igst, tSide)]
      : [pDate(r.date), r.part, r.voucher, r.no, r.gstin, f2(r.value), amt(r.add, ""), amt(r.gross, gSide, false), amt(r.main, tSide), amt(r.sgst, tSide), amt(r.cgst, tSide), roundTxt(r.round), amt(r.igMain, tSide), amt(r.igst, tSide)];

  const totalCells = sales
    ? ["", "Grand Total", "", "", "", f2(tot.value), amt(tot.gross, gSide, false), amt(tot.main, tSide, false), amt(tot.cgst, tSide), amt(tot.sgst, tSide), roundTxt(tot.round), amt(tot.igMain, tSide), amt(tot.igst, tSide)]
    : ["", "Grand Total", "", "", "", f2(tot.value), amt(tot.add, ""), amt(tot.gross, gSide, false), amt(tot.main, tSide, false), amt(tot.sgst, tSide), amt(tot.cgst, tSide), roundTxt(tot.round), amt(tot.igMain, tSide), amt(tot.igst, tSide)];

  const numFrom = 5; // columns from "Value" onwards are right aligned
  return createPortal(
    <div className="gt-printsheet">
      <style>{`
        .gt-printsheet { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          #root { display: none !important; }
          .gt-printsheet { display: block !important; width: 100%; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; }
        }
        .gt-ps-co { font-weight: 700; font-size: 15px; }
        .gt-ps-line { font-size: 10px; line-height: 1.35; }
        .gt-ps-title { font-weight: 700; font-size: 13px; margin-top: 6px; }
        .gt-ps-table { border-collapse: collapse; width: 100%; margin-top: 6px; font-size: 9px; table-layout: auto; }
        .gt-ps-table th { border: 1px solid #999; padding: 3px 4px; font-weight: 500; text-align: center; vertical-align: bottom; }
        .gt-ps-table td { border: 1px solid #bbb; padding: 2px 4px; white-space: nowrap; }
        .gt-ps-table td.n { text-align: right; }
        .gt-ps-table tr { page-break-inside: avoid; }
        .gt-ps-table thead { display: table-header-group; }
        .gt-ps-gt td { font-weight: 700; border-top: 1.5px solid #000; }
      `}</style>
      <div className="gt-ps-co">{COMPANY.name}</div>
      <div className="gt-ps-line">NO : 26/A, MAIN ROAD,PAMBANKULAM,</div>
      <div className="gt-ps-line">KALANTHAPANAI, PANAGUDI-627109</div>
      <div className="gt-ps-title">{sales ? "Sales Register" : "Purchase Register"}</div>
      <div className="gt-ps-line">
        {pRange(from)} to {pRange(to)}
      </div>
      <table className="gt-ps-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i}>
              {cells(r).map((c, k) => (
                <td key={k} className={k >= numFrom ? "n" : ""}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          <tr className="gt-ps-gt">
            {totalCells.map((c, k) => (
              <td key={k} className={k >= numFrom ? "n" : k === 1 ? "n" : ""}>
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>,
    document.body
  );
}

function EmptyHint({ tab, meta, month, onJump }) {
  if (!meta) return "No GST records in this period";
  const total = tab === "sales" ? meta.gst_sales_total_count : meta.gst_purchase_total_count;
  const lm = tab === "sales" ? meta.latest_month : meta.latest_purchase_month;
  const label = tab === "sales" ? "GST sales invoices" : "GST purchase bills";
  return (
    <div>
      <div>No {label} in this period.</div>
      {total > 0 && lm && lm !== month && (
        <div style={{ marginTop: 8 }}>
          {total} {label} exist in other dates.{" "}
          <button className="gt-btn gt-btn--sm" onClick={() => onJump(lm)}>
            Show {monthName(lm)}
          </button>
        </div>
      )}
      {tab === "purchase" && meta.non_gst_purchase_count > 0 && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          {meta.non_gst_purchase_count} Non-GST purchase bill(s) are excluded. Turn on “GST” in the Purchase Bill to include a bill.
        </div>
      )}
    </div>
  );
}

function Stat({ l, v, c, big }) {
  return (
    <div className={`gt-stat${c ? ` gt-stat--${c}` : ""}`}>
      <span>{l}</span>
      <b style={big ? { fontSize: 19 } : undefined}>₹ {money(v)}</b>
    </div>
  );
}