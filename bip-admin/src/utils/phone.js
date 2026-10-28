// =============================================================
//  phone.js — Indian phone helpers (+91 is the default)
//  The app keeps storing the 10-digit number exactly as before.
// =============================================================

// "+91 98765 43210", "09876543210", "919876543210" → "9876543210"
export function phone10(value) {
  let d = String(value ?? "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

// Number for WhatsApp links: always with 91, never twice → "919876543210"
export function waPhone(value) {
  const d = phone10(value);
  return d.length === 10 ? `91${d}` : "";
}

// wa.me link with the +91 number (opens the share picker if no number)
export function waLink(value, text = "") {
  const p = waPhone(value);
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return p ? `https://wa.me/${p}${q}` : `https://wa.me/${q}`;
}

// "+91 98765 43210" for display
export function showPhone(value) {
  const d = phone10(value);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(value ?? "");
}