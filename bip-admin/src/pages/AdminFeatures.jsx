import React, { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";

const getHeaders = () => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  };
  const role = localStorage.getItem("role");
  if (role === "admin") {
    const viewBranch = localStorage.getItem("admin_view_branch");
    if (viewBranch) headers["X-Branch-ID"] = viewBranch;
  }
  return headers;
};

const FieldInput = ({ label, required, children }) => (
  <div className="af-fg">
    <label className="af-label">
      {label}
      {required && <span className="af-req">*</span>}
    </label>
    {children}
  </div>
);

const AdminFeatures = () => {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({
    total_amount: 0,
    total_entries: 0,
    current_month_amount: 0,
    current_week_amount: 0,
    current_year_amount: 0,
  });
  // NEW: holds a Total Amount breakdown per year, e.g. [{ year: 2026, amount: 115678, count: 4 }, ...]
  const [yearlyHistory, setYearlyHistory] = useState([]);

  const getTodayYMD = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const [formData, setFormData] = useState({
    branch_id: "",
    branch_name: "",
    amount: "",
    payment_date: getTodayYMD(),
    note: "",
    received_by: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [editModal, setEditModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filters, setFilters] = useState({
    branch_name: "",
    amount_min: "",
    amount_max: "",
    date_from: "",
    date_to: "",
    received_by: "",
  });
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // NEW: which section tab is active — matches the Employee page pattern.
  // Order requested: Branch Amount Records -> Add Branch Amount -> Yearly Amount History
  const [activeTab, setActiveTab] = useState("records");

  const role = localStorage.getItem("role");
  const isBranchSelected =
    role === "admin" ? !!localStorage.getItem("admin_view_branch") : true;

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };

  useEffect(() => {
    const viewBranchId = localStorage.getItem("admin_view_branch");
    const viewBranchName = localStorage.getItem("admin_view_branch_name");
    if (role === "admin" && viewBranchId && viewBranchName) {
      setFormData((prev) => ({
        ...prev,
        branch_id: viewBranchId,
        branch_name: viewBranchName,
      }));
    }
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        "/admin/admin_feature_get_branch_amounts.php",
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const fetchedRecords = data.records || [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      let currentMonthAmount = 0,
        currentWeekAmount = 0;

      // NEW: aggregate every record into its calendar year so we can
      // 1) show "Total Amount" for the CURRENT year only (auto-resets on Jan 1)
      // 2) keep a full history of totals for every previous year
      const yearlyMap = {};

      fetchedRecords.forEach((rec) => {
        const amt = parseFloat(rec.amount) || 0;
        const d = new Date(rec.payment_date);
        const y = d.getFullYear();

        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth)
          currentMonthAmount += amt;
        if (d >= startOfWeek && d <= endOfWeek) currentWeekAmount += amt;

        if (!yearlyMap[y]) yearlyMap[y] = { amount: 0, count: 0 };
        yearlyMap[y].amount += amt;
        yearlyMap[y].count += 1;
      });

      const yearlyHistoryArr = Object.keys(yearlyMap)
        .map((y) => ({
          year: parseInt(y, 10),
          amount: yearlyMap[y].amount,
          count: yearlyMap[y].count,
        }))
        .sort((a, b) => b.year - a.year);

      const currentYearAmount = yearlyMap[currentYear]?.amount || 0;

      setRecords(fetchedRecords);
      setYearlyHistory(yearlyHistoryArr);
      setStats({
        total_amount: parseFloat(data.stats?.total_amount) || 0,
        total_entries: data.stats?.total_entries || 0,
        current_month_amount: currentMonthAmount,
        current_week_amount: currentWeekAmount,
        current_year_amount: currentYearAmount,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!isBranchSelected) {
      showToast(
        "Please select a specific branch from the topbar to add an amount.",
        "error",
      );
      return;
    }
    if (!formData.branch_id) {
      showToast("Branch is required", "error");
      return;
    }
    try {
      const response = await apiFetch(
        "/admin/admin_feature_add_branch_amount.php",
        {
          method: "POST",
          body: JSON.stringify(formData),
        },
      );
      const result = await response.json();
      if (response.ok) {
        showToast(result.message || "Branch amount saved successfully");
        setFormData((prev) => ({
          ...prev,
          amount: "",
          payment_date: getTodayYMD(),
          note: "",
          received_by: "",
        }));
        fetchRecords();
      } else {
        showToast(result.message || "Failed to save branch amount", "error");
      }
    } catch (err) {
      showToast("Server error", "error");
    }
  };

  const toYMD = (dateStr) => {
    if (!dateStr) return "";
    const s = String(dateStr).trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD-MM-YYYY or DD/MM/YYYY
    const m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return s;
  };

  const handleEdit = (record) => {
    setEditModal({
      id: record.id,
      branch_id: parseInt(record.branch_id),
      branch_name: record.branch_name,
      amount: record.amount,
      payment_date: toYMD(record.payment_date),
      note: record.note || "",
      received_by: record.received_by || "",
    });
  };

  const handleUpdate = async () => {
    if (!editModal) return;
    // Ensure correct types — PHP checks branch_id > 0, amount > 0, payment_date non-empty
    const payload = {
      id: parseInt(editModal.id),
      branch_id: parseInt(editModal.branch_id),
      branch_name: editModal.branch_name,
      amount: parseFloat(editModal.amount),
      payment_date: editModal.payment_date,
      note: editModal.note || "",
      received_by: editModal.received_by || "",
    };
    if (!payload.branch_id || payload.amount <= 0 || !payload.payment_date) {
      showToast("Branch ID, amount and date are required", "error");
      return;
    }
    try {
      const response = await apiFetch(
        "/admin/admin_feature_update_branch_amount.php",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (response.ok) {
        showToast(result.message);
        setEditModal(null);
        fetchRecords();
      } else showToast(result.message || "Update failed", "error");
    } catch (err) {
      showToast("Server error", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const response = await apiFetch(
        `/admin/admin_feature_delete_branch_amount.php?id=${deleteConfirm}`,
        {
          method: "DELETE",
        },
      );
      const result = await response.json();
      if (response.ok) {
        showToast(result.message);
        fetchRecords();
      } else showToast(result.message || "Delete failed", "error");
    } catch (err) {
      showToast("Server error", "error");
    }
    setDeleteConfirm(null);
  };

  const filteredRecords = records.filter((rec) => {
    if (
      filters.branch_name &&
      !rec.branch_name.toLowerCase().includes(filters.branch_name.toLowerCase())
    )
      return false;
    if (filters.amount_min && rec.amount < parseFloat(filters.amount_min))
      return false;
    if (filters.amount_max && rec.amount > parseFloat(filters.amount_max))
      return false;
    if (filters.date_from && rec.payment_date < filters.date_from) return false;
    if (filters.date_to && rec.payment_date > filters.date_to) return false;
    if (
      filters.received_by &&
      !(rec.received_by || "")
        .toLowerCase()
        .includes(filters.received_by.toLowerCase())
    )
      return false;
    return true;
  });

  const totalFiltered = filteredRecords.length;
  const totalPages =
    rowsPerPage === -1 ? 1 : Math.ceil(totalFiltered / rowsPerPage);
  const startIndex = rowsPerPage === -1 ? 0 : (currentPage - 1) * rowsPerPage;
  const paginatedRecords = filteredRecords.slice(
    startIndex,
    rowsPerPage === -1 ? totalFiltered : startIndex + rowsPerPage,
  );

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setCurrentPage(1);
  };

  const inr = (v) =>
    `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";
  const formatTime = (ts) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const thisYear = new Date().getFullYear();

  const statCards = [
    {
      // CHANGED: was the all-time cumulative total_amount from the backend.
      // Now shows only the CURRENT year's total, so it automatically resets
      // to 0 the moment a new year begins — no manual reset needed.
      label: `Total Amount (${thisYear})`,
      value: inr(stats.current_year_amount),
      icon: "bi-cash-stack",
      color: "#15803d",
      bg: "#dcfce7",
      border: "#86efac",
    },
    {
      label: "Total Entries",
      value: stats.total_entries,
      icon: "bi-receipt",
      color: "#1d4ed8",
      bg: "#dbeafe",
      border: "#93c5fd",
    },
    {
      label: "This Month",
      value: inr(stats.current_month_amount),
      icon: "bi-calendar3",
      color: "#b45309",
      bg: "#fef3c7",
      border: "#fcd34d",
    },
    {
      label: "This Week",
      value: inr(stats.current_week_amount),
      icon: "bi-calendar-week",
      color: "#7c3aed",
      bg: "#ede9fe",
      border: "#c4b5fd",
    },
  ];

  return (
    <div className="af-root">
      {/* Toast */}
      {toast.show && (
        <div className={`af-toast af-toast--${toast.type}`}>
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
      <div className="af-header">
        <div className="af-header__icon">
          <i className="bi bi-bank2"></i>
        </div>
        <div>
          <h1 className="af-header__title">Admin Features</h1>
          <p className="af-header__sub">
            Manage branch amount entries and records
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="af-stats">
        {statCards.map((card, i) => (
          <div
            key={i}
            className="af-stat"
            style={{ "--c": card.color, "--bg": card.bg, "--bd": card.border }}
          >
            <div className="af-stat__icon">
              <i className={`bi ${card.icon}`}></i>
            </div>
            <div className="af-stat__body">
              <div className="af-stat__label">{card.label}</div>
              <div className="af-stat__value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* NEW: Tab navigation — same pattern as the Employee page (icon + label,
          active tab gets a green underline, badge shows a live count). */}
      <div className="af-tabs">
        <button
          type="button"
          className={`af-tab${activeTab === "records" ? " af-tab--active" : ""}`}
          onClick={() => setActiveTab("records")}
        >
          <i className="bi bi-table"></i>
          <span>Branch Amount Records</span>
          <span className="af-tab__badge">{totalFiltered}</span>
        </button>
        <button
          type="button"
          className={`af-tab${activeTab === "add" ? " af-tab--active" : ""}`}
          onClick={() => setActiveTab("add")}
        >
          <i className="bi bi-plus-circle"></i>
          <span>Add Branch Amount</span>
        </button>
        <button
          type="button"
          className={`af-tab${activeTab === "history" ? " af-tab--active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <i className="bi bi-bar-chart-line"></i>
          <span>Yearly Amount History</span>
          <span className="af-tab__badge">{yearlyHistory.length}</span>
        </button>
      </div>

      {/* TAB 1: Branch Amount Records */}
      {activeTab === "records" && (
        <div className="af-card">
          <div className="af-card__head">
            <i className="bi bi-table"></i>
            <span>Branch Amount Records</span>
            <span className="af-count">{totalFiltered} records</span>
          </div>

          {/* Filters */}
          <div className="af-filters">
            <div className="af-fgrp">
              <i className="bi bi-search af-ficon"></i>
              <input
                className="af-finput af-finput--icon"
                type="text"
                name="branch_name"
                placeholder="Branch name…"
                value={filters.branch_name}
                onChange={handleFilterChange}
              />
            </div>
            <input
              className="af-finput"
              type="number"
              name="amount_min"
              placeholder="Min amount"
              value={filters.amount_min}
              onChange={handleFilterChange}
            />
            <input
              className="af-finput"
              type="number"
              name="amount_max"
              placeholder="Max amount"
              value={filters.amount_max}
              onChange={handleFilterChange}
            />
            <input
              className="af-finput"
              type="date"
              name="date_from"
              value={filters.date_from}
              onChange={handleFilterChange}
              title="From date"
            />
            <input
              className="af-finput"
              type="date"
              name="date_to"
              value={filters.date_to}
              onChange={handleFilterChange}
              title="To date"
            />
            <div className="af-fgrp">
              <i className="bi bi-person af-ficon"></i>
              <input
                className="af-finput af-finput--icon"
                type="text"
                name="received_by"
                placeholder="Received by…"
                value={filters.received_by}
                onChange={handleFilterChange}
              />
            </div>
          </div>

          {loading ? (
            <div className="af-loading">
              <div className="af-spinner"></div>
              <span>Loading records…</span>
            </div>
          ) : error ? (
            <div className="af-error">{error}</div>
          ) : (
            <>
              <div className="af-table-wrap">
                <table className="af-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Branch</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Received By</th>
                      <th>Note</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((rec, idx) => (
                        <tr key={rec.id} className="af-tr">
                          <td className="af-td--num">{startIndex + idx + 1}</td>
                          <td>
                            <span className="af-branch-tag">
                              {rec.branch_name}
                            </span>
                          </td>
                          <td>
                            <span className="af-amount">{inr(rec.amount)}</span>
                          </td>
                          <td>
                            <span className="af-date">
                              {formatDate(rec.payment_date)}
                            </span>
                          </td>
                          <td>
                            <span className="af-time">
                              {formatTime(rec.created_at)}
                            </span>
                          </td>
                          <td>
                            {rec.received_by || (
                              <span className="af-nil">—</span>
                            )}
                          </td>
                          <td>
                            {rec.note ? (
                              <span className="af-note">{rec.note}</span>
                            ) : (
                              <span className="af-nil">—</span>
                            )}
                          </td>
                          <td>
                            <div className="af-actions">
                              <button
                                className="af-act af-act--edit"
                                onClick={() => handleEdit(rec)}
                                title="Edit"
                              >
                                <i className="bi bi-pencil-fill"></i>
                              </button>
                              <button
                                className="af-act af-act--del"
                                onClick={() => setDeleteConfirm(rec.id)}
                                title="Delete"
                              >
                                <i className="bi bi-trash-fill"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8">
                          <div className="af-empty">
                            <i className="bi bi-inbox"></i>
                            <p>No records found</p>
                            <span>Try adjusting your filters</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalFiltered > 0 && (
                <div className="af-pagination">
                  <div className="af-pg-left">
                    <span>Show</span>
                    <select
                      className="af-pg-select"
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={-1}>All</option>
                    </select>
                    <span>entries per page</span>
                  </div>
                  {rowsPerPage !== -1 && (
                    <div className="af-pg-right">
                      <span className="af-pg-info">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        className="af-pg-btn"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        <i className="bi bi-chevron-left"></i> Previous
                      </button>
                      <button
                        className="af-pg-btn"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        Next <i className="bi bi-chevron-right"></i>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: Add Branch Amount */}
      {activeTab === "add" && (
        <>
          {!isBranchSelected && role === "admin" && (
            <div className="af-alert">
              <i className="bi bi-exclamation-triangle-fill"></i>
              Please select a specific branch (Branch A, B, or C) from the
              topbar to add an amount.
            </div>
          )}

          {isBranchSelected && (
            <div className="af-card">
              <div className="af-card__head">
                <i className="bi bi-plus-circle"></i>
                <span>Add Branch Amount</span>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="af-form-grid">
                  <FieldInput label="Branch Name" required>
                    <input
                      className="af-input"
                      type="text"
                      name="branch_name"
                      value={formData.branch_name}
                      readOnly
                      style={{ background: "#f8fafc", cursor: "not-allowed" }}
                    />
                  </FieldInput>
                  <FieldInput label="Amount" required>
                    <input
                      className="af-input"
                      type="number"
                      name="amount"
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={handleChange}
                      required
                    />
                  </FieldInput>
                  <FieldInput label="Date" required>
                    <input
                      className="af-input"
                      type="date"
                      name="payment_date"
                      value={formData.payment_date}
                      onChange={handleChange}
                      required
                    />
                  </FieldInput>
                  <FieldInput label="Received By">
                    <input
                      className="af-input"
                      type="text"
                      name="received_by"
                      placeholder="Person who received"
                      value={formData.received_by}
                      onChange={handleChange}
                    />
                  </FieldInput>
                  <div className="af-fg af-fg--full">
                    <label className="af-label">Note</label>
                    <input
                      className="af-input"
                      type="text"
                      name="note"
                      placeholder="Optional note…"
                      value={formData.note}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                {error && <div className="af-error">{error}</div>}
                <div className="af-form-actions">
                  <button type="submit" className="af-btn af-btn--primary">
                    <i className="bi bi-check-circle"></i> Save Amount
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* TAB 3: Yearly Amount History */}
      {activeTab === "history" && (
        <div className="af-card">
          <div className="af-card__head">
            <i className="bi bi-bar-chart-line"></i>
            <span>Yearly Amount History</span>
            <span className="af-count">
              {yearlyHistory.length} year{yearlyHistory.length > 1 ? "s" : ""}
            </span>
          </div>
          {yearlyHistory.length > 0 ? (
            <div className="af-table-wrap">
              <table className="af-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Entries</th>
                    <th>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyHistory.map((yh) => (
                    <tr
                      key={yh.year}
                      className={`af-tr${
                        yh.year === thisYear ? " af-year-row--current" : ""
                      }`}
                    >
                      <td>
                        <span className="af-branch-tag">
                          {yh.year}
                          {yh.year === thisYear ? " (Current)" : ""}
                        </span>
                      </td>
                      <td>{yh.count}</td>
                      <td>
                        <span className="af-amount">{inr(yh.amount)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="af-empty">
              <i className="bi bi-inbox"></i>
              <p>No history yet</p>
              <span>Yearly totals will appear once records exist</span>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="af-overlay" onClick={() => setEditModal(null)}>
          <div className="af-modal" onClick={(e) => e.stopPropagation()}>
            <div className="af-modal__header">
              <div className="af-modal__title">
                <i className="bi bi-pencil-square"></i> Edit Branch Amount
              </div>
              <button
                className="af-modal__close"
                onClick={() => setEditModal(null)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="af-modal__body">
              {[
                { label: "Branch", field: "branch_name", type: "readonly" },
                { label: "Amount", field: "amount", type: "number" },
                { label: "Date", field: "payment_date", type: "date" },
                { label: "Received By", field: "received_by", type: "text" },
                { label: "Note", field: "note", type: "text", full: true },
              ].map(({ label, field, type, full }) => (
                <div
                  key={field}
                  className={`af-fg${full ? " af-fg--full" : ""}`}
                >
                  <label className="af-label">{label}</label>
                  {type === "readonly" ? (
                    <input
                      className="af-input"
                      type="text"
                      value={editModal[field]}
                      readOnly
                      style={{ background: "#f8fafc", cursor: "not-allowed" }}
                    />
                  ) : (
                    <input
                      className="af-input"
                      type={type}
                      value={editModal[field]}
                      onChange={(e) =>
                        setEditModal({ ...editModal, [field]: e.target.value })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="af-modal__footer">
              <button
                className="af-btn af-btn--ghost"
                onClick={() => setEditModal(null)}
              >
                Cancel
              </button>
              <button className="af-btn af-btn--primary" onClick={handleUpdate}>
                <i className="bi bi-check-circle"></i> Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="af-overlay" onClick={() => setDeleteConfirm(null)}>
          <div
            className="af-modal af-modal--sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="af-modal__header">
              <div className="af-modal__title" style={{ color: "#dc2626" }}>
                <i className="bi bi-trash"></i> Confirm Delete
              </div>
              <button
                className="af-modal__close"
                onClick={() => setDeleteConfirm(null)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div style={{ padding: "24px", textAlign: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#fef2f2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 24,
                  color: "#dc2626",
                }}
              >
                <i className="bi bi-exclamation-triangle-fill"></i>
              </div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#0f172a",
                }}
              >
                Delete this record?
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="af-modal__footer">
              <button
                className="af-btn af-btn--ghost"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button className="af-btn af-btn--danger" onClick={handleDelete}>
                <i className="bi bi-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* NEW: hide the native scrollbar (and its up/down arrow buttons) everywhere —
           widened from html/body to ALL elements, since the scrollbar shown was
           coming from a wrapper container in the app layout, not html/body directly.
           Scrolling still works via mouse wheel, trackpad, touch, and keyboard —
           only the visible track/arrows are removed. */
        * {
          scrollbar-width: none;       /* Firefox */
          -ms-overflow-style: none;    /* old Edge / IE */
        }
        *::-webkit-scrollbar {
          display: none;               /* Chrome, Edge, Safari */
          width: 0;
          height: 0;
        }

        .af-root { width: 100%; max-width: 100%; min-width: 0; color: #0f172a; position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

        /* Toast */
        .af-toast { position: fixed; top: 24px; right: 24px; z-index: 1200; display: flex; align-items: center; gap: 10px; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.18); color: #fff; min-width: 240px; animation: af-slide .28s cubic-bezier(.4,0,.2,1); }
        .af-toast--success { background: #008b3e; }
        .af-toast--error   { background: #dc2626; }
        @keyframes af-slide { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        /* Header */
        .af-header { display: flex; align-items: center; gap: 14px; padding-bottom: 28px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 28px; }
        .af-header__icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #008b3e, #00b84f); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,139,62,.25); }
        .af-header__title { margin: 0 0 2px; font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
        .af-header__sub { margin: 0; font-size: 13px; color: #64748b; }

        /* Stats */
        .af-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
        .af-stat { display: flex; align-items: center; gap: 14px; background: #fff; border: 1.5px solid var(--bd); border-radius: 12px; padding: 16px 18px; }
        .af-stat__icon { width: 44px; height: 44px; border-radius: 10px; background: var(--bg); color: var(--c); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .af-stat__label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 4px; }
        .af-stat__value { font-size: 18px; font-weight: 800; color: var(--c); font-family: "SF Mono", "Fira Code", monospace; }

        /* Alert */
        .af-alert { display: flex; align-items: center; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; padding: 12px 16px; font-size: 14px; font-weight: 500; margin-bottom: 24px; }

        /* NEW: Tabs — Employee-page style (icon + label, green underline on active, badge count) */
        .af-tabs { display: flex; align-items: center; gap: 32px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 24px; overflow-x: auto; }
        .af-tab { display: inline-flex; align-items: center; gap: 8px; background: none; border: none; padding: 14px 2px; font-size: 14.5px; font-weight: 700; color: #94a3b8; cursor: pointer; position: relative; white-space: nowrap; transition: color .15s; }
        .af-tab i { font-size: 16px; color: #cbd5e1; transition: color .15s; }
        .af-tab:hover { color: #475569; }
        .af-tab:hover i { color: #94a3b8; }
        .af-tab--active { color: #008b3e; }
        .af-tab--active i { color: #008b3e; }
        .af-tab--active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1.5px; height: 2.5px; background: #008b3e; border-radius: 2px; }
        .af-tab__badge { background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 1px 9px; border-radius: 20px; }

        /* Card */
        .af-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 24px; margin-bottom: 24px; }
        .af-card__head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .af-card__head i { color: #008b3e; font-size: 17px; }
        .af-count { margin-left: auto; font-size: 12px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 2px 10px; border-radius: 20px; }

        /* Form */
        .af-form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
        .af-fg { display: flex; flex-direction: column; gap: 7px; }
        .af-fg--full { grid-column: 1 / -1; }
        .af-label { font-size: 13px; font-weight: 600; color: #374151; }
        .af-req { color: #ef4444; margin-left: 3px; }
        .af-input { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; }
        .af-input:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
        .af-form-actions { display: flex; justify-content: flex-end; margin-top: 20px; }

        /* Buttons */
        .af-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: opacity .15s, box-shadow .15s; }
        .af-btn--primary { background: linear-gradient(135deg, #008b3e, #009e46); color: #fff; box-shadow: 0 2px 8px rgba(0,139,62,.3); }
        .af-btn--primary:hover { box-shadow: 0 4px 16px rgba(0,139,62,.38); }
        .af-btn--ghost { background: #f8fafc; color: #374151; border: 1.5px solid #e2e8f0; }
        .af-btn--ghost:hover { background: #f1f5f9; }
        .af-btn--danger { background: #dc2626; color: #fff; box-shadow: 0 2px 8px rgba(220,38,38,.25); }

        /* Filters */
        .af-filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.5fr; gap: 8px; margin-bottom: 20px; }
        .af-fgrp { position: relative; }
        .af-ficon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 13px; pointer-events: none; }
        .af-finput { height: 36px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s; }
        .af-finput--icon { padding-left: 30px; }
        .af-finput:focus { border-color: #008b3e; background: #fff; }

        /* Table */
        .af-table-wrap { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow-x: auto; }
        .af-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .af-table thead tr { background: #f8fafc; }
        .af-table th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .6px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
        .af-table td { padding: 13px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: middle; }
        .af-tr:last-child td { border-bottom: none; }
        .af-tr:hover td { background: #f8fffe; }
        .af-td--num { color: #94a3b8; font-size: 12px; width: 36px; }
        .af-branch-tag { background: #dcfce7; color: #15803d; border-radius: 6px; padding: 3px 9px; font-size: 12px; font-weight: 700; }
        .af-amount { font-family: "SF Mono", "Fira Code", monospace; font-weight: 700; color: #15803d; font-size: 13px; }
        .af-date { color: #374151; font-size: 13px; white-space: nowrap; }
        .af-time { color: #64748b; font-size: 12px; }
        .af-note { background: #f8fafc; border-radius: 5px; padding: 2px 8px; font-size: 12px; color: #475569; }
        .af-nil { color: #cbd5e1; }
        .af-actions { display: flex; gap: 6px; }
        .af-act { width: 30px; height: 30px; border: none; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: transform .12s, box-shadow .12s; }
        .af-act:hover { transform: scale(1.08); }
        .af-act--edit { background: #eff6ff; color: #2563eb; }
        .af-act--edit:hover { background: #dbeafe; }
        .af-act--del { background: #fef2f2; color: #dc2626; }
        .af-act--del:hover { background: #fee2e2; }

        /* NEW: highlight the current year's row in the Yearly Amount History table */
        .af-year-row--current td { background: #f0fdf4; }
        .af-year-row--current .af-branch-tag { background: #bbf7d0; }

        /* Empty */
        .af-empty { display: flex; flex-direction: column; align-items: center; padding: 52px 20px; color: #94a3b8; }
        .af-empty i { font-size: 40px; margin-bottom: 10px; }
        .af-empty p { margin: 0 0 4px; font-weight: 600; color: #64748b; font-size: 15px; }
        .af-empty span { font-size: 13px; }

        /* Loading */
        .af-loading { display: flex; align-items: center; gap: 12px; padding: 40px; justify-content: center; color: #64748b; font-size: 14px; }
        .af-spinner { width: 20px; height: 20px; border: 3px solid #e2e8f0; border-top-color: #008b3e; border-radius: 50%; animation: af-spin .7s linear infinite; }
        @keyframes af-spin { to { transform: rotate(360deg); } }
        .af-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 12px 16px; font-size: 14px; margin-top: 12px; }

        /* Pagination */
        .af-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 16px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; gap: 10px; }
        .af-pg-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b; }
        .af-pg-select { height: 32px; border: 1.5px solid #e2e8f0; border-radius: 7px; padding: 0 8px; font-size: 13px; background: #fafbfc; cursor: pointer; outline: none; }
        .af-pg-right { display: flex; align-items: center; gap: 8px; }
        .af-pg-info { font-size: 13px; color: #64748b; }
        .af-pg-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: 1.5px solid #e2e8f0; background: #fafbfc; border-radius: 8px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; transition: background .15s; }
        .af-pg-btn:hover:not(:disabled) { background: #f1f5f9; }
        .af-pg-btn:disabled { opacity: .45; cursor: not-allowed; }

        /* Modal */
        .af-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: af-fi .18s ease; }
        @keyframes af-fi { from { opacity: 0; } to { opacity: 1; } }
        .af-modal { background: #fff; border-radius: 16px; width: 560px; max-width: 92vw; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.22); animation: af-mi .22s cubic-bezier(.4,0,.2,1); }
        .af-modal--sm { width: 380px; }
        @keyframes af-mi { from { transform: translateY(18px) scale(.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        .af-modal__header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f1f5f9; }
        .af-modal__title { display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 800; color: #0f172a; }
        .af-modal__title i { color: #008b3e; }
        .af-modal__close { width: 30px; height: 30px; border: none; background: #f1f5f9; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 13px; }
        .af-modal__close:hover { background: #e2e8f0; }
        .af-modal__body { padding: 20px 22px; overflow-y: auto; flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .af-modal__footer { padding: 14px 22px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }

        /* Responsive */
        @media (max-width: 1100px) {
          .af-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .af-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .af-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .af-table { min-width: 900px; }
        }

        @media (max-width: 768px) {
          .af-root {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            overflow-x: hidden;
          }

          .af-header {
            align-items: flex-start;
            gap: 12px;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .af-header > div:last-child { min-width: 0; }
          .af-header__title { font-size: 20px; }
          .af-header__sub { line-height: 1.5; }

          .af-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 20px;
          }
          .af-stat {
            min-width: 0;
            padding: 14px;
            gap: 10px;
          }
          .af-stat__body { min-width: 0; }
          .af-stat__icon {
            width: 38px;
            height: 38px;
            font-size: 17px;
          }
          .af-stat__label { font-size: 10px; }
          .af-stat__value {
            font-size: 15px;
            overflow-wrap: anywhere;
          }

          .af-alert {
            align-items: flex-start;
            font-size: 13px;
            line-height: 1.5;
          }

          .af-card {
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 16px;
          }
          .af-card__head {
            flex-wrap: wrap;
            margin-bottom: 16px;
          }
          .af-count {
            margin-left: auto;
            white-space: nowrap;
          }

          .af-form-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }
          .af-fg,
          .af-fg--full {
            grid-column: auto;
            min-width: 0;
          }
          .af-form-actions { justify-content: stretch; }
          .af-form-actions .af-btn {
            width: 100%;
            justify-content: center;
          }

          .af-filters {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
          .af-fgrp,
          .af-finput {
            min-width: 0;
            width: 100%;
          }
          .af-filters .af-fgrp:first-child,
          .af-filters .af-fgrp:last-child {
            grid-column: 1 / -1;
          }

          .af-table-wrap {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .af-table { min-width: 900px; }

          .af-pagination {
            flex-direction: column;
            align-items: stretch;
          }
          .af-pg-left {
            justify-content: center;
            flex-wrap: wrap;
          }
          .af-pg-right {
            justify-content: center;
            flex-wrap: wrap;
          }
          .af-pg-info {
            width: 100%;
            text-align: center;
          }
          .af-pg-right .af-pg-btn {
            flex: 1;
            justify-content: center;
          }

          .af-toast {
            top: 12px;
            right: 12px;
            left: 12px;
            width: auto;
            min-width: 0;
          }

          .af-overlay {
            padding: 16px;
            align-items: center;
          }
          .af-modal {
            width: 100%;
            max-width: 560px;
            max-height: calc(100vh - 32px);
          }
          .af-modal--sm {
            width: 100%;
            max-width: 380px;
          }
          .af-modal__body {
            grid-template-columns: minmax(0, 1fr);
          }
        }

        @media (max-width: 480px) {
          .af-stats { grid-template-columns: 1fr; }

          .af-card { padding: 14px 12px; }
          .af-header__icon {
            width: 36px;
            height: 36px;
          }

          .af-filters { grid-template-columns: 1fr; }
          .af-filters .af-fgrp:first-child,
          .af-filters .af-fgrp:last-child {
            grid-column: auto;
          }

          .af-modal__header,
          .af-modal__body,
          .af-modal__footer {
            padding-left: 16px;
            padding-right: 16px;
          }
          .af-modal__footer {
            flex-direction: column-reverse;
          }
          .af-modal__footer .af-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminFeatures;
