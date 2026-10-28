// =============================================================
//  SignedAmountInput — amount that can be + or − on every device
//  Mobile number keypads have no "−" key, so this uses a text field
//  with a decimal keypad plus a +/− toggle. Value stays a plain string
//  like "0.40" or "-0.60" — exactly what the pages already expect.
// =============================================================
export default function SignedAmountInput({ value, onChange, name, className = "", style, ...rest }) {
  const v = String(value ?? "");
  const emit = (next) => onChange?.({ target: { name, value: next } });
  const clean = (raw) => {
    let s = String(raw).replace(/[^0-9.-]/g, "");
    const neg = s.startsWith("-");
    s = s.replace(/-/g, "");
    const parts = s.split(".");
    s = parts.shift() + (parts.length ? "." + parts.join("") : "");
    return (neg ? "-" : "") + s;
  };
  const flip = () => {
    const t = v.trim();
    emit(t.startsWith("-") ? t.slice(1) : t === "" ? "-" : `-${t}`);
  };
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "stretch", ...style }}>
      <button
        type="button"
        title="Switch between + and −"
        onClick={flip}
        style={{
          minWidth: 34, border: "1.5px solid #cbd5e1", borderRadius: 6, background: "#fff",
          fontWeight: 800, cursor: "pointer", lineHeight: 1,
        }}
      >
        {v.trim().startsWith("-") ? "−" : "+"}
      </button>
      <input
        type="text"
        inputMode="decimal"
        {...rest}
        name={name}
        value={v}
        onChange={(e) => emit(clean(e.target.value))}
        className={className}
      />
    </span>
  );
}