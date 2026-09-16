import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminLayout from "./components/AdminLayout";
import useEnterNavigation from "./hooks/useEnterNavigation";

// Auth
import Login from "./pages/Login";
import BranchSelection from "./pages/BranchSelection";

// Main
import Dashboard from "./pages/Dashboard";

// Billing
import TaxInvoice from "./pages/TaxInvoice";
import PurchaseBill from "./pages/PurchaseBill";
import Quotation from "./pages/Quotation";

// Stock Management
import PurchaseInventory from "./pages/PurchaseInventory";
import Products from "./pages/Products";

// Staff Management
import AdminFeatures from "./pages/AdminFeatures";
import Employee_details from "./pages/Employee_details";
import Salary from "./pages/Salary";

// CRM
import Clients from "./pages/Clients";

function AppRoutes() {
  // Enter → next field, on every page (Login included)
  useEnterNavigation();

  // Add this helper at the top
// const user = JSON.parse(localStorage.getItem('user') || '{}');
// i will add this funtion on four lines bellow
function AdminRoute({ children }) {
  const role = localStorage.getItem('role');
  return role === 'admin' ? children : <Navigate to="/dashboard" replace />;
}
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/branch-selection" element={<BranchSelection />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* Billing */}
        <Route path="tax-invoice" element={<TaxInvoice />} />
        <Route path="purchase-bill" element={<PurchaseBill />} />
        <Route path="quotation" element={<Quotation />} />

        {/* Stock Management */}
        <Route path="purchase-inventory" element={<PurchaseInventory />} />
        <Route path="products" element={<Products />} />

        {/* Staff Management */}
        {/* <Route path="admin-features" element={<AdminFeatures />} /> */}
        {/* i will added the below one line of router */}
        <Route
          path="admin-features"
          element={
            <AdminRoute>
              <AdminFeatures />
            </AdminRoute>
          }
        />
        <Route path="employee-details" element={<Employee_details />} />
        <Route path="salary" element={<Salary />} />

        {/* CRM */}
        <Route
          path="clients"
          element={
            <AdminRoute>
              <Clients />
            </AdminRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}