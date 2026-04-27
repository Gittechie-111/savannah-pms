import { useState, useEffect } from "react";
import MpesaPayment from './MpesaPayment';

// ─── API LAYER — talks to FastAPI backend via /api/* ─────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = {
  async login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(errorText || "Invalid credentials");
    }
    return res.json();
  },
  async register(name, email, password, role = "tenant") {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(errorText || "Registration failed");
    }
    return res.json();
  },
  async get(path, token) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  },
  async post(path, body, token) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  },
};

// Format currency (e.g., 35000 → "KES 35,000")
const fmt = n => "KES " + Number(n).toLocaleString();

// Format percentage (e.g., 75.5 → "75.5%")
const pct = n => n + "%";

const STATUS_COLORS = {
  Completed: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  Pending:   { bg: "#fef9c3", text: "#713f12", dot: "#eab308" },
  Failed:    { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

// ─── Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.expected));
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:120, padding:"8px 0" }}>
      {data.map((d, i) => {
        const ch = Math.round((d.collected / max) * 100);
        const eh = Math.round((d.expected  / max) * 100);
        return (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:100 }}>
              <div style={{ width:10, height:eh+"%",  background:"#e2e8f0", borderRadius:"3px 3px 0 0" }} />
              <div style={{ width:10, height:ch+"%", background:"linear-gradient(180deg,#10b981,#059669)", borderRadius:"3px 3px 0 0" }} />
            </div>
            <span style={{ fontSize:9, color:"#94a3b8", fontWeight:600 }}>{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────
function Donut({ value, size=72, color="#10b981" }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition:"stroke-dasharray 1s ease" }} />
    </svg>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent="#10b981", donutVal }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"20px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <p style={{ color:"#64748b", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>{label}</p>
        <p style={{ color:"#f1f5f9", fontSize:22, fontWeight:700, letterSpacing:-0.5 }}>{value}</p>
        {sub && <p style={{ color:"#475569", fontSize:12, marginTop:4 }}>{sub}</p>}
      </div>
      {donutVal !== undefined
        ? <div style={{ position:"relative" }}>
            <Donut value={donutVal} color={accent} />
            <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:accent, fontWeight:700 }}>{donutVal}%</span>
          </div>
        : <div style={{ width:44, height:44, borderRadius:12, background:`${accent}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{icon}</div>
      }
    </div>
  );
}

// ─── Transaction Table ────────────────────────────────────────────────────
function TransactionTable({ data }) {
  if (!data || data.length === 0)
    return <p style={{ color:"#475569", textAlign:"center", padding:32, fontSize:13 }}>No transactions found.</p>;
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
            {["Ref","Tenant","Unit","Amount","Method","Status","Date"].map(h => (
              <th key={h} style={{ padding:"12px 14px", color:"#475569", fontSize:11, fontWeight:600, textTransform:"uppercase", textAlign:"left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(t => {
            const sc = STATUS_COLORS[t.status] || STATUS_COLORS.Pending;
            return (
              <tr key={t.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                <td style={{ padding:"12px 14px", color:"#475569", fontSize:11, fontFamily:"monospace" }}>{t.ref}</td>
                <td style={{ padding:"12px 14px", color:"#f1f5f9", fontSize:13, fontWeight:500 }}>{t.tenant}</td>
                <td style={{ padding:"12px 14px", color:"#94a3b8", fontSize:13 }}>{t.unit}</td>
                <td style={{ padding:"12px 14px", color:"#10b981", fontSize:13, fontWeight:600 }}>{fmt(t.amount)}</td>
                <td style={{ padding:"12px 14px", color:"#94a3b8", fontSize:12 }}>{t.method}</td>
                <td style={{ padding:"12px 14px" }}>
                  <span style={{ background:sc.bg, color:sc.text, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, display:"inline-flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:5, height:5, borderRadius:"50%", background:sc.dot, display:"inline-block" }} />
                    {t.status}
                  </span>
                </td>
                <td style={{ padding:"12px 14px", color:"#475569", fontSize:12 }}>{t.date}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setShowPw(false);
    setShowConfirmPw(false);
  };

  const switchMode = (registerMode) => {
    resetForm();
    setIsRegister(registerMode);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      if (isRegister) {
        if (!name.trim() || !email.trim() || !password || !confirmPassword) {
          throw new Error("Please fill in all required fields.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
      }

      if (!isRegister && (!email.trim() || !password)) {
        throw new Error("Enter your email and password.");
      }

      const result = isRegister
        ? await api.register(name.trim(), email.trim(), password)
        : await api.login(email.trim(), password);

      sessionStorage.setItem("token", result.token);
      sessionStorage.setItem("user", JSON.stringify(result.user));
      onLogin(result.user, result.token);
    } catch (err) {
      setError(err.message || (isRegister ? "Registration failed." : "Invalid email or password."));
    } finally {
      setLoading(false);
    }
  };

  const demos = [
    { label:"Admin",      email:"admin@savannah.co.ke",      pw:"admin123" },
    { label:"Accountant", email:"accountant@savannah.co.ke", pw:"account123" },
    { label:"Tenant",     email:"tenant001@savannah.co.ke",  pw:"tenant123" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0a1628", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans','Segoe UI',sans-serif", backgroundImage:"radial-gradient(ellipse at 20% 50%,rgba(16,185,129,0.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(99,102,241,0.08) 0%,transparent 50%)" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}input:focus{outline:none;}`}</style>
      <div style={{ width:"100%", maxWidth:440, padding:24 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:"linear-gradient(135deg,#10b981,#059669)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:"0 8px 32px rgba(16,185,129,0.3)", fontSize:28 }}>🏢</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#f8fafc" }}>Savannah</h1>
          <p style={{ color:"#64748b", fontSize:13, marginTop:4 }}>Property Management System</p>
        </div>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:32 }}>
          <div style={{ display:"flex", gap:8, marginBottom:24, background:"rgba(255,255,255,0.03)", padding:6, borderRadius:12 }}>
            <button
              onClick={() => switchMode(false)}
              style={{ flex:1, padding:"10px 12px", borderRadius:8, border:"none", background:!isRegister ? "linear-gradient(135deg,#10b981,#059669)" : "transparent", color:!isRegister ? "white" : "#94a3b8", fontSize:13, fontWeight:600 }}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode(true)}
              style={{ flex:1, padding:"10px 12px", borderRadius:8, border:"none", background:isRegister ? "linear-gradient(135deg,#10b981,#059669)" : "transparent", color:isRegister ? "white" : "#94a3b8", fontSize:13, fontWeight:600 }}
            >
              Create Account
            </button>
          </div>

          <h2 style={{ color:"#f1f5f9", fontSize:18, fontWeight:600, marginBottom:6 }}>{isRegister ? "Create your account" : "Welcome back"}</h2>
          <p style={{ color:"#475569", fontSize:13, marginBottom:24 }}>{isRegister ? "Register as a tenant to access your dashboard" : "Sign in to access your dashboard"}</p>

          {isRegister && (
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", color:"#94a3b8", fontSize:12, fontWeight:500, marginBottom:6 }}>FULL NAME</label>
              <input value={name} onChange={e=>setName(e.target.value)} type="text" placeholder="John Doe"
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"11px 14px", color:"#f1f5f9", fontSize:14 }} />
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", color:"#94a3b8", fontSize:12, fontWeight:500, marginBottom:6 }}>EMAIL ADDRESS</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@savannah.co.ke"
              style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"11px 14px", color:"#f1f5f9", fontSize:14 }} />
          </div>

          <div style={{ marginBottom:isRegister ? 16 : 20 }}>
            <label style={{ display:"block", color:"#94a3b8", fontSize:12, fontWeight:500, marginBottom:6 }}>PASSWORD</label>
            <div style={{ position:"relative" }}>
              <input value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                type={showPw?"text":"password"} placeholder="••••••••"
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"11px 40px 11px 14px", color:"#f1f5f9", fontSize:14 }} />
              <button type="button" onClick={()=>setShowPw(!showPw)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#64748b", fontSize:16 }}>{showPw?"🙈":"👁"}</button>
            </div>
          </div>

          {isRegister && (
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", color:"#94a3b8", fontSize:12, fontWeight:500, marginBottom:6 }}>CONFIRM PASSWORD</label>
              <div style={{ position:"relative" }}>
                <input value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                  type={showConfirmPw?"text":"password"} placeholder="••••••••"
                  style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"11px 40px 11px 14px", color:"#f1f5f9", fontSize:14 }} />
                <button type="button" onClick={()=>setShowConfirmPw(!showConfirmPw)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#64748b", fontSize:16 }}>{showConfirmPw?"🙈":"👁"}</button>
              </div>
            </div>
          )}

          {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 14px", color:"#fca5a5", fontSize:13, marginBottom:16 }}>⚠️ {error}</div>}

          <button onClick={handleSubmit} disabled={loading} style={{ width:"100%", padding:13, borderRadius:10, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#10b981,#059669)", color:"white", fontSize:14, fontWeight:600, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(16,185,129,0.3)", opacity:loading?0.7:1 }}>
            {loading ? (isRegister ? "Creating account…" : "Signing in…") : (isRegister ? "Create Account →" : "Sign In →")}
          </button>

          <button
            type="button"
            onClick={() => switchMode(!isRegister)}
            style={{ width:"100%", marginTop:14, background:"none", border:"none", color:"#94a3b8", fontSize:12, fontWeight:500 }}
          >
            {isRegister ? "Already have an account? Sign In" : "New user? Create Account"}
          </button>

          {!isRegister && (
            <div style={{ marginTop:24, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:20 }}>
              <p style={{ color:"#475569", fontSize:11, textAlign:"center", marginBottom:10 }}>DEMO ACCOUNTS — CLICK TO FILL</p>
              <div style={{ display:"flex", gap:8 }}>
                {demos.map(d => (
                  <button key={d.label} onClick={()=>{setEmail(d.email);setPassword(d.pw);}}
                    style={{ flex:1, padding:"8px 6px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", color:"#94a3b8", fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:500 }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function Dashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [toast, setToast] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ tenant:"", unit:"", amount:"", method:"M-Pesa" });
  const [stats, setStats] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [properties, setProperties] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [arrears, setArrears] = useState([]);
  const [loading, setLoading] = useState(true);

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  useEffect(() => {
    Promise.all([
      api.get("/api/dashboard/stats", token),
      api.get("/api/dashboard/monthly-collections", token),
      api.get("/api/properties", token),
      api.get("/api/transactions", token),
      api.get("/api/arrears", token),
    ]).then(([s,m,p,t,a]) => { setStats(s);setMonthly(m);setProperties(p);setTransactions(t);setArrears(a); })
      .catch(() => showToast("Cannot reach backend. Run: uvicorn main:app --reload (port 8000)", "error"))
      .finally(() => setLoading(false));
  }, [token]);

  const handlePayment = async () => {
    if (!payForm.tenant || !payForm.amount) { showToast("Fill in all fields","error"); return; }
    try {
      const result = await api.post("/api/payments/initiate", { unit_id:1, amount:parseFloat(payForm.amount), method:payForm.method, tenant_name:payForm.tenant }, token);
      setTransactions(prev => [result.transaction, ...prev]);
      setArrears(prev => prev.filter(a => a.tenant !== payForm.tenant));
      setPayModal(false); setPayForm({tenant:"",unit:"",amount:"",method:"M-Pesa"});
      showToast(`✅ ${result.message}`);
    } catch { showToast("Payment failed. Try again.","error"); }
  };

  const NAV = [
    {id:"overview",label:"Overview",icon:"📊"},
    {id:"transactions",label:"Transactions",icon:"💳"},
    {id:"properties",label:"Properties",icon:"🏢"},
    {id:"arrears",label:"Arrears",icon:"⚠️"},
  ];

  if (user.role === "tenant") return <TenantView user={user} token={token} onLogout={onLogout} />;

  return (
    <div style={{ minHeight:"100vh", background:"#080f1e", fontFamily:"'DM Sans','Segoe UI',sans-serif", display:"flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px;}button{cursor:pointer;font-family:inherit;}input:focus,select:focus{outline:none;}`}</style>

      {/* Sidebar */}
      <div style={{ width:220, background:"rgba(255,255,255,0.03)", borderRight:"1px solid rgba(255,255,255,0.06)", display:"flex", flexDirection:"column", padding:"24px 0", flexShrink:0 }}>
        <div style={{ padding:"0 20px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#10b981,#059669)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏢</div>
            <div>
              <p style={{ color:"#f1f5f9", fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:700 }}>Savannah</p>
              <p style={{ color:"#475569", fontSize:10 }}>Property Mgmt</p>
            </div>
          </div>
        </div>
        <nav style={{ flex:1, padding:"16px 12px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>setActiveTab(n.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, border:"none", marginBottom:2, background:activeTab===n.id?"rgba(16,185,129,0.12)":"none", color:activeTab===n.id?"#10b981":"#64748b", fontSize:13, fontWeight:activeTab===n.id?600:400, textAlign:"left" }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding:"16px 12px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ padding:"10px 12px", marginBottom:8 }}>
            <p style={{ color:"#f1f5f9", fontSize:13, fontWeight:500 }}>{user.name}</p>
            <p style={{ color:"#475569", fontSize:11, textTransform:"capitalize" }}>{user.role}</p>
          </div>
          <button onClick={onLogout} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,0.08)", background:"none", color:"#ef4444", fontSize:12, fontWeight:500, textAlign:"left" }}>← Sign Out</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, overflow:"auto", padding:28 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <div>
            <h1 style={{ color:"#f1f5f9", fontSize:22, fontWeight:700, letterSpacing:-0.5 }}>{NAV.find(n=>n.id===activeTab)?.label}</h1>
            <p style={{ color:"#475569", fontSize:13 }}>April 2025 · Nairobi, Kenya</p>
          </div>
          {(user.role==="admin"||user.role==="accountant") && (
            <button onClick={()=>setPayModal(true)} style={{ padding:"10px 20px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#10b981,#059669)", color:"white", fontSize:13, fontWeight:600, boxShadow:"0 4px 16px rgba(16,185,129,0.25)" }}>
              + Record Payment
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300 }}>
            <p style={{ color:"#475569" }}>Connecting to backend…</p>
          </div>
        ) : (
          <>
            {activeTab==="overview" && stats && (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:16, marginBottom:24 }}>
                  <StatCard label="Total Units"     value={stats.total_units}          sub={`${stats.occupied_units} occupied`} icon="🏠" />
                  <StatCard label="Occupancy Rate"  value={pct(stats.occupancy_rate)}  donutVal={stats.occupancy_rate} accent="#6366f1" />
                  <StatCard label="Collected (Apr)" value={fmt(stats.collected_revenue)} sub={`of ${fmt(stats.expected_revenue)}`} icon="💰" />
                  <StatCard label="Collection Rate" value={pct(stats.collection_rate)} donutVal={stats.collection_rate} accent="#10b981" />
                  <StatCard label="In Arrears"      value={stats.tenants_in_arrears}   sub="tenants" icon="⚠️" accent="#ef4444" />
                  <StatCard label="Properties"      value={stats.total_properties}     sub="across Nairobi" icon="🏢" accent="#f59e0b" />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
                  <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
                    <p style={{ color:"#f1f5f9", fontSize:14, fontWeight:600, marginBottom:4 }}>Monthly Collections</p>
                    <p style={{ color:"#475569", fontSize:12, marginBottom:12 }}>6-month trend</p>
                    <BarChart data={monthly} />
                  </div>
                  <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
                    <p style={{ color:"#f1f5f9", fontSize:14, fontWeight:600, marginBottom:16 }}>Properties Occupancy</p>
                    {properties.map(p => {
                      const occ = Math.round((p.occupied/p.total_units)*100);
                      return (
                        <div key={p.id} style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                            <span style={{ color:"#cbd5e1", fontSize:13, fontWeight:500 }}>{p.name}</span>
                            <span style={{ color:"#10b981", fontSize:12, fontWeight:600 }}>{occ}%</span>
                          </div>
                          <div style={{ height:6, background:"rgba(255,255,255,0.06)", borderRadius:4 }}>
                            <div style={{ height:"100%", width:occ+"%", background:"linear-gradient(90deg,#10b981,#059669)", borderRadius:4 }} />
                          </div>
                          <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                            <span style={{ color:"#475569", fontSize:11 }}>{p.occupied}/{p.total_units} units</span>
                            <span style={{ color:"#475569", fontSize:11 }}>{p.location}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
                  <p style={{ color:"#f1f5f9", fontSize:14, fontWeight:600, marginBottom:16 }}>Recent Transactions</p>
                  <TransactionTable data={transactions.slice(0,5)} />
                </div>
              </div>
            )}

            {activeTab==="transactions" && (
              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
                <p style={{ color:"#f1f5f9", fontSize:14, fontWeight:600, marginBottom:16 }}>All Transactions · {transactions.length} records</p>
                <TransactionTable data={transactions} />
              </div>
            )}

            {activeTab==="properties" && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
                {properties.map(p => {
                  const occ = Math.round((p.occupied/p.total_units)*100);
                  return (
                    <div key={p.id} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                        <div>
                          <p style={{ color:"#f1f5f9", fontSize:15, fontWeight:600 }}>{p.name}</p>
                          <p style={{ color:"#475569", fontSize:12, marginTop:2 }}>📍 {p.location}</p>
                        </div>
                        <div style={{ width:44, height:44, borderRadius:12, background:"rgba(16,185,129,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🏢</div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                        {[["Total",p.total_units,"#6366f1"],["Occupied",p.occupied,"#10b981"],["Vacant",p.total_units-p.occupied,"#f59e0b"]].map(([l,v,c])=>(
                          <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:12 }}>
                            <p style={{ color:"#475569", fontSize:10, fontWeight:600, textTransform:"uppercase" }}>{l}</p>
                            <p style={{ color:c, fontSize:16, fontWeight:700, marginTop:3 }}>{v}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ height:6, background:"rgba(255,255,255,0.06)", borderRadius:4 }}>
                        <div style={{ height:"100%", width:occ+"%", background:"linear-gradient(90deg,#10b981,#059669)", borderRadius:4 }} />
                      </div>
                      <p style={{ color:"#10b981", fontSize:12, fontWeight:600, marginTop:6, textAlign:"right" }}>{occ}% occupied</p>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab==="arrears" && (
              <div>
                <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:12, padding:"14px 18px", marginBottom:20, display:"flex", gap:12, alignItems:"center" }}>
                  <span style={{ fontSize:20 }}>⚠️</span>
                  <div>
                    <p style={{ color:"#fca5a5", fontSize:13, fontWeight:600 }}>{arrears.length} Tenants in Arrears</p>
                    <p style={{ color:"#ef444480", fontSize:12 }}>Outstanding: {fmt(arrears.reduce((s,a)=>s+a.balance,0))}</p>
                  </div>
                </div>
                <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                        {["Tenant","Unit","Rent (KES)","Balance (KES)","Action"].map(h=>(
                          <th key={h} style={{ padding:"14px 16px", color:"#475569", fontSize:11, fontWeight:600, textTransform:"uppercase", textAlign:"left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {arrears.map((a,i)=>(
                        <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"14px 16px", color:"#f1f5f9", fontSize:13, fontWeight:500 }}>{a.tenant}</td>
                          <td style={{ padding:"14px 16px", color:"#94a3b8", fontSize:13 }}>{a.unit_number}</td>
                          <td style={{ padding:"14px 16px", color:"#94a3b8", fontSize:13 }}>{a.rent_amount?.toLocaleString()}</td>
                          <td style={{ padding:"14px 16px" }}><span style={{ color:"#ef4444", fontWeight:700, fontSize:13 }}>{a.balance?.toLocaleString()}</span></td>
                          <td style={{ padding:"14px 16px" }}>
                            <button onClick={()=>{setPayForm({tenant:a.tenant,unit:a.unit_number,amount:a.balance,method:"M-Pesa"});setPayModal(true);}}
                              style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #10b981", background:"none", color:"#10b981", fontSize:11, fontWeight:600 }}>Record Payment</button>
                          </td>
                        </tr>
                      ))}
                      {arrears.length===0 && <tr><td colSpan={5} style={{ padding:40, textAlign:"center", color:"#475569", fontSize:13 }}>🎉 No tenants in arrears</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Modal */}
      {payModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
          <div style={{ background:"#111827", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:28, width:420 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <h3 style={{ color:"#f1f5f9", fontSize:16, fontWeight:600 }}>Record Payment</h3>
              <button onClick={()=>setPayModal(false)} style={{ background:"none", border:"none", color:"#64748b", fontSize:20 }}>×</button>
            </div>
            {[["Tenant Name","text","tenant","e.g. James Mwangi"],["Unit Number","text","unit","e.g. A-101"],["Amount (KES)","number","amount","e.g. 35000"]].map(([lbl,type,key,ph])=>(
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ display:"block", color:"#94a3b8", fontSize:11, fontWeight:600, marginBottom:5, textTransform:"uppercase" }}>{lbl}</label>
                <input type={type} value={payForm[key]} onChange={e=>setPayForm(p=>({...p,[key]:e.target.value}))} placeholder={ph}
                  style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px 14px", color:"#f1f5f9", fontSize:13 }} />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", color:"#94a3b8", fontSize:11, fontWeight:600, marginBottom:5, textTransform:"uppercase" }}>Payment Method</label>
              <select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))}
                style={{ width:"100%", background:"#1e293b", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px 14px", color:"#f1f5f9", fontSize:13 }}>
                {["M-Pesa","Airtel Money","Bank Transfer","Card"].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setPayModal(false)} style={{ flex:1, padding:11, borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#94a3b8", fontSize:13 }}>Cancel</button>
              <button onClick={handlePayment} style={{ flex:2, padding:11, borderRadius:10, border:"none", background:"linear-gradient(135deg,#10b981,#059669)", color:"white", fontSize:13, fontWeight:600 }}>Confirm Payment →</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:200, background:toast.type==="error"?"#ef4444":"#10b981", color:"white", padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:500, boxShadow:"0 8px 32px rgba(0,0,0,0.4)", maxWidth:380 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Tenant View ──────────────────────────────────────────────────────────
function TenantView({ user, token, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMpesaPayment, setShowMpesaPayment] = useState(false); // ← ADD THIS



  useEffect(() => {
    api.get("/api/transactions", token)
      .then(data => setTransactions(data.filter(t => t.tenant === user.name)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const paid = transactions.filter(t=>t.status==="Completed").reduce((s,t)=>s+t.amount, 0);
  
  // Get rent amount (you may need to fetch this from API)
  
  // const rentAmount = 35000; // Default rent amount - you can fetch from /api/units
  // const tenantId = user.id;
  // const propertyId = 1; // You can fetch actual property ID from API

  // NEW CODE (fetch real data)
  const [rentAmount, setRentAmount] = useState(35000);
  const [propertyId, setPropertyId] = useState(1);
  const [unitNumber, setUnitNumber] = useState("A-101");

  useEffect(() => {
    // Fetch tenant's unit info
    api.get("/api/units", token)
      .then(units => {
        // Find unit assigned to this tenant
        const myUnit = units.find(u => u.tenant === user.name);
        if (myUnit) {
          setRentAmount(myUnit.rent_amount);
          setPropertyId(myUnit.property_id);
          setUnitNumber(myUnit.unit_number);
        }
      })
      .catch(err => console.error("Failed to fetch unit:", err));
  }, [token, user.name]);

  // Function to refresh dashboard after payment
  const refreshTransactions = () => {
    api.get("/api/transactions", token)
      .then(data => setTransactions(data.filter(t => t.tenant === user.name)))
      .catch(() => {});
  };

  return (
    <div style={{ minHeight:"100vh", background:"#080f1e", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{ maxWidth:700, margin:"0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <div>
            <h1 style={{ color:"#f1f5f9", fontFamily:"'Playfair Display',serif", fontSize:22 }}>Tenant Portal</h1>
            <p style={{ color:"#475569", fontSize:13, marginTop:2 }}>Welcome, {user.name}</p>
          </div>
          <button onClick={onLogout} style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#94a3b8", fontSize:12 }}>Sign Out</button>
        </div>
        
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:24 }}>
          {[["My Unit","A-101","🏠"],["Rent Amount",fmt(rentAmount),"💰"],["Total Paid",fmt(paid),"✅"]].map(([l,v,ic])=>(
            <div key={l} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
              <p style={{ color:"#475569", fontSize:11, fontWeight:600, textTransform:"uppercase", marginBottom:8 }}>{ic} {l}</p>
              <p style={{ color:"#f1f5f9", fontSize:18, fontWeight:700 }}>{v}</p>
            </div>
          ))}
        </div>

        {/* ========== ADD M-PESA PAYMENT BUTTON HERE ========== */}
        {!showMpesaPayment ? (
          <div style={{ marginBottom:24 }}>
            <button
              onClick={() => setShowMpesaPayment(true)}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#10b981,#059669)",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}
            >
              💳 Pay Rent with M-Pesa
            </button>
          </div>
        ) : (
          <div style={{ marginBottom:24 }}>
            <MpesaPayment
              tenantId={user.id}
              amount={rentAmount}
              propertyId={propertyId}
              onSuccess={() => {
                setShowMpesaPayment(false);
                refreshTransactions();
                alert("✅ Payment successful! Your rent has been updated.");
              }}
              onError={(error) => {
                console.error("Payment error:", error);
                alert("❌ Payment failed. Please try again.");
              }}
            />
            <button
              onClick={() => setShowMpesaPayment(false)}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "8px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "none",
                color: "#64748b",
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {/* ========== END M-PESA PAYMENT SECTION ========== */}

        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
          <p style={{ color:"#f1f5f9", fontSize:14, fontWeight:600, marginBottom:16 }}>My Payment History</p>
          {loading ? <p style={{ color:"#475569", textAlign:"center", padding:24 }}>Loading…</p> : <TransactionTable data={transactions} />}
        </div>
      </div>
    </div>
  );
}



// ─── Tenant View ──────────────────────────────────────────────────────────
// function TenantView({ user, token, onLogout }) {
//   const [transactions, setTransactions] = useState([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     api.get("/api/transactions", token)
//       .then(data => setTransactions(data.filter(t => t.tenant === user.name)))
//       .catch(() => {})
//       .finally(() => setLoading(false));
//   }, [token]);

//   const paid = transactions.filter(t=>t.status==="Completed").reduce((s,t)=>s+t.amount,0);

//   return (
//     <div style={{ minHeight:"100vh", background:"#080f1e", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:24 }}>
//       <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
//       <div style={{ maxWidth:700, margin:"0 auto" }}>
//         <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
//           <div>
//             <h1 style={{ color:"#f1f5f9", fontFamily:"'Playfair Display',serif", fontSize:22 }}>Tenant Portal</h1>
//             <p style={{ color:"#475569", fontSize:13, marginTop:2 }}>Welcome, {user.name}</p>
//           </div>
//           <button onClick={onLogout} style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#94a3b8", fontSize:12 }}>Sign Out</button>
//         </div>
//         <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:24 }}>
//           {[["My Unit","A-101","🏠"],["Rent Amount","KES 35,000","💰"],["Total Paid",fmt(paid),"✅"]].map(([l,v,ic])=>(
//             <div key={l} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
//               <p style={{ color:"#475569", fontSize:11, fontWeight:600, textTransform:"uppercase", marginBottom:8 }}>{ic} {l}</p>
//               <p style={{ color:"#f1f5f9", fontSize:18, fontWeight:700 }}>{v}</p>
//             </div>
//           ))}
//         </div>
//         <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22 }}>
//           <p style={{ color:"#f1f5f9", fontSize:14, fontWeight:600, marginBottom:16 }}>My Payment History</p>
//           {loading ? <p style={{ color:"#475569", textAlign:"center", padding:24 }}>Loading…</p> : <TransactionTable data={transactions} />}
//         </div>
//       </div>
//     </div>
//   );
// }

// ═══════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const t = sessionStorage.getItem("token");
    const u = sessionStorage.getItem("user");
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
  }, []);

  const handleLogin = (u, t) => {
    sessionStorage.setItem("token", t); sessionStorage.setItem("user", JSON.stringify(u));
    setUser(u); setToken(t);
  };
  const handleLogout = () => {
    sessionStorage.clear(); setUser(null); setToken(null);
  };

  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
