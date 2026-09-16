const API_BASE = "http://localhost:8000";

export const apiFetch = (path, options = {}) => {
  const { branchId, ...restOptions } = options;
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(restOptions.headers || {}),
  };

  // If admin, add the branch header — an explicit branchId override wins,
  // otherwise fall back to whichever branch is globally selected.
  if (role === "admin") {
    const effectiveBranch = branchId ?? localStorage.getItem("admin_view_branch");
    if (effectiveBranch) {
      headers["X-Branch-ID"] = effectiveBranch;
    }
  }

  return fetch(`${API_BASE}${path}`, {
    ...restOptions,
    headers,
  });
};