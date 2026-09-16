import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

const BRANCHES = [
  { value: "", label: "All Branches" },
  { value: "1", label: "Branch A" },
  { value: "2", label: "Branch B" },
  { value: "3", label: "Branch C" },
];

export default function Topbar() {
  const { logout } = useAuth();
  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState("");
  const [branchName, setBranchName] = useState("");
  const [viewBranch, setViewBranch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const branchRef = useRef(null);

  // Load user data from localStorage
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.full_name || user.username || "User");
        setUserRole(
          user.role === "admin"
            ? "Administrator"
            : user.branch_name || "Branch User",
        );
        setBranchName(user.branch_name || "");
      } catch (e) {}
    }
    const role = localStorage.getItem("role");
    if (role === "admin") {
      const savedViewBranch = localStorage.getItem("admin_view_branch");
      setViewBranch(savedViewBranch || "");
    }
  }, []);

  // Close branch dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (branchRef.current && !branchRef.current.contains(e.target)) {
        setBranchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Handle branch switch for admin
  const handleBranchSwitch = (branchId) => {
    const branchNames = { 1: "Branch A", 2: "Branch B", 3: "Branch C" };
    if (branchId === "") {
      localStorage.removeItem("admin_view_branch");
      localStorage.removeItem("admin_view_branch_name");
    } else {
      localStorage.setItem("admin_view_branch", branchId);
      localStorage.setItem("admin_view_branch_name", branchNames[branchId]);
    }
    window.location.reload();
  };

  // Get branch display text for admin
  const getAdminBranchDisplay = () => {
    if (!viewBranch) return "All Branches";
    const branches = { 1: "Branch A", 2: "Branch B", 3: "Branch C" };
    return branches[viewBranch] || `Branch ${viewBranch}`;
  };

  const role = localStorage.getItem("role");

  return (
    <header className="tb-root">
      <div className="tb-title">
        Bip Fencing <span>Admin</span>
      </div>

      {/* Mobile toggle */}
      <button
        className="tb-menu-btn"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        <i className={`bi ${menuOpen ? "bi-x-lg" : "bi-list"}`}></i>
      </button>

      <div className={`tb-right${menuOpen ? " tb-right--open" : ""}`}>
        {/* Branch Indicator */}
        {role === "admin" ? (
          <div className="tb-branch tb-branch--admin">
            <i className="bi bi-building"></i>
            <span>{getAdminBranchDisplay()}</span>
          </div>
        ) : (
          branchName && (
            <div className="tb-branch">
              <i className="bi bi-shop"></i>
              <span>{branchName}</span>
            </div>
          )
        )}

        {/* Admin Branch Switcher (custom dropdown) */}
        {role === "admin" && (
          <div className="tb-dropdown" ref={branchRef}>
            <button
              type="button"
              className={`tb-dropdown__trigger${branchOpen ? " tb-dropdown__trigger--open" : ""}`}
              onClick={() => setBranchOpen((o) => !o)}
            >
              <i className="bi bi-buildings"></i>
              <span>
                {BRANCHES.find((b) => b.value === viewBranch)?.label ||
                  "All Branches"}
              </span>
              <i className="bi bi-chevron-down tb-dropdown__chevron"></i>
            </button>

            {branchOpen && (
              <div className="tb-dropdown__menu">
                {BRANCHES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    className={`tb-dropdown__item${
                      viewBranch === b.value ? " tb-dropdown__item--active" : ""
                    }`}
                    onClick={() => {
                      setBranchOpen(false);
                      handleBranchSwitch(b.value);
                    }}
                  >
                    <span>{b.label}</span>
                    {viewBranch === b.value && (
                      <i className="bi bi-check-lg tb-dropdown__check"></i>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="tb-user">
          <div className="tb-avatar">{userName.charAt(0).toUpperCase()}</div>
          <div className="tb-user-info">
            <div className="tb-user-name">{userName}</div>
            <div className="tb-user-role">{userRole}</div>
          </div>
        </div>

        <button className="tb-logout" onClick={logout}>
          <i className="bi bi-box-arrow-right"></i> Logout
        </button>
      </div>

      <style>{`
        .tb-root {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fff;
          border-bottom: 1.5px solid #e2e8f0;
          padding: 14px 28px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          position: sticky;
          top: 0;
          z-index: 100;
          flex-wrap: wrap;
        }

        /* ── Title ── */
        .tb-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.3px;
          color: #0f172a;
        }
        .tb-title span {
          color: #008b3e;
          font-weight: 700;
        }

        /* ── Mobile toggle ── */
        .tb-menu-btn {
          display: none;
          width: 38px;
          height: 38px;
          border: 1.5px solid #e2e8f0;
          background: #fafbfc;
          border-radius: 8px;
          align-items: center;
          justify-content: center;
          color: #1e293b;
          font-size: 16px;
          cursor: pointer;
          transition: background .15s, border-color .15s;
        }
        .tb-menu-btn:hover { background: #f1f5f9; }

        /* ── Right side group ── */
        .tb-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* ── Branch indicator ── */
        .tb-branch {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f1f5f9;
          color: #475569;
          border-radius: 20px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 700;
        }
        .tb-branch i {
          font-size: 13px;
          color: #008b3e;
        }
        .tb-branch--admin i { color: #6366f1; }

        /* ── Custom Branch Dropdown ── */
        .tb-dropdown {
          position: relative;
        }
        .tb-dropdown__trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 36px;
          border: 1.5px solid #e2e8f0;
          border-radius: 20px;
          padding: 0 14px;
          font-size: 12.5px;
          font-weight: 700;
          font-family: inherit;
          background: #fafbfc;
          color: #1e293b;
          cursor: pointer;
          outline: none;
          transition: border-color .15s, background .15s, box-shadow .15s;
          white-space: nowrap;
        }
        .tb-dropdown__trigger i:first-child { color: #008b3e; font-size: 13px; }
        .tb-dropdown__trigger:hover { background: #f1f5f9; }
        .tb-dropdown__trigger--open,
        .tb-dropdown__trigger:focus {
          border-color: #008b3e;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(0,139,62,0.1);
        }
        .tb-dropdown__chevron {
          font-size: 10px;
          color: #94a3b8;
          margin-left: 2px;
          transition: transform .18s ease;
        }
        .tb-dropdown__trigger--open .tb-dropdown__chevron {
          transform: rotate(180deg);
          color: #008b3e;
        }

        .tb-dropdown__menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 180px;
          background: #fff;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(15,23,42,0.12);
          padding: 6px;
          z-index: 200;
          animation: tb-dropIn .15s cubic-bezier(.4,0,.2,1);
        }
        @keyframes tb-dropIn {
          from { opacity: 0; transform: translateY(-6px) scale(.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        .tb-dropdown__item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          border: none;
          background: transparent;
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          color: #374151;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          transition: background .12s, color .12s;
        }
        .tb-dropdown__item:hover {
          background: #f0fdf4;
          color: #008b3e;
        }
        .tb-dropdown__item--active {
          background: #dcfce7;
          color: #15803d;
        }
        .tb-dropdown__item--active:hover {
          background: #dcfce7;
          color: #15803d;
        }
        .tb-dropdown__check {
          font-size: 13px;
          color: #15803d;
        }

        /* ── User block ── */
        .tb-user {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tb-user-info { text-align: right; }
        .tb-user-name {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
        }
        .tb-user-role {
          font-size: 11px;
          color: #64748b;
          line-height: 1.2;
        }
        .tb-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          color: #15803d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          flex-shrink: 0;
        }

        /* ── Logout button ── */
        .tb-logout {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border: 1.5px solid #e2e8f0;
          background: #fafbfc;
          color: #374151;
          transition: background .15s, border-color .15s, transform .1s;
        }
        .tb-logout:hover { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
        .tb-logout:active { transform: scale(.98); }

        /* ── Responsive ── */
        @media (max-width: 860px) {
          .tb-branch span { display: none; }
          .tb-branch { padding: 5px 8px; }
        }

        @media (max-width: 700px) {
          .tb-root {
            padding: 12px 16px;
          }
          .tb-title { font-size: 16px; }

          .tb-menu-btn { display: flex; }

          .tb-right {
            display: none;
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid #f1f5f9;
          }
          .tb-right--open { display: flex; }

          .tb-branch {
            justify-content: center;
          }
          .tb-branch span { display: inline; }

          .tb-dropdown__trigger {
            width: 100%;
            justify-content: center;
            border-radius: 8px;
          }
          .tb-dropdown__menu {
            position: static;
            margin-top: 6px;
            width: 100%;
            box-shadow: none;
            border-color: #e2e8f0;
          }

          .tb-user {
            justify-content: center;
          }
          .tb-user-info { text-align: left; }

          .tb-logout {
            justify-content: center;
            width: 100%;
          }
        }
      `}</style>
    </header>
  );
}
