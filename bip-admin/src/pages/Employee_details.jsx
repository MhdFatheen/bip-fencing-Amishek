import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";

const getHeaders = () => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  };
  const role = localStorage.getItem("role");
  if (role === "admin") {
    const viewBranch = localStorage.getItem("admin_view_branch");
    if (viewBranch) {
      headers["X-Branch-ID"] = viewBranch;
    }
  }
  return headers;
};

const Employee_details = () => {
  const { logout } = useAuth();
  const userRole = localStorage.getItem("role");
  const isBranchSelected =
    userRole === "admin" ? !!localStorage.getItem("admin_view_branch") : true;

  const [activeTab, setActiveTab] = useState("records");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [filters, setFilters] = useState({
    name: "",
    salary_type: "",
    whatsapp: "",
    date_from: "",
    date_to: "",
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 1,
  });

  const getTodayYMD = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const emptyForm = {
    employee_name: "",
    gender: "",
    whatsapp_number: "",
    address: "",
    salary_type: "",
    price_per_bags: "",
    date_of_joining: getTodayYMD(),
  };
  const [formData, setFormData] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      2500,
    );
  };

  const handleFilterChange = (e) => {
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    setFilters(newFilters);
    fetchEmployees(1, pagination.limit, newFilters, true);
  };

  const fetchEmployees = async (
    page = 1,
    limit = pagination.limit,
    customFilters = null,
    resetPage = true,
  ) => {
    setLoading(true);
    setError("");
    const activeFilters = customFilters || filters;
    try {
      const params = new URLSearchParams();
      params.append("page", resetPage ? 1 : page);
      params.append("limit", limit);
      if (activeFilters.name) params.append("name", activeFilters.name);
      if (activeFilters.salary_type)
        params.append("salary_type", activeFilters.salary_type);
      if (activeFilters.whatsapp)
        params.append("whatsapp", activeFilters.whatsapp);
      if (activeFilters.date_from)
        params.append("date_from", activeFilters.date_from);
      if (activeFilters.date_to)
        params.append("date_to", activeFilters.date_to);

      const response = await apiFetch(`/employees/get_employees.php?${params}`);
      if (!response.ok) {
        if (response.status === 401) {
          showToast("Session expired. Please log in again.", "error");
          logout();
          return;
        }
        throw new Error("Failed to fetch employees");
      }
      const result = await response.json();
      setEmployees(result.data || []);
      setPagination({
        page: result.page || 1,
        limit: result.limit || limit,
        total: result.total || 0,
        total_pages: result.total_pages || 1,
      });
      if (resetPage) setPagination((prev) => ({ ...prev, page: 1 }));
      setActiveTab("records");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.total_pages) return;
    fetchEmployees(newPage, pagination.limit, null, false);
  };

  const handleLimitChange = (e) => {
    let newLimit = parseInt(e.target.value);
    if (newLimit === -1) newLimit = 10000;
    setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
    fetchEmployees(1, newLimit, null, true);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setFormData({ ...emptyForm, date_of_joining: getTodayYMD() });
    setEditId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isBranchSelected && userRole === "admin") {
      showToast(
        "Please select a specific branch from the topbar before adding an employee.",
        "error",
      );
      return;
    }
    // Validate gender
    if (!formData.gender) {
      showToast("Please select a gender.", "error");
      return;
    }

    // Validate Indian WhatsApp number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (
      !formData.whatsapp_number ||
      !phoneRegex.test(formData.whatsapp_number.replace(/\s/g, ""))
    ) {
      showToast(
        "Please enter a valid 10-digit WhatsApp number (starting with 6-9).",
        "error",
      );
      return;
    }

    try {
      const response = await apiFetch(
        editId
          ? `/employees/update_employee.php?id=${editId}`
          : "/employees/add_employee.php",
        {
          method: editId ? "PUT" : "POST",
          body: JSON.stringify(formData),
        },
      );
      if (response.ok) {
        showToast(
          editId
            ? "Employee updated successfully"
            : "Employee added successfully",
        );
        resetForm();
        setShowModal(false);
        fetchEmployees(pagination.page, pagination.limit);
        setActiveTab("records");
      } else {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          showToast("Session expired. Please log in again.", "error");
          logout();
        } else {
          showToast(
            errData.error || "Failed to save employee details",
            "error",
          );
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Server error", "error");
    }
  };

  const handleEdit = (emp) => {
    setFormData({
      employee_name: emp.employee_name,
      gender: emp.gender || "",
      whatsapp_number: emp.whatsapp_number || emp.phone_number || "",
      address: emp.address || "",
      salary_type: emp.salary_type,
      price_per_bags: emp.price_per_bags || "",
      date_of_joining: emp.date_of_joining,
    });
    setEditId(emp.id);
    setShowModal(true);
  };

  // Opens the styled confirmation modal instead of the browser's
  // native window.confirm() dialog.
  const handleDelete = (emp) => setDeleteTarget(emp);

  const confirmDelete = async () => {
    const emp = deleteTarget;
    if (!emp) return;
    try {
      const response = await apiFetch(
        `/employees/delete_employee.php?id=${emp.id}`,
        {
          method: "DELETE",
        },
      );
      if (response.ok) {
        showToast("Employee deleted successfully");
        fetchEmployees(pagination.page, pagination.limit);
      } else {
        const errData = await response.json().catch(() => ({}));
        showToast(errData.error || "Delete failed", "error");
      }
    } catch (err) {
      showToast("Server error", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  // Fetch total count on mount so the badge shows correctly on "add" tab
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await apiFetch(
          "/employees/get_employees.php?page=1&limit=1",
        );
        if (response.ok) {
          const result = await response.json();
          setPagination((prev) => ({ ...prev, total: result.total || 0 }));
        }
      } catch (_) {}
    };
    fetchCount();
  }, []);

  useEffect(() => {
    if (activeTab === "records") {
      fetchEmployees();
    }
  }, [activeTab]);

  const salaryBadge = (type) => {
    const map = {
      monthly: { bg: "#e0f2fe", color: "#0369a1", label: "Monthly" },
      weekly: { bg: "#fef9c3", color: "#854d0e", label: "Weekly" },
      daily: { bg: "#fce7f3", color: "#9d174d", label: "Daily" },
    };
    const s = map[type] || { bg: "#f1f5f9", color: "#475569", label: type };
    return (
      <span
        style={{
          background: s.bg,
          color: s.color,
          borderRadius: 20,
          padding: "3px 10px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.2,
          display: "inline-block",
        }}
      >
        {s.label}
      </span>
    );
  };

  return (
    <div className="ep-root">
      {/* Toast */}
      {toast.show && (
        <div className={`ep-toast ep-toast--${toast.type}`}>
          {toast.type === "success" ? (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="12" fill="#fff" fillOpacity=".18" />
              <path
                d="M7 12.5l3.5 3.5 6.5-7"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="12" fill="#fff" fillOpacity=".18" />
              <path
                d="M12 8v4m0 4h.01"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="ep-header">
        <div className="ep-header__icon">
          <i className="bi bi-person-badge-fill"></i>
        </div>
        <div>
          <h1 className="ep-header__title">Employee Details</h1>
          <p className="ep-header__sub">
            Manage employee records and staff information
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="ep-tabs">
        <button
          className={`ep-tab${activeTab === "add" ? " ep-tab--active" : ""}`}
          onClick={() => {
            setActiveTab("add");
            resetForm();
          }}
        >
          <i className="bi bi-plus-circle"></i>
          Add Employee
        </button>
        <button
          className={`ep-tab${
            activeTab === "records" ? " ep-tab--active" : ""
          }`}
          onClick={() => fetchEmployees()}
        >
          <i className="bi bi-table"></i>
          Employee Records
          <span className="ep-tab__badge">{pagination.total}</span>
        </button>
      </div>

      {/* Add Form */}
      {activeTab === "add" && (
        <form onSubmit={handleSubmit} className="ep-form-wrap">
          {!isBranchSelected && userRole === "admin" && (
            <div className="ep-alert">
              <i className="bi bi-exclamation-triangle-fill"></i>
              Please select a specific branch (Branch A, B, or C) from the
              topbar to add an employee.
            </div>
          )}
          <div className="ep-card">
            <div className="ep-card__head">
              <i className="bi bi-person-vcard"></i>
              <span>Employee Information</span>
            </div>
            <div className="ep-form-grid">
              {[
                {
                  name: "employee_name",
                  label: "Employee Name",
                  req: true,
                  type: "text",
                  hint: "Must be unique — no two employees can share the same name",
                },
                {
                  name: "whatsapp_number",
                  label: "WhatsApp Number",
                  req: true,
                  type: "text",
                },
                { name: "address", label: "Address", req: false, type: "text" },
              ].map((f) => (
                <div className="ep-fg" key={f.name}>
                  <label className="ep-label">
                    {f.label}
                    {f.req && <span className="ep-req">*</span>}
                  </label>
                  <input
                    type={f.type}
                    name={f.name}
                    value={formData[f.name]}
                    onChange={handleChange}
                    required={f.req}
                    disabled={!isBranchSelected && userRole === "admin"}
                    className="ep-input"
                    placeholder={`Enter ${f.label.toLowerCase()}`}
                  />
                  {f.hint && <span className="ep-hint">{f.hint}</span>}
                </div>
              ))}

              <div className="ep-fg">
                <label className="ep-label">
                  Gender<span className="ep-req">*</span>
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  required
                  disabled={!isBranchSelected && userRole === "admin"}
                  className="ep-input"
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="ep-fg">
                <label className="ep-label">
                  Salary Type<span className="ep-req">*</span>
                </label>
                <select
                  name="salary_type"
                  value={formData.salary_type}
                  onChange={handleChange}
                  required
                  disabled={!isBranchSelected && userRole === "admin"}
                  className="ep-input"
                >
                  <option value="">Select salary type</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>

              <div className="ep-fg">
                <label className="ep-label">Price per Bags</label>
                <input
                  type="number"
                  name="price_per_bags"
                  value={formData.price_per_bags}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  disabled={!isBranchSelected && userRole === "admin"}
                  className="ep-input"
                  placeholder="Enter price per bags"
                />
              </div>

              <div className="ep-fg">
                <label className="ep-label">
                  Date of Joining<span className="ep-req">*</span>
                </label>
                <input
                  type="date"
                  name="date_of_joining"
                  value={formData.date_of_joining}
                  onChange={handleChange}
                  required
                  disabled={!isBranchSelected && userRole === "admin"}
                  className="ep-input"
                />
              </div>
            </div>
          </div>

          {isBranchSelected && (
            <div className="ep-form-actions">
              <button
                type="button"
                className="ep-btn ep-btn--ghost"
                onClick={resetForm}
              >
                <i className="bi bi-arrow-counterclockwise"></i> Reset
              </button>
              <button type="submit" className="ep-btn ep-btn--primary">
                <i className="bi bi-check-circle"></i> Save Employee
              </button>
            </div>
          )}
        </form>
      )}

      {/* Records Tab */}
      {activeTab === "records" && (
        <div className="ep-card">
          <div className="ep-card__head">
            <i className="bi bi-table"></i>
            <span>Employee Records</span>
            <span className="ep-records-count">{pagination.total} total</span>
          </div>

          {/* Filter Bar */}
          <div className="ep-filters">
            <div className="ep-filter-group">
              <i className="bi bi-search ep-filter-icon"></i>
              <input
                type="text"
                name="name"
                placeholder="Search by name…"
                value={filters.name}
                onChange={handleFilterChange}
                className="ep-filter-input ep-filter-input--icon"
              />
            </div>
            <select
              name="salary_type"
              value={filters.salary_type}
              onChange={handleFilterChange}
              className="ep-filter-input"
            >
              <option value="">All Salary Types</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
            <div className="ep-filter-group">
              <i className="bi bi-whatsapp ep-filter-icon"></i>
              <input
                type="text"
                name="whatsapp"
                placeholder="WhatsApp…"
                value={filters.whatsapp}
                onChange={handleFilterChange}
                className="ep-filter-input ep-filter-input--icon"
              />
            </div>
            <input
              type="date"
              name="date_from"
              value={filters.date_from}
              onChange={handleFilterChange}
              className="ep-filter-input"
              title="From date"
            />
            <input
              type="date"
              name="date_to"
              value={filters.date_to}
              onChange={handleFilterChange}
              className="ep-filter-input"
              title="To date"
            />
          </div>

          {loading && (
            <div className="ep-loading">
              <div className="ep-spinner"></div>
              <span>Loading employees…</span>
            </div>
          )}
          {error && <div className="ep-error">{error}</div>}

          {!loading && !error && (
            <>
              <div className="ep-table-wrap">
                <table className="ep-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Employee</th>
                      <th>WhatsApp</th>
                      <th>Salary Type</th>
                      <th>Price per Bags</th>
                      {userRole === "admin" && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length > 0 ? (
                      employees.map((emp, idx) => (
                        <tr key={emp.id} className="ep-tr">
                          <td className="ep-td--num">
                            {(pagination.page - 1) * pagination.limit + idx + 1}
                          </td>
                          <td>
                            <div className="ep-emp-cell">
                              <div className="ep-avatar">
                                {emp.employee_name
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <div>
                                <div className="ep-emp-name">
                                  {emp.employee_name}
                                </div>
                                <div className="ep-emp-meta">
                                  {emp.gender || "—"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="ep-contact-cell">
                              {(emp.whatsapp_number || emp.phone_number) && (
                                <span>
                                  <i className="bi bi-whatsapp"></i>{" "}
                                  {emp.whatsapp_number || emp.phone_number}
                                </span>
                              )}
                              {!(emp.whatsapp_number || emp.phone_number) &&
                                "—"}
                            </div>
                          </td>
                          <td>{salaryBadge(emp.salary_type)}</td>
                          <td>
                            {emp.price_per_bags != null &&
                            emp.price_per_bags !== "" ? (
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  color: "#15803d",
                                }}
                              >
                                ₹
                                {Number(emp.price_per_bags).toLocaleString(
                                  "en-IN",
                                )}
                              </span>
                            ) : (
                              <span className="ep-nil">—</span>
                            )}
                          </td>
                          {userRole === "admin" && (
                            <td>
                              <div className="ep-actions">
                                <button
                                  className="ep-action-btn ep-action-btn--edit"
                                  onClick={() => handleEdit(emp)}
                                  title="Edit"
                                >
                                  <i className="bi bi-pencil-fill"></i>
                                </button>
                                <button
                                  className="ep-action-btn ep-action-btn--delete"
                                  onClick={() => handleDelete(emp)}
                                  title="Delete"
                                >
                                  <i className="bi bi-trash-fill"></i>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={userRole === "admin" ? 6 : 5}
                          className="ep-empty"
                        >
                          <div className="ep-empty-inner">
                            <i className="bi bi-inbox"></i>
                            <p>No employee records found</p>
                            <span>Try adjusting your filters</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="ep-pagination">
                <div className="ep-pagination__left">
                  <span>Show</span>
                  <select
                    value={pagination.limit === 10000 ? -1 : pagination.limit}
                    onChange={handleLimitChange}
                    className="ep-pg-select"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={-1}>All</option>
                  </select>
                  <span>entries per page</span>
                </div>
                {pagination.limit !== 10000 && (
                  <div className="ep-pagination__right">
                    <span className="ep-pg-info">
                      Page {pagination.page} of {pagination.total_pages}
                    </span>
                    <button
                      className="ep-pg-btn"
                      disabled={pagination.page <= 1}
                      onClick={() => handlePageChange(pagination.page - 1)}
                    >
                      <i className="bi bi-chevron-left"></i> Previous
                    </button>
                    <button
                      className="ep-pg-btn"
                      disabled={pagination.page >= pagination.total_pages}
                      onClick={() => handlePageChange(pagination.page + 1)}
                    >
                      Next <i className="bi bi-chevron-right"></i>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="ep-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div
            className="ep-modal ep-modal--confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ep-modal__header">
              <div className="ep-modal__title ep-modal__title--danger">
                <i className="bi bi-trash"></i>
                Delete Employee
              </div>
              <button
                className="ep-modal__close"
                onClick={() => setDeleteTarget(null)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="ep-modal__body ep-modal__body--confirm">
              <div className="ep-confirm-icon">
                <i className="bi bi-exclamation-triangle-fill"></i>
              </div>
              <p className="ep-confirm-title">
                Delete <strong>{deleteTarget.employee_name}</strong>?
              </p>
              <p className="ep-confirm-sub">
                This will permanently remove the employee record. This action
                cannot be undone.
              </p>
            </div>

            <div className="ep-modal__footer">
              <button
                className="ep-btn ep-btn--ghost"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button className="ep-btn ep-btn--danger" onClick={confirmDelete}>
                <i className="bi bi-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showModal && (
        <div className="ep-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="ep-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ep-modal__header">
              <div className="ep-modal__title">
                <i className="bi bi-pencil-square"></i>
                Edit Employee
              </div>
              <button
                className="ep-modal__close"
                onClick={() => setShowModal(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="ep-modal__body">
              {Object.keys(emptyForm).map((key) => (
                <div className="ep-fg" key={key}>
                  <label className="ep-label">
                    {key
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </label>
                  {key === "gender" ? (
                    <select
                      name={key}
                      value={formData[key] || ""}
                      onChange={handleChange}
                      className="ep-input"
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : key === "salary_type" ? (
                    <select
                      name={key}
                      value={formData[key] || ""}
                      onChange={handleChange}
                      className="ep-input"
                    >
                      <option value="">Select type</option>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                    </select>
                  ) : key === "date_of_joining" ? (
                    <input
                      type="date"
                      name={key}
                      value={formData[key] || ""}
                      onChange={handleChange}
                      className="ep-input"
                    />
                  ) : key === "price_per_bags" ? (
                    <input
                      type="number"
                      name={key}
                      value={formData[key] || ""}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="ep-input"
                      placeholder="Enter price per bags"
                    />
                  ) : (
                    <input
                      type="text"
                      name={key}
                      value={formData[key] || ""}
                      onChange={handleChange}
                      className="ep-input"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="ep-modal__footer">
              <button
                className="ep-btn ep-btn--ghost"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button className="ep-btn ep-btn--primary" onClick={handleSubmit}>
                <i className="bi bi-check-circle"></i> Update Employee
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* NEW: hide the native scrollbar (and its up/down arrow buttons) everywhere,
           matching the same fix applied on the Admin Features page.
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

        /* ── Root ── */
        .ep-root {
          padding: 0;
          color: #0f172a;
          width: 100%;
          position: relative;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        /* ── Toast ── */
        .ep-toast {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 1200;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          animation: ep-slideIn 0.28s cubic-bezier(.4,0,.2,1);
          color: #fff;
          min-width: 240px;
        }
        .ep-toast--success { background: #008b3e; }
        .ep-toast--error   { background: #dc2626; }
        @keyframes ep-slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }

        /* ── Page Header ── */
        .ep-header {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-bottom: 28px;
          border-bottom: 1.5px solid #e2e8f0;
          margin-bottom: 8px;
        }
        .ep-header__icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #008b3e 0%, #00b84f 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 17px;
          flex-shrink: 0;
          box-shadow: 0 3px 10px rgba(0,139,62,0.25);
        }
        .ep-header__title {
          margin: 0 0 2px;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.4px;
          color: #0f172a;
        }
        .ep-header__sub {
          margin: 0;
          font-size: 13px;
          color: #64748b;
        }

        /* ── Tabs ── */
        /* CHANGED: restyled to match AdminFeatures — muted gray inactive tabs,
           icon + label only (no button-like hover background), green text +
           thin green underline (via ::after) only on the active tab. */
        .ep-tabs {
          display: flex;
          align-items: center;
          gap: 32px;
          border-bottom: 1.5px solid #e2e8f0;
          margin-top: 28px;
          margin-bottom: 32px;
          overflow-x: auto;
        }
        .ep-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          padding: 14px 2px;
          font-size: 14.5px;
          font-weight: 700;
          color: #94a3b8;
          cursor: pointer;
          position: relative;
          white-space: nowrap;
          transition: color .15s;
        }
        .ep-tab i { font-size: 16px; color: #cbd5e1; transition: color .15s; }
        .ep-tab:hover { color: #475569; }
        .ep-tab:hover i { color: #94a3b8; }
        .ep-tab--active { color: #008b3e; }
        .ep-tab--active i { color: #008b3e; }
        .ep-tab--active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1.5px;
          height: 2.5px;
          background: #008b3e;
          border-radius: 2px;
        }
        .ep-tab__badge {
          background: #dcfce7;
          color: #15803d;
          border-radius: 20px;
          padding: 1px 9px;
          font-size: 12px;
          font-weight: 700;
        }

        /* ── Card ── */
        .ep-card {
          background: #fff;
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          padding: 28px;
          margin-bottom: 28px;
        }
        .ep-card__head {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f1f5f9;
        }
        .ep-card__head i { color: #008b3e; font-size: 18px; }
        .ep-records-count {
          margin-left: auto;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 10px;
          border-radius: 20px;
        }

        /* ── Form ── */
        .ep-form-wrap { }
        .ep-form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
        }
        .ep-fg { display: flex; flex-direction: column; gap: 7px; }
        .ep-label { font-size: 13px; font-weight: 600; color: #374151; }
        .ep-req { color: #ef4444; margin-left: 3px; }
        .ep-nil { color: #cbd5e1; }
        .ep-hint { font-size: 12px; color: #64748b; margin-top: 2px; }
        .ep-input {
          height: 42px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          padding: 0 13px;
          font-size: 14px;
          color: #1e293b;
          background: #fafbfc;
          transition: border-color .15s, box-shadow .15s;
          width: 100%;
          box-sizing: border-box;
          outline: none;
        }
        .ep-input:focus {
          border-color: #008b3e;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(0,139,62,0.1);
        }
        .ep-input:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }

        .ep-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        /* ── Buttons ── */
        .ep-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 10px 22px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: opacity .15s, box-shadow .15s, transform .1s;
        }
        .ep-btn:active { transform: scale(.98); }
        .ep-btn--primary {
          background: linear-gradient(135deg, #008b3e 0%, #009e46 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(0,139,62,0.3);
        }
        .ep-btn--primary:hover { box-shadow: 0 4px 16px rgba(0,139,62,0.38); }
        .ep-btn--ghost {
          background: #f8fafc;
          color: #374151;
          border: 1.5px solid #e2e8f0;
        }
        .ep-btn--ghost:hover { background: #f1f5f9; }

        /* ── Alert ── */
        .ep-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 20px;
        }

        /* ── Filters ── */
        .ep-filters {
          display: grid;
          grid-template-columns: 2fr 1.2fr 1fr 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 22px;
          align-items: center;
        }
        .ep-filter-group {
          position: relative;
          width: 100%;
        }
        .ep-filter-icon {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 13px;
          pointer-events: none;
        }
        .ep-filter-input {
          height: 38px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          color: #1e293b;
          background: #fafbfc;
          transition: border-color .15s;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          outline: none;
        }
        .ep-filter-input--icon { padding-left: 32px; }
        .ep-filter-input:focus { border-color: #008b3e; background: #fff; }

        /* ── Table ── */
        .ep-table-wrap {
          overflow-x: auto;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
        }
        .ep-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .ep-table thead tr {
          background: #f8fafc;
        }
        .ep-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          white-space: nowrap;
          border-bottom: 1.5px solid #e2e8f0;
        }
        .ep-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          vertical-align: middle;
        }
        .ep-tr:last-child td { border-bottom: none; }
        .ep-tr:hover td { background: #f8fffe; }
        .ep-td--num { color: #94a3b8; font-size: 13px; width: 36px; }

        /* Avatar + emp cell */
        .ep-emp-cell { display: flex; align-items: center; gap: 12px; }
        .ep-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          color: #15803d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 800;
          flex-shrink: 0;
          letter-spacing: 0;
        }
        .ep-emp-name { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .ep-emp-meta { font-size: 12px; color: #64748b; margin-top: 1px; }
        .ep-id-tag {
          background: #f1f5f9;
          color: #475569;
          border-radius: 6px;
          padding: 3px 9px;
          font-size: 12px;
          font-weight: 700;
          font-family: "SF Mono", "Fira Code", monospace;
        }
        .ep-contact-cell { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
        .ep-contact-cell span { display: flex; align-items: center; gap: 6px; color: #475569; }
        .ep-date { font-size: 13px; color: #374151; white-space: nowrap; }

        /* Action buttons */
        .ep-actions { display: flex; gap: 6px; align-items: center; }
        .ep-action-btn {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          transition: transform .12s, box-shadow .12s;
        }
        .ep-action-btn:hover { transform: scale(1.08); }
        .ep-action-btn--edit { background: #eff6ff; color: #2563eb; }
        .ep-action-btn--edit:hover { background: #dbeafe; box-shadow: 0 2px 8px rgba(37,99,235,.18); }
        .ep-action-btn--delete { background: #fef2f2; color: #dc2626; }
        .ep-action-btn--delete:hover { background: #fee2e2; box-shadow: 0 2px 8px rgba(220,38,38,.18); }

        /* Empty state */
        .ep-empty { padding: 0 !important; }
        .ep-empty-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 56px 20px;
          color: #94a3b8;
        }
        .ep-empty-inner i { font-size: 44px; margin-bottom: 12px; }
        .ep-empty-inner p { font-size: 15px; font-weight: 600; color: #64748b; margin: 0 0 4px; }
        .ep-empty-inner span { font-size: 13px; }

        /* Loading */
        .ep-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 40px;
          justify-content: center;
          color: #64748b;
          font-size: 14px;
        }
        .ep-spinner {
          width: 22px; height: 22px;
          border: 3px solid #e2e8f0;
          border-top-color: #008b3e;
          border-radius: 50%;
          animation: ep-spin .7s linear infinite;
        }
        @keyframes ep-spin { to { transform: rotate(360deg); } }

        .ep-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 14px;
          margin-bottom: 16px;
        }

        /* ── Pagination ── */
        .ep-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid #f1f5f9;
          flex-wrap: wrap;
          gap: 12px;
        }
        .ep-pagination__left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #64748b;
        }
        .ep-pg-select {
          height: 34px;
          border: 1.5px solid #e2e8f0;
          border-radius: 7px;
          padding: 0 8px;
          font-size: 13px;
          background: #fafbfc;
          color: #1e293b;
          cursor: pointer;
          outline: none;
        }
        .ep-pg-select:focus { border-color: #008b3e; }
        .ep-pagination__right { display: flex; align-items: center; gap: 8px; }
        .ep-pg-info { font-size: 13px; color: #64748b; margin-right: 4px; }
        .ep-pg-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border: 1.5px solid #e2e8f0;
          background: #fafbfc;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          cursor: pointer;
          transition: background .15s, border-color .15s;
        }
        .ep-pg-btn:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .ep-pg-btn:disabled { opacity: .45; cursor: not-allowed; }

        /* ── Modal ── */
        .ep-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15,23,42,0.55);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: ep-fadeIn .18s ease;
        }
        @keyframes ep-fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ep-modal {
          background: #fff;
          border-radius: 16px;
          width: 620px;
          max-width: 92vw;
          max-height: 88vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 60px rgba(15,23,42,0.22);
          animation: ep-modalIn .22s cubic-bezier(.4,0,.2,1);
        }
        @keyframes ep-modalIn {
          from { transform: translateY(20px) scale(.97); opacity: 0; }
          to   { transform: translateY(0)    scale(1);   opacity: 1; }
        }
        .ep-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
        }
        .ep-modal__title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 17px;
          font-weight: 800;
          color: #0f172a;
        }
        .ep-modal__title i { color: #008b3e; }
        .ep-modal__close {
          width: 32px; height: 32px;
          border: none;
          background: #f1f5f9;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          font-size: 14px;
          transition: background .15s;
        }
        .ep-modal__close:hover { background: #e2e8f0; }
        .ep-modal__body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .ep-modal__footer {
          padding: 16px 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        /* ── Confirm dialog variant ── */
        .ep-modal--confirm { width: 430px; }
        .ep-modal__title--danger { color: #dc2626; }
        .ep-modal__title--danger i { color: #dc2626; }
        .ep-modal__body--confirm {
          display: block;
          text-align: center;
          padding: 28px 24px;
        }
        .ep-confirm-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #fef2f2;
          color: #dc2626;
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }
        .ep-confirm-title {
          margin: 0 0 6px;
          font-size: 15.5px;
          font-weight: 700;
          color: #0f172a;
        }
        .ep-confirm-sub {
          margin: 0;
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
        }
        .ep-btn--danger {
          background: #dc2626;
          color: #fff;
          box-shadow: 0 2px 8px rgba(220,38,38,0.3);
        }
        .ep-btn--danger:hover { box-shadow: 0 4px 16px rgba(220,38,38,0.38); }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .ep-filters { grid-template-columns: 1fr 1fr 1fr; }
        }
        @media (max-width: 960px) {
          .ep-form-grid { grid-template-columns: 1fr 1fr; }
          .ep-filters { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
          .ep-form-grid { grid-template-columns: 1fr; }
          .ep-filters { grid-template-columns: 1fr; }
          .ep-modal__body { grid-template-columns: 1fr; }
          .ep-header { gap: 12px; }
          .ep-header__title { font-size: 20px; }
        }
      `}</style>
    </div>
  );
};

export default Employee_details;
