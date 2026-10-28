// =============================================================
//  PhoneInput — "+91 | 9876543210"
//  Shows +91 as a fixed prefix; the value passed to onChange is the
//  plain 10-digit number (pasting "+91…" or "0…" is cleaned, never doubled).
//  onChange receives a normal-looking event: e.target.name / e.target.value
// =============================================================
import { phone10 } from "../utils/phone";

export default function PhoneInput({ value, onChange, name, className = "", style, ...rest }) {
  const handle = (e) => {
    const clean = phone10(e.target.value);
    onChange?.({ ...e, target: { ...e.target, name, value: clean } });
  };
  return (
    <div className="ph91" style={style}>
      <span className="ph91__cc">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="10-digit mobile number"
        {...rest}
        maxLength={16} /* room for "+91 98765 43210"; cleaned to 10 digits below */
        name={name}
        value={value ?? ""}
        onChange={handle}
        className={`${className} ph91__input`}
      />
      <style>{`
        .ph91 { display: flex; align-items: stretch; width: 100%; }
        .ph91__cc { display: flex; align-items: center; padding: 0 10px; border: 1.5px solid #e2e8f0; border-right: none;
          border-radius: 8px 0 0 8px; background: #f1f5f9; color: #334155; font-weight: 700; font-size: 13.5px; white-space: nowrap; }
        .ph91 .ph91__input { border-top-left-radius: 0 !important; border-bottom-left-radius: 0 !important; flex: 1; min-width: 0; }
      `}</style>
    </div>
  );
}