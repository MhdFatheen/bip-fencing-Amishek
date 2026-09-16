import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.jpeg";

// Pass onNavigate so sub-links can close the mobile sidebar
function DropdownItem({ label, icon, children, onNavigate }) {
  const [open, setOpen] = useState(false);

  // Stop propagation so clicking the trigger never bubbles to the overlay
  const handleToggle = (e) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  // Clone children and inject onClick that calls onNavigate
  const enhancedChildren = Array.isArray(children)
    ? children.map((child, i) =>
        child
          ? {
              ...child,
              props: {
                ...child.props,
                onClick: (e) => {
                  child.props.onClick?.(e);
                  onNavigate?.();
                },
              },
            }
          : child,
      )
    : children;

  return (
    <div>
      <div
        className="nav-item-link nav-dropdown-trigger"
        onClick={handleToggle}
      >
        <div className="nav-icon-wrap">
          <i className={`bi ${icon}`}></i>
        </div>
        <span>{label}</span>
        <i className={`bi bi-chevron-right chevron ${open ? "open" : ""}`}></i>
      </div>
      <div className={`nav-dropdown-items ${open ? "open" : ""}`}>
        <div className="nav-dropdown-inner">{enhancedChildren}</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = localStorage.getItem("role");

  // Track previous pathname — only close sidebar when pathname actually changes
  // (i.e. a real page NavLink was clicked, not a dropdown toggle)
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      prevPathRef.current = location.pathname;
      setMobileOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Called when a sub-nav NavLink is tapped on mobile
  const handleSubNavClick = () => setMobileOpen(false);

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="sb-brand">
        <div className="sb-brand__left">
          <div className="sb-brand__icon">
            <img
              src={logo}
              alt="Bip Fencing"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "8px",
              }}
            />
          </div>
          <div className="sb-brand__text">
            <div className="sb-brand__name">Bip Fencing</div>
            <div className="sb-brand__sub">Admin Panel</div>
          </div>
        </div>
        <button
          className="sb-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close"
        >
          <i className="bi bi-x-lg"></i>
        </button>
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        <div className="sb-section">Main</div>
        <NavLink
          to="/dashboard"
          onClick={handleSubNavClick}
          className={({ isActive }) =>
            `nav-item-link${isActive ? " active" : ""}`
          }
        >
          <div className="nav-icon-wrap">
            <i className="bi bi-grid-1x2-fill"></i>
          </div>
          <span>Dashboard</span>
        </NavLink>

        <div className="sb-section">Billing</div>
        <DropdownItem
          label="Billing"
          icon="bi-receipt"
          onNavigate={handleSubNavClick}
        >
          <NavLink
            to="/tax-invoice"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-file-earmark-text"></i>
            <span>Sales</span>
          </NavLink>
          <NavLink
            to="/purchase-bill"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-bag-check"></i>
            <span>Purchase Bill</span>
          </NavLink>
          <NavLink
            to="/quotation"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-file-earmark-spreadsheet"></i>
            <span>Quotation</span>
          </NavLink>
        </DropdownItem>

        <div className="sb-section">Inventory</div>
        <DropdownItem
          label="Stock Management"
          icon="bi-boxes"
          onNavigate={handleSubNavClick}
        >
          <NavLink
            to="/purchase-inventory"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-cart-plus"></i>
            <span>Purchase Inventory</span>
          </NavLink>
          <NavLink
            to="/products"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-box-seam"></i>
            <span>Products</span>
          </NavLink>
        </DropdownItem>

        <div className="sb-section">HR</div>
        <DropdownItem
          label="Staff Management"
          icon="bi-people"
          onNavigate={handleSubNavClick}
        >
          {role === "admin" && (
            <NavLink
              to="/admin-features"
              className={({ isActive }) =>
                `nav-item-link nav-sub${isActive ? " active" : ""}`
              }
            >
              <i className="bi bi-shield-lock"></i>
              <span>Admin Features</span>
            </NavLink>
          )}
          <NavLink
            to="/employee-details"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-person-vcard"></i>
            <span>Employee Details</span>
          </NavLink>
          <NavLink
            to="/salary"
            className={({ isActive }) =>
              `nav-item-link nav-sub${isActive ? " active" : ""}`
            }
          >
            <i className="bi bi-cash-stack"></i>
            <span>Salary &amp; Attendance</span>
          </NavLink>
        </DropdownItem>

        {role === "admin" && (
          <>
            <div className="sb-section">CRM</div>
            <NavLink
              to="/clients"
              onClick={handleSubNavClick}
              className={({ isActive }) =>
                `nav-item-link${isActive ? " active" : ""}`
              }
            >
              <div className="nav-icon-wrap">
                <i className="bi bi-person-lines-fill"></i>
              </div>
              <span>customers</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        <div className="sb-stats">
          <div className="sb-stat">
            <span className="sb-stat__val">3</span>
            <span className="sb-stat__label">Branches</span>
          </div>
          <div className="sb-stat">
            <span className="sb-stat__val">∞</span>
            <span className="sb-stat__label">Records</span>
          </div>
          {/* FIX 2: dot beside label inline so it never overlaps the "L" */}
          <div className="sb-stat">
            <div className="sb-stat__live">
              <span className="sb-stat__dot"></span>
              <span className="sb-stat__label">Live</span>
            </div>
          </div>
        </div>
        <div className="sb-divider" />
        <button className="nav-item-link sb-logout" onClick={logout}>
          <div className="nav-icon-wrap nav-icon-wrap--logout">
            <i className="bi bi-box-arrow-right"></i>
          </div>
          <span>Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Sidebar shell ── */
        .sidebar {
          width: 252px;
          height: 100vh;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0; left: 0;
          z-index: 1000;
          overflow-y: auto;
          overflow-x: hidden;
          contain: strict;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

          /* FIX 5: neutral scrollbar — no green tint */
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.12) transparent;

          background: #0a0a0a;
          border-right: 1px solid rgba(0,139,62,.2);
        }

        /* FIX 5: webkit scrollbar — neutral grey, no green on hover */
        .sidebar::-webkit-scrollbar { width: 4px; }
        .sidebar::-webkit-scrollbar-track { background: transparent; }
        .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 4px; }
        .sidebar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.2); }

        /* Background pattern */
        .sidebar::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 30% 20%, rgba(0,168,72,.07) 0%, transparent 55%),
            radial-gradient(circle at 80% 70%, rgba(0,139,62,.06) 0%, transparent 50%),
            radial-gradient(circle, rgba(0,168,72,.12) 1px, transparent 1px);
          background-size: auto, auto, 22px 22px;
          pointer-events: none;
          z-index: 0;
        }

        /* ── Brand ── */
        .sb-brand {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 16px 16px;
          position: sticky; top: 0; z-index: 10;
          background: #0a0a0a;
          border-bottom: 1px solid rgba(0,139,62,.25);
          flex-shrink: 0;
        }
        .sb-brand__left {
          display: flex; align-items: center; gap: 11px;
          min-width: 0; /* allow text to truncate if needed */
        }
        .sb-brand__icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #00a848, #00c853);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; color: #fff;
          box-shadow: 0 0 0 1px rgba(0,168,72,.3), 0 4px 14px rgba(0,139,62,.45);
          flex-shrink: 0;
          position: relative; z-index: 1;
          overflow: hidden;
        }
        /* FIX 3: brand text block always visible, never hidden by icon */
        .sb-brand__text {
          display: flex; flex-direction: column;
          min-width: 0;
          position: relative; z-index: 1;
        }
        .sb-brand__name {
          font-size: 14px; font-weight: 700; color: #f0f9f3;
          letter-spacing: -0.2px; line-height: 1.2;
          white-space: nowrap;
        }
        .sb-brand__sub {
          font-size: 9.5px; font-weight: 700; color: #00a848;
          text-transform: uppercase; letter-spacing: 1.2px; margin-top: 1px;
          white-space: nowrap;
        }
        .sb-close {
          display: none; background: none; border: none;
          color: rgba(255,255,255,.35); font-size: 16px; cursor: pointer;
          padding: 5px; border-radius: 6px; transition: color .15s, background .15s;
          position: relative; z-index: 1;
          flex-shrink: 0;
          margin-left: 8px;
        }
        .sb-close:hover { color: #fff; background: rgba(255,255,255,.08); }

        /* ── Nav ── */
        .sb-nav { flex: 1; padding: 8px 0 4px; position: relative; z-index: 1; }

        .sb-section {
          font-size: 9.5px; font-weight: 700; color: rgba(0,168,72,.6);
          text-transform: uppercase; letter-spacing: 1.2px;
          padding: 16px 18px 5px;
        }

        .nav-item-link {
          display: flex; align-items: center; gap: 9px;
          padding: 7px 14px;
          color: rgba(255,255,255,.45);
          text-decoration: none; font-size: 13.5px; font-weight: 500;
          cursor: pointer; border: none; background: none;
          width: 100%; text-align: left;
          transition: color .15s, background .15s;
          position: relative; border-radius: 0;
        }
        .nav-item-link:hover {
          color: #fff;
          background: rgba(0,168,72,.1);
        }
        .nav-item-link.active {
          color: #00c853;
          background: rgba(0,168,72,.12);
          font-weight: 600;
        }
        /* Active indicator bar on left edge */
        .nav-item-link.active::after {
          content: "";
          position: absolute; left: 0; top: 6px; bottom: 6px;
          width: 3px;
          background: linear-gradient(180deg, #00a848, #00c853);
          border-radius: 0 3px 3px 0;
        }
        .nav-item-link span { flex: 1; }

        /* Icon wrapper for top-level items */
        .nav-icon-wrap {
          width: 28px; height: 28px; border-radius: 7px;
          background: rgba(0,139,62,.2);
          border: 1px solid rgba(0,139,62,.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; flex-shrink: 0;
          transition: background .15s, border-color .15s;
        }
        .nav-item-link:hover .nav-icon-wrap {
          background: rgba(0,168,72,.12);
          border-color: rgba(0,168,72,.3);
        }
        .nav-item-link.active .nav-icon-wrap {
          background: rgba(0,168,72,.15);
          border-color: rgba(0,200,80,.4);
          color: #00c853;
        }
        .nav-icon-wrap--logout {
          background: rgba(248,81,73,.1);
          border-color: rgba(248,81,73,.15);
        }

        /* Sub nav (dropdown children) */
        .nav-sub {
          padding-left: 52px; font-size: 13px;
          color: rgba(255,255,255,.35);
        }
        .nav-sub i { font-size: 13px; margin-right: 2px; }
        .nav-sub:hover { color: #fff; }
        .nav-sub.active { color: #00c853; }

        /* FIX 1: removed the green dot (::after) on active sub-nav items */
        /* .nav-sub.active::after was the dot — deleted entirely */

        /* Chevron */
        .chevron { font-size: 10px !important; color: rgba(0,168,72,.6); transition: transform .2s; flex-shrink: 0; }
        .chevron.open { transform: rotate(90deg); }

        /* Dropdown animation */
        .nav-dropdown-items { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s ease; }
        .nav-dropdown-items.open { grid-template-rows: 1fr; }
        .nav-dropdown-inner { min-height: 0; overflow: hidden; }

        .nav-dropdown-trigger { gap: 9px; }

        /* ── Footer ── */
        .sb-footer { position: relative; z-index: 1; padding-bottom: 8px; }

        .sb-stats {
          display: flex; align-items: center;
          margin: 8px 12px 0;
          background: rgba(0,168,72,.07);
          border: 1px solid rgba(0,139,62,.25);
          border-radius: 10px;
          padding: 10px 14px;
          gap: 0;
        }
        .sb-stat { flex: 1; text-align: center; }
        .sb-stat + .sb-stat { border-left: 1px solid rgba(255,255,255,.08); }
        .sb-stat__val { display: block; font-size: 15px; font-weight: 800; color: #f0f9f3; letter-spacing: -0.3px; }
        .sb-stat__label { font-size: 9px; color: rgba(255,255,255,.35); text-transform: uppercase; letter-spacing: 0.8px; }

        /* FIX 2: Live stat — dot and label side by side, no overlap */
        .sb-stat__live {
          display: flex; align-items: center; justify-content: center; gap: 5px;
        }
        .sb-stat__dot {
          display: inline-block; width: 7px; height: 7px; border-radius: 50%;
          background: #00c853;
          box-shadow: 0 0 8px rgba(0,200,80,.9);
          animation: sb-pulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes sb-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.6; transform:scale(.85); } }

        .sb-divider { height: 1px; background: rgba(0,168,72,.1); margin: 10px 12px 4px; }

        .sb-logout { color: rgba(248,120,120,.7); font-weight: 600; }
        .sb-logout:hover { color: #fca5a5; background: rgba(248,81,73,.08); }

        /* ── Hamburger ── */
        .hamburger-btn {
          display: none; position: fixed; top: 10px; left: 10px;
          z-index: 1101; width: 36px; height: 36px;
          border: 1.5px solid #e2e8f0; border-radius: 8px;
          background: #fff; color: #008b3e; font-size: 15px; cursor: pointer;
          align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,.08);
          transition: background .13s, border-color .13s, opacity .15s;
          flex-shrink: 0;
        }
        .hamburger-btn:hover { background: #f0fdf4; border-color: #86efac; }
        .hamburger-btn.is-hidden { opacity: 0; pointer-events: none; }

        /* ── Overlay ── */
        /* z-index 999 = BELOW sidebar (1000) so it never paints over sidebar content */
        .sidebar-overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(5,20,10,.65);
          z-index: 999;
          animation: sb-fade .2s ease;
        }
        @keyframes sb-fade { from { opacity:0 } to { opacity:1 } }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .hamburger-btn { display: flex; }
          .tb-topbar { padding-left: 56px !important; }

          /* FIX 3: show close button, keep brand layout intact on mobile */
          .sb-close { display: flex; align-items: center; }

          .sidebar {
            transform: translateX(-110%);
            transition: transform .25s cubic-bezier(.4,0,.2,1);
            /* FIX 4: no filter/blur on the sidebar itself */
            filter: none;
            -webkit-filter: none;
          }
          .sidebar.mobile-open {
            transform: translateX(0);
            box-shadow: 8px 0 40px rgba(0,0,0,.4);
          }
          .sidebar-overlay { display: block; }
          .tb-header, .page-header, header { padding-left: 52px !important; }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
          .sidebar { width: 216px; }
        }
      `}</style>

      <button
        className={`hamburger-btn${mobileOpen ? " is-hidden" : ""}`}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <i className="bi bi-layout-sidebar-inset"></i>
      </button>

      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
        {sidebarContent}
      </aside>
    </>
  );
}
