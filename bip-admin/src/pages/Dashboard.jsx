import { useEffect, useState } from "react";

const inr = (v) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function Dashboard() {
  const [data, setData] = useState({
    invoices: [],
    purchases: [],
    quotations: [],
    employees: [],
    attendance: [],
    clients: [],
    products: [],
  });

  const [quoteSummary, setQuoteSummary] = useState({
    totalQuotes: 0,
    totalSubtotal: 0,
    totalDiscount: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    setData({
      invoices: JSON.parse(localStorage.getItem("invoices")) || [],
      purchases: JSON.parse(localStorage.getItem("purchaseBills")) || [],
      quotations: JSON.parse(localStorage.getItem("quotes")) || [],
      employees: JSON.parse(localStorage.getItem("employees")) || [],
      attendance:
        JSON.parse(localStorage.getItem("bip_attendance_records")) || [],
      clients: JSON.parse(localStorage.getItem("bip_clients")) || [],
      products: JSON.parse(localStorage.getItem("products")) || [],
    });

    const saved = localStorage.getItem("quotes_summary");
    if (saved) {
      try {
        setQuoteSummary(JSON.parse(saved));
      } catch (_) {}
    }
  }, []);

  const totalRevenue = data.invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalExpense = data.purchases.reduce(
    (s, p) => s + (p.grandTotal || 0),
    0,
  );
  const profit = totalRevenue - totalExpense;

  const today = new Date().toISOString().split("T")[0];
  const todayAttendance = data.attendance.filter((a) => a.date === today);
  const uniqueEmployees = [
    ...new Set(data.attendance.map((a) => a.employeeId || a.employeeName)),
  ];
  const totalEmployees = uniqueEmployees.length;
  const present = todayAttendance.filter((a) => a.status === "Present").length;
  const lowStock = data.products.filter((p) => (p.stock || 0) < 10);

  const statCards = [
    {
      label: "Total Revenue",
      value: totalRevenue.toFixed(2),
      icon: "bi-currency-rupee",
      color: "green",
      unit: "₹ ",
    },
    {
      label: "Purchase Expense",
      value: totalExpense.toFixed(2),
      icon: "bi-receipt",
      color: "red",
      unit: "₹ ",
    },
    {
      label: "Profit",
      value: profit.toFixed(2),
      icon: "bi-graph-up",
      color: "blue",
      unit: "₹ ",
    },
    {
      label: "Employees",
      value: totalEmployees,
      icon: "bi-people",
      color: "orange",
    },
    {
      label: "Present Today",
      value: present,
      icon: "bi-person-check",
      color: "teal",
    },
    {
      label: "Clients",
      value: data.clients.length,
      icon: "bi-briefcase",
      color: "pink",
    },
  ];

  const cardColors = {
    green: { bg: "#10b981", light: "#d1fae5" },
    red: { bg: "#ef4444", light: "#fee2e2" },
    blue: { bg: "#3b82f6", light: "#dbeafe" },
    orange: { bg: "#f59e0b", light: "#fed7aa" },
    teal: { bg: "#06b6d4", light: "#cffafe" },
    pink: { bg: "#ec4899", light: "#fce7f3" },
  };

  // Monthly chart data
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const revenueData = [65000, 78000, 85000, 92000, 108000, totalRevenue];
  const expenseData = [42000, 51000, 58000, 67000, 75000, totalExpense];
  const maxValue = Math.max(...revenueData, ...expenseData, 1);

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">
          Welcome back! Here's your business overview.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        {statCards.map((card, i) => (
          <div
            key={i}
            className="stat-card"
            style={{ background: cardColors[card.color].bg }}
          >
            <div className="stat-card-icon">
              <i className={`bi ${card.icon}`}></i>
            </div>
            <div className="stat-card-content">
              <div className="stat-card-label">{card.label}</div>
              <div className="stat-card-value">
                {card.unit}
                {typeof card.value === "number"
                  ? card.value.toLocaleString("en-IN")
                  : card.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="chart-section">
        <div className="section-header">
          <h3>
            <i className="bi bi-bar-chart-fill"></i> Revenue vs Expense
          </h3>
          <span className="section-badge">Last 6 months</span>
        </div>
        <div className="chart-container">
          {months.map((month, idx) => (
            <div key={month} className="chart-column">
              <div className="chart-bars">
                <div
                  className="chart-bar revenue-bar"
                  style={{ height: `${(revenueData[idx] / maxValue) * 120}px` }}
                  title={`Revenue: ${inr(revenueData[idx])}`}
                ></div>
                <div
                  className="chart-bar expense-bar"
                  style={{ height: `${(expenseData[idx] / maxValue) * 120}px` }}
                  title={`Expense: ${inr(expenseData[idx])}`}
                ></div>
              </div>
              <div className="chart-month">{month}</div>
            </div>
          ))}
        </div>
        <div className="chart-legend">
          <span>
            <i className="bi bi-circle-fill" style={{ color: "#10b981" }}></i>{" "}
            Revenue
          </span>
          <span>
            <i className="bi bi-circle-fill" style={{ color: "#ef4444" }}></i>{" "}
            Expense
          </span>
        </div>
      </div>

      {/* Recent Records */}
      <div className="recent-grid">
        {/* Invoices */}
        <div className="recent-card">
          <div className="recent-header">
            <h3>
              <i className="bi bi-receipt"></i> Recent Invoices
            </h3>
            <button
              className="view-link"
              onClick={() => (window.location.href = "/billing")}
            >
              View all →
            </button>
          </div>
          <div className="recent-list">
            {data.invoices.length === 0 ? (
              <div className="empty-state">No invoices yet</div>
            ) : (
              data.invoices
                .slice(-4)
                .reverse()
                .map((inv, idx) => (
                  <div key={idx} className="recent-item">
                    <div className="recent-info">
                      <div className="recent-title">{inv.invoiceNo}</div>
                      <div className="recent-meta">
                        {inv.clientName || "Walk-in"}
                      </div>
                    </div>
                    <div className="recent-amount revenue">
                      {inr(inv.total || 0)}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Purchases */}
        <div className="recent-card">
          <div className="recent-header">
            <h3>
              <i className="bi bi-cart"></i> Recent Purchases
            </h3>
            <button
              className="view-link"
              onClick={() => (window.location.href = "/purchase-bill")}
            >
              View all →
            </button>
          </div>
          <div className="recent-list">
            {data.purchases.length === 0 ? (
              <div className="empty-state">No purchases yet</div>
            ) : (
              data.purchases
                .slice(-4)
                .reverse()
                .map((pur, idx) => (
                  <div key={idx} className="recent-item">
                    <div className="recent-info">
                      <div className="recent-title">{pur.billNo}</div>
                      <div className="recent-meta">
                        {pur.company_name || "Supplier"}
                      </div>
                    </div>
                    <div className="recent-amount expense">
                      {inr(pur.grandTotal || 0)}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Quotations */}
        <div className="recent-card">
          <div className="recent-header">
            <h3>
              <i className="bi bi-file-text"></i> Recent Quotations
            </h3>
            <button
              className="view-link"
              onClick={() => (window.location.href = "/quotation")}
            >
              View all →
            </button>
          </div>

          {/* Quote Summary */}
          {quoteSummary.totalQuotes > 0 && (
            <div className="quote-summary">
              <div className="quote-summary-item">
                <span>Total Quotes</span>
                <strong>{quoteSummary.totalQuotes}</strong>
              </div>
              <div className="quote-summary-item">
                <span>Subtotal</span>
                <strong>{inr(quoteSummary.totalSubtotal)}</strong>
              </div>
              <div className="quote-summary-item">
                <span>Discount</span>
                <strong className="discount">
                  {inr(quoteSummary.totalDiscount)}
                </strong>
              </div>
              <div className="quote-summary-item">
                <span>Revenue</span>
                <strong className="revenue">
                  {inr(quoteSummary.totalRevenue)}
                </strong>
              </div>
            </div>
          )}

          <div className="recent-list">
            {data.quotations.length === 0 ? (
              <div className="empty-state">No quotations yet</div>
            ) : (
              data.quotations
                .slice(-3)
                .reverse()
                .map((q, idx) => (
                  <div key={idx} className="recent-item">
                    <div className="recent-info">
                      <div className="recent-title">{q.quoteNo}</div>
                      <div className="recent-meta">
                        {q.clientName || "New quote"}
                      </div>
                    </div>
                    <div className="recent-amount">{inr(q.total || 0)}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="bottom-grid">
        {/* Employee Status */}
        <div className="info-card">
          <div className="info-header">
            <h3>
              <i className="bi bi-people"></i> Employee Status
            </h3>
          </div>
          <div className="employee-stats">
            <div className="employee-stat present">
              <div className="employee-value">{present}</div>
              <div className="employee-label">Present</div>
            </div>
            <div className="employee-stat absent">
              <div className="employee-value">{totalEmployees - present}</div>
              <div className="employee-label">Absent</div>
            </div>
            <div className="employee-stat total">
              <div className="employee-value">{totalEmployees}</div>
              <div className="employee-label">Total</div>
            </div>
          </div>
        </div>

        {/* Stock Alert */}
        {lowStock.length > 0 && (
          <div className="info-card alert">
            <div className="info-header">
              <h3>
                <i className="bi bi-exclamation-triangle-fill"></i> Low Stock
                Alert
              </h3>
            </div>
            <div className="stock-list">
              {lowStock.slice(0, 5).map((p, idx) => (
                <div key={idx} className="stock-item">
                  <span>{p.name || p.productName}</span>
                  <span className="stock-badge">{p.stock} left</span>
                </div>
              ))}
              {lowStock.length > 5 && (
                <div className="stock-more">
                  +{lowStock.length - 5} more products
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .dashboard-container {
          padding: 24px 28px;
          background: #f5f6fa;
          min-height: 100vh;
        }

        /* Header */
        .dashboard-header {
          margin-bottom: 28px;
        }

        .dashboard-title {
          font-size: 28px;
          font-weight: 800;
          color: #1a1a2e;
          margin: 0 0 8px 0;
        }

        .dashboard-subtitle {
          color: #666;
          margin: 0;
          font-size: 14px;
        }

        /* Stats Cards Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 20px;
          margin-bottom: 28px;
        }

        .stat-card {
          border-radius: 16px;
          padding: 20px;
          color: white;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }

        .stat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }

        .stat-card-icon {
          font-size: 28px;
          margin-bottom: 16px;
          opacity: 0.9;
        }

        .stat-card-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.85;
          margin-bottom: 6px;
        }

        .stat-card-value {
          font-size: 24px;
          font-weight: 800;
          word-break: break-word;
        }

        /* Chart Section */
        .chart-section {
          background: white;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 28px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eef2f6;
        }

        .section-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-header h3 i {
          color: #3b82f6;
        }

        .section-badge {
          font-size: 11px;
          color: #94a3b8;
          background: #f1f5f9;
          padding: 4px 10px;
          border-radius: 20px;
        }

        .chart-container {
          display: flex;
          justify-content: space-around;
          align-items: flex-end;
          height: 180px;
          gap: 16px;
        }

        .chart-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .chart-bars {
          display: flex;
          gap: 6px;
          align-items: flex-end;
        }

        .chart-bar {
          width: 32px;
          border-radius: 8px 8px 0 0;
          transition: height 0.3s;
          cursor: pointer;
        }

        .revenue-bar {
          background: #10b981;
        }

        .expense-bar {
          background: #ef4444;
        }

        .chart-month {
          font-size: 11px;
          font-weight: 600;
          color: #666;
        }

        .chart-legend {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #eef2f6;
        }

        .chart-legend span {
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Recent Records Grid */
        .recent-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin-bottom: 28px;
        }

        .recent-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .recent-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eef2f6;
        }

        .recent-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .recent-header h3 i {
          color: #3b82f6;
        }

        .view-link {
          background: none;
          border: none;
          color: #3b82f6;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .recent-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .recent-info {
          flex: 1;
        }

        .recent-title {
          font-weight: 600;
          font-size: 13px;
          color: #1a1a2e;
        }

        .recent-meta {
          font-size: 11px;
          color: #999;
          margin-top: 2px;
        }

        .recent-amount {
          font-weight: 700;
          font-size: 13px;
        }

        .recent-amount.revenue {
          color: #10b981;
        }

        .recent-amount.expense {
          color: #ef4444;
        }

        /* Quote Summary */
        .quote-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 16px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
        }

        .quote-summary-item {
          text-align: center;
        }

        .quote-summary-item span {
          display: block;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 4px;
        }

        .quote-summary-item strong {
          font-size: 14px;
          font-weight: 800;
          color: #1e293b;
        }

        .quote-summary-item strong.discount {
          color: #ef4444;
        }

        .quote-summary-item strong.revenue {
          color: #ea580c;
        }

        /* Bottom Grid */
        .bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .info-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .info-card.alert {
          background: #fff7ed;
          border: 1px solid #fed7aa;
        }

        .info-header {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eef2f6;
        }

        .info-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .info-header h3 i {
          color: #3b82f6;
        }

        .info-card.alert .info-header h3 i {
          color: #ea580c;
        }

        /* Employee Stats */
        .employee-stats {
          display: flex;
          gap: 16px;
        }

        .employee-stat {
          flex: 1;
          text-align: center;
          padding: 16px;
          border-radius: 12px;
        }

        .employee-stat.present {
          background: #10b98110;
        }

        .employee-stat.absent {
          background: #ef444410;
        }

        .employee-stat.total {
          background: #3b82f610;
        }

        .employee-value {
          font-size: 28px;
          font-weight: 800;
        }

        .employee-stat.present .employee-value { color: #10b981; }
        .employee-stat.absent .employee-value { color: #ef4444; }
        .employee-stat.total .employee-value { color: #3b82f6; }

        .employee-label {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          margin-top: 6px;
        }

        /* Stock List */
        .stock-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stock-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #fed7aa;
        }

        .stock-badge {
          background: #fee2e2;
          color: #dc2626;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .stock-more {
          text-align: center;
          font-size: 12px;
          color: #ea580c;
          padding-top: 8px;
        }

        .empty-state {
          text-align: center;
          padding: 24px;
          color: #999;
          font-size: 13px;
        }

        /* Responsive */
        @media (max-width: 1300px) {
          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 900px) {
          .dashboard-container {
            padding: 16px;
          }
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .recent-grid {
            grid-template-columns: 1fr;
          }
          .bottom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 500px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .chart-container {
            height: 150px;
          }
          .chart-bar {
            width: 24px;
          }
        }
      `}</style>
    </div>
  );
}
