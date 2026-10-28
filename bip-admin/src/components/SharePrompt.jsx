// =============================================================
//  Share helpers for WhatsApp (invoice / quotation images)
//
//  Phones only allow the share sheet right after a tap. Building the
//  image takes a moment, so the tap can "expire" → the share is blocked.
//  shareImage() reports that as "needs-tap", and <SharePrompt> shows a
//  button so one more tap opens WhatsApp with the image + full details.
// =============================================================
import { createPortal } from "react-dom";
import { waLink } from "../utils/phone";

export async function shareImage({ blob, fileName, phone, text }) {
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName, text });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled"; // user closed the sheet
      if (e && e.name === "NotAllowedError") return "needs-tap";
      // anything else → desktop-style fallback below
    }
  }
  // Desktop / no file sharing: download the image and open the chat with the details
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.open(waLink(phone, text), "_blank");
  return "fallback";
}

export default function SharePrompt({ pending, onClose }) {
  if (!pending) return null;
  const tap = async () => {
    const r = await shareImage(pending);
    if (r !== "needs-tap") onClose();
  };
  // rendered on <body> so no page wrapper can shift or cover it
  return createPortal(
    <div className="no-print share-prompt" style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 2000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", width: "100%", maxWidth: 440, borderRadius: "16px 16px 0 0",
        padding: "18px 18px 24px", boxShadow: "0 -8px 24px rgba(0,0,0,.2)",
      }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
          <i className="bi bi-check-circle-fill" style={{ color: "#008b3e" }}></i> {pending.fileName} is ready
        </div>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>
          Tap below to send it on WhatsApp{pending.phone ? " to +91 " + String(pending.phone).replace(/\D/g, "").slice(-10) : ""}.
        </div>
        <button type="button" onClick={tap} style={{
          width: "100%", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 800,
          fontSize: 15, color: "#fff", background: "#25D366", cursor: "pointer",
        }}>
          <i className="bi bi-whatsapp"></i> Share on WhatsApp
        </button>
        <button type="button" onClick={() => { window.open(waLink(pending.phone, pending.text), "_blank"); onClose(); }} style={{
          width: "100%", marginTop: 8, border: "1px solid #cbd5e1", borderRadius: 10, padding: "11px 0",
          fontWeight: 700, fontSize: 14, background: "#fff", color: "#334155", cursor: "pointer",
        }}>
          Send details as text only
        </button>
      </div>
    </div>,
    document.body,
  );
}