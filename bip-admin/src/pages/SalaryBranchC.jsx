import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "../utils/api";

/* =========================================================
   Salary — single entry page (Branch A, B and C)
   Employee · Date · Present/Absent · No of Pack ·
   branch work items (qty × employee rate) · Petrol · Tea · Advance → Total
   ========================================================= */

// Work items per branch. key → form field `${key}_qty`, stored amount field, employee rate field
// SMS after Save — turned OFF for now. Code is kept; set to true to use it again.
const SMS_ENABLED = false;

const VARIANTS = {
  B: {
    title: "Salary — Nanguneri",
    packs: true,
    petrolTea: true,
    extra: true,
    foodOt: true,
    items: [],
  },
  A: {
    title: "Salary — Vallioor",
    packs: true,
    petrolTea: true,
    items: [
      { key: "kambi", label: "Kambi Kattu", rate: "kambi_kattu_rate", amount: "kambi_amount" },
      { key: "others", label: "Others", rate: "others_rate", amount: "others_amount" },
    ],
  },
  C: {
    title: "Salary — Panagudi",
    packs: true,
    salaryPerPack: false, // Total = Salary + (packs × Price per Pack) — same as other branches
    petrolTea: true,
    items: [
      { key: "loading", label: "Loading", rate: "loading_rate", amount: "loading_amount" },
      { key: "unloading", label: "Unloading", rate: "unloading_rate", amount: "unloading_amount" },
      { key: "location", label: "Location Change", rate: "location_change_rate", amount: "location_change" },
    ],
  },
};

