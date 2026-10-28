import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.jpeg";
// Background photo: replace src/assets/login-bg.jpg with any photo (1920px wide or more looks best)
import loginBg from "../assets/login-bg.jpg";

const LOGO_SRC = "/logo.jpeg";
const API_BASE = "http://localhost:8000";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.user.role);
        localStorage.setItem("user", JSON.stringify(data.user));
        if (data.user.role === "admin")
          localStorage.removeItem("admin_view_branch");
        setAuth();
        if (data.user.role === "admin") {
          navigate("/branch-selection");
          setTimeout(() => {
            if (window.location.pathname !== "/branch-selection")
              alert("Branch selection page not found.");
          }, 500);
        } else {
          navigate("/dashboard");
        }
      } else {
        setError(data.error || "Invalid username or password");
      }
    } catch {
      setError("Cannot connect to server. Make sure PHP is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Full-viewport page, card fills it ── */
        .lg-page {
          height: 100vh; width: 100vw;
          display: flex; align-items: center; justify-content: center;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: linear-gradient(135deg, #071208 0%, #0d2614 50%, #091a0c 100%);
          position: relative; overflow: hidden;
        }

        /* Dot-grid background */
        .lg-page::before {
          content: "";
          position: absolute; inset: 0;
          background-image:
            radial-gradient(circle at 20% 40%, rgba(0,168,72,.15) 0%, transparent 45%),
            radial-gradient(circle at 80% 60%, rgba(0,139,62,.12) 0%, transparent 40%),
            radial-gradient(circle, rgba(0,168,72,.13) 1px, transparent 1px);
          background-size: auto, auto, 26px 26px;
          pointer-events: none;
        }

        /* ── Card: wide, compact, viewport-fitted ── */
        .lg-card {
          position: relative; z-index: 1;
          width: calc(100vw - 80px);
          max-width: 1100px;
          height: calc(100vh - 64px);
          max-height: 620px;
          min-height: 480px;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          border-radius: 22px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(0,200,80,.14),
            0 28px 70px rgba(0,0,0,.75),
            0 6px 24px rgba(0,0,0,.45);
        }

        /* ══════════════════════
           LEFT — dark green
        ══════════════════════ */
        .lg-left {
          background: linear-gradient(155deg, #0f2e18 0%, #091a0c 60%, #04090505 100%);
          padding: 32px 36px 28px;
          display: flex; flex-direction: column;
          position: relative; overflow: hidden;
        }

        /* Dot grid overlay */
        .lg-left::before {
          content: "";
          position: absolute; inset: 0;
          background-image: radial-gradient(circle, rgba(0,200,80,.22) 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none; opacity: .4;
        }
        /* Top-right glow */
        .lg-left::after {
          content: "";
          position: absolute; top: -70px; right: -70px;
          width: 260px; height: 260px; border-radius: 50%;
          background: rgba(0,168,72,.2); filter: blur(65px);
          pointer-events: none;
        }
        .lg-glow-b {
          position: absolute; bottom: -50px; left: -30px;
          width: 200px; height: 200px; border-radius: 50%;
          background: rgba(0,100,40,.28); filter: blur(55px);
          pointer-events: none; z-index: 0;
        }

        .lg-left-inner {
          position: relative; z-index: 1;
          flex: 1; display: flex; flex-direction: column;
        }

        /* Logo */
        .lg-logo {
          display: flex; align-items: center; gap: 11px;
          margin-bottom: 28px;
        }
        .lg-logo__box {
          width: 40px; height: 40px; border-radius: 11px;
          background: rgba(0,200,80,.1); border: 1px solid rgba(0,200,80,.22);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; flex-shrink: 0;
          box-shadow: 0 3px 12px rgba(0,139,62,.3);
        }
        .lg-logo__img { width: 27px; height: 27px; object-fit: contain; }
        .lg-logo__img.errored { display: none; }
        .lg-logo__fb { font-size: 16px; color: #00c853; display: none; }
        .lg-logo__img.errored + .lg-logo__fb { display: block; }
        .lg-logo__name { font-size: 14px; font-weight: 800; color: #fff; letter-spacing: -.2px; line-height: 1.2; }
        .lg-logo__sub { font-size: 9px; font-weight: 700; color: #00a848; text-transform: uppercase; letter-spacing: 1.4px; margin-top: 1px; }

        /* Hero */
        .lg-hero { flex: 1; display: flex; flex-direction: column; justify-content: center; }

        .lg-tag {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(0,200,80,.1); border: 1px solid rgba(0,200,80,.2);
          border-radius: 20px; padding: 4px 12px;
          font-size: 9.5px; font-weight: 700; color: #00c853;
          text-transform: uppercase; letter-spacing: 1.2px;
          margin-bottom: 16px; width: fit-content;
        }
        .lg-tag__dot {
          width: 5px; height: 5px; border-radius: 50%; background: #00c853;
          box-shadow: 0 0 6px rgba(0,200,80,.9);
          animation: lg-blink 2s ease-in-out infinite;
        }
        @keyframes lg-blink { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.75)} }

        .lg-title {
          font-size: 30px; font-weight: 900; color: #fff;
          line-height: 1.15; letter-spacing: -.9px; margin-bottom: 12px;
        }
        .lg-title em { font-style: normal; color: #00c853; }

        .lg-desc {
          font-size: 12.5px; color: rgba(255,255,255,.42); line-height: 1.8;
          max-width: 280px; margin-bottom: 24px;
        }

        /* 2-column feature grid */
        .lg-feats {
          display: grid; grid-template-columns: 1fr 1fr; gap: 9px;
        }
        .lg-feat {
          display: flex; align-items: center; gap: 9px;
          font-size: 11.5px; font-weight: 500; color: rgba(255,255,255,.68);
          background: rgba(0,168,72,.06); border: 1px solid rgba(0,168,72,.12);
          border-radius: 9px; padding: 8px 10px;
        }
        .lg-feat i { font-size: 12px; color: #00c853; flex-shrink: 0; }

        /* Stats strip */
        .lg-stats {
          display: flex; gap: 0;
          border-top: 1px solid rgba(255,255,255,.07);
          padding-top: 18px; margin-top: 22px;
        }
        .lg-stat { flex: 1; }
        .lg-stat + .lg-stat { border-left: 1px solid rgba(255,255,255,.07); padding-left: 18px; }
        .lg-stat__val { display: block; font-size: 18px; font-weight: 900; color: #fff; letter-spacing: -.3px; }
        .lg-stat__lbl { font-size: 8.5px; color: rgba(255,255,255,.27); text-transform: uppercase; letter-spacing: .9px; margin-top: 2px; }

        .lg-copy { font-size: 10px; color: rgba(255,255,255,.16); margin-top: 16px; position: relative; z-index: 1; }


        /* ══════════════════════
           RIGHT — white
        ══════════════════════ */
        .lg-right {
          background: #ffffff;
          display: flex; align-items: center; justify-content: center;
          padding: 32px 44px;
          position: relative;
        }
        .lg-right::before {
          content: "";
          position: absolute; top: 0; left: 0;
          width: 140px; height: 140px;
          background: radial-gradient(circle at 0% 0%, rgba(0,168,72,.05) 0%, transparent 70%);
          pointer-events: none;
        }

        .lg-form-wrap { width: 100%; max-width: 320px; position: relative; z-index: 1; }

        /* Form header */
        .lg-fh { margin-bottom: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .lg-fh__logobox {
          width: 90px; height: 90px; border-radius: 14px;
          background: linear-gradient(135deg, #006e31, #00c853);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px;
          box-shadow: 0 4px 18px rgba(0,110,49,.3), 0 0 0 1px rgba(0,200,80,.18);
          overflow: hidden;
        }
        .lg-fh__logoimg { width: 90px; height: 90px; object-fit: cover; }
        .lg-fh__logoimg.errored { display: none; }
        .lg-fh__logofb { font-size: 20px; color: #fff; display: none; }
        .lg-fh__logoimg.errored + .lg-fh__logofb { display: block; }

        .lg-fh__eyebrow {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1.7px; color: #00a848; margin-bottom: 5px;
        }
        .lg-fh__title { font-size: 22px; font-weight: 900; color: #0a1a0e; letter-spacing: -.5px; margin-bottom: 3px; }
        .lg-fh__sub { font-size: 12.5px; color: #8a9e8d; }

        /* Error */
        .lg-alert {
          display: flex; align-items: center; gap: 8px;
          background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626;
          border-radius: 9px; padding: 9px 12px; font-size: 12.5px; font-weight: 500;
          margin-bottom: 16px;
        }

        /* Stacked input card */
        .lg-form { display: flex; flex-direction: column; }

        .lg-group {
          border: 1.5px solid #dde8de; border-radius: 12px; overflow: hidden;
          margin-bottom: 14px;
          transition: border-color .15s, box-shadow .15s;
        }
        .lg-group:focus-within {
          border-color: #00a848;
          box-shadow: 0 0 0 3px rgba(0,168,72,.1);
        }

        .lg-field {
          display: flex; align-items: center;
          background: #f6faf6; position: relative;
          border-bottom: 1px solid #dde8de;
        }
        .lg-field:last-child { border-bottom: none; }

        .lg-field__lbl {
          position: absolute; top: 7px; left: 42px;
          font-size: 9.5px; font-weight: 700; color: #8aaa8d;
          text-transform: uppercase; letter-spacing: .6px; pointer-events: none;
        }
        .lg-field__icon {
          width: 42px; display: flex; align-items: center; justify-content: center;
          font-size: 13px; color: #a8c4aa; flex-shrink: 0;
          padding-top: 14px; align-self: flex-end; padding-bottom: 10px;
        }
        .lg-inp {
          flex: 1; height: 52px; padding: 20px 12px 8px 0;
          border: none; outline: none; background: transparent;
          font-size: 14px; color: #0a1a0e; font-family: inherit;
        }
        .lg-inp::placeholder { color: #bdd0bf; }
        .lg-eye {
          padding: 0 13px 0 0; background: none; border: none;
          cursor: pointer; color: #a8c4aa; font-size: 14px;
          transition: color .15s; flex-shrink: 0;
        }
        .lg-eye:hover { color: #008b3e; }

        /* Submit */
        .lg-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; height: 46px;
          background: linear-gradient(135deg, #006e31, #009e46 60%, #00c853 100%);
          color: #fff; border: none; border-radius: 11px;
          font-size: 14.5px; font-weight: 800; letter-spacing: .1px;
          cursor: pointer; font-family: inherit;
          transition: transform .12s, box-shadow .15s;
          box-shadow: 0 3px 16px rgba(0,110,49,.38);
        }
        .lg-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 26px rgba(0,110,49,.48); }
        .lg-btn:active:not(:disabled) { transform: translateY(0); }
        .lg-btn:disabled { opacity: .5; cursor: not-allowed; }
        .lg-spin {
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
          border-radius: 50%; animation: lg-spin .65s linear infinite;
        }
        @keyframes lg-spin { to { transform: rotate(360deg); } }

        /* Credentials */
        .lg-sep {
          display: flex; align-items: center; gap: 10px; margin: 16px 0 12px;
        }
        .lg-sep__line { flex: 1; height: 1px; background: #e8efe9; }
        .lg-sep__txt { font-size: 10px; color: #b0c4b2; font-weight: 600; letter-spacing: .5px; white-space: nowrap; }

        .lg-creds { display: flex; flex-direction: column; gap: 6px; }
        .lg-cred {
          display: flex; align-items: center; gap: 9px;
          padding: 8px 11px; border-radius: 8px;
          background: #f4f8f5; border: 1px solid #ddeadf;
          transition: background .15s, border-color .15s;
        }
        .lg-cred:hover { background: #eaf3ec; border-color: #b8d9be; }
        .lg-cred code { font-size: 11.5px; color: #3d5440; font-family: "SF Mono","Fira Code",monospace; }
        .lg-badge {
          font-size: 9px; font-weight: 800; text-transform: uppercase;
          letter-spacing: .4px; padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
        }
        .lg-badge--admin { background: #dcfce7; color: #15803d; }
        .lg-badge--branch { background: #dbeafe; color: #1d4ed8; }

        /* ── Responsive ── */
        @media (max-width: 820px) {
          .lg-card {
            grid-template-columns: 1fr;
            width: calc(100vw - 40px);
            height: auto; max-height: none;
            max-width: 420px;
          }
          .lg-left { padding: 28px 28px 20px; }
          .lg-title { font-size: 24px; }
          .lg-feats { grid-template-columns: 1fr; }
          .lg-stats { display: none; }
          .lg-right { padding: 28px 28px; }
        }
        @media (max-width: 420px) {
          .lg-right { padding: 24px 18px; }
          .lg-left { padding: 24px 18px 16px; }
        }

        /* ══════════════════════════════════════════
           GLASS UI over the fencing-products scene
           (visual only — form logic is unchanged)
        ══════════════════════════════════════════ */
        .lg-page { background-size: cover; background-position: center; background-repeat: no-repeat; }
        .lg-page::before { display: none; }

        .lg-card {
          background: rgba(255,255,255,.07);
          -webkit-backdrop-filter: blur(3px) saturate(160%);
          backdrop-filter: blur(3px) saturate(160%);
          border: 1px solid rgba(255,255,255,.28);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),
            0 30px 80px rgba(0,0,0,.55),
            0 8px 28px rgba(0,0,0,.35);
        }
        .lg-left {
          background: linear-gradient(155deg, rgba(8,34,18,.55) 0%, rgba(8,34,18,.30) 80%);
          border-right: 1px solid rgba(255,255,255,.16);
        }
        .lg-left::before { opacity: .15; }
        .lg-right {
          background: rgba(10,40,22,.22);
          -webkit-backdrop-filter: blur(1px);
          backdrop-filter: blur(1px);
        }
        .lg-right::before { display: none; }

        .lg-fh__eyebrow { color: #7dffb0; }
        .lg-fh__title { color: #fff; text-shadow: 0 1px 12px rgba(0,0,0,.35); }
        .lg-fh__sub { color: rgba(255,255,255,.72); }

        .lg-group {
          background: rgba(255,255,255,.14);
          border-color: rgba(255,255,255,.35);
        }
        .lg-group:focus-within {
          border-color: #5dffa0;
          box-shadow: 0 0 0 3px rgba(93,255,160,.22);
        }
        .lg-field { background: transparent; border-bottom-color: rgba(255,255,255,.22); }
        .lg-field__lbl { color: rgba(255,255,255,.7); }
        .lg-field__icon { color: rgba(255,255,255,.75); }
        .lg-inp { color: #fff; }
        .lg-inp::placeholder { color: rgba(255,255,255,.4); }
        .lg-eye { color: rgba(255,255,255,.7); }
        .lg-eye:hover { color: #7dffb0; }
        .lg-inp:-webkit-autofill {
          -webkit-text-fill-color: #fff;
          transition: background-color 9999s ease-out 0s;
        }
        .lg-sep__line { background: rgba(255,255,255,.2); }
        .lg-desc { color: rgba(255,255,255,.88); text-shadow: 0 1px 8px rgba(0,0,0,.45); }
        .lg-feat { color: rgba(255,255,255,.92); }
        .lg-stat__lbl { color: rgba(255,255,255,.7); }
        .lg-copy { color: rgba(255,255,255,.55); }
        .lg-alert { background: rgba(254,226,226,.92); }

        /* Logo image fills its box */
        .lg-fh__logobox { width: 110px; height: 110px; border-radius: 18px; background: transparent; }
        .lg-fh__logoimg { width: 100%; height: 100%; object-fit: cover; transform: scale(1.12); }
        /* Centered sign-in only (left info panel hidden) */
        .lg-left { display: none; }
        .lg-card {
          grid-template-columns: 1fr;
          width: calc(100vw - 40px);
          max-width: 460px;
          height: auto; max-height: none; min-height: 0;
        }
        .lg-right { padding: 40px 36px; }
        @media (max-width: 420px) { .lg-right { padding: 28px 18px; } }
      `}</style>

      <div className="lg-page" style={{ backgroundImage: `linear-gradient(rgba(4,22,10,.30), rgba(4,22,10,.50)), url(${loginBg})` }}>
        <div className="lg-card">
          {/* ════ LEFT ════ */}
          <div className="lg-left">
            <div className="lg-glow-b" />
            <div className="lg-left-inner">
              <div className="lg-logo">
                <div className="lg-logo__box">
                  <img
                    src={LOGO_SRC}
                    alt="Logo"
                    className="lg-logo__img"
                    onError={(e) => e.target.classList.add("errored")}
                  />
                  <img
                    src={logo}
                    alt="Bip Fencing"
                    className="lg-logo__fb"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "8px",
                    }}
                  />
                </div>
                <div>
                  <div className="lg-logo__name">Bip Fencing</div>
                  <div className="lg-logo__sub">Admin Panel</div>
                </div>
              </div>

              <div className="lg-hero">
                <div className="lg-tag">
                  <span className="lg-tag__dot" /> Operations Platform
                </div>
                <h1 className="lg-title">
                  Hello,
                  <br />
                  <em>welcome!</em>
                </h1>
                <p className="lg-desc">
                  Centralised control over attendance, overtime, payroll and
                  branch operations — role-based access for the right people.
                </p>
                <div className="lg-feats">
                  {[
                    ["bi-diagram-3-fill", "Multi-branch"],
                    ["bi-person-badge-fill", "Salary records"],
                    ["bi-clock-history", "Attendance & OT"],
                    ["bi-lock-fill", "Role-based access"],
                  ].map(([icon, label]) => (
                    <div className="lg-feat" key={label}>
                      <i className={`bi ${icon}`} /> {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg-stats">
                {[
                  ["3", "Branches"],
                  ["∞", "Records"],
                  ["99.9%", "Uptime"],
                ].map(([v, l]) => (
                  <div className="lg-stat" key={l}>
                    <span className="lg-stat__val">{v}</span>
                    <span className="lg-stat__lbl">{l}</span>
                  </div>
                ))}
              </div>

              <p className="lg-copy">
                © 2026 Bip Fencing. All rights reserved.
              </p>
            </div>
          </div>

          {/* ════ RIGHT ════ */}
          <div className="lg-right">
            <div className="lg-form-wrap">
              <div className="lg-fh">
                <div className="lg-fh__logobox">
                  <img
                    src={LOGO_SRC}
                    alt="Bip Fencing"
                    className="lg-fh__logoimg"
                    onError={(e) => e.target.classList.add("errored")}
                  />
                  <img
                    src={logo}
                    alt="Bip Fencing"
                    className="lg-fh__logofb"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "8px",
                    }}
                  />
                </div>
                <div className="lg-fh__eyebrow">Welcome back</div>
                <h2 className="lg-fh__title">Sign in to continue</h2>
                <p className="lg-fh__sub">
                  Enter your credentials to access the dashboard
                </p>
              </div>

              {error && (
                <div className="lg-alert" role="alert">
                  <i className="bi bi-exclamation-circle-fill" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="lg-form" noValidate>
                <div className="lg-group">
                  <div className="lg-field">
                    <span className="lg-field__icon">
                      <i className="bi bi-person-fill" />
                    </span>
                    <span className="lg-field__lbl">Username</span>
                    <input
                      className="lg-inp"
                      type="text"
                      placeholder="your_username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                    />
                  </div>
                  <div className="lg-field">
                    <span className="lg-field__icon">
                      <i className="bi bi-lock-fill" />
                    </span>
                    <span className="lg-field__lbl">Password</span>
                    <input
                      className="lg-inp"
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="lg-eye"
                      onClick={() => setShowPass((v) => !v)}
                      tabIndex={-1}
                    >
                      <i
                        className={`bi ${showPass ? "bi-eye-slash" : "bi-eye"}`}
                      />
                    </button>
                  </div>
                </div>

                <button className="lg-btn" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="lg-spin" /> Authenticating…
                    </>
                  ) : (
                    <>
                      Sign In{" "}
                      <i
                        className="bi bi-arrow-right-short"
                        style={{ fontSize: "18px" }}
                      />
                    </>
                  )}
                </button>
              </form>

              <div className="lg-sep">
                <div className="lg-sep__line" />
                <div className="lg-sep__line" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}