import SalaryOld from "./SalaryOld";
import SalaryBranchC from "./SalaryBranchC";

// Branch A (id 1 = Vallioor): pack / kambi kattu / others entry page
// Branch C (id 3 = Panagudi): pack / loading / unloading / location entry page
// Branch B (id 2 = Nanguneri): attendance / work yes-no amount / extra entry page
// "All Branches" keeps the original salary page.

const currentBranchId = () => {
  if (localStorage.getItem("role") === "admin") {
    return (localStorage.getItem("admin_view_branch") || "").trim();
  }
  try {
    return String(JSON.parse(localStorage.getItem("user") || "{}").branch_id ?? "").trim();
  } catch {
    return "";
  }
};

export default function Salary() {
  const b = currentBranchId();
  if (b === "1") return <SalaryBranchC variant="A" />;
  if (b === "2") return <SalaryBranchC variant="B" />;
  if (b === "3") return <SalaryBranchC variant="C" />;
  return <SalaryOld />;
}
