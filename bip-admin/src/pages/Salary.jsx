import { useState, useEffect, useCallback } from "react";
import Select from "react-select";
import { apiFetch } from "../utils/api";

const getHeaders = () => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  };
  if (localStorage.getItem("role") === "admin") {
    const viewBranch = localStorage.getItem("admin_view_branch");
    if (viewBranch) headers["X-Branch-ID"] = viewBranch;
  }
  return headers;
};

/* =========================================================
   ATTENDANCE — shared constants / helpers (from Attendance.jsx)
   ========================================================= */
const STATUSES = [
  "Present",
  "Absent",
  "Half Day",
  "Late",
  "On Leave",
  "Holiday",
  "Work From Site",
];
const LEAVE_TYPES = [
  "Annual Leave",
  "Sick Leave",
  "Emergency Leave",
  "Unpaid Leave",
  "Maternity/Paternity",
  "Compensatory Off",
];
const STATUS_META = {
  Present: { bg: "#dcfce7", color: "#15803d", icon: "bi-check-circle-fill" },
  Absent: { bg: "#fee2e2", color: "#dc2626", icon: "bi-x-circle-fill" },
  "Half Day": { bg: "#fef9c3", color: "#b45309", icon: "bi-circle-half" },
  Late: { bg: "#fef3c7", color: "#d97706", icon: "bi-clock-fill" },
  "On Leave": {
    bg: "#e0f2fe",
    color: "#0369a1",
    icon: "bi-calendar2-minus-fill",
  },
  Holiday: { bg: "#f1f5f9", color: "#475569", icon: "bi-star-fill" },
  "Work From Site": {
    bg: "#ede9fe",
    color: "#7c3aed",
    icon: "bi-geo-alt-fill",
  },
};

// Backend JSON may return ids as numbers or strings ("3" vs 3) and dates as
// "2026-08-16" or "2026-08-16 00:00:00". Compare them tolerantly so records
// always match up with their employee/date.
const sameId = (a, b) => String(a) === String(b);
const dateOnly = (d) => String(d || "").slice(0, 10);

const formatTime12 = (t) => {
  if (!t) return "";
  let [h, m] = t.split(":");
  h = parseInt(h);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

/* =========================================================
   SALARY v2 — helpers (period ranges, formatting, WhatsApp message)
   ========================================================= */
const toYMD = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Returns [startDateStr, endDateStr, labelText] for the given period
const getPeriodRange = (period) => {
  const now = new Date();
  if (period === "day") {
    const s = toYMD(now);
    return [s, s, `Today (${s})`];
  }
  if (period === "week") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [
      toYMD(monday),
      toYMD(sunday),
      `This Week (${toYMD(monday)} to ${toYMD(sunday)})`,
    ];
  }
  if (period === "all") {
    return ["0000-01-01", "9999-12-31", "All Time"];
  }
  // month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [
    toYMD(first),
    toYMD(last),
    `This Month (${first.toLocaleDateString("en-GB", { month: "short", year: "numeric" })})`,
  ];
};

const inr = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const buildWhatsAppMessage = (
  empName,
  periodLabel,
  earned,
  paid,
  pending,
  earningDays = [],
) => {
  let breakdown = "";
  if (earningDays.length > 0) {
    const sortedDays = [...earningDays].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    breakdown =
      sortedDays
        .map((d) => {
          let dayText = `${d.date}\nBags: ${d.bags_count} = ${inr(d.base_amount)}`;
          if (d.ot_entries && d.ot_entries.length > 0) {
            d.ot_entries.forEach((ot) => {
              dayText += `\n${ot.work_name} x${ot.quantity} = ${inr(ot.amount * ot.quantity)}`;
            });
          }
          dayText += `\nDay Total: ${inr(d.total_amount)}`;
          return dayText;
        })
        .join("\n\n") + "\n\n";
  }
  return (
    `Hi ${empName}, here is your salary summary for ${periodLabel}:\n\n` +
    breakdown +
    `Earned: ${inr(earned)}\n` +
    `Paid: ${inr(paid)}\n` +
    `Pending Balance: ${inr(pending)}\n\n` +
    `Thank you!`
  );
};

const openWhatsApp = (whatsappNumber, message) => {
  if (!whatsappNumber) return false;
  const digits = String(whatsappNumber).replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  window.open(
    `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`,
    "_blank",
  );
  return true;
};

