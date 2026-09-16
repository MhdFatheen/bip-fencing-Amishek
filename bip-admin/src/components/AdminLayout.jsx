import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

// Sidebar order (top → bottom). Paths Sidebar.jsx-la irukura maadhiri irukanum.
const MENU_ORDER = [
  '/dashboard',
  '/tax-invoice',        // Sales
  '/purchase-bill',      // Purchase Bill
  '/quotation',          // Quotation
  '/purchase-inventory', // Purchase Inventory
  '/products',           // Products
  '/admin-features',     // Admin Features
  '/employee-details',   // Employee Details
  '/salary',             // Salary & Attendance
  '/clients',            // Customers
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Esc → previous page in the sidebar menu
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.cl-overlay, .modal.show')) return;
      const i = MENU_ORDER.findIndex((p) => location.pathname.startsWith(p));
      if (i <= 0) return; // Dashboard or unknown page → stay
      e.preventDefault();
      navigate(MENU_ORDER[i - 1]);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [navigate, location.pathname]);

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}