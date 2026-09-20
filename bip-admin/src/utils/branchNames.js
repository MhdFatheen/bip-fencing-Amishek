// =============================================================
//  branchNames.js — DISPLAY names only
//  Branch IDs, database values and backend logic stay unchanged.
//  Branch 1 → Valioor, 2 → Naguneri, 3 → Kadambakulam
// =============================================================

export const BRANCH_LABELS = {
  1: "Valioor",
  2: "Naguneri",
  3: "Kadambakulam",
};

// Old names kept coming from the database / older records
const OLD_NAMES = {
  "branch a": "Valioor",
  "branch b": "Naguneri",
  "branch c": "Kadambakulam",
  bra: "Valioor",
  brb: "Naguneri",
  brc: "Kadambakulam",
};

// Accepts a branch id (1 / "1") or a stored name ("Branch A") and
// returns the name to show. Anything unknown is returned untouched.
export function branchLabel(value) {
  if (value === null || value === undefined || value === "") return value;
  const asId = Number(value);
  if (!Number.isNaN(asId) && BRANCH_LABELS[asId]) return BRANCH_LABELS[asId];
  const key = String(value).trim().toLowerCase();
  return OLD_NAMES[key] || value;
}