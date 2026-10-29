// =============================================================
//  branchNames.js — DISPLAY names only
//  Branch IDs, database values and backend logic stay unchanged.
//  Branch 1 → Kadambankulam, 2 → Fencing Group, 3 → Panagudi
// =============================================================

export const BRANCH_LABELS = {
  1: "Kadambankulam",
  2: "Fencing Group",
  3: "Panagudi",
};

// Old names kept coming from the database / older records
const OLD_NAMES = {
  "branch a": "Kadambankulam",
  "branch b": "Fencing Group",
  "branch c": "Panagudi",
  bra: "Kadambankulam",
  brb: "Fencing Group",
  brc: "Panagudi",
  // spellings that may still be stored in the database
  vallioor: "Kadambankulam",
  valioor: "Kadambankulam",
  kadambankulam: "Kadambankulam",
  kadambakulam: "Kadambankulam",
  nanguneri: "Fencing Group",
  naguneri: "Fencing Group",
  "fencing group": "Fencing Group",
  panagudi: "Panagudi",
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