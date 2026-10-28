import { useState } from "react";
import { useNavigate } from "react-router-dom";
import fenceBg from "../assets/fence-bg.webp";

export default function BranchSelection() {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const navigate = useNavigate();

  // Real branch ids (same as the database / topbar): 1 Kadambankulam, 2 Fencing Group, 3 Panagudi
  const branches = [
    {
      id: 1,
      name: "Kadambankulam",
      code: "KBM",
      location: "BIP Fencing Kadambankulam",
      color: "#34d399",
    },
    {
      id: 2,
      name: "Fencing Group",
      code: "NRI",
      location: "BIP Fencing Fencing Group",
      color: "#38bdf8",
    },
    {
      id: 3,
      name: "Panagudi",
      code: "PNG",
      location: "BIP Fencing Panagudi",
      color: "#c4b5fd",
    },
  ];

  const handleSubmit = () => {
    if (!selectedBranch) return;

    const branch = branches.find((b) => b.id === selectedBranch);
    if (!branch) return;

    localStorage.setItem("admin_view_branch", String(selectedBranch));
    localStorage.setItem("admin_view_branch_name", branch.name);
    navigate("/dashboard");
  };

  const handleViewAllBranches = () => {
    localStorage.removeItem("admin_view_branch");
    localStorage.removeItem("admin_view_branch_name");
    navigate("/dashboard");
  };

  return (
    <div className="branch-selection-page" style={{ "--fence": `url(${fenceBg})` }}>
      <div className="selection-container">
        <div className="selection-header">
          <div className="logo-wrapper">
            <div className="logo-icon">
              <i className="bi bi-shield-lock-fill" aria-hidden="true"></i>
            </div>
            <h1>Bip Fencing Admin</h1>
            <p>SECURE ACCESS PORTAL</p>
          </div>
          <h2>Select Branch to Manage</h2>
          <p className="subtext">
            You are logged in as Administrator. Choose which branch you want to
            monitor.
          </p>
        </div>

        <div className="branch-cards">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className={`branch-card ${selectedBranch === branch.id ? "selected" : ""}`}
              onClick={() => setSelectedBranch(branch.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedBranch(branch.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={selectedBranch === branch.id}
            >
              <div
                className="branch-icon"
                style={{ color: branch.color }}
              >
                <i className="bi bi-shop" aria-hidden="true"></i>
              </div>
              <div className="branch-info">
                <h3>{branch.name}</h3>
                <span className="branch-code">{branch.code}</span>
                <p className="branch-location">
                  <i className="bi bi-geo-alt-fill" aria-hidden="true"></i>
                  {branch.location}
                </p>
              </div>
              <div className="selection-indicator">
                {selectedBranch === branch.id && (
                  <i
                    className="bi bi-check-circle-fill"
                    style={{ color: branch.color }}
                    aria-label="Selected"
                  ></i>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="selection-actions">
          <button
            className="btn-continue"
            onClick={handleSubmit}
            disabled={!selectedBranch}
          >
            Continue to Dashboard <i className="bi bi-arrow-right-short" aria-hidden="true"></i>
          </button>
          <button className="btn-skip" onClick={handleViewAllBranches}>
            View All Branches
          </button>
        </div>
      </div>

      <style>{`
        .branch-selection-page {
          min-height: 100vh;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background:
            linear-gradient(135deg, rgba(5, 25, 14, 0.55) 0%, rgba(10, 45, 26, 0.25) 100%),
            var(--fence) center / cover no-repeat fixed;
          overflow: hidden;
        }

        .selection-container {
          position: relative;
          max-width: 1100px;
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          -webkit-backdrop-filter: blur(5px) saturate(140%);
          backdrop-filter: blur(5px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 32px;
          box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.35);
          padding: 2.5rem;
          color: #fff;
        }

        .selection-header { text-align: center; margin-bottom: 2rem; }
        .logo-wrapper { margin-bottom: 1.5rem; }

        .logo-icon {
          width: 60px;
          height: 60px;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.4);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          border-radius: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        .logo-icon i { font-size: 28px; color: #fff; }

        .selection-header h1 { font-size: 26px; font-weight: 800; color: #fff; margin: 0 0 0.25rem; text-shadow: 0 2px 10px rgba(0,0,0,.35); }
        .logo-wrapper > p { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,.75); font-weight: 600; margin: 0; }
        .selection-header h2 { font-size: 28px; font-weight: 700; color: #fff; margin: 1.5rem 0 0.5rem; text-shadow: 0 2px 10px rgba(0,0,0,.35); }
        .subtext { font-size: 15px; color: rgba(255,255,255,.85); max-width: 520px; margin: 0 auto; }

        .branch-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.25rem;
          margin-bottom: 2.25rem;
        }

        .branch-card {
          background: rgba(255, 255, 255, 0.08);
          -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 20px;
          padding: 1.4rem;
          cursor: pointer;
          transition: all 0.25s ease;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .branch-card:hover {
          transform: translateY(-4px);
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.55);
          box-shadow: 0 14px 30px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,.4);
        }
        .branch-card:focus-visible { outline: 3px solid #6ee7b7; outline-offset: 3px; }
        .branch-card.selected {
          background: rgba(52, 211, 153, 0.25);
          border-color: #6ee7b7;
          box-shadow: 0 0 0 2px rgba(110, 231, 183, 0.5), 0 14px 30px -10px rgba(0, 0, 0, 0.5);
        }

        .branch-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.35);
        }
        .branch-icon i { font-size: 24px; }
        .branch-info { flex: 1; min-width: 0; }
        .branch-info h3 { font-size: 18px; font-weight: 700; margin: 0 0 4px; color: #fff; }
        .branch-code {
          font-size: 11px; font-weight: 700; color: #fff;
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 9px; border-radius: 20px; display: inline-block; margin-bottom: 8px;
        }
        .branch-location { font-size: 13px; color: rgba(255,255,255,.85); margin: 0; display: flex; align-items: flex-start; gap: 4px; }
        .branch-location i { font-size: 11px; color: rgba(255,255,255,.7); margin-top: 3px; }
        .selection-indicator { margin-left: auto; }
        .selection-indicator i { font-size: 22px; }

        .selection-actions { display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; }

        .btn-continue {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.35);
          padding: 12px 28px;
          border-radius: 40px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 8px 20px rgba(5, 150, 105, 0.4);
          transition: transform 0.15s, box-shadow 0.2s;
        }
        .btn-continue:hover:not(:disabled) { transform: scale(1.03); box-shadow: 0 10px 26px rgba(5,150,105,.55); }
        .btn-continue:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-skip {
          background: rgba(255, 255, 255, 0.14);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.4);
          padding: 12px 28px;
          border-radius: 40px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-skip:hover { background: rgba(255, 255, 255, 0.26); }

        @media (max-width: 700px) {
          .branch-selection-page { padding: 1rem; background-attachment: scroll; }
          .selection-container { padding: 1.5rem; border-radius: 24px; }
          .branch-cards { grid-template-columns: 1fr; gap: 1rem; }
          .selection-header h2 { font-size: 22px; }
          .selection-header h1 { font-size: 21px; }
          .btn-continue, .btn-skip { width: 100%; justify-content: center; }
          .selection-actions { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}