export default function Salary() {
  /* =========================================================
     Shared / page-level state
     ========================================================= */
  const [view, setView] = useState("attendance"); // "attendance" | "salary"
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const userRole = localStorage.getItem("role");
  const isAdmin = userRole === "admin";

  /* =========================================================
     ATTENDANCE state (prefixed "at" to avoid collisions with Salary state)
     ========================================================= */
  const [atRecords, setAtRecords] = useState([]);
  const [atStats, setAtStats] = useState({
    total_employees: 0,
    today: {},
    all_time: {},
  });
  const [atDeleteConfirm, setAtDeleteConfirm] = useState(null);
  const [atBranchWarn, setAtBranchWarn] = useState(false);
  const [atSearch, setAtSearch] = useState("");
  const [atFilterStatus, setAtFilterStatus] = useState("");
  const [atFilterDate, setAtFilterDate] = useState("");
  const [atActiveTab, setAtActiveTab] = useState("all");
  const [atLoading, setAtLoading] = useState(false);
  const [atApiError, setAtApiError] = useState("");
  const [atRowsPerPage, setAtRowsPerPage] = useState(10);
  const [atCurrentPage, setAtCurrentPage] = useState(1);
  const [atDbEmployees, setAtDbEmployees] = useState([]);
  const [atEmpLoading, setAtEmpLoading] = useState(false);
  const [atEmpError, setAtEmpError] = useState("");
  const [atBranchesMap, setAtBranchesMap] = useState({});
  const [atSelectedEmployeeId, setAtSelectedEmployeeId] = useState(null);
  const [atQuickMarkDate, setAtQuickMarkDate] = useState(toYMD(new Date()));

  /* =========================================================
     SALARY v2 state (prefixed "sy" — daily wage + OT + payments)
     ========================================================= */
  const [syDays, setSyDays] = useState([]);
  const [syPayments, setSyPayments] = useState([]);
  const [syOtTypes, setSyOtTypes] = useState([]);
  const [syBranchBudget, setSyBranchBudget] = useState(0);
  const [syBudgetLoading, setSyBudgetLoading] = useState(false);
  const [syLoading, setSyLoading] = useState(false);
  const [syApiError, setSyApiError] = useState("");
  const [sySearch, setSySearch] = useState("");
  const [sySelectedEmployeeId, setSySelectedEmployeeId] = useState(null);
  const [syPeriod, setSyPeriod] = useState("all"); // "day" | "week" | "month" | "all"
  const [sySearchDateFrom, setSySearchDateFrom] = useState("");
  const [sySearchDateTo, setSySearchDateTo] = useState("");
  const [syRowsPerPage, setSyRowsPerPage] = useState(10);
  const [syCurrentPage, setSyCurrentPage] = useState(1);
  const [syShowOtModal, setSyShowOtModal] = useState(false);
  const [syOtForm, setSyOtForm] = useState({
    date: "",
    ot_work_type_id: "",
    amount: "",
  });
  const [syEditingDayId, setSyEditingDayId] = useState(null);
  const [syDraftBags, setSyDraftBags] = useState(0);
  const [syDraftOtQuantities, setSyDraftOtQuantities] = useState({});
  const [syShowPaymentModal, setSyShowPaymentModal] = useState(false);
  const [syShowPaymentHistory, setSyShowPaymentHistory] = useState(false);
  const [syPaymentForm, setSyPaymentForm] = useState({
    amount: "",
    payment_date: "",
    note: "",
  });
  const [syShowManageOt, setSyShowManageOt] = useState(false);
  const [syOtLoading, setSyOtLoading] = useState(false);
  const [syManageOtForm, setSyManageOtForm] = useState({
    name: "",
    amount: "",
  });
  const [syOtDeleteConfirm, setSyOtDeleteConfirm] = useState(null);
  const [syDayDeleteConfirm, setSyDayDeleteConfirm] = useState(null);
  const [syPaymentDeleteConfirm, setSyPaymentDeleteConfirm] = useState(null);

  const selectedBranch = localStorage.getItem("admin_view_branch");
  const canMarkAttendance = !isAdmin || (isAdmin && !!selectedBranch);
  const canEditDelete = isAdmin;

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };

  const formatTime = (ts) =>
    ts
      ? new Date(ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  /* =========================================================
     ATTENDANCE data fetching / handlers
     ========================================================= */
  useEffect(() => {
    setAtCurrentPage(1);
  }, [atFilterDate, atFilterStatus, atSearch, atActiveTab]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const res = await apiFetch("/branches/get_branches.php?simple=1");
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.branches || [];
        const map = {};
        list.forEach((b) => {
          map[b.id] = b.name || b.branch_name;
        });
        setAtBranchesMap(map);
      } catch {}
    };
    fetchBranches();
  }, []);

  const fetchAttendanceRecords = useCallback(async () => {
    setAtLoading(true);
    setAtApiError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token");
      const params = new URLSearchParams();
      if (atFilterDate) params.set("date", atFilterDate);
      if (atFilterStatus) params.set("status", atFilterStatus);
      if (atSearch) params.set("search", atSearch);
      if (atActiveTab !== "all") params.set("tab", atActiveTab);
      params.set("token", token);
      const res = await apiFetch(
        `/attendance/attendance.php?${params.toString()}`,
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAtRecords(data.records || []);
      setAtStats(data.stats || { total_employees: 0, today: {}, all_time: {} });
    } catch (err) {
      setAtApiError(err.message);
      showToast(err.message, "error");
    } finally {
      setAtLoading(false);
    }
  }, [atFilterDate, atFilterStatus, atSearch, atActiveTab]);

  useEffect(() => {
    fetchAttendanceRecords();
  }, [fetchAttendanceRecords]);

  useEffect(() => {
    const fetchAttendanceEmployees = async () => {
      setAtEmpLoading(true);
      setAtEmpError("");
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token");
        const res = await apiFetch("/employees/get_employees.php?simple=1");
        const data = await res.json();
        setAtDbEmployees(Array.isArray(data) ? data : data.employees || []);
      } catch (err) {
        setAtEmpError(err.message);
      } finally {
        setAtEmpLoading(false);
      }
    };
    fetchAttendanceEmployees();
    window.addEventListener("employees-updated", fetchAttendanceEmployees);
    return () =>
      window.removeEventListener("employees-updated", fetchAttendanceEmployees);
  }, []);

  const handleAttendanceDelete = async (id) => {
    if (!canEditDelete) {
      showToast("Only admin can delete records.", "error");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token");
      const res = await apiFetch(`/attendance/attendance.php?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAtDeleteConfirm(null);
      showToast("Attendance record deleted");
      fetchAttendanceRecords();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleQuickMark = async (emp, status) => {
    if (!canMarkAttendance) {
      // Admin is viewing "All Branches" — we don't know which branch to save
      // the record against, so ask them to pick one first.
      setAtBranchWarn(true);
      return;
    }
    const empId = emp.emp_id;
    const empName = emp.employee_name || emp.emp_name;
    const existing = atRecords.find(
      (r) =>
        sameId(r.employee_id, empId) && dateOnly(r.date) === atQuickMarkDate,
    );
    const payload = {
      employee_id: empId,
      employee_name: empName,
      date: atQuickMarkDate,
      status,
      leave_type: "",
      check_in: "",
      check_out: "",
      work_hours: "",
    };
    if (isAdmin && selectedBranch) payload.branch_id = parseInt(selectedBranch);
    try {
      const res = await apiFetch(
        existing
          ? `/attendance/attendance.php?id=${existing.id}`
          : "/attendance/attendance.php",
        {
          method: existing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(`${empName} marked ${status} for ${atQuickMarkDate}`);
      fetchAttendanceRecords();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const atTodayStr = toYMD(new Date());
  const atTodayRecords = atRecords.filter(
    (r) => dateOnly(r.date) === atTodayStr,
  );
  const atTodayPresent = atTodayRecords.filter(
    (r) => r.status === "Present",
  ).length;
  const atTodayAbsent = atTodayRecords.filter(
    (r) => r.status === "Absent",
  ).length;
  const atTodayHalf = atTodayRecords.filter(
    (r) => r.status === "Half Day",
  ).length;
  const atTodayWFS = atTodayRecords.filter(
    (r) => r.status === "Work From Site",
  ).length;
  const atShowBranchColumn = isAdmin && !selectedBranch;

  /* ---- WhatsApp-style employee list for Attendance ---- */
  const atEmployeeList = atDbEmployees
    .filter((emp) => {
      if (!atSearch) return true;
      const s = atSearch.toLowerCase();
      const name = (emp.employee_name || emp.emp_name || "").toLowerCase();
      const id = (emp.emp_id || "").toString().toLowerCase();
      return name.includes(s) || id.includes(s);
    })
    .map((emp) => {
      const empRecords = atRecords
        .filter((r) => sameId(r.employee_id, emp.emp_id))
        .sort((a, b) =>
          `${b.date}${b.created_at || ""}`.localeCompare(
            `${a.date}${a.created_at || ""}`,
          ),
        );
      return {
        emp,
        lastRecord: empRecords[0] || null,
        recordCount: empRecords.length,
      };
    })
    .sort((a, b) => {
      if (a.lastRecord && b.lastRecord)
        return b.lastRecord.date.localeCompare(a.lastRecord.date);
      if (a.lastRecord) return -1;
      if (b.lastRecord) return 1;
      return (a.emp.employee_name || a.emp.emp_name || "").localeCompare(
        b.emp.employee_name || b.emp.emp_name || "",
      );
    });

  const atSelectedEmployee = atSelectedEmployeeId
    ? atDbEmployees.find((e) => e.emp_id === atSelectedEmployeeId) || null
    : null;
  const atSelectedRecords = atSelectedEmployeeId
    ? atRecords
        .filter((r) => sameId(r.employee_id, atSelectedEmployeeId))
        .sort((a, b) =>
          `${b.date}${b.created_at || ""}`.localeCompare(
            `${a.date}${a.created_at || ""}`,
          ),
        )
    : [];

  const atOpenEmployeeDetail = (empId) => {
    setAtSelectedEmployeeId(empId);
    setAtCurrentPage(1);
  };
  const atBackToEmployeeList = () => setAtSelectedEmployeeId(null);

  const atEmployeeTotal = atEmployeeList.length;
  const atEmployeeTotalPages =
    atRowsPerPage === -1 ? 1 : Math.ceil(atEmployeeTotal / atRowsPerPage);
  const atEmployeeStartIndex =
    atRowsPerPage === -1 ? 0 : (atCurrentPage - 1) * atRowsPerPage;
  const atPaginatedEmployeeList =
    atRowsPerPage === -1
      ? atEmployeeList
      : atEmployeeList.slice(
          atEmployeeStartIndex,
          atEmployeeStartIndex + atRowsPerPage,
        );

  /* =========================================================
     SALARY v2 — data fetching
     ========================================================= */
  const fetchSalaryDays = useCallback(async (silent = false) => {
    if (!silent) setSyLoading(true);
    setSyApiError("");
    try {
      const res = await apiFetch("/salary/salary_daily.php?action=days");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSyDays(Array.isArray(data) ? data : []);
    } catch (err) {
      setSyApiError(err.message);
    } finally {
      if (!silent) setSyLoading(false);
    }
  }, []);

  const fetchSalaryPayments = useCallback(async () => {
    try {
      const res = await apiFetch("/salary/salary_daily.php?action=payments");
      const data = await res.json();
      setSyPayments(Array.isArray(data) ? data : []);
    } catch {
      setSyPayments([]);
    }
  }, []);

  const fetchOtTypes = useCallback(async (includeInactive = false) => {
    try {
      const cacheBust = `_=${Date.now()}`;
      const query = includeInactive ? `all=1&${cacheBust}` : cacheBust;
      const res = await apiFetch(`/salary/ot_work_types.php?${query}`);
      const data = await res.json();
      setSyOtTypes(
        Array.isArray(data)
          ? data.map((t) => ({ ...t, is_active: Number(t.is_active) }))
          : [],
      );
    } catch {
      setSyOtTypes([]);
    }
  }, []);

  const fetchBranchBudget = useCallback(async (silent = false) => {
    if (!silent) setSyBudgetLoading(true);
    try {
      const res = await apiFetch(
        "/salary/salary_daily.php?action=branch_budget",
      );
      const data = await res.json();
      setSyBranchBudget(parseFloat(data.total_branch_amount) || 0);
    } catch {
      setSyBranchBudget(0);
    } finally {
      if (!silent) setSyBudgetLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalaryDays();
    fetchSalaryPayments();
    fetchOtTypes();
    fetchBranchBudget();
  }, [fetchSalaryDays, fetchSalaryPayments, fetchOtTypes, fetchBranchBudget]);

  // Attendance is marked on a different tab of this same page. Since that
  // doesn't automatically refresh the Salary tab's data, refetch quietly
  // every time the user switches into the Salary tab so newly marked
  // attendance always shows up here immediately.
  useEffect(() => {
    if (view === "salary") {
      fetchSalaryDays(true);
      fetchSalaryPayments();
    }
  }, [view, fetchSalaryDays, fetchSalaryPayments]);

  const refreshSalaryData = () => {
    // Silent — keeps the current list/timeline visible instead of
    // flashing a loading spinner over it after every action.
    fetchSalaryDays(true);
    fetchSalaryPayments();
    fetchBranchBudget(true);
  };

  /* ---- WhatsApp-style employee list for Salary ---- */
  const syEmployeeList = atDbEmployees
    .filter((emp) => {
      if (!sySearch) return true;
      const s = sySearch.toLowerCase();
      const name = (emp.employee_name || emp.emp_name || "").toLowerCase();
      const id = (emp.emp_id || "").toString().toLowerCase();
      return name.includes(s) || id.includes(s);
    })
    .map((emp) => {
      const empDays = syDays.filter((d) => d.employee_id === emp.emp_id);
      const empPayments = syPayments.filter(
        (p) => p.employee_id === emp.emp_id,
      );
      const totalEarned = empDays.reduce(
        (s, d) => s + (Number(d.total_amount) || 0),
        0,
      );
      const totalPaid = empPayments.reduce(
        (s, p) => s + (Number(p.amount) || 0),
        0,
      );
      const pending = totalEarned - totalPaid;
      const lastDay = [...empDays].sort((a, b) =>
        b.date.localeCompare(a.date),
      )[0];
      return { emp, totalEarned, totalPaid, pending, lastDay };
    })
    .sort((a, b) => {
      if (a.lastDay && b.lastDay)
        return b.lastDay.date.localeCompare(a.lastDay.date);
      if (a.lastDay) return -1;
      if (b.lastDay) return 1;
      return (a.emp.employee_name || a.emp.emp_name || "").localeCompare(
        b.emp.employee_name || b.emp.emp_name || "",
      );
    });

  const syEmployeeTotal = syEmployeeList.length;
  const syEmployeeTotalPages =
    syRowsPerPage === -1 ? 1 : Math.ceil(syEmployeeTotal / syRowsPerPage);
  const syEmployeeStartIndex =
    syRowsPerPage === -1 ? 0 : (syCurrentPage - 1) * syRowsPerPage;
  const syPaginatedEmployeeList =
    syRowsPerPage === -1
      ? syEmployeeList
      : syEmployeeList.slice(
          syEmployeeStartIndex,
          syEmployeeStartIndex + syRowsPerPage,
        );

  const syOverallTotals = syEmployeeList.reduce(
    (acc, row) => {
      acc.earned += row.totalEarned;
      acc.paid += row.totalPaid;
      acc.pending += row.pending;
      return acc;
    },
    { earned: 0, paid: 0, pending: 0 },
  );

  const sySelectedEmployee = sySelectedEmployeeId
    ? atDbEmployees.find((e) => e.emp_id === sySelectedEmployeeId) || null
    : null;

  const [syPeriodStart, syPeriodEnd, syPeriodLabel] = getPeriodRange(syPeriod);

  // An explicit date filter (if set) overrides the Day/Week/Month period tabs.
  const syUsingDateFilter = !!(sySearchDateFrom || sySearchDateTo);
  const syRangeStart = sySearchDateFrom || syPeriodStart;
  const syRangeEnd = sySearchDateTo || sySearchDateFrom || syPeriodEnd;
  const syRangeLabel = syUsingDateFilter
    ? `${syRangeStart} to ${syRangeEnd}`
    : syPeriodLabel;

  const sySelectedAllDays = sySelectedEmployeeId
    ? syDays
        .filter((d) => d.employee_id === sySelectedEmployeeId)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const sySelectedAllPayments = sySelectedEmployeeId
    ? syPayments
        .filter((p) => p.employee_id === sySelectedEmployeeId)
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
    : [];

  const sySelectedPeriodDays = sySelectedAllDays.filter(
    (d) => d.date >= syRangeStart && d.date <= syRangeEnd,
  );
  const sySelectedPeriodPayments = sySelectedAllPayments.filter(
    (p) => p.payment_date >= syRangeStart && p.payment_date <= syRangeEnd,
  );

  const syPeriodEarned = sySelectedPeriodDays.reduce(
    (s, d) => s + (Number(d.total_amount) || 0),
    0,
  );
  const syPeriodPaid = sySelectedPeriodPayments.reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const syAllTimeEarned = sySelectedAllDays.reduce(
    (s, d) => s + (Number(d.total_amount) || 0),
    0,
  );
  const syAllTimePaid = sySelectedAllPayments.reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const syPendingBalance = syAllTimeEarned - syAllTimePaid;

  // Merge the period's earning-days and payments into one chronological timeline
  const syEarningsTimeline = [...sySelectedPeriodDays].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const syPaymentsTimeline = [...sySelectedPeriodPayments].sort((a, b) =>
    b.payment_date.localeCompare(a.payment_date),
  );

  const syOpenEmployeeDetail = (empId) => {
    setSySelectedEmployeeId(empId);
    setSyPeriod("all");
  };
  const syBackToEmployeeList = () => setSySelectedEmployeeId(null);

  const syOpenOtModal = () => {
    setSyOtForm({ date: toYMD(new Date()), ot_work_type_id: "", amount: "" });
    setSyShowOtModal(true);
  };
  const syOpenPaymentModal = () => {
    setSyPaymentForm({ amount: "", payment_date: toYMD(new Date()), note: "" });
    setSyShowPaymentModal(true);
  };

  const handleAddOt = async (e) => {
    e.preventDefault();
    if (!syOtForm.ot_work_type_id || !syOtForm.date) {
      showToast("Please choose a work type and date", "error");
      return;
    }
    if (syOtForm.amount !== "" && Number(syOtForm.amount) < 0) {
      showToast("Amount cannot be negative", "error");
      return;
    }
    try {
      const res = await apiFetch("/salary/salary_daily.php?action=add_ot", {
        method: "POST",
        body: JSON.stringify({
          employee_id: sySelectedEmployeeId,
          date: syOtForm.date,
          ot_work_type_id: syOtForm.ot_work_type_id,
          amount: syOtForm.amount,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("OT entry added");
      setSyShowOtModal(false);
      refreshSalaryData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleDeleteOt = async (id) => {
    try {
      const res = await apiFetch(
        `/salary/salary_daily.php?action=delete_ot&id=${id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("OT entry removed");
      setSyOtDeleteConfirm(null);
      refreshSalaryData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleDeleteDay = async (id) => {
    try {
      const res = await apiFetch(
        `/salary/salary_daily.php?action=delete_day&id=${id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("Earnings entry deleted");
      setSyDayDeleteConfirm(null);
      if (syEditingDayId === id) setSyEditingDayId(null);
      refreshSalaryData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleAdjustBags = async (salaryDayId, direction) => {
    // Instant local update — no waiting on a full refetch of days/payments/budget.
    setSyDays((prev) =>
      prev.map((d) => {
        if (d.id !== salaryDayId) return d;
        if (d.attendance_status !== "Present") return d; // not adjustable, no-op
        const newBags =
          direction === "inc"
            ? d.bags_count + 1
            : Math.max(0, d.bags_count - 1);
        const emp = atDbEmployees.find((e) => e.emp_id === d.employee_id);
        const pricePerBag = emp ? Number(emp.price_per_bags) || 0 : 0;
        const newBase = newBags * pricePerBag;
        return {
          ...d,
          bags_count: newBags,
          base_amount: newBase,
          total_amount: newBase + (Number(d.ot_amount) || 0),
        };
      }),
    );
    try {
      const res = await apiFetch(
        "/salary/salary_daily.php?action=adjust_bags",
        {
          method: "POST",
          body: JSON.stringify({ salary_day_id: salaryDayId, direction }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (err) {
      showToast(err.message, "error");
      fetchSalaryDays(); // resync with the server since the optimistic update may be wrong
    }
  };

  const handleAdjustOtQuantity = async (otEntryId, direction) => {
    setSyDays((prev) =>
      prev.map((d) => {
        if (!d.ot_entries || !d.ot_entries.some((o) => o.id === otEntryId))
          return d;
        const newEntries = d.ot_entries.map((o) => {
          if (o.id !== otEntryId) return o;
          const newQty =
            direction === "inc" ? o.quantity + 1 : Math.max(1, o.quantity - 1);
          return { ...o, quantity: newQty };
        });
        const newOtAmount = newEntries.reduce(
          (s, o) => s + Number(o.amount) * Number(o.quantity),
          0,
        );
        return {
          ...d,
          ot_entries: newEntries,
          ot_amount: newOtAmount,
          total_amount: (Number(d.base_amount) || 0) + newOtAmount,
        };
      }),
    );
    try {
      const res = await apiFetch(
        "/salary/salary_daily.php?action=adjust_ot_quantity",
        {
          method: "POST",
          body: JSON.stringify({ ot_entry_id: otEntryId, direction }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (err) {
      showToast(err.message, "error");
      fetchSalaryDays();
    }
  };

  const syStartEditDay = (dayData) => {
    setSyEditingDayId(dayData.id);
    setSyDraftBags(dayData.bags_count);
    const qtyMap = {};
    (dayData.ot_entries || []).forEach((ot) => {
      qtyMap[ot.id] = ot.quantity;
    });
    setSyDraftOtQuantities(qtyMap);
  };

  const syCancelEditDay = () => {
    setSyEditingDayId(null);
  };

  const syDraftAdjustBags = (direction) => {
    setSyDraftBags((b) => (direction === "inc" ? b + 1 : Math.max(0, b - 1)));
  };

  const syDraftAdjustOtQty = (otId, direction) => {
    setSyDraftOtQuantities((prev) => ({
      ...prev,
      [otId]:
        direction === "inc"
          ? (prev[otId] || 1) + 1
          : Math.max(1, (prev[otId] || 1) - 1),
    }));
  };

  const syHandleSaveDayEdits = async (dayData) => {
    try {
      if (
        dayData.attendance_status === "Present" &&
        syDraftBags !== dayData.bags_count
      ) {
        const res = await apiFetch(
          "/salary/salary_daily.php?action=update_bags_count",
          {
            method: "POST",
            body: JSON.stringify({
              salary_day_id: dayData.id,
              bags_count: syDraftBags,
            }),
          },
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      for (const ot of dayData.ot_entries || []) {
        const draftQty = syDraftOtQuantities[ot.id];
        if (draftQty !== undefined && draftQty !== ot.quantity) {
          const res2 = await apiFetch(
            "/salary/salary_daily.php?action=update_ot_quantity",
            {
              method: "POST",
              body: JSON.stringify({
                ot_entry_id: ot.id,
                quantity: draftQty,
              }),
            },
          );
          const data2 = await res2.json();
          if (data2.error) throw new Error(data2.error);
        }
      }
      showToast("Changes saved");
      setSyEditingDayId(null);
      refreshSalaryData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const amt = Number(syPaymentForm.amount) || 0;
    if (amt <= 0 || !syPaymentForm.payment_date) {
      showToast("Please enter a valid amount and date", "error");
      return;
    }
    try {
      const res = await apiFetch(
        "/salary/salary_daily.php?action=add_payment",
        {
          method: "POST",
          body: JSON.stringify({
            employee_id: sySelectedEmployeeId,
            amount: amt,
            payment_date: syPaymentForm.payment_date,
            note: syPaymentForm.note,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("Payment recorded");
      setSyShowPaymentModal(false);
      refreshSalaryData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleDeletePayment = async (id) => {
    try {
      const res = await apiFetch(
        `/salary/salary_daily.php?action=delete_payment&id=${id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("Payment removed");
      setSyPaymentDeleteConfirm(null);
      refreshSalaryData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleSendWhatsApp = () => {
    if (!sySelectedEmployee) return;
    const number = sySelectedEmployee.whatsapp_number;
    if (!number) {
      showToast("This employee has no WhatsApp number on file", "error");
      return;
    }
    const message = buildWhatsAppMessage(
      sySelectedEmployee.employee_name || sySelectedEmployee.emp_name,
      syRangeLabel,
      syPeriodEarned,
      syPeriodPaid,
      syPendingBalance,
      sySelectedPeriodDays,
    );
    openWhatsApp(number, message);
  };

  const syOpenManageOt = async () => {
    setSyManageOtForm({ name: "", amount: "" });
    // Show the modal immediately with a spinner, then swap in the full
    // (active + inactive) list once it arrives. Without this, the modal
    // briefly renders the stale active-only list and then pops in the rest.
    setSyOtLoading(true);
    setSyShowManageOt(true);
    await fetchOtTypes(true);
    setSyOtLoading(false);
  };

  const syCloseManageOt = () => {
    setSyShowManageOt(false);
    fetchOtTypes(); // back to active-only, since the Add OT dropdown uses this same state
  };

  const handleSaveNewOtType = async (e) => {
    e.preventDefault();
    const name = syManageOtForm.name.trim();
    const amount = Number(syManageOtForm.amount) || 0;
    if (!name || amount < 0) {
      showToast("Please enter a valid name and amount", "error");
      return;
    }
    try {
      const res = await apiFetch("/salary/ot_work_types.php", {
        method: "POST",
        body: JSON.stringify({ name, amount }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast("OT work type added");
      setSyManageOtForm({ name: "", amount: "" });
      fetchOtTypes(true);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ---------------------------------------------------------------------
  // FIX: previously this function did an optimistic flip AND THEN, even
  // on a successful PUT, immediately re-fetched from the server
  // ("always re-verify"). If the backend's read (GET) ran against a
  // stale replica/cache or just hadn't committed the write yet, that
  // re-fetch pulled back the OLD is_active value and silently overwrote
  // the optimistic flip a moment later — which is exactly the
  // "Deactivate -> Activate -> flips back to Deactivate" bug.
  //
  // Fix: trust a successful response and only resync with the server
  // when something actually goes wrong (network/error), which is the
  // only time we truly need to detect a silent no-op update.
  // ---------------------------------------------------------------------
  const handleToggleOtType = async (type) => {
    const newActive = type.is_active ? 0 : 1;
    // Flip instantly so the Activate/Deactivate button always reflects
    // the click immediately, regardless of network timing.
    setSyOtTypes((prev) =>
      prev.map((t) => (t.id === type.id ? { ...t, is_active: newActive } : t)),
    );
    try {
      const res = await apiFetch(`/salary/ot_work_types.php?id=${type.id}`, {
        method: "PUT",
        body: JSON.stringify({
          id: type.id,
          name: type.name,
          amount: type.amount,
          is_active: newActive,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Success — trust the optimistic update. Do NOT re-fetch here;
      // doing so risks overwriting the correct state with a stale read.
    } catch (err) {
      showToast(err.message, "error");
      fetchOtTypes(true); // resync since the optimistic flip may be wrong
    }
  };

  return (
    <>
      <style>{`
        .sl-root { color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .sl-toast { position: fixed; top: 24px; right: 24px; z-index: 1200; display: flex; align-items: center; gap: 10px; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.18); color: #fff; min-width: 240px; animation: sl-in .28s cubic-bezier(.4,0,.2,1); }
        .sl-toast.success { background: #008b3e; } .sl-toast.error { background: #dc2626; }
        @keyframes sl-in { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .sl-header { display: flex; align-items: center; gap: 14px; padding-bottom: 28px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 28px; }
        .sl-header__icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #008b3e, #00b84f); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,139,62,.25); }
        .sl-header__title { margin: 0 0 2px; font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
        .sl-header__sub { margin: 0; font-size: 13px; color: #64748b; }
        .sl-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
        .sl-stat { background: #fff; border: 1.5px solid var(--bd); border-radius: 12px; padding: 18px 20px; }
        .sl-stat__label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 8px; }
        .sl-stat__value { font-size: 20px; font-weight: 800; color: var(--c); font-family: "SF Mono","Fira Code",monospace; }
        .sl-skeleton { animation: sl-pulse 1.5s infinite; background: #e5e7eb; border-radius: 4px; height: 28px; width: 130px; display: inline-block; }
        @keyframes sl-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .sl-tabs { display: flex; gap: 4px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 24px; }
        .sl-tab { display: flex; align-items: center; gap: 8px; padding: 13px 20px; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; border-radius: 6px 6px 0 0; transition: color .15s, border-color .15s; }
        .sl-tab:hover { background: #f8fafc; color: #1e293b; }
        .sl-tab.active { color: #008b3e; border-bottom-color: #008b3e; }
        .sl-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 24px; margin-bottom: 24px; }
        .sl-card__head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .sl-card__head i { color: #008b3e; font-size: 17px; }
        .sl-form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .sl-fg { display: flex; flex-direction: column; gap: 7px; }
        .sl-fg--2 { grid-column: span 2; }
        .sl-fg--full { grid-column: 1 / -1; }
        .sl-label { font-size: 13px; font-weight: 600; color: #374151; }
        .sl-input, .sl-select { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; }
        .sl-input:focus, .sl-select:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
        .sl-input:disabled, .sl-select:disabled { background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }
        .sl-hint { font-size: 12px; color: #64748b; margin-top: 3px; }
        .sl-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: box-shadow .15s; }
        .sl-btn--primary { background: linear-gradient(135deg,#008b3e,#009e46); color:#fff; box-shadow: 0 2px 8px rgba(0,139,62,.3); }
        .sl-btn--primary:hover { box-shadow: 0 4px 16px rgba(0,139,62,.38); }
        .sl-btn--ghost { background: #f8fafc; color: #374151; border: 1.5px solid #e2e8f0; }
        .sl-btn--ghost:hover { background: #f1f5f9; }
        .sl-btn--danger { background: #dc2626; color: #fff; }
        .sl-form-actions { display: flex; gap: 10px; margin-top: 22px; justify-content: flex-end; }
        .sl-alert { display: flex; align-items: center; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; padding: 12px 16px; font-size: 14px; margin-bottom: 20px; }
        .sl-error { color: #dc2626; font-size: 13px; margin-top: 8px; }
        .sl-filters { display: grid; grid-template-columns: 2fr 2fr 1fr auto; gap: 8px; margin-bottom: 20px; align-items: center; }
        .sl-finput { height: 36px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; }
        .sl-finput:focus { border-color: #008b3e; }
        .sl-table-wrap { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow-x: auto; }
        .sl-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .sl-table thead tr { background: #f8fafc; }
        .sl-table th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .6px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
        .sl-table td { padding: 13px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .sl-table tbody tr:last-child td { border-bottom: none; }
        .sl-table tbody tr:hover td { background: #f8fffe; }
        .sl-td-num { color: #94a3b8; font-size: 12px; width: 36px; }
        .sl-emp-name { font-weight: 700; font-size: 13.5px; }
        .sl-id-tag { background: #f1f5f9; color: #475569; border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 700; font-family: "SF Mono","Fira Code",monospace; }
        .sl-paid { color: #15803d; font-weight: 700; font-family: monospace; }
        .sl-balance { color: #dc2626; font-weight: 700; font-family: monospace; }
        .sl-amount { font-family: monospace; font-weight: 600; }
        .sl-date { font-size: 13px; color: #374151; white-space: nowrap; }
        .sl-time { font-size: 12px; color: #94a3b8; }
        .sl-actions { display: flex; gap: 5px; justify-content: flex-end; }
        .sl-act { width: 30px; height: 30px; border: none; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: transform .12s; }
        .sl-act:hover { transform: scale(1.08); }
        .sl-act--view { background: #dcfce7; color: #15803d; }
        .sl-act--edit { background: #eff6ff; color: #2563eb; }
        .sl-act--del  { background: #fef2f2; color: #dc2626; }
        .sl-empty { display: flex; flex-direction: column; align-items: center; padding: 52px 20px; color: #94a3b8; }
        .sl-empty i { font-size: 40px; margin-bottom: 10px; }
        .sl-empty p { margin: 0; font-weight: 600; color: #64748b; }
        .sl-loading { display: flex; align-items: center; gap: 12px; padding: 40px; justify-content: center; color: #64748b; font-size: 14px; }
        .sl-spinner { width: 20px; height: 20px; border: 3px solid #e2e8f0; border-top-color: #008b3e; border-radius: 50%; animation: sl-spin .7s linear infinite; }
        @keyframes sl-spin { to { transform: rotate(360deg); } }
        .sl-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 16px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; gap: 10px; }
        .sl-pg-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b; }
        .sl-pg-select { height: 32px; border: 1.5px solid #e2e8f0; border-radius: 7px; padding: 0 8px; font-size: 13px; background: #fafbfc; cursor: pointer; outline: none; }
        .sl-pg-right { display: flex; align-items: center; gap: 8px; }
        .sl-pg-info { font-size: 13px; color: #64748b; }
        .sl-pg-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: 1.5px solid #e2e8f0; background: #fafbfc; border-radius: 8px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
        .sl-pg-btn:hover:not(:disabled) { background: #f1f5f9; }
        .sl-pg-btn:disabled { opacity: .45; cursor: not-allowed; }
        .sl-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: sl-fi .18s ease; }
        @keyframes sl-fi { from { opacity: 0; } to { opacity: 1; } }
        .sl-modal { background: #fff; border-radius: 16px; width: 520px; max-width: 92vw; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.22); animation: sl-mi .22s cubic-bezier(.4,0,.2,1); }
        .sl-modal--sm { width: 380px; }
        @keyframes sl-mi { from { transform: translateY(18px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
        .sl-modal__hd { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f1f5f9; }
        .sl-modal__title { display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 800; color: #0f172a; }
        .sl-modal__title i { color: #008b3e; }
        .sl-modal__close { width: 30px; height: 30px; border: none; background: #f1f5f9; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 13px; }
        .sl-modal__close:hover { background: #e2e8f0; }
        .sl-modal__body { padding: 20px 22px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .sl-modal__ft { padding: 14px 22px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }
        .sl-view-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f8fafc; font-size: 14px; }
        .sl-view-row:last-child { border-bottom: none; }
        @media (max-width: 900px) { .sl-stats { grid-template-columns: 1fr 1fr; } .sl-form-grid { grid-template-columns: 1fr 1fr; } .sl-filters { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .sl-stats { grid-template-columns: 1fr; } .sl-form-grid { grid-template-columns: 1fr; } .sl-filters { grid-template-columns: 1fr; } }

        /* ── Attendance (integrated tab) ── */
        .at-root { color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .at-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; margin-bottom: 20px; flex-wrap: wrap; gap: 14px; }
        .at-header__left { display: flex; align-items: center; gap: 14px; }
        .at-header__icon { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #008b3e, #00b84f); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 17px; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,139,62,.25); }
        .at-header__title { margin: 0 0 2px; font-size: 18px; font-weight: 800; letter-spacing: -.4px; }
        .at-header__sub { margin: 0; font-size: 13px; color: #64748b; }
        .at-quick-date { display: flex; align-items: center; gap: 10px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 8px 14px; }
        .at-quick-mark { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .at-quick-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; border: 1.5px solid #e2e8f0; background: #fff; color: #64748b; transition: all .12s; }
        .at-quick-btn:hover { transform: translateY(-1px); }
        .at-quick-btn--present.active { background: #dcfce7; border-color: #86efac; color: #15803d; }
        .at-quick-btn--absent.active { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
        .at-quick-btn--present:hover:not(.active) { background: #f0fdf4; border-color: #86efac; color: #15803d; }
        .at-quick-btn--absent:hover:not(.active) { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
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
        .at-btn--warn { background: #fef3c7; color: #b45309; border: 1.5px solid #fde68a; }
        .at-btn:disabled { opacity: .5; cursor: not-allowed; }
        .at-card { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 24px; margin-bottom: 24px; }
        .at-card__head { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .at-form-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin: 0 0 12px; }
        .at-form-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 20px; }
        .at-fg { display: flex; flex-direction: column; gap: 7px; }
        .at-fg--2 { grid-column: span 2; }
        .at-label { font-size: 13px; font-weight: 600; color: #374151; }
        .at-input, .at-select { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; color: #1e293b; background: #fafbfc; width: 100%; box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s; }
        .at-input:focus, .at-select:focus { border-color: #008b3e; background: #fff; box-shadow: 0 0 0 3px rgba(0,139,62,.1); }
        .at-input:disabled, .at-select:disabled { background: #f1f5f9; color: #94a3b8; }
        .at-readonly { height: 40px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 12px; font-size: 14px; background: #f8fafc; color: #475569; font-weight: 600; display: flex; align-items: center; }
        .at-form-actions { display: flex; gap: 10px; padding-top: 8px; }
        .at-tabs-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
        .at-tabs { display: flex; gap: 6px; }
        .at-tab { padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid #e2e8f0; background: #f8fafc; color: #64748b; transition: all .15s; }
        .at-tab.active { background: #008b3e; color: #fff; border-color: #008b3e; }
        .at-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .at-finput { height: 36px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 11px; font-size: 13px; color: #1e293b; background: #fafbfc; outline: none; transition: border-color .15s; }
        .at-finput:focus { border-color: #008b3e; }
        .at-table-wrap { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow-x: auto; }
        .at-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .at-table thead tr { background: #f8fafc; }
        .at-table th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .6px; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
        .at-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .at-table tbody tr:last-child td { border-bottom: none; }
        .at-table tbody tr:hover td { background: #f8fbff; }
        .at-tfoot td { background: #f8fafc; font-size: 12px; font-weight: 700; color: #475569; border-top: 2px solid #e2e8f0; padding: 10px 14px; }
        .at-td-num { color: #94a3b8; font-size: 12px; width: 36px; }
        .at-emp-cell { display: flex; align-items: center; gap: 10px; }
        .at-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; }
        .at-emp-name { font-weight: 700; font-size: 13px; color: #0f172a; }
        .at-emp-id { font-size: 11px; color: #94a3b8; }
        .at-status-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .at-time-mono { font-family: "SF Mono","Fira Code",monospace; font-size: 12px; color: #475569; }
        .at-wh { font-family: "SF Mono","Fira Code",monospace; font-weight: 700; color: #15803d; }
        .at-actions { display: flex; gap: 5px; }
        .at-act { width: 30px; height: 30px; border: none; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: transform .12s; }
        .at-act:hover { transform: scale(1.08); }
        .at-act--edit { background: #eff6ff; color: #2563eb; }
        .at-act--del { background: #fef2f2; color: #dc2626; }
        .at-empty { display: flex; flex-direction: column; align-items: center; padding: 52px 20px; color: #94a3b8; }
        .at-empty i { font-size: 40px; margin-bottom: 10px; }
        .at-empty p { margin: 0 0 4px; font-weight: 600; color: #64748b; font-size: 14px; }
        .at-loading { display: flex; align-items: center; gap: 12px; padding: 40px; justify-content: center; color: #64748b; }
        .at-spinner { width: 22px; height: 22px; border: 3px solid #e2e8f0; border-top-color: #008b3e; border-radius: 50%; animation: at-spin .7s linear infinite; }
        @keyframes at-spin { to { transform: rotate(360deg); } }
        .at-pagination { display: flex; justify-content: space-between; align-items: center; padding: 16px 0 0; border-top: 1px solid #f1f5f9; margin-top: 16px; flex-wrap: wrap; gap: 10px; }
        .at-pg-left { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b; }
        .at-pg-select { height: 32px; border: 1.5px solid #e2e8f0; border-radius: 7px; padding: 0 8px; font-size: 13px; background: #fafbfc; cursor: pointer; outline: none; }
        .at-pg-right { display: flex; align-items: center; gap: 8px; }
        .at-pg-info { font-size: 13px; color: #64748b; }
        .at-pg-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: 1.5px solid #e2e8f0; background: #fafbfc; border-radius: 8px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; transition: background .15s; }
        .at-pg-btn:hover:not(:disabled) { background: #f1f5f9; }
        .at-pg-btn:disabled { opacity: .45; cursor: not-allowed; }
        .at-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .at-modal { background: #fff; border-radius: 16px; width: 460px; max-width: 92vw; box-shadow: 0 24px 60px rgba(15,23,42,.22); animation: at-mi .22s cubic-bezier(.4,0,.2,1); overflow: hidden; }
        @keyframes at-mi { from { transform: translateY(18px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
        .at-modal__hd { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f1f5f9; }
        .at-modal__title { font-size: 16px; font-weight: 800; color: #dc2626; display: flex; align-items: center; gap: 8px; }
        .at-modal__close { width: 30px; height: 30px; border: none; background: #f1f5f9; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 13px; }
        .at-modal__body { padding: 24px 22px; text-align: center; }
        .at-modal__ft { padding: 14px 22px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; }
        .at-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 16px; border-top: 1px solid #f1f5f9; margin-top: 4px; }
        .at-status-summary { display: flex; gap: 14px; flex-wrap: wrap; }
        .at-ss-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #64748b; }

        /* ── Salary v2 ── */
        .sy-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        .sy-summary__item { background: #f8fbff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
        .sy-summary__label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #64748b; margin-bottom: 4px; }
        .sy-summary__value { font-size: 17px; font-weight: 800; font-family: "SF Mono","Fira Code",monospace; }
        .sy-actions { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .sy-date-filter { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .sy-date-filter__sep { font-size: 12px; color: #94a3b8; }
        .sy-ot-line { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 3px 10px 3px 12px; font-size: 12px; color: #475569; }
        .sy-bags-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #475569; }
        .sy-stepper-btn { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; padding: 0; transition: background .12s, border-color .12s, transform .1s; flex-shrink: 0; }
        .sy-stepper-btn:hover:not(:disabled) { background: #dcfce7; border-color: #86efac; color: #15803d; }
        .sy-stepper-btn:active:not(:disabled) { transform: scale(.88); }
        .sy-stepper-btn:disabled { opacity: .4; cursor: not-allowed; }
        .sy-stepper-count { min-width: 16px; text-align: center; font-weight: 700; font-family: "SF Mono","Fira Code",monospace; transition: color .15s; }
        .sy-stepper-total { font-weight: 700; color: #15803d; font-family: "SF Mono","Fira Code",monospace; margin-left: 2px; transition: color .15s; }
        .sy-bags-hint { font-size: 11px; color: #94a3b8; font-style: italic; }
        .sy-edit-btn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background .12s, border-color .12s; }
        .sy-edit-btn:hover { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
        .sy-section-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; }
        .sy-section-head i { color: #008b3e; }
        .sy-ot-line__del { border: none; background: none; color: #cbd5e1; cursor: pointer; display: flex; align-items: center; padding: 2px; font-size: 10px; transition: color .12s; }
        .sy-ot-line__del:hover { color: #dc2626; }
        .at-bubble--payment { background: #eff6ff; border-color: #bfdbfe; }
        .sy-ot-add-row { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
        .sy-ot-type-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
        .sy-ot-type-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; }
        .sy-ot-type-row__amount { margin-left: auto; font-family: "SF Mono","Fira Code",monospace; font-weight: 700; color: #15803d; font-size: 13px; }
        @media (max-width: 640px) {
          .sy-summary { grid-template-columns: 1fr; }
          .sy-actions { flex-direction: column; align-items: stretch; }
          .sy-date-filter { margin-left: 0; width: 100%; flex-wrap: wrap; }
          .sy-date-filter .at-finput { flex: 1; min-width: 0; }
          .sy-actions .at-btn { width: 100%; justify-content: center; }
          .sy-ot-add-row { flex-wrap: wrap; }
        }

        /* ── Attendance: WhatsApp-style employee list ── */
        .at-chat-list { border-radius: 10px; border: 1.5px solid #e2e8f0; overflow: hidden; }
        .at-chat-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background .12s; }
        .at-chat-item:last-child { border-bottom: none; }
        .at-chat-item:hover { background: #f8fbff; }
        .at-chat-avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; flex-shrink: 0; }
        .at-chat-body { flex: 1; min-width: 0; }
        .at-chat-name { font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 2px; }
        .at-chat-preview { font-size: 12.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
        .at-chat-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .at-chat-time { font-size: 11px; color: #94a3b8; }
        .at-chat-badge { background: #008b3e; color: #fff; font-size: 10px; font-weight: 800; min-width: 18px; height: 18px; border-radius: 20px; display: flex; align-items: center; justify-content: center; padding: 0 5px; }

        /* ── Attendance: employee detail / timeline ── */
        .at-detail-header { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; }
        .at-back-btn { width: 34px; height: 34px; border: 1.5px solid #e2e8f0; background: #f8fafc; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #374151; font-size: 14px; flex-shrink: 0; transition: background .12s; }
        .at-back-btn:hover { background: #f1f5f9; }
        .at-detail-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; flex-shrink: 0; }
        .at-detail-name { font-weight: 800; font-size: 15px; color: #0f172a; }
        .at-detail-sub { font-size: 12px; color: #64748b; margin-top: 1px; }
        .at-timeline { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        .at-bubble { background: #f8fbff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
        .at-bubble-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .at-bubble-date { font-weight: 700; font-size: 13px; color: #1e293b; }
        .at-bubble-body { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12.5px; color: #475569; margin-bottom: 8px; }
        .at-bubble-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; border-top: 1px solid #eef2f7; }
        @media (max-width: 1100px) {
          .at-root { width: 100%; max-width: 100%; min-width: 0; }
          .at-stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .at-form-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .at-fg--2 { grid-column: span 2; }
          .at-table { min-width: 1000px; }
        }
        @media (max-width: 768px) {
          .at-root { width: 100%; max-width: 100%; min-width: 0; overflow-x: hidden; }
          .at-header { align-items: flex-start; padding-bottom: 16px; margin-bottom: 16px; }
          .at-header__left { width: 100%; min-width: 0; }
          .at-header__left > div:last-child { min-width: 0; }
          .at-header__title { font-size: 17px; }
          .at-header__sub { line-height: 1.5; }
          .at-header > .at-btn { width: 100%; justify-content: center; }
          .at-stats { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-bottom: 20px; }
          .at-stat { padding: 14px; gap: 10px; min-width: 0; }
          .at-stat__icon { width: 38px; height: 38px; font-size: 17px; }
          .at-stat__label { font-size: 10px; }
          .at-stat__value { font-size: 19px; }
          .at-stat__sub { font-size: 10px; }
          .at-card { padding: 16px; border-radius: 12px; margin-bottom: 16px; }
          .at-form-grid { grid-template-columns: minmax(0,1fr); gap: 14px; }
          .at-fg, .at-fg--2 { grid-column: auto; min-width: 0; }
          .at-form-actions { flex-direction: column; }
          .at-form-actions .at-btn { width: 100%; justify-content: center; }
          .at-fg > div[style*="height: 40"] { width: 100%; max-width: 100%; overflow-x: auto; overflow-y: visible; padding-bottom: 2px; }
          .at-tabs-row { align-items: stretch; }
          .at-tabs-row > div:first-child { width: 100%; }
          .at-filters { width: 100%; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
          .at-filters .at-finput { width: 100% !important; min-width: 0; }
          .at-filters .at-finput:first-child { grid-column: 1 / -1; }
          .at-filters .at-pg-btn { width: 100%; justify-content: center; }
          .at-tabs { width: 100%; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
          .at-tab { flex: 0 0 auto; white-space: nowrap; }
          .at-table-wrap { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .at-table { min-width: 1000px; }
          .at-pagination { flex-direction: column; align-items: stretch; }
          .at-pg-left { justify-content: center; flex-wrap: wrap; }
          .at-pg-right { justify-content: center; flex-wrap: wrap; }
          .at-pg-info { width: 100%; text-align: center; }
          .at-pg-right .at-pg-btn { flex: 1; justify-content: center; }
          .at-chat-item { padding: 10px 12px; gap: 10px; }
          .at-chat-avatar { width: 38px; height: 38px; font-size: 12px; }
          .at-chat-name { font-size: 13px; }
          .at-chat-preview { font-size: 11.5px; }
          .at-detail-header { flex-wrap: wrap; }
          .at-detail-header .at-btn { width: 100%; justify-content: center; order: 3; }
          .at-bubble-body { gap: 8px; }
          .at-footer { align-items: flex-start; }
          .at-status-summary { gap: 10px; }
          .at-overlay { padding: 16px; }
          .at-modal { width: 100%; max-width: 460px; }
        }
        @media (max-width: 480px) {
          .at-stats { grid-template-columns: 1fr; }
          .at-filters { grid-template-columns: 1fr; }
          .at-filters .at-finput:first-child { grid-column: auto; }
          .at-card { padding: 14px 12px; }
          .at-header__icon { width: 36px; height: 36px; }
          .at-modal__hd, .at-modal__body, .at-modal__ft { padding-left: 16px; padding-right: 16px; }
          .at-modal__ft { flex-direction: column-reverse; }
          .at-modal__ft .at-btn { width: 100%; justify-content: center; }
        }
      `}</style>

      <div className="sl-root">
        {toast.show && (
          <div className={`sl-toast ${toast.type}`}>
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

        <div className="sl-header">
          <div className="sl-header__icon">
            <i className="bi bi-cash-stack"></i>
          </div>
          <div>
            <h1 className="sl-header__title">Salary &amp; Attendance</h1>
            <p className="sl-header__sub">
              Employee Salary and Attendance Management
            </p>
          </div>
        </div>

        {view === "attendance" ? (
          <div className="at-stats">
            {[
              {
                label: "Total Employees",
                value: atStats.total_employees || 0,
                sub: `${atTodayRecords.length} marked today`,
                c: "#008b3e",
                bg: "#dcfce7",
                bd: "#86efac",
                icon: "bi-people-fill",
              },
              {
                label: "Present Today",
                value: atTodayPresent,
                sub:
                  atTodayPresent > 0 && atStats.total_employees
                    ? `${Math.round((atTodayPresent / atStats.total_employees) * 100)}% attendance`
                    : "No records yet",
                c: "#15803d",
                bg: "#dcfce7",
                bd: "#86efac",
                icon: "bi-check-circle-fill",
              },
              {
                label: "Absent Today",
                value: atTodayAbsent,
                sub: `${atTodayHalf} half day`,
                c: "#dc2626",
                bg: "#fee2e2",
                bd: "#fca5a5",
                icon: "bi-x-circle-fill",
              },
              {
                label: "Work From Site",
                value: atTodayWFS,
                sub:
                  atTodayWFS > 0
                    ? `${atTodayWFS} working from site`
                    : "No WFS today",
                c: "#7c3aed",
                bg: "#ede9fe",
                bd: "#c4b5fd",
                icon: "bi-geo-alt-fill",
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
        ) : (
          <div className="sl-stats">
            {[
              {
                label: "Total Branch Budget",
                value: syBudgetLoading ? null : inr(syBranchBudget),
                key: "budget",
                c: "#1e293b",
                bd: "#e2e8f0",
              },
              {
                label: "Total Paid",
                value: syBudgetLoading ? null : inr(syOverallTotals.paid),
                key: "paid",
                c: "#15803d",
                bd: "#86efac",
              },
              {
                label: "Available Balance",
                value: syBudgetLoading
                  ? null
                  : inr(syBranchBudget - syOverallTotals.paid),
                key: "available",
                c:
                  syBranchBudget - syOverallTotals.paid < 0
                    ? "#dc2626"
                    : "#15803d",
                bd:
                  syBranchBudget - syOverallTotals.paid < 0
                    ? "#fecaca"
                    : "#86efac",
              },
            ].map(({ label, value, key, c, bd }) => (
              <div
                className="sl-stat"
                key={key}
                style={{ "--c": c, "--bd": bd }}
              >
                <div className="sl-stat__label">{label}</div>
                {value === null ? (
                  <span className="sl-skeleton" />
                ) : (
                  <div className="sl-stat__value">{value}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="sl-tabs">
          <button
            className={`sl-tab${view === "attendance" ? " active" : ""}`}
            onClick={() => setView("attendance")}
          >
            <i className="bi bi-calendar-check"></i> Attendance
          </button>
          <button
            className={`sl-tab${view === "salary" ? " active" : ""}`}
            onClick={() => setView("salary")}
          >
            <i className="bi bi-cash-stack"></i> Salary
          </button>
        </div>

        {view === "attendance" && (
          <div className="at-root">
            <div className="at-header" style={{ justifyContent: "flex-end" }}>
              <div className="at-quick-date">
                <label className="at-label" style={{ marginBottom: 0 }}>
                  Marking attendance for
                </label>
                <input
                  className="at-input"
                  style={{ width: 170, height: 38 }}
                  type="date"
                  value={atQuickMarkDate}
                  onChange={(e) => setAtQuickMarkDate(e.target.value)}
                />
              </div>
            </div>

            <div className="at-card">
              {!atSelectedEmployeeId ? (
                <>
                  <div className="at-tabs-row">
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: "#1e293b",
                        }}
                      >
                        Employee Attendance
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {atLoading
                          ? "Loading…"
                          : `${atEmployeeList.length} employee${atEmployeeList.length !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                    <div className="at-filters">
                      <input
                        className="at-finput"
                        style={{ width: 180 }}
                        type="text"
                        placeholder="Search name / ID…"
                        value={atSearch}
                        onChange={(e) => setAtSearch(e.target.value)}
                      />
                      <input
                        className="at-finput"
                        style={{ width: 140 }}
                        type="date"
                        value={atFilterDate}
                        onChange={(e) => setAtFilterDate(e.target.value)}
                      />
                      <select
                        className="at-finput"
                        style={{ width: 140 }}
                        value={atFilterStatus}
                        onChange={(e) => setAtFilterStatus(e.target.value)}
                      >
                        <option value="">All Status</option>
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        className="at-pg-btn"
                        onClick={fetchAttendanceRecords}
                        title="Refresh"
                      >
                        <i className="bi bi-arrow-clockwise"></i>
                      </button>
                    </div>
                  </div>
                  <div className="at-tabs">
                    {[
                      ["all", "All Records"],
                      ["today", "Today"],
                      ["week", "This Week"],
                      ["month", "This Month"],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        className={`at-tab${atActiveTab === val ? " active" : ""}`}
                        onClick={() => setAtActiveTab(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 16 }}>
                    {atLoading ? (
                      <div className="at-loading">
                        <div className="at-spinner"></div>
                        <span>Loading employees…</span>
                      </div>
                    ) : atEmployeeList.length === 0 ? (
                      <div className="at-empty">
                        <i className="bi bi-people"></i>
                        <p>No employees found</p>
                        <span>
                          {atApiError
                            ? "Check backend console."
                            : "Try adjusting your search."}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="at-chat-list">
                          {atPaginatedEmployeeList.map(
                            ({ emp, lastRecord, recordCount }) => {
                              const name =
                                emp.employee_name || emp.emp_name || "—";
                              const hue = (name.charCodeAt(0) * 7) % 360;
                              const meta = lastRecord
                                ? STATUS_META[lastRecord.status] || {
                                    color: "#475569",
                                    icon: "bi-dash-circle",
                                  }
                                : null;
                              const dateRecord = atRecords.find(
                                (r) =>
                                  sameId(r.employee_id, emp.emp_id) &&
                                  dateOnly(r.date) === atQuickMarkDate,
                              );
                              return (
                                <div className="at-chat-item" key={emp.emp_id}>
                                  <div
                                    className="at-chat-avatar"
                                    style={{
                                      background: `hsl(${hue},60%,90%)`,
                                      color: `hsl(${hue},50%,35%)`,
                                    }}
                                  >
                                    {name
                                      .split(" ")
                                      .slice(0, 2)
                                      .map((w) => w[0])
                                      .join("")
                                      .toUpperCase()}
                                  </div>
                                  <div
                                    className="at-chat-body"
                                    style={{ cursor: "pointer" }}
                                    onClick={() =>
                                      atOpenEmployeeDetail(emp.emp_id)
                                    }
                                  >
                                    <div className="at-chat-name">{name}</div>
                                    <div className="at-chat-preview">
                                      {lastRecord ? (
                                        <>
                                          <i
                                            className={`bi ${meta.icon}`}
                                            style={{ color: meta.color }}
                                          ></i>{" "}
                                          {lastRecord.status} on{" "}
                                          {lastRecord.date}
                                        </>
                                      ) : (
                                        "No attendance records yet"
                                      )}
                                    </div>
                                  </div>
                                  <div className="at-quick-mark">
                                    <button
                                      className={`at-quick-btn at-quick-btn--present${dateRecord?.status === "Present" ? " active" : ""}`}
                                      onClick={() =>
                                        handleQuickMark(emp, "Present")
                                      }
                                      title={`Mark Present for ${atQuickMarkDate}`}
                                    >
                                      <i className="bi bi-check-lg"></i> Present
                                    </button>
                                    <button
                                      className={`at-quick-btn at-quick-btn--absent${dateRecord?.status === "Absent" ? " active" : ""}`}
                                      onClick={() =>
                                        handleQuickMark(emp, "Absent")
                                      }
                                      title={`Mark Absent for ${atQuickMarkDate}`}
                                    >
                                      <i className="bi bi-x-lg"></i> Absent
                                    </button>
                                  </div>
                                  <i
                                    className="bi bi-chevron-right"
                                    style={{
                                      color: "#cbd5e1",
                                      fontSize: 13,
                                      cursor: "pointer",
                                      flexShrink: 0,
                                    }}
                                    onClick={() =>
                                      atOpenEmployeeDetail(emp.emp_id)
                                    }
                                  ></i>
                                </div>
                              );
                            },
                          )}
                        </div>
                        {atEmployeeTotal > 0 && (
                          <div className="at-pagination">
                            <div className="at-pg-left">
                              Show
                              <select
                                className="at-pg-select"
                                value={atRowsPerPage}
                                onChange={(e) => {
                                  setAtRowsPerPage(parseInt(e.target.value));
                                  setAtCurrentPage(1);
                                }}
                              >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={-1}>All</option>
                              </select>
                              entries per page
                            </div>
                            {atRowsPerPage !== -1 && (
                              <div className="at-pg-right">
                                <span className="at-pg-info">
                                  Page {atCurrentPage} of {atEmployeeTotalPages}
                                </span>
                                <button
                                  className="at-pg-btn"
                                  disabled={atCurrentPage === 1}
                                  onClick={() =>
                                    setAtCurrentPage((p) => Math.max(1, p - 1))
                                  }
                                >
                                  <i className="bi bi-chevron-left"></i>{" "}
                                  Previous
                                </button>
                                <button
                                  className="at-pg-btn"
                                  disabled={
                                    atCurrentPage === atEmployeeTotalPages
                                  }
                                  onClick={() =>
                                    setAtCurrentPage((p) =>
                                      Math.min(atEmployeeTotalPages, p + 1),
                                    )
                                  }
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
                </>
              ) : (
                <>
                  <div className="at-detail-header">
                    <button
                      className="at-back-btn"
                      onClick={atBackToEmployeeList}
                      title="Back to employee list"
                    >
                      <i className="bi bi-arrow-left"></i>
                    </button>
                    {atSelectedEmployee && (
                      <div
                        className="at-detail-avatar"
                        style={{
                          background: `hsl(${((atSelectedEmployee.employee_name || atSelectedEmployee.emp_name || "?").charCodeAt(0) * 7) % 360},60%,90%)`,
                          color: `hsl(${((atSelectedEmployee.employee_name || atSelectedEmployee.emp_name || "?").charCodeAt(0) * 7) % 360},50%,35%)`,
                        }}
                      >
                        {(
                          atSelectedEmployee.employee_name ||
                          atSelectedEmployee.emp_name ||
                          "?"
                        )
                          .split(" ")
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="at-detail-name">
                        {atSelectedEmployee
                          ? atSelectedEmployee.employee_name ||
                            atSelectedEmployee.emp_name
                          : "Employee"}
                      </div>
                      <div className="at-detail-sub">
                        {atSelectedRecords.length} record
                        {atSelectedRecords.length !== 1 ? "s" : ""}
                        {atShowBranchColumn && atSelectedRecords[0]?.branch_id
                          ? ` · ${atBranchesMap[atSelectedRecords[0].branch_id] || `Branch #${atSelectedRecords[0].branch_id}`}`
                          : ""}
                      </div>
                    </div>
                    {atSelectedEmployee && (
                      <div className="at-quick-mark">
                        <input
                          className="at-input"
                          style={{ width: 140, height: 34, fontSize: 12.5 }}
                          type="date"
                          value={atQuickMarkDate}
                          onChange={(e) => setAtQuickMarkDate(e.target.value)}
                        />
                        <button
                          className={`at-quick-btn at-quick-btn--present${
                            atSelectedRecords.find(
                              (r) => dateOnly(r.date) === atQuickMarkDate,
                            )?.status === "Present"
                              ? " active"
                              : ""
                          }`}
                          onClick={() =>
                            handleQuickMark(atSelectedEmployee, "Present")
                          }
                        >
                          <i className="bi bi-check-lg"></i> Present
                        </button>
                        <button
                          className={`at-quick-btn at-quick-btn--absent${
                            atSelectedRecords.find(
                              (r) => dateOnly(r.date) === atQuickMarkDate,
                            )?.status === "Absent"
                              ? " active"
                              : ""
                          }`}
                          onClick={() =>
                            handleQuickMark(atSelectedEmployee, "Absent")
                          }
                        >
                          <i className="bi bi-x-lg"></i> Absent
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="at-tabs" style={{ marginBottom: 4 }}>
                    {[
                      ["all", "All Records"],
                      ["today", "Today"],
                      ["week", "This Week"],
                      ["month", "This Month"],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        className={`at-tab${atActiveTab === val ? " active" : ""}`}
                        onClick={() => setAtActiveTab(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="at-timeline">
                    {atLoading ? (
                      <div className="at-loading">
                        <div className="at-spinner"></div>
                        <span>Loading records…</span>
                      </div>
                    ) : atSelectedRecords.length === 0 ? (
                      <div className="at-empty">
                        <i className="bi bi-calendar-x"></i>
                        <p>No attendance records</p>
                        <span>Mark attendance for this employee above.</span>
                      </div>
                    ) : (
                      atSelectedRecords.map((rec) => {
                        const meta = STATUS_META[rec.status] || {
                          bg: "#f1f5f9",
                          color: "#475569",
                          icon: "bi-dash-circle",
                        };
                        return (
                          <div className="at-bubble" key={rec.id}>
                            <div className="at-bubble-head">
                              <span className="at-bubble-date">{rec.date}</span>
                              <span
                                className="at-status-badge"
                                style={{
                                  background: meta.bg,
                                  color: meta.color,
                                }}
                              >
                                <i
                                  className={`bi ${meta.icon}`}
                                  style={{ fontSize: 10 }}
                                ></i>
                                {rec.status}
                              </span>
                            </div>
                            <div className="at-bubble-body">
                              {(rec.check_in || rec.check_out) && (
                                <span>
                                  <i className="bi bi-box-arrow-in-right"></i>{" "}
                                  {rec.check_in
                                    ? formatTime12(rec.check_in)
                                    : "—"}{" "}
                                  <i className="bi bi-arrow-right"></i>{" "}
                                  <i className="bi bi-box-arrow-left"></i>{" "}
                                  {rec.check_out
                                    ? formatTime12(rec.check_out)
                                    : "—"}
                                </span>
                              )}
                              {rec.work_hours > 0 && (
                                <span className="at-wh">
                                  {parseFloat(rec.work_hours).toFixed(1)}h
                                  worked
                                </span>
                              )}
                              {rec.leave_type && <span>{rec.leave_type}</span>}
                            </div>
                            <div className="at-bubble-foot">
                              <span className="at-time-mono">
                                Logged {formatTime(rec.created_at)}
                              </span>
                              {canEditDelete && (
                                <div className="at-actions">
                                  <button
                                    className="at-act at-act--del"
                                    onClick={() => setAtDeleteConfirm(rec)}
                                    title="Delete"
                                  >
                                    <i className="bi bi-trash-fill"></i>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {view === "salary" && (
          <div className="at-root">
            <div className="at-card">
              {!sySelectedEmployeeId ? (
                <>
                  <div className="at-tabs-row">
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: "#1e293b",
                        }}
                      >
                        Employee Salary
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {syLoading
                          ? "Loading…"
                          : `${syEmployeeList.length} employee${syEmployeeList.length !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                    <div className="at-filters">
                      <input
                        className="at-finput"
                        style={{ width: 200 }}
                        type="text"
                        placeholder="Search name / ID…"
                        value={sySearch}
                        onChange={(e) => setSySearch(e.target.value)}
                      />
                      {isAdmin && (
                        <button
                          className="at-btn at-btn--ghost"
                          style={{ padding: "7px 14px", fontSize: 13 }}
                          onClick={syOpenManageOt}
                        >
                          <i className="bi bi-gear"></i> OT Types
                        </button>
                      )}
                      <button
                        className="at-pg-btn"
                        onClick={refreshSalaryData}
                        title="Refresh"
                      >
                        <i className="bi bi-arrow-clockwise"></i>
                      </button>
                    </div>
                  </div>
                  {syApiError && <div className="sl-error">{syApiError}</div>}
                  <div style={{ marginTop: 16 }}>
                    {syLoading ? (
                      <div className="at-loading">
                        <div className="at-spinner"></div>
                        <span>Loading employees…</span>
                      </div>
                    ) : syEmployeeList.length === 0 ? (
                      <div className="at-empty">
                        <i className="bi bi-people"></i>
                        <p>No employees found</p>
                        <span>Try adjusting your search.</span>
                      </div>
                    ) : (
                      <>
                        <div className="at-chat-list">
                          {syPaginatedEmployeeList.map(
                            ({
                              emp,
                              totalEarned,
                              totalPaid,
                              pending,
                              lastDay,
                            }) => {
                              const name =
                                emp.employee_name || emp.emp_name || "—";
                              const hue = (name.charCodeAt(0) * 7) % 360;
                              return (
                                <div
                                  className="at-chat-item"
                                  key={emp.emp_id}
                                  onClick={() =>
                                    syOpenEmployeeDetail(emp.emp_id)
                                  }
                                >
                                  <div
                                    className="at-chat-avatar"
                                    style={{
                                      background: `hsl(${hue},60%,90%)`,
                                      color: `hsl(${hue},50%,35%)`,
                                    }}
                                  >
                                    {name
                                      .split(" ")
                                      .slice(0, 2)
                                      .map((w) => w[0])
                                      .join("")
                                      .toUpperCase()}
                                  </div>
                                  <div className="at-chat-body">
                                    <div className="at-chat-name">{name}</div>
                                    <div className="at-chat-preview">
                                      {lastDay ? (
                                        <>
                                          <i
                                            className="bi bi-cash-coin"
                                            style={{ color: "#008b3e" }}
                                          ></i>{" "}
                                          Last earning {lastDay.date} ·{" "}
                                          {inr(lastDay.total_amount)}
                                        </>
                                      ) : (
                                        "No earnings recorded yet"
                                      )}
                                    </div>
                                  </div>
                                  <div className="at-chat-meta">
                                    <div
                                      className="at-chat-badge"
                                      style={{
                                        background:
                                          pending > 0 ? "#dc2626" : "#008b3e",
                                      }}
                                    >
                                      {inr(pending)}
                                    </div>
                                    <i
                                      className="bi bi-chevron-right"
                                      style={{
                                        color: "#cbd5e1",
                                        fontSize: 13,
                                      }}
                                    ></i>
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                        {syEmployeeTotal > 0 && (
                          <div className="at-pagination">
                            <div className="at-pg-left">
                              Show
                              <select
                                className="at-pg-select"
                                value={syRowsPerPage}
                                onChange={(e) => {
                                  setSyRowsPerPage(parseInt(e.target.value));
                                  setSyCurrentPage(1);
                                }}
                              >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={-1}>All</option>
                              </select>
                              entries per page
                            </div>
                            {syRowsPerPage !== -1 && (
                              <div className="at-pg-right">
                                <span className="at-pg-info">
                                  Page {syCurrentPage} of {syEmployeeTotalPages}
                                </span>
                                <button
                                  className="at-pg-btn"
                                  disabled={syCurrentPage === 1}
                                  onClick={() =>
                                    setSyCurrentPage((p) => Math.max(1, p - 1))
                                  }
                                >
                                  <i className="bi bi-chevron-left"></i>{" "}
                                  Previous
                                </button>
                                <button
                                  className="at-pg-btn"
                                  disabled={
                                    syCurrentPage === syEmployeeTotalPages
                                  }
                                  onClick={() =>
                                    setSyCurrentPage((p) =>
                                      Math.min(syEmployeeTotalPages, p + 1),
                                    )
                                  }
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
                </>
              ) : (
                <>
                  <div className="at-detail-header">
                    <button
                      className="at-back-btn"
                      onClick={syBackToEmployeeList}
                      title="Back to employee list"
                    >
                      <i className="bi bi-arrow-left"></i>
                    </button>
                    {sySelectedEmployee && (
                      <div
                        className="at-detail-avatar"
                        style={{
                          background: `hsl(${((sySelectedEmployee.employee_name || sySelectedEmployee.emp_name || "?").charCodeAt(0) * 7) % 360},60%,90%)`,
                          color: `hsl(${((sySelectedEmployee.employee_name || sySelectedEmployee.emp_name || "?").charCodeAt(0) * 7) % 360},50%,35%)`,
                        }}
                      >
                        {(
                          sySelectedEmployee.employee_name ||
                          sySelectedEmployee.emp_name ||
                          "?"
                        )
                          .split(" ")
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="at-detail-name">
                        {sySelectedEmployee
                          ? sySelectedEmployee.employee_name ||
                            sySelectedEmployee.emp_name
                          : "Employee"}
                      </div>
                      <div className="at-detail-sub">
                        {sySelectedEmployee?.whatsapp_number
                          ? `WhatsApp: ${sySelectedEmployee.whatsapp_number}`
                          : "No WhatsApp number on file"}
                      </div>
                    </div>
                    <button
                      className="at-btn at-btn--primary"
                      style={{ padding: "7px 14px", fontSize: 13 }}
                      onClick={handleSendWhatsApp}
                    >
                      <i className="bi bi-whatsapp"></i> Send
                    </button>
                  </div>

                  <div className="at-tabs" style={{ marginBottom: 16 }}>
                    {[
                      ["day", "Day"],
                      ["week", "Week"],
                      ["month", "Month"],
                      ["all", "All"],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        className={`at-tab${syPeriod === val ? " active" : ""}`}
                        onClick={() => setSyPeriod(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="sy-summary">
                    <div className="sy-summary__item">
                      <div className="sy-summary__label">
                        Earned ({syUsingDateFilter ? "filtered" : syPeriod})
                      </div>
                      <div
                        className="sy-summary__value"
                        style={{ color: "#1e293b" }}
                      >
                        {inr(syPeriodEarned)}
                      </div>
                    </div>
                    <div className="sy-summary__item">
                      <div className="sy-summary__label">
                        Paid ({syUsingDateFilter ? "filtered" : syPeriod})
                      </div>
                      <div
                        className="sy-summary__value"
                        style={{ color: "#15803d" }}
                      >
                        {inr(syPeriodPaid)}
                      </div>
                    </div>
                    <div className="sy-summary__item">
                      <div className="sy-summary__label">
                        Pending Balance (all time)
                      </div>
                      <div
                        className="sy-summary__value"
                        style={{
                          color: syPendingBalance > 0 ? "#dc2626" : "#15803d",
                        }}
                      >
                        {inr(syPendingBalance)}
                      </div>
                    </div>
                  </div>

                  <div className="sy-actions">
                    <button
                      className="at-btn at-btn--primary"
                      onClick={syOpenOtModal}
                    >
                      <i className="bi bi-plus-lg"></i> Add OT
                    </button>
                    {isAdmin && (
                      <button
                        className="at-btn at-btn--ghost"
                        onClick={syOpenPaymentModal}
                      >
                        <i className="bi bi-cash"></i> Add Payment
                      </button>
                    )}
                    <button
                      className={`at-btn ${syShowPaymentHistory ? "at-btn--primary" : "at-btn--ghost"}`}
                      onClick={() => setSyShowPaymentHistory((v) => !v)}
                    >
                      <i className="bi bi-wallet2"></i> Payment History
                    </button>
                    <div className="sy-date-filter">
                      <input
                        className="at-finput"
                        type="date"
                        value={sySearchDateFrom}
                        onChange={(e) => setSySearchDateFrom(e.target.value)}
                        title="From date"
                      />
                      <span className="sy-date-filter__sep">to</span>
                      <input
                        className="at-finput"
                        type="date"
                        value={sySearchDateTo}
                        onChange={(e) => setSySearchDateTo(e.target.value)}
                        title="To date"
                      />
                      {syUsingDateFilter && (
                        <button
                          className="at-pg-btn"
                          onClick={() => {
                            setSySearchDateFrom("");
                            setSySearchDateTo("");
                          }}
                          title="Clear date filter"
                        >
                          <i className="bi bi-x-lg"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {!syShowPaymentHistory && (
                    <div className="sy-section-head">
                      <i className="bi bi-cash-coin"></i>
                      <span>Earnings</span>
                    </div>
                  )}
                  {!syShowPaymentHistory && (
                    <div className="at-timeline">
                      {syLoading ? (
                        <div className="at-loading">
                          <div className="at-spinner"></div>
                          <span>Loading…</span>
                        </div>
                      ) : syEarningsTimeline.length === 0 ? (
                        <div className="at-empty">
                          <i className="bi bi-cash-coin"></i>
                          <p>No earnings in this period</p>
                          <span>
                            Mark attendance or add OT to log earnings.
                          </span>
                        </div>
                      ) : (
                        syEarningsTimeline.map((d) => {
                          const isEditingThis = syEditingDayId === d.id;
                          const emp = atDbEmployees.find(
                            (e) => e.emp_id === d.employee_id,
                          );
                          const pricePerBag = emp
                            ? Number(emp.price_per_bags) || 0
                            : 0;
                          const draftBase =
                            d.attendance_status === "Present"
                              ? syDraftBags * pricePerBag
                              : d.base_amount;
                          const draftOtTotal = (d.ot_entries || []).reduce(
                            (s, ot) =>
                              s +
                              Number(ot.amount) *
                                Number(
                                  syDraftOtQuantities[ot.id] ?? ot.quantity,
                                ),
                            0,
                          );
                          const draftTotal = draftBase + draftOtTotal;

                          return (
                            <div className="at-bubble" key={`d-${d.id}`}>
                              <div className="at-bubble-head">
                                <span className="at-bubble-date">{d.date}</span>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  {d.attendance_status && (
                                    <span
                                      className="at-status-badge"
                                      style={{
                                        background:
                                          (
                                            STATUS_META[d.attendance_status] ||
                                            {}
                                          ).bg || "#f1f5f9",
                                        color:
                                          (
                                            STATUS_META[d.attendance_status] ||
                                            {}
                                          ).color || "#475569",
                                      }}
                                    >
                                      {d.attendance_status}
                                    </span>
                                  )}
                                  {!isEditingThis && (
                                    <button
                                      className="sy-edit-btn"
                                      onClick={() => syStartEditDay(d)}
                                      title="Edit this day"
                                    >
                                      <i className="bi bi-pencil"></i> Edit
                                    </button>
                                  )}
                                  {!isEditingThis && canEditDelete && (
                                    <button
                                      className="at-act at-act--del"
                                      style={{
                                        width: 26,
                                        height: 26,
                                        fontSize: 11,
                                      }}
                                      onClick={() => setSyDayDeleteConfirm(d)}
                                      title="Delete this day's earnings"
                                    >
                                      <i className="bi bi-trash-fill"></i>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div
                                className="at-bubble-body"
                                style={{ flexDirection: "column", gap: 6 }}
                              >
                                {isEditingThis ? (
                                  <>
                                    <span className="sy-bags-row">
                                      <span>Bags:</span>
                                      <button
                                        type="button"
                                        className="sy-stepper-btn"
                                        onClick={() => syDraftAdjustBags("dec")}
                                        disabled={
                                          d.attendance_status !== "Present" ||
                                          syDraftBags <= 0
                                        }
                                        title="Decrease bags"
                                      >
                                        <i className="bi bi-dash"></i>
                                      </button>
                                      <span className="sy-stepper-count">
                                        {syDraftBags}
                                      </span>
                                      <button
                                        type="button"
                                        className="sy-stepper-btn"
                                        onClick={() => syDraftAdjustBags("inc")}
                                        disabled={
                                          d.attendance_status !== "Present"
                                        }
                                        title="Increase bags"
                                      >
                                        <i className="bi bi-plus"></i>
                                      </button>
                                      <span className="sy-stepper-total">
                                        = {inr(draftBase)}
                                      </span>
                                      {d.attendance_status !== "Present" && (
                                        <span className="sy-bags-hint">
                                          (mark Present to adjust)
                                        </span>
                                      )}
                                    </span>
                                    {d.ot_entries &&
                                      d.ot_entries.length > 0 &&
                                      d.ot_entries.map((ot) => (
                                        <span
                                          key={ot.id}
                                          className="sy-ot-line"
                                        >
                                          <i className="bi bi-clock-history"></i>{" "}
                                          {ot.work_name}: {inr(ot.amount)}
                                          <button
                                            type="button"
                                            className="sy-stepper-btn"
                                            onClick={() =>
                                              syDraftAdjustOtQty(ot.id, "dec")
                                            }
                                            disabled={
                                              (syDraftOtQuantities[ot.id] ??
                                                ot.quantity) <= 1
                                            }
                                            title="Decrease quantity"
                                          >
                                            <i className="bi bi-dash"></i>
                                          </button>
                                          <span className="sy-stepper-count">
                                            {syDraftOtQuantities[ot.id] ??
                                              ot.quantity}
                                          </span>
                                          <button
                                            type="button"
                                            className="sy-stepper-btn"
                                            onClick={() =>
                                              syDraftAdjustOtQty(ot.id, "inc")
                                            }
                                            title="Increase quantity"
                                          >
                                            <i className="bi bi-plus"></i>
                                          </button>
                                          <span className="sy-stepper-total">
                                            ={" "}
                                            {inr(
                                              ot.amount *
                                                (syDraftOtQuantities[ot.id] ??
                                                  ot.quantity),
                                            )}
                                          </span>
                                          {canEditDelete && (
                                            <button
                                              className="sy-ot-line__del"
                                              onClick={() =>
                                                setSyOtDeleteConfirm(ot)
                                              }
                                              title="Remove OT entry"
                                            >
                                              <i className="bi bi-x-lg"></i>
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                  </>
                                ) : (
                                  <>
                                    <span className="sy-bags-row">
                                      Bags: {d.bags_count} ={" "}
                                      {inr(d.base_amount)}
                                    </span>
                                    {d.ot_entries &&
                                      d.ot_entries.length > 0 &&
                                      d.ot_entries.map((ot) => (
                                        <span
                                          key={ot.id}
                                          className="sy-ot-line"
                                        >
                                          <i className="bi bi-clock-history"></i>{" "}
                                          {ot.work_name}: {inr(ot.amount)} ×{" "}
                                          {ot.quantity} ={" "}
                                          {inr(ot.amount * ot.quantity)}
                                          {canEditDelete && (
                                            <button
                                              className="sy-ot-line__del"
                                              onClick={() =>
                                                setSyOtDeleteConfirm(ot)
                                              }
                                              title="Remove OT entry"
                                            >
                                              <i className="bi bi-x-lg"></i>
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                  </>
                                )}
                              </div>
                              <div className="at-bubble-foot">
                                <span className="at-wh">
                                  Total:{" "}
                                  {inr(
                                    isEditingThis ? draftTotal : d.total_amount,
                                  )}
                                </span>
                                {isEditingThis && (
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      className="at-btn at-btn--ghost"
                                      style={{
                                        padding: "5px 12px",
                                        fontSize: 12,
                                      }}
                                      onClick={syCancelEditDay}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      className="at-btn at-btn--primary"
                                      style={{
                                        padding: "5px 12px",
                                        fontSize: 12,
                                      }}
                                      onClick={() => syHandleSaveDayEdits(d)}
                                    >
                                      <i className="bi bi-check-lg"></i> Save
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {syShowPaymentHistory && (
                    <>
                      <div className="sy-section-head">
                        <i className="bi bi-wallet2"></i>
                        <span>Payment History</span>
                      </div>
                      <div className="at-timeline">
                        {syLoading ? (
                          <div className="at-loading">
                            <div className="at-spinner"></div>
                            <span>Loading…</span>
                          </div>
                        ) : syPaymentsTimeline.length === 0 ? (
                          <div className="at-empty">
                            <i className="bi bi-wallet2"></i>
                            <p>No payments in this period</p>
                            <span>Use Add Payment above to record one.</span>
                          </div>
                        ) : (
                          syPaymentsTimeline.map((p) => (
                            <div
                              className="at-bubble at-bubble--payment"
                              key={`p-${p.id}`}
                            >
                              <div className="at-bubble-head">
                                <span className="at-bubble-date">
                                  {p.payment_date}
                                </span>
                                <span
                                  className="at-status-badge"
                                  style={{
                                    background: "#dbeafe",
                                    color: "#1d4ed8",
                                  }}
                                >
                                  <i className="bi bi-cash"></i> Payment
                                </span>
                              </div>
                              <div className="at-bubble-body">
                                <span
                                  style={{ fontWeight: 700, color: "#1d4ed8" }}
                                >
                                  {inr(p.amount)} paid
                                </span>
                                {p.note && <span>{p.note}</span>}
                              </div>
                              {canEditDelete && (
                                <div className="at-bubble-foot">
                                  <span className="at-time-mono">
                                    Logged {formatTime(p.created_at)}
                                  </span>
                                  <div className="at-actions">
                                    <button
                                      className="at-act at-act--del"
                                      onClick={() =>
                                        setSyPaymentDeleteConfirm(p)
                                      }
                                      title="Delete payment"
                                    >
                                      <i className="bi bi-trash-fill"></i>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {atBranchWarn && (
          <div className="at-overlay" onClick={() => setAtBranchWarn(false)}>
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title" style={{ color: "#b45309" }}>
                  <i className="bi bi-building"></i> Select a Branch
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setAtBranchWarn(false)}
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
                    background: "#fffbeb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 14px",
                    fontSize: 22,
                    color: "#b45309",
                  }}
                >
                  <i className="bi bi-exclamation-triangle-fill"></i>
                </div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>
                  Please select a branch first
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  You are currently viewing <strong>All Branches</strong>.
                  Attendance has to be saved against one specific branch, so
                  pick a branch at the top and try again.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--primary"
                  onClick={() => setAtBranchWarn(false)}
                >
                  <i className="bi bi-check-lg"></i> Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {atDeleteConfirm && (
          <div className="at-overlay" onClick={() => setAtDeleteConfirm(null)}>
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title">
                  <i className="bi bi-trash"></i> Delete Record
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setAtDeleteConfirm(null)}
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
                  Remove attendance for{" "}
                  <strong>{atDeleteConfirm.employee_name}</strong>
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  on <strong>{atDeleteConfirm.date}</strong>? This action is
                  permanent.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--ghost"
                  onClick={() => setAtDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="at-btn at-btn--danger"
                  onClick={() => handleAttendanceDelete(atDeleteConfirm.id)}
                >
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {syShowOtModal && (
          <div className="sl-overlay" onClick={() => setSyShowOtModal(false)}>
            <div
              className="sl-modal sl-modal--sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sl-modal__hd">
                <div className="sl-modal__title">
                  <i className="bi bi-clock-history"></i> Add OT Entry
                </div>
                <button
                  className="sl-modal__close"
                  onClick={() => setSyShowOtModal(false)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <form onSubmit={handleAddOt}>
                <div className="sl-modal__body">
                  <div className="sl-fg">
                    <label className="sl-label">Date</label>
                    <input
                      className="sl-input"
                      type="date"
                      value={syOtForm.date}
                      onChange={(e) =>
                        setSyOtForm({ ...syOtForm, date: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="sl-fg">
                    <label className="sl-label">Work Type</label>
                    <select
                      className="sl-select"
                      value={syOtForm.ot_work_type_id}
                      onChange={(e) => {
                        const selected = syOtTypes.find(
                          (t) => String(t.id) === e.target.value,
                        );
                        setSyOtForm({
                          ...syOtForm,
                          ot_work_type_id: e.target.value,
                          amount: selected ? selected.amount : syOtForm.amount,
                        });
                      }}
                      required
                    >
                      <option value="">Select work type…</option>
                      {syOtTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {inr(t.amount)}
                        </option>
                      ))}
                    </select>
                    {syOtTypes.length === 0 && (
                      <span className="sl-hint">
                        No OT work types yet.{" "}
                        {isAdmin
                          ? "Use the OT Types button to add one."
                          : "Ask an admin to add one."}
                      </span>
                    )}
                  </div>
                  <div className="sl-fg">
                    <label className="sl-label">Amount</label>
                    <input
                      className="sl-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={syOtForm.amount}
                      onChange={(e) =>
                        setSyOtForm({ ...syOtForm, amount: e.target.value })
                      }
                      placeholder="Auto-filled from work type — edit if needed"
                    />
                    <span className="sl-hint">
                      Pre-filled from the work type's preset amount, but you can
                      change it for this entry.
                    </span>
                  </div>
                </div>
                <div className="sl-modal__ft">
                  <button
                    type="button"
                    className="sl-btn sl-btn--ghost"
                    onClick={() => setSyShowOtModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="sl-btn sl-btn--primary">
                    <i className="bi bi-check-circle"></i> Add OT
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {syShowPaymentModal && (
          <div
            className="sl-overlay"
            onClick={() => setSyShowPaymentModal(false)}
          >
            <div
              className="sl-modal sl-modal--sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sl-modal__hd">
                <div className="sl-modal__title">
                  <i className="bi bi-cash"></i> Add Payment
                </div>
                <button
                  className="sl-modal__close"
                  onClick={() => setSyShowPaymentModal(false)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <form onSubmit={handleAddPayment}>
                <div className="sl-modal__body">
                  <div className="sl-fg">
                    <label className="sl-label">Amount</label>
                    <input
                      className="sl-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={syPaymentForm.amount}
                      onChange={(e) =>
                        setSyPaymentForm({
                          ...syPaymentForm,
                          amount: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="sl-fg">
                    <label className="sl-label">Date</label>
                    <input
                      className="sl-input"
                      type="date"
                      value={syPaymentForm.payment_date}
                      onChange={(e) =>
                        setSyPaymentForm({
                          ...syPaymentForm,
                          payment_date: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="sl-fg">
                    <label className="sl-label">Note (optional)</label>
                    <input
                      className="sl-input"
                      type="text"
                      placeholder="e.g. Weekly settlement"
                      value={syPaymentForm.note}
                      onChange={(e) =>
                        setSyPaymentForm({
                          ...syPaymentForm,
                          note: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="sl-modal__ft">
                  <button
                    type="button"
                    className="sl-btn sl-btn--ghost"
                    onClick={() => setSyShowPaymentModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="sl-btn sl-btn--primary">
                    <i className="bi bi-check-circle"></i> Save Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {syShowManageOt && (
          <div className="sl-overlay" onClick={syCloseManageOt}>
            <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sl-modal__hd">
                <div className="sl-modal__title">
                  <i className="bi bi-gear"></i> Manage OT Work Types
                </div>
                <button className="sl-modal__close" onClick={syCloseManageOt}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="sl-modal__body">
                <form onSubmit={handleSaveNewOtType} className="sy-ot-add-row">
                  <input
                    className="sl-input"
                    type="text"
                    placeholder="Work type name"
                    value={syManageOtForm.name}
                    onChange={(e) =>
                      setSyManageOtForm({
                        ...syManageOtForm,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                  <input
                    className="sl-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    style={{ width: 110 }}
                    value={syManageOtForm.amount}
                    onChange={(e) =>
                      setSyManageOtForm({
                        ...syManageOtForm,
                        amount: e.target.value,
                      })
                    }
                    required
                  />
                  <button type="submit" className="sl-btn sl-btn--primary">
                    <i className="bi bi-plus-lg"></i> Add
                  </button>
                </form>

                <div className="sy-ot-type-list">
                  {syOtLoading ? (
                    <div className="at-loading">
                      <div className="at-spinner"></div>
                      <span>Loading OT types…</span>
                    </div>
                  ) : syOtTypes.length === 0 ? (
                    <div className="at-empty" style={{ padding: "28px 12px" }}>
                      <i className="bi bi-clock-history"></i>
                      <p>No OT work types yet</p>
                    </div>
                  ) : (
                    syOtTypes.map((t) => (
                      <div className="sy-ot-type-row" key={t.id}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: t.is_active ? "#1e293b" : "#94a3b8",
                            textDecoration: t.is_active
                              ? "none"
                              : "line-through",
                          }}
                        >
                          {t.name}
                        </span>
                        <span className="sy-ot-type-row__amount">
                          {inr(t.amount)}
                        </span>
                        <button
                          className={`sl-btn ${t.is_active ? "sl-btn--ghost" : "sl-btn--primary"}`}
                          style={{ padding: "5px 12px", fontSize: 12 }}
                          onClick={() => handleToggleOtType(t)}
                        >
                          {t.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="sl-modal__ft">
                <button
                  className="sl-btn sl-btn--ghost"
                  onClick={syCloseManageOt}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {syOtDeleteConfirm && (
          <div
            className="at-overlay"
            onClick={() => setSyOtDeleteConfirm(null)}
          >
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title">
                  <i className="bi bi-trash"></i> Remove OT Entry
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setSyOtDeleteConfirm(null)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="at-modal__body">
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>
                  Remove <strong>{syOtDeleteConfirm.work_name}</strong> (
                  {inr(syOtDeleteConfirm.amount)})?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  This action is permanent.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--ghost"
                  onClick={() => setSyOtDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="at-btn at-btn--danger"
                  onClick={() => handleDeleteOt(syOtDeleteConfirm.id)}
                >
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {syDayDeleteConfirm && (
          <div
            className="at-overlay"
            onClick={() => setSyDayDeleteConfirm(null)}
          >
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title">
                  <i className="bi bi-trash"></i> Delete Earnings Entry
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setSyDayDeleteConfirm(null)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="at-modal__body">
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>
                  Delete the entire earnings entry for{" "}
                  <strong>{syDayDeleteConfirm.date}</strong> (
                  {inr(syDayDeleteConfirm.total_amount)})?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  This removes the bags wage and any OT logged for this day.
                  This action is permanent.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--ghost"
                  onClick={() => setSyDayDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="at-btn at-btn--danger"
                  onClick={() => handleDeleteDay(syDayDeleteConfirm.id)}
                >
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {syPaymentDeleteConfirm && (
          <div
            className="at-overlay"
            onClick={() => setSyPaymentDeleteConfirm(null)}
          >
            <div className="at-modal" onClick={(e) => e.stopPropagation()}>
              <div className="at-modal__hd">
                <div className="at-modal__title">
                  <i className="bi bi-trash"></i> Delete Payment
                </div>
                <button
                  className="at-modal__close"
                  onClick={() => setSyPaymentDeleteConfirm(null)}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="at-modal__body">
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>
                  Delete the {inr(syPaymentDeleteConfirm.amount)} payment on{" "}
                  <strong>{syPaymentDeleteConfirm.payment_date}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  This action is permanent.
                </p>
              </div>
              <div className="at-modal__ft">
                <button
                  className="at-btn at-btn--ghost"
                  onClick={() => setSyPaymentDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="at-btn at-btn--danger"
                  onClick={() => handleDeletePayment(syPaymentDeleteConfirm.id)}
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