const toYMD = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const inr = (v) =>
  `₹${(Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SalaryBranchC({ variant = "C" }) {
  const cfg = VARIANTS[variant] || VARIANTS.C;
  const ITEMS = cfg.items;

  const emptyForm = () => {
    const f = {
      employee_id: "",
      date: toYMD(new Date()),
      status: "Present",
      salary: "",
      pack_count: "",
      petrol: "",
      tea: "",
      food: "",
      ot: "",
      work_yes: "No",
      work_amount: "",
      extra: "",
      advance: "",
    };
    ITEMS.forEach((it) => (f[`${it.key}_qty`] = ""));
    return f;
  };

  // Form: qty × employee rate. Saved row: stored amounts.
  // Panagudi: packs typed → rate = Price per Pack from Employee page (salary ÷ 3).
  // 0 packs → full salary is added instead.
  const perPackFromSalary = (f, emp) => {
    const n = Number(f.pack_count) || 0;
    return cfg.salaryPerPack && n > 0 ? Number(emp?.price_per_bags) || 0 : null;
  };
  const calcForm = (f, emp) => {
    const pps = perPackFromSalary(f, emp);
    const packAmt = (Number(f.pack_count) || 0) * (pps ?? (Number(emp?.price_per_bags) || 0));
    if (pps !== null) f = { ...f, salary: 0 };
    const items = {};
    ITEMS.forEach((it) => {
      items[it.key] = (Number(f[`${it.key}_qty`]) || 0) * (Number(emp?.[it.rate]) || 0);
    });
    // Work amount always comes from the employee page (Yes = add it, No = 0)
    const work = f.work_yes === "Yes" ? Number(emp?.work_rate) || 0 : 0;
    return finish(f, packAmt, items, work, Number(f.extra) || 0);
  };
  const calcRow = (r) => {
    const packAmt = (Number(r.pack_count) || 0) * (Number(r.pack_rate) || 0);
    const items = {};
    ITEMS.forEach((it) => (items[it.key] = Number(r[it.amount]) || 0));
    const work = Number(r.work_yes) ? Number(r.work_amount) || 0 : 0;
    return finish(r, packAmt, items, work, Number(r.extra_amount) || 0);
  };
  const finish = (f, packAmt, items, work = 0, extra = 0) => {
    const petrol = cfg.petrolTea ? Number(f.petrol) || 0 : 0;
    const tea = cfg.petrolTea ? Number(f.tea) || 0 : 0;
    const advance = Number(f.advance) || 0;
    const salary = Number(f.salary ?? f.salary_amount) || 0;
    const food = cfg.foodOt ? Number(f.food ?? f.food_amount) || 0 : 0;
    const ot = cfg.foodOt ? Number(f.ot ?? f.ot_day_amount) || 0 : 0;
    const itemSum = Object.values(items).reduce((a, b) => a + b, 0);
    return {
      salary, packAmt, items, petrol, tea, food, ot, advance, work, extra,
      total: salary + packAmt + itemSum + petrol + tea + food + ot + work + extra - advance,
    };
  };

  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [empSearch, setEmpSearch] = useState("");
  const [showEmpList, setShowEmpList] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filter, setFilter] = useState({ q: "", from: "", to: "" });
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const isAdmin = localStorage.getItem("role") === "admin";

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 2500);
  };

  const loadEmployees = async () => {
    try {
      const res = await apiFetch("/employees/get_employees.php?simple=1");
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : data.employees || []);
    } catch {
      setEmployees([]);
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/salary/salary_daily.php?action=days");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    loadRecords();
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const selectedEmp = employees.find((e) => e.emp_id === form.employee_id);
  const totals = calcForm(form, selectedEmp);
  const amt = (v) => (Number(v) ? +Number(v).toFixed(2) : "");
  // Present = full salary, Half Day = half, Absent = 0
  const salaryFor = (emp, status) =>
    status === "Absent" ? "" : amt((Number(emp?.salary_amount) || 0) / (status === "Half Day" ? 2 : 1));

  const empMatches = employees
    .filter((e) => (e.employee_name || "").toLowerCase().includes(empSearch.trim().toLowerCase()))
    .slice(0, 10);

  const pickEmployee = (emp) => {
    setForm((p) => ({
      ...p,
      employee_id: emp.emp_id,
      salary: salaryFor(emp, p.status),
      work_amount: cfg.yesNo && p.work_yes === "Yes" ? amt(emp.work_rate) : "",
      petrol: cfg.petrolTea ? amt(emp.petrol_allowance) : "",
      tea: cfg.petrolTea ? amt(emp.tea_allowance) : "",
      food: cfg.foodOt ? amt(emp.food_rate) : "",
      ot: cfg.foodOt ? amt(emp.ot_rate) : "",
    }));
    setEmpSearch(emp.employee_name);
    setShowEmpList(false);
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEmpSearch("");
    setEditing(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.employee_id) return showToast("Please select an employee", "error");
    if (!form.date) return showToast("Please select a date", "error");
    setSaving(true);
    try {
      const body = {
        employee_id: form.employee_id,
        date: form.date,
        status: form.status,
        salary_amount: perPackFromSalary(form, selectedEmp) !== null ? 0 : Number(form.salary) || 0,
        pack_rate: perPackFromSalary(form, selectedEmp) ?? undefined,
        pack_count: Number(form.pack_count) || 0,
        petrol: Number(form.petrol) || 0,
        tea: Number(form.tea) || 0,
        food_amount: Number(form.food) || 0,
        ot_day_amount: Number(form.ot) || 0,
        advance: Number(form.advance) || 0,
        work_yes: form.work_yes === "Yes" ? 1 : 0,
        work_amount: form.work_yes === "Yes" ? Number(selectedEmp?.work_rate) || 0 : 0,
        extra_amount: Number(form.extra) || 0,
      };
      ITEMS.forEach((it) => (body[`${it.key}_qty`] = Number(form[`${it.key}_qty`]) || 0));
      const res = await apiFetch("/salary/salary_daily.php?action=save_entry", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(editing ? "Entry updated" : "Entry saved");
      if (SMS_ENABLED) sendSalarySms();
      resetForm();
      loadRecords();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── SMS to the employee after Save ────────────────────────────
  const buildSmsText = () => {
    const lines = [`Hi ${selectedEmp?.employee_name || empSearch},`, `Date: ${form.date}`, `Attendance: ${form.status}`];
    if (totals.salary) lines.push(`Salary: ${inr(totals.salary)}`);
    if (cfg.packs) lines.push(`No of Packs: ${inr(totals.packAmt)}`);
    ITEMS.forEach((it) => lines.push(`${it.label}: ${inr(totals.items[it.key])}`));
    if (cfg.yesNo) lines.push(`Work: ${inr(totals.work)}`);
    if (cfg.extra || cfg.yesNo) lines.push(`Extra: ${inr(totals.extra)}`);
    if (cfg.foodOt) lines.push(`Food: ${inr(totals.food)}`, `OT: ${inr(totals.ot)}`);
    if (cfg.petrolTea) lines.push(`Petrol: ${inr(totals.petrol)}`, `Tea: ${inr(totals.tea)}`);
    lines.push(`Advance: -${inr(totals.advance)}`, `Total: ${inr(totals.total)}`, "", "Thank you - BIP Fencing");
    return lines.join("\n");
  };

  const sendSalarySms = async () => {
    const phone = String(selectedEmp?.whatsapp_number || selectedEmp?.phone_number || "").replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) {
      showToast("Saved, but this employee has no mobile number for SMS", "error");
      return;
    }
    const message = buildSmsText();
    try {
      const res = await apiFetch("/salary/send_sms.php", {
        method: "POST",
        body: JSON.stringify({ phone, message }),
      });
      const data = await res.json();
      if (data.sent) {
        showToast(`Saved & SMS sent to ${phone}`);
        return;
      }
      throw new Error(data.error || "SMS not sent");
    } catch (err) {
      showToast(`Saved, but SMS failed: ${err.message}`, "error");
    }
  };

  const handleEdit = (r) => {
    const f = {
      employee_id: r.employee_id,
      date: r.date,
      status: ["Absent", "Half Day"].includes(r.attendance_status) ? r.attendance_status : "Present",
      salary: Number(r.salary_amount) || "",
      pack_count: Number(r.pack_count) || "",
      petrol: Number(r.petrol) || "",
      tea: Number(r.tea) || "",
      food: Number(r.food_amount) || "",
      ot: Number(r.ot_day_amount) || "",
      advance: Number(r.advance) || "",
      work_yes: Number(r.work_yes) ? "Yes" : "No",
      work_amount: Number(r.work_amount) || "",
      extra: Number(r.extra_amount) || "",
    };
    ITEMS.forEach((it) => (f[`${it.key}_qty`] = Number(r[`${it.key}_qty`]) || ""));
    setForm(f);
    setEmpSearch(r.employee_name || "");
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/salary/salary_daily.php?action=delete_day&id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("Entry deleted");
      loadRecords();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const filtered = useMemo(
    () =>
      records
        .filter((r) => {
          const q = filter.q.trim().toLowerCase();
          if (q && !(r.employee_name || "").toLowerCase().includes(q)) return false;
          if (filter.from && r.date < filter.from) return false;
          if (filter.to && r.date > filter.to) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [records, filter],
  );

  const numInput = (key, placeholder = "0") => (
    <input
      type="number"
      min="0"
      step="0.01"
      className="sp-input"
      placeholder={placeholder}
      value={form[key]}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  const colCount = 20;

  return (
    <div className="sp-root">
      {toast.show && <div className={`sp-toast sp-toast--${toast.type}`}>{toast.message}</div>}

      <div className="sp-head">
        <div className="sp-head__icon">
          <i className="bi bi-cash-stack"></i>
        </div>
        <div>
          <h1>{cfg.title}</h1>
          <p>Daily attendance, packs and advance per employee</p>
        </div>
      </div>

      {/* ── Entry form ── */}
      <form className="sp-card" onSubmit={handleSave}>
        <div className="sp-card__head">
          <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-circle"}`}></i>
          <span>{editing ? "Edit Entry" : "New Entry"}</span>
        </div>

        <div className="sp-grid">
          <div className="sp-fg sp-fg--emp">
            <label>
              Employee<span className="sp-req">*</span>
            </label>
            <input
              className="sp-input"
              placeholder="Type employee name…"
              value={empSearch}
              disabled={editing}
              autoComplete="off"
              onChange={(e) => {
                setEmpSearch(e.target.value);
                set("employee_id", "");
                setShowEmpList(true);
              }}
              onFocus={() => setShowEmpList(true)}
              onBlur={() => setTimeout(() => setShowEmpList(false), 150)}
            />
            {showEmpList && !editing && empMatches.length > 0 && (
              <ul className="sp-suggest">
                {empMatches.map((emp) => (
                  <li key={emp.emp_id} onMouseDown={() => pickEmployee(emp)}>
                    <span>{emp.employee_name}</span>
                    {emp.branch_name && <small>{emp.branch_name}</small>}
                  </li>
                ))}
              </ul>
            )}
            {selectedEmp && selectedEmp.id && (
              <small className="sp-hint">
                <a
                  href={`/statements?type=employee&employee_id=${selectedEmp.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#008b3e", fontWeight: 700 }}
                >
                  <i className="bi bi-journal-text"></i> View Statement
                </a>
              </small>
            )}
            {selectedEmp && cfg.packs && (
              <small className="sp-hint">
                {cfg.salaryPerPack ? `Salary ${inr(selectedEmp.salary_amount)}` : `Pack ${inr(selectedEmp.price_per_bags)}`}
                {ITEMS.map((it) => ` · ${it.label} ${inr(selectedEmp[it.rate])}`).join("")}
              </small>
            )}
          </div>

          <div className="sp-fg">
            <label>
              Date<span className="sp-req">*</span>
            </label>
            <input
              type="date"
              className="sp-input"
              value={form.date}
              disabled={editing}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>

          <div className="sp-fg">
            <label>Attendance</label>
            <div className="sp-toggle">
              {["Present", "Half Day", "Absent"].map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`sp-toggle__btn sp-toggle__btn--${s === "Half Day" ? "half" : s.toLowerCase()}${form.status === s ? " active" : ""}`}
                  onClick={() => setForm((p) => ({ ...p, status: s, salary: salaryFor(selectedEmp, s) }))}
                >
                  <i className={`bi ${s === "Present" ? "bi-check-circle-fill" : s === "Half Day" ? "bi-circle-half" : "bi-x-circle-fill"}`}></i> {s}
                </button>
              ))}
            </div>
          </div>

          <div className="sp-fg">
            <label>Salary (₹)</label>
            {numInput("salary")}
          </div>

          {cfg.packs && (
            <div className="sp-fg">
              <label>No of Pack</label>
              {numInput("pack_count")}
            </div>
          )}

          {cfg.yesNo && (
            <div className="sp-fg">
              <label>Work (Yes / No)</label>
              <div className="sp-toggle">
                {["Yes", "No"].map((v) => (
                  <button
                    type="button"
                    key={v}
                    className={`sp-toggle__btn sp-toggle__btn--${v === "Yes" ? "present" : "absent"}${form.work_yes === v ? " active" : ""}`}
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        work_yes: v,
                        work_amount: v === "Yes" ? amt(selectedEmp?.work_rate) : "",
                      }))
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
              <small className="sp-hint">
                {form.work_yes === "Yes" ? (
                  <>Work amount: <b>{inr(totals.work)}</b> (from employee page)</>
                ) : (
                  "No work amount"
                )}
              </small>
            </div>
          )}

          {(cfg.extra || cfg.yesNo) && (
            <div className="sp-fg">
              <label>Extra (₹)</label>
              {numInput("extra")}
            </div>
          )}

          {ITEMS.map((it) => (
            <div className="sp-fg" key={it.key}>
              <label>{it.label}</label>
              {numInput(`${it.key}_qty`)}
            </div>
          ))}

          {[
            ...(cfg.foodOt
              ? [
                  ["food", "Food (₹)", selectedEmp?.food_rate],
                  ["ot", "OT (₹)", selectedEmp?.ot_rate],
                ]
              : []),
            ...(cfg.petrolTea
              ? [
                  ["petrol", "Petrol (₹)", selectedEmp?.petrol_allowance],
                  ["tea", "Tea (₹)", selectedEmp?.tea_allowance],
                ]
              : []),
          ].map(([key, label, empAmt]) => (
            <div className="sp-fg" key={key}>
              <label>{label}</label>
              {numInput(key)}
              {selectedEmp && <small className="sp-hint">From employee: {inr(empAmt)}</small>}
            </div>
          ))}

          <div className="sp-fg">
            <label>Advance (₹)</label>
            {numInput("advance")}
          </div>
        </div>

        {/* ── Amount summary (live) ── */}
        <div className="sp-sum">
          {perPackFromSalary(form, selectedEmp) !== null && (
            <div className="sp-sum__row" style={{ color: "#94a3b8" }}>
              <span>Salary (not added — paid by packs)</span>
              <b>{inr(form.salary)}</b>
            </div>
          )}
          {[
            ...(perPackFromSalary(form, selectedEmp) === null ? [["Salary", totals.salary, ""]] : []),
            ...(cfg.packs ? [["No of Packs", totals.packAmt, `${Number(form.pack_count) || 0} × ${inr(selectedEmp?.price_per_bags)}`]] : []),
            ...ITEMS.map((it) => [it.label, totals.items[it.key], `${Number(form[`${it.key}_qty`]) || 0} × ${inr(selectedEmp?.[it.rate])}`]),
            ...(cfg.yesNo ? [["Work", totals.work, form.work_yes === "Yes" ? "Yes" : "No"]] : []),
            ...(cfg.extra || cfg.yesNo ? [["Extra", totals.extra, ""]] : []),
            ...(cfg.foodOt ? [["Food", totals.food, ""], ["OT", totals.ot, ""]] : []),
            ...(cfg.petrolTea ? [["Petrol", totals.petrol, ""], ["Tea", totals.tea, ""]] : []),
          ].map(([label, val]) => (
            <div className="sp-sum__row" key={label}>
              <span>{label}</span>
              <b>= {inr(val)}</b>
            </div>
          ))}
          <div className="sp-sum__row sp-sum__row--neg">
            <span>Advance</span>
            <b>= −{inr(totals.advance)}</b>
          </div>
          <div className={`sp-sum__row sp-sum__row--total${totals.total < 0 ? " is-neg" : ""}`}>
            <span>Total</span>
            <b>= {inr(totals.total)}</b>
          </div>
        </div>

        <div className="sp-form-foot">
          <div className="sp-actions">
            <button type="button" className="sp-btn sp-btn--ghost" onClick={resetForm}>
              {editing ? "Cancel" : "Reset"}
            </button>
            <button type="submit" className="sp-btn sp-btn--primary" disabled={saving}>
              <i className="bi bi-check-circle"></i> {saving ? "Saving…" : editing ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </form>

      {/* ── Records ── */}
      <div className="sp-card">
        <div className="sp-card__head">
          <i className="bi bi-table"></i>
          <span>Records</span>
          <span className="sp-count">{filtered.length}</span>
          <button type="button" className="sp-icon-btn" onClick={loadRecords} title="Refresh">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        <div className="sp-filters">
          <input
            className="sp-input"
            placeholder="Search employee…"
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          />
          <input
            type="date"
            className="sp-input"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
            title="From"
          />
          <input
            type="date"
            className="sp-input"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
            title="To"
          />
        </div>

        {error && <div className="sp-error">{error}</div>}

        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Attendance</th>
                <th>Salary</th>
                {cfg.packs && <th>Packs</th>}
                {cfg.packs && <th>Pack Amt</th>}
                {ITEMS.map((it) => (
                  <th key={it.key}>{it.label}</th>
                ))}
                {cfg.yesNo && <th>Work</th>}
                {(cfg.extra || cfg.yesNo) && <th>Extra</th>}
                {cfg.foodOt && <th>Food</th>}
                {cfg.foodOt && <th>OT</th>}
                {cfg.petrolTea && <th>Petrol</th>}
                {cfg.petrolTea && <th>Tea</th>}
                <th>Advance</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount + 1} className="sp-empty">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount + 1} className="sp-empty">
                    No records found
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const c = calcRow(r);
                  return (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td className="sp-strong">
                        {r.employee_name}
                        {(() => {
                          const eid = employees.find((e) => e.emp_id === r.employee_id)?.id;
                          return eid ? (
                            <button
                              className="sp-icon-btn"
                              style={{ marginLeft: 8, verticalAlign: "middle" }}
                              onClick={() => window.open(`/statements?type=employee&employee_id=${eid}`, "_blank", "noopener")}
                              title="Salary statement of this employee"
                            >
                              <i className="bi bi-journal-text"></i>
                            </button>
                          ) : null;
                        })()}
                      </td>
                      <td>
                        <span
                          className={`sp-badge sp-badge--${r.attendance_status === "Absent" ? "absent" : r.attendance_status === "Present" ? "present" : r.attendance_status === "Half Day" ? "half" : "other"}`}
                        >
                          {r.attendance_status || "—"}
                        </span>
                      </td>
                      <td>{c.salary ? inr(c.salary) : "—"}</td>
                      {cfg.packs && <td>{Number(r.pack_count) || 0}</td>}
                      {cfg.packs && <td>{c.packAmt ? inr(c.packAmt) : "—"}</td>}
                      {ITEMS.map((it) => (
                        <td key={it.key}>{c.items[it.key] ? inr(c.items[it.key]) : "—"}</td>
                      ))}
                      {cfg.yesNo && <td>{Number(r.work_yes) ? `Yes · ${inr(c.work)}` : "No"}</td>}
                      {(cfg.extra || cfg.yesNo) && <td>{c.extra ? inr(c.extra) : "—"}</td>}
                      {cfg.foodOt && <td>{c.food ? inr(c.food) : "—"}</td>}
                      {cfg.foodOt && <td>{c.ot ? inr(c.ot) : "—"}</td>}
                      {cfg.petrolTea && <td>{c.petrol ? inr(c.petrol) : "—"}</td>}
                      {cfg.petrolTea && <td>{c.tea ? inr(c.tea) : "—"}</td>}
                      <td className="sp-neg">{c.advance ? `−${inr(c.advance)}` : "—"}</td>
                      <td className="sp-strong" style={{ color: c.total < 0 ? "#dc2626" : "#15803d" }}>
                        {inr(c.total)}
                      </td>
                      <td>
                        <div className="sp-row-actions">
                          <button className="sp-icon-btn" onClick={() => handleEdit(r)} title="Edit">
                            <i className="bi bi-pencil-fill"></i>
                          </button>
                          {isAdmin && (
                            <button
                              className="sp-icon-btn sp-icon-btn--del"
                              onClick={() => setDeleteTarget(r)}
                              title="Delete"
                            >
                              <i className="bi bi-trash-fill"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="sp-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete entry?</h3>
            <p>
              {deleteTarget.employee_name} · {deleteTarget.date}
            </p>
            <div className="sp-actions">
              <button className="sp-btn sp-btn--ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="sp-btn sp-btn--danger" onClick={handleDelete}>
                <i className="bi bi-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .sp-root { color: #0f172a; width: 100%; }
        .sp-head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
        .sp-head__icon { width: 48px; height: 48px; border-radius: 14px; background: #16a34a; color: #fff;
          display: grid; place-items: center; font-size: 22px; box-shadow: 0 6px 16px rgba(22,163,74,.3); }
        .sp-head h1 { margin: 0; font-size: 22px; font-weight: 800; }
        .sp-head p { margin: 2px 0 0; color: #64748b; font-size: 13px; }

        .sp-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
        .sp-card__head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px;
          padding-bottom: 14px; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .sp-card__head i { color: #16a34a; }
        .sp-count { background: #f1f5f9; color: #475569; border-radius: 20px; padding: 2px 10px; font-size: 12px; }
        .sp-card__head .sp-icon-btn { margin-left: auto; }

        .sp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
        .sp-fg { display: flex; flex-direction: column; gap: 6px; position: relative; }
        .sp-fg label { font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .03em; }
        .sp-req { color: #dc2626; margin-left: 2px; }
        .sp-hint { color: #64748b; font-size: 12px; }
        .sp-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;
          font-size: 14px; background: #f8fafc; outline: none; }
        .sp-input:focus { border-color: #16a34a; background: #fff; box-shadow: 0 0 0 3px rgba(22,163,74,.12); }
        .sp-input:disabled { opacity: .7; }

        .sp-suggest { position: absolute; top: 66px; left: 0; right: 0; z-index: 30; list-style: none; margin: 0; padding: 4px;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 8px 24px rgba(15,23,42,.12);
          max-height: 240px; overflow-y: auto; }
        .sp-suggest li { display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .sp-suggest li:hover { background: #f0fdf4; }
        .sp-suggest small { color: #64748b; }

        .sp-toggle { display: flex; gap: 6px; }
        .sp-toggle__btn { flex: 1; padding: 9px 6px; white-space: nowrap; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc;
          font-weight: 700; font-size: 13px; cursor: pointer; color: #64748b; }
        .sp-toggle__btn--present.active { background: #dcfce7; border-color: #86efac; color: #15803d; }
        .sp-toggle__btn--absent.active { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
        .sp-toggle__btn--half.active { background: #fef3c7; border-color: #fcd34d; color: #b45309; }
        .sp-badge--half { background: #fef3c7; color: #b45309; }

        .sp-check { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #e2e8f0;
          border-radius: 10px; cursor: pointer; align-self: end; background: #f8fafc; font-size: 14px; font-weight: 600; }
        .sp-check.active { border-color: #86efac; background: #f0fdf4; }
        .sp-check input { width: 18px; height: 18px; accent-color: #16a34a; }
        .sp-check small { color: #64748b; font-weight: 500; }
        .sp-check b { margin-left: auto; font-family: monospace; color: #15803d; }

        .sp-sum { max-width: 460px; margin: 18px 0 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .sp-sum__row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
          padding: 8px 14px; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
        .sp-sum__row span { font-weight: 600; color: #334155; }
        .sp-sum__row small { color: #94a3b8; font-weight: 500; }
        .sp-sum__row b { font-family: monospace; font-size: 15px; color: #0f172a; white-space: nowrap; }
        .sp-sum__row--neg b { color: #dc2626; }
        .sp-sum__row--total { background: #f0fdf4; border-bottom: none; border-top: 2px solid #86efac; }
        .sp-sum__row--total span { font-weight: 800; color: #15803d; }
        .sp-sum__row--total b { font-size: 18px; color: #15803d; }
        .sp-sum__row--total.is-neg { background: #fef2f2; border-top-color: #fca5a5; }
        .sp-sum__row--total.is-neg b, .sp-sum__row--total.is-neg span { color: #dc2626; }
        .sp-form-foot { display: flex; justify-content: flex-end; align-items: center; gap: 16px; flex-wrap: wrap;
          margin-top: 18px; padding-top: 16px; border-top: 1px dashed #e2e8f0; }
        .sp-total { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .sp-total span { font-weight: 700; color: #475569; }
        .sp-total b { font-size: 24px; font-family: monospace; }
        .sp-total small { color: #64748b; font-size: 12px; width: 100%; }
        .sp-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .sp-btn { padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer; border: 1px solid transparent; }
        .sp-btn--primary { background: #16a34a; color: #fff; }
        .sp-btn--primary:disabled { opacity: .6; }
        .sp-btn--ghost { background: #fff; border-color: #e2e8f0; color: #334155; }
        .sp-btn--danger { background: #dc2626; color: #fff; }

        .sp-filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        .sp-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; }
        .sp-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px; }
        .sp-table { width: 100%; border-collapse: collapse; font-size: 14px; white-space: nowrap; }
        .sp-table th { background: #f8fafc; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase;
          letter-spacing: .04em; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        .sp-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
        .sp-table tfoot td { background: #f8fafc; font-weight: 800; border-top: 2px solid #e2e8f0; font-family: monospace; }
        .sp-strong { font-weight: 700; }
        .sp-neg { color: #dc2626; }
        .sp-empty { text-align: center; color: #94a3b8; padding: 30px !important; }
        .sp-badge { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; }
        .sp-badge--present { background: #dcfce7; color: #15803d; }
        .sp-badge--absent { background: #fee2e2; color: #dc2626; }
        .sp-badge--other { background: #f1f5f9; color: #475569; }
        .sp-row-actions { display: flex; gap: 6px; }
        .sp-icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; color: #334155; }
        .sp-icon-btn--del { color: #dc2626; border-color: #fecaca; background: #fef2f2; }

        .sp-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid; place-items: center; z-index: 100; }
        .sp-modal { background: #fff; border-radius: 16px; padding: 22px; width: min(380px, 92vw); }
        .sp-modal h3 { margin: 0 0 6px; }
        .sp-modal p { margin: 0 0 18px; color: #64748b; }

        .sp-toast { position: fixed; top: 20px; right: 20px; z-index: 200; padding: 12px 18px; border-radius: 12px;
          color: #fff; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
        .sp-toast--success { background: #16a34a; }
        .sp-toast--error { background: #dc2626; }

        @media (max-width: 640px) {
          .sp-filters { grid-template-columns: 1fr; }
          .sp-form-foot { flex-direction: column; align-items: stretch; }
          .sp-actions .sp-btn { flex: 1; }
        }
      `}</style>
    </div>
  );
}