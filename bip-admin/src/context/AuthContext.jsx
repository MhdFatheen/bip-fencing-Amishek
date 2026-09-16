import { createContext, useContext, useState } from "react";
import { apiFetch } from "../utils/api"; // adjust path if needed
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem("token"), // ← check token not isAuthenticated
  );

  const navigate = useNavigate();

const logout = async () => {
  try {
    await apiFetch("/logout.php", {
      method: "POST",
    });
  } catch (err) {
    // Ignore logout API errors and continue clearing local data
    console.error("Logout request failed:", err);
  }

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("selectedBranch");
  sessionStorage.clear();

  setIsAuthenticated(false);
  navigate("/login", { replace: true });
};

  // called by Login.jsx after successful PHP login
  const setAuth = () => {
    sessionStorage.clear(); // belt-and-suspenders: also clear on the way in, in case logout was skipped
    setIsAuthenticated(true);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
