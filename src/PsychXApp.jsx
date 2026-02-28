import { useState, useEffect, useRef, Component } from "react";

// ─── Error Boundary ────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, background: "#fef2f2", borderRadius: 16, border: "2px solid #fecaca", margin: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 16, fontFamily: "monospace", background: "#fff", padding: 12, borderRadius: 8 }}>
          {this.state.error?.message || "Unknown error"}
        </div>
        <button onClick={() => this.setState({ error: null })}
          style={{ padding: "8px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
          Try Again
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ─── Storage ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "psychx_patients_v2";
async function loadPatients() {
  try { const r = await window.storage.get(STORAGE_KEY); return r ? JSON.parse(r.value) : []; }
  catch { return []; }
}
async function savePatients(patients) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(patients)); } catch {}
}

// ─── Constants ─────────────────────────────────────────────────────────────
const PHQ9_QUESTIONS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead, or of hurting yourself in some way"
];
const PHQ9_OPTIONS = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

const ANTIDEPRESSANTS = [
  "Fluoxetine (Prozac)", "Sertraline (Zoloft)", "Escitalopram (Lexapro)",
  "Citalopram (Celexa)", "Paroxetine (Paxil)", "Fluvoxamine (Luvox)",
  "Venlafaxine (Effexor)", "Duloxetine (Cymbalta)", "Desvenlafaxine (Pristiq)",
  "Bupropion (Wellbutrin)", "Mirtazapine (Remeron)", "Amitriptyline",
  "Nortriptyline", "Imipramine", "Phenelzine (Nardil)", "Tranylcypromine (Parnate)",
  "Selegiline (EMSAM)", "Trazodone", "Vilazodone (Viibryd)", "Vortioxetine (Trintellix)",
  "Levomilnacipran (Fetzima)", "Lithium augmentation", "Other"
];

const SIDE_EFFECTS = [
  "Dissociation", "Dizziness", "Nausea", "Sedation", "Headache",
  "Blood pressure elevation", "Anxiety", "Vomiting", "Vertigo", "None observed"
];

const PA_STATUSES = ["Pending", "Approved", "Denied", "Under Appeal", "Reauth Due", "Expired"];
const DENIAL_REASONS = [
  "Missing information / errors",
  "Diagnosis-related denial",
  "Wrong benefit submitted",
  "Step therapy required",
  "Must be prescribed by psychiatrist",
  "Specialty pharmacy out-of-network",
  "Not medically necessary",
  "Other"
];

function phq9Severity(score) {
  if (score <= 4) return { label: "Minimal", color: "#22c55e", bg: "#f0fdf4" };
  if (score <= 9) return { label: "Mild", color: "#84cc16", bg: "#f7fee7" };
  if (score <= 14) return { label: "Moderate", color: "#f59e0b", bg: "#fffbeb" };
  if (score <= 19) return { label: "Moderately Severe", color: "#f97316", bg: "#fff7ed" };
  return { label: "Severe", color: "#ef4444", bg: "#fef2f2" };
}

function sessionPhase(num) {
  if (num <= 8) return { label: "Induction", color: "#1a7fa8", bg: "#f0f9ff" };
  if (num <= 16) return { label: "Early Maintenance", color: "#7c3aed", bg: "#faf5ff" };
  return { label: "Ongoing Maintenance", color: "#059669", bg: "#f0fdf4" };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function paUrgency(pa) {
  if (!pa.expirationDate || pa.status === "Denied" || pa.status === "Expired") return null;
  const days = daysUntil(pa.expirationDate);
  if (days === null) return null;
  if (days < 0) return { label: "Expired", color: "#dc2626", bg: "#fef2f2" };
  if (days <= 14) return { label: `${days}d left`, color: "#dc2626", bg: "#fef2f2" };
  if (days <= 30) return { label: `${days}d left`, color: "#f59e0b", bg: "#fffbeb" };
  return { label: `${days}d left`, color: "#059669", bg: "#f0fdf4" };
}

const emptySession = (num) => ({
  id: Date.now().toString(),
  sessionNumber: num,
  date: new Date().toISOString().split("T")[0],
  dose: "56mg",
  bpPreSystolic: "", bpPreDiastolic: "",
  bpPost40Systolic: "", bpPost40Diastolic: "",
  bpPostSystolic: "", bpPostDiastolic: "",
  pulseOxPre: "", pulseOxDuring: "", pulseOxPost: "",
  sideEffects: [],
  sideEffectNotes: "",
  patientTolerance: "Good",
  remsFormSubmitted: false,
  sae: false,
  saeDescription: "",
  clinicalNotes: "",
  transportArranged: true,
  discharged: false
});

const emptyPA = () => ({
  id: Date.now().toString(),
  submittedDate: new Date().toISOString().split("T")[0],
  payer: "",
  benefitType: "medical",
  authNumber: "",
  status: "Pending",
  startDate: "",
  expirationDate: "",
  denialReason: "",
  appealDate: "",
  appealNotes: "",
  reauthSubmittedDate: "",
  notes: ""
});

const emptyPatient = () => ({
  id: Date.now().toString(),
  createdAt: new Date().toISOString(),
  status: "intake",
  firstName: "", lastName: "", dob: "", gender: "", phone: "", email: "",
  address: "", city: "", state: "", zip: "",
  insurerName: "", planType: "commercial", policyHolder: "", policyId: "", groupNumber: "",
  insuranceCardFront: null, insuranceCardBack: null,
  diagnosisCode: "F33.2", diagnosisDate: "",
  trialOne: { drug: "", dose: "", duration: "", reason: "" },
  trialTwo: { drug: "", dose: "", duration: "", reason: "" },
  psychotherapy: "", psychiatristConsult: false, psychiatristName: "",
  contraindications: { aneurysm: false, avmHistory: false, ich: false, hypersensitivity: false },
  hypertension: false, substanceHistory: false, psychosisHistory: false,
  concomitantMeds: "",
  phq9: Array(9).fill(null), phq9Date: "",
  remsEnrolled: false, withMeEnrolled: false,
  sessions: [],
  paRecords: [],
  notes: ""
});

// ─── Styles ────────────────────────────────────────────────────────────────
const C = {
  teal: "#1a7fa8", tealDark: "#0d5f80", tealLight: "#f0f9ff",
  navy: "#0d1f35", navyMid: "#1a3550",
  green: "#059669", greenLight: "#f0fdf4",
  amber: "#f59e0b", amberLight: "#fffbeb",
  red: "#dc2626", redLight: "#fef2f2",
  purple: "#7c3aed", purpleLight: "#faf5ff",
  gray50: "#f8fafc", gray100: "#f1f5f9", gray200: "#e2e8f0",
  gray400: "#94a3b8", gray500: "#64748b", gray700: "#334155", gray900: "#1a2332"
};

const S = {
  app: { fontFamily: "'DM Sans','Helvetica Neue',sans-serif", background: C.gray50, minHeight: "100vh", color: C.gray900 },
  sidebar: {
    width: 260, background: `linear-gradient(180deg, ${C.navy} 0%, ${C.navyMid} 100%)`,
    minHeight: "100vh", display: "flex", flexDirection: "column",
    position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100,
    boxShadow: "4px 0 24px rgba(0,0,0,0.18)"
  },
  main: { marginLeft: 260, minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: {
    background: "#fff", borderBottom: `1px solid ${C.gray200}`,
    padding: "0 32px", height: 64,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    position: "sticky", top: 0, zIndex: 50,
    boxShadow: "0 1px 8px rgba(0,0,0,0.06)"
  },
  content: { padding: "28px 32px", flex: 1 },
  card: {
    background: "#fff", borderRadius: 16, padding: "24px 28px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    border: `1px solid ${C.gray200}`, marginBottom: 20
  },
  btn: (v = "primary") => ({
    padding: "9px 20px", borderRadius: 10, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
    ...(v === "primary" ? { background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, color: "#fff", boxShadow: `0 2px 8px ${C.teal}40` }
      : v === "success" ? { background: `linear-gradient(135deg,${C.green},#047857)`, color: "#fff", boxShadow: `0 2px 8px ${C.green}40` }
      : v === "danger" ? { background: C.redLight, color: C.red, border: `1px solid #fecaca` }
      : v === "amber" ? { background: C.amberLight, color: "#92400e", border: `1px solid #fde68a` }
      : v === "ghost" ? { background: "transparent", color: C.gray500, border: `1px solid ${C.gray200}` }
      : { background: C.gray100, color: "#475569", border: `1px solid ${C.gray200}` })
  }),
  input: {
    width: "100%", padding: "9px 13px", borderRadius: 10,
    border: `1.5px solid ${C.gray200}`, fontSize: 13,
    fontFamily: "inherit", color: C.gray900, background: "#fff",
    outline: "none", transition: "border-color 0.15s", boxSizing: "border-box"
  },
  label: { fontSize: 11, fontWeight: 700, color: C.gray500, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: C.gray900, marginBottom: 18, paddingBottom: 10, borderBottom: `2px solid ${C.gray100}` },
  badge: (color) => ({
    display: "inline-flex", alignItems: "center", padding: "3px 10px",
    borderRadius: 20, fontSize: 11, fontWeight: 700,
    background: color === "green" ? "#dcfce7" : color === "amber" ? "#fef3c7"
      : color === "red" ? "#fee2e2" : color === "blue" ? "#dbeafe"
      : color === "purple" ? "#ede9fe" : "#f1f5f9",
    color: color === "green" ? "#166534" : color === "amber" ? "#92400e"
      : color === "red" ? "#991b1b" : color === "blue" ? "#1e40af"
      : color === "purple" ? "#5b21b6" : "#475569"
  })
};

// ─── UI primitives ─────────────────────────────────────────────────────────
function Input({ value, onChange, placeholder, type = "text", style = {}, disabled }) {
  const [focused, setFocused] = useState(false);
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} disabled={disabled}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={{ ...S.input, borderColor: focused ? C.teal : C.gray200, opacity: disabled ? 0.6 : 1, ...style }} />;
}

function Select({ value, onChange, options, style = {} }) {
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)}
      style={{ ...S.input, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 36, ...style }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

function Checkbox({ checked, onChange, label, size = 20 }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.gray700 }}>
      <div onClick={() => onChange(!checked)} style={{
        width: size, height: size, borderRadius: 6,
        border: `2px solid ${checked ? C.teal : "#cbd5e1"}`,
        background: checked ? C.teal : "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s", flexShrink: 0, cursor: "pointer"
      }}>
        {checked && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
      </div>
      {label}
    </label>
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  const [focused, setFocused] = useState(false);
  return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={{ ...S.input, resize: "vertical", lineHeight: 1.6, borderColor: focused ? C.teal : C.gray200 }} />;
}

function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

function VitalsInput({ label, systolic, diastolic, onSys, onDia, ox, onOx, type = "bp" }) {
  if (type === "ox") return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Input value={ox} onChange={onOx} placeholder="98" style={{ width: 80 }} />
        <span style={{ fontSize: 13, color: C.gray500 }}>%</span>
      </div>
    </div>
  );
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Input value={systolic} onChange={onSys} placeholder="120" style={{ width: 70 }} />
        <span style={{ fontSize: 16, color: C.gray400, fontWeight: 700 }}>/</span>
        <Input value={diastolic} onChange={onDia} placeholder="80" style={{ width: 70 }} />
        <span style={{ fontSize: 11, color: C.gray500 }}>mmHg</span>
      </div>
    </div>
  );
}

function MultiSelect({ options, selected, onChange, label }) {
  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  return (
    <div>
      {label && <label style={S.label}>{label}</label>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map(opt => {
          const active = selected.includes(opt);
          return (
            <div key={opt} onClick={() => toggle(opt)} style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s",
              background: active ? C.teal : C.gray100,
              color: active ? "#fff" : C.gray500,
              border: `1.5px solid ${active ? C.teal : C.gray200}`
            }}>{opt}</div>
          );
        })}
      </div>
    </div>
  );
}

function ImageCapture({ label, value, onChange }) {
  const ref = useRef();
  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input type="file" ref={ref} accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
      {value ? (
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `2px solid ${C.teal}` }}>
          <img src={value} alt={label} style={{ width: "100%", maxHeight: 150, objectFit: "cover", display: "block" }} />
          <button onClick={() => onChange(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, color: "#fff", padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>Remove</button>
        </div>
      ) : (
        <div onClick={() => ref.current?.click()} style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "24px 20px", textAlign: "center", cursor: "pointer", background: C.gray50 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📷</div>
          <div style={{ fontSize: 12, color: C.gray500, fontWeight: 500 }}>Click to capture or upload</div>
        </div>
      )}
    </div>
  );
}

// ─── PHQ-9 ─────────────────────────────────────────────────────────────────
function PHQ9Form({ answers, onChange, date, onDateChange }) {
  const score = answers.reduce((s, v) => s + (v ?? 0), 0);
  const answered = answers.filter(v => v !== null).length;
  const complete = answered === 9;
  const sev = complete ? phq9Severity(score) : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={S.sectionTitle}>PHQ-9 Depression Screening</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ ...S.label, margin: 0 }}>Date</label>
          <input type="date" value={date ?? ""} onChange={e => onDateChange(e.target.value)} style={{ ...S.input, width: "auto" }} />
        </div>
      </div>
      <div style={{ background: C.gray50, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.gray500 }}>
        Over the <strong>last 2 weeks</strong>, how often have you been bothered by any of the following problems?
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 90px)", gap: 6, padding: "6px 10px", marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textTransform: "uppercase" }}>Question</div>
        {PHQ9_OPTIONS.map((o, i) => <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textAlign: "center", textTransform: "uppercase" }}>{o}<br />({i})</div>)}
      </div>
      {PHQ9_QUESTIONS.map((q, qi) => (
        <div key={qi} style={{
          display: "grid", gridTemplateColumns: "1fr repeat(4, 90px)", gap: 6,
          padding: "12px 10px", borderRadius: 8, marginBottom: 3,
          background: answers[qi] !== null ? "#f0f9ff" : qi % 2 === 0 ? C.gray50 : "#fff",
          border: `1px solid ${answers[qi] !== null ? "#bae6fd" : C.gray100}`, alignItems: "center"
        }}>
          <div style={{ fontSize: 13, color: C.gray700, lineHeight: 1.4 }}>
            <span style={{ color: C.gray400, marginRight: 6, fontWeight: 700 }}>{qi + 1}.</span>{q}
          </div>
          {[0, 1, 2, 3].map(val => (
            <div key={val} style={{ display: "flex", justifyContent: "center" }}>
              <div onClick={() => { const a = [...answers]; a[qi] = val; onChange(a); }} style={{
                width: 20, height: 20, borderRadius: "50%",
                border: `2px solid ${answers[qi] === val ? C.teal : "#cbd5e1"}`,
                background: answers[qi] === val ? C.teal : "#fff",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                {answers[qi] === val && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
            </div>
          ))}
        </div>
      ))}
      {complete && sev && (
        <div style={{ marginTop: 16, padding: "18px 22px", borderRadius: 12, background: sev.bg, border: `2px solid ${sev.color}30`, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: sev.color, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 10, color: C.gray500, fontWeight: 700, textTransform: "uppercase", marginTop: 3 }}>Score</div>
          </div>
          <div style={{ width: 1, height: 50, background: C.gray200 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: sev.color }}>{sev.label} Depression</div>
            <div style={{ fontSize: 12, color: C.gray500, marginTop: 3 }}>
              {score >= 10 ? "PHQ-9 ≥10 supports Spravato candidacy evaluation" : "PHQ-9 <10 — reassess clinical picture for TRD eligibility"}
            </div>
          </div>
          {answers[8] > 0 && (
            <div style={{ padding: "10px 14px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red }}>⚠ Q9 Positive</div>
              <div style={{ fontSize: 11, color: C.red }}>Safety assessment required</div>
            </div>
          )}
        </div>
      )}
      {!complete && answered > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.gray400, textAlign: "center" }}>{answered}/9 answered</div>
      )}
    </div>
  );
}

// ─── Session Tracker ───────────────────────────────────────────────────────
function SessionTracker({ patient, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [session, setSession] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const upd = (field, value) => setSession(prev => ({ ...prev, [field]: value }));

  const startNew = () => {
    setSession(emptySession(patient.sessions.length + 1));
    setAdding(true);
  };

  const saveSession = () => {
    const updated = { ...patient, sessions: [...patient.sessions, session] };
    onUpdate(updated);
    setAdding(false);
    setSession(null);
  };

  const deleteSession = (id) => {
    if (!confirm("Delete this session record?")) return;
    onUpdate({ ...patient, sessions: patient.sessions.filter(s => s.id !== id) });
  };

  const sessions = [...(patient.sessions || [])].sort((a, b) => b.sessionNumber - a.sessionNumber);
  const remsUnsent = patient.sessions.filter(s => !s.remsFormSubmitted).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={S.sectionTitle}>Session Log</div>
          <div style={{ display: "flex", gap: 10, marginTop: -10 }}>
            <span style={{ fontSize: 13, color: C.gray500 }}>{patient.sessions.length} session{patient.sessions.length !== 1 ? "s" : ""} recorded</span>
            {remsUnsent > 0 && <span style={{ ...S.badge("red"), fontSize: 11 }}>⚠ {remsUnsent} REMS form{remsUnsent > 1 ? "s" : ""} pending</span>}
          </div>
        </div>
        {!adding && <button onClick={startNew} style={S.btn()}>+ Log New Session</button>}
      </div>

      {/* New session form */}
      {adding && session && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, background: "#f9feff" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 18 }}>
            Session #{session.sessionNumber} — {sessionPhase(session.sessionNumber).label}
            <span style={{ ...S.badge("blue"), marginLeft: 10 }}>{sessionPhase(session.sessionNumber).label}</span>
          </div>

          {/* Row 1: Date + Dose */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <Field label="Session Date">
              <Input type="date" value={session.date} onChange={v => upd("date", v)} />
            </Field>
            <Field label="Dose Administered">
              <Select value={session.dose} onChange={v => upd("dose", v)} options={[
                { value: "56mg", label: "56mg (2 devices)" },
                { value: "84mg", label: "84mg (3 devices)" }
              ]} />
            </Field>
            <Field label="Patient Tolerance">
              <Select value={session.patientTolerance} onChange={v => upd("patientTolerance", v)} options={[
                { value: "Good", label: "Good" },
                { value: "Fair", label: "Fair" },
                { value: "Poor", label: "Poor" }
              ]} />
            </Field>
          </div>

          {/* BP / Vitals */}
          <div style={{ background: C.gray50, borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 14 }}>Vital Signs — REMS Required Monitoring</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16 }}>
              <VitalsInput label="BP Pre-Admin" systolic={session.bpPreSystolic} diastolic={session.bpPreDiastolic} onSys={v => upd("bpPreSystolic", v)} onDia={v => upd("bpPreDiastolic", v)} />
              <VitalsInput label="BP ~40min Post" systolic={session.bpPost40Systolic} diastolic={session.bpPost40Diastolic} onSys={v => upd("bpPost40Systolic", v)} onDia={v => upd("bpPost40Diastolic", v)} />
              <VitalsInput label="BP at Discharge" systolic={session.bpPostSystolic} diastolic={session.bpPostDiastolic} onSys={v => upd("bpPostSystolic", v)} onDia={v => upd("bpPostDiastolic", v)} />
              <VitalsInput label="Pulse Ox Pre" type="ox" ox={session.pulseOxPre} onOx={v => upd("pulseOxPre", v)} />
              <VitalsInput label="Pulse Ox During" type="ox" ox={session.pulseOxDuring} onOx={v => upd("pulseOxDuring", v)} />
              <VitalsInput label="Pulse Ox Post" type="ox" ox={session.pulseOxPost} onOx={v => upd("pulseOxPost", v)} />
            </div>
            {(parseInt(session.bpPreSystolic) > 140 || parseInt(session.bpPreDiastolic) > 90) && (
              <div style={{ marginTop: 12, padding: "8px 14px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                ⚠ Pre-admin BP elevated (&gt;140/90) — physician must evaluate before proceeding
              </div>
            )}
          </div>

          {/* Side effects */}
          <div style={{ marginBottom: 20 }}>
            <MultiSelect label="Side Effects Observed" options={SIDE_EFFECTS} selected={session.sideEffects} onChange={v => upd("sideEffects", v)} />
            {session.sideEffects.length > 0 && session.sideEffects[0] !== "None observed" && (
              <div style={{ marginTop: 10 }}>
                <label style={S.label}>Side Effect Notes</label>
                <Textarea value={session.sideEffectNotes} onChange={v => upd("sideEffectNotes", v)} placeholder="Describe severity, timing, resolution..." rows={2} />
              </div>
            )}
          </div>

          {/* SAE */}
          <div style={{ marginBottom: 20, padding: "14px 18px", background: C.redLight, borderRadius: 12, border: "1px solid #fecaca" }}>
            <Checkbox checked={session.sae} onChange={v => upd("sae", v)}
              label="Serious Adverse Event (SAE) occurred — sedation/dissociation/respiratory depression/hypertension resulting in hospitalization, disability, or life-threatening event" />
            {session.sae && (
              <div style={{ marginTop: 12 }}>
                <label style={S.label}>SAE Description (required for REMS report)</label>
                <Textarea value={session.saeDescription} onChange={v => upd("saeDescription", v)} placeholder="Describe the serious adverse event in detail..." rows={3} />
              </div>
            )}
          </div>

          {/* Clinical notes + REMS + discharge */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <Field label="Clinical Notes" span={2}>
              <Textarea value={session.clinicalNotes} onChange={v => upd("clinicalNotes", v)} placeholder="Patient response, observations, plan for next session..." rows={3} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <Checkbox checked={session.remsFormSubmitted} onChange={v => upd("remsFormSubmitted", v)} label="REMS Patient Monitoring Form submitted" />
            <Checkbox checked={session.transportArranged} onChange={v => upd("transportArranged", v)} label="Transportation home confirmed" />
            <Checkbox checked={session.discharged} onChange={v => upd("discharged", v)} label="Patient discharged (clinically stable)" />
          </div>

          {session.remsFormSubmitted === false && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", fontWeight: 600 }}>
              ⚠ REMS form must be submitted to SpravatoREMS.com after every session — this is an FDA requirement
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => { setAdding(false); setSession(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={saveSession} style={S.btn("success")}>✓ Save Session</button>
          </div>
        </div>
      )}

      {/* Session history */}
      {sessions.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>💉</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No sessions logged yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Log the first treatment session when it occurs</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sessions.map(s => {
            const phase = sessionPhase(s.sessionNumber);
            const expanded = expandedId === s.id;
            return (
              <div key={s.id} style={{ ...S.card, marginBottom: 0, padding: 0, overflow: "hidden" }}>
                {/* Session header row */}
                <div onClick={() => setExpandedId(expanded ? null : s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", cursor: "pointer", background: expanded ? "#f9feff" : "#fff" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: phase.bg, border: `2px solid ${phase.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: phase.color }}>#{s.sessionNumber}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.gray900 }}>{new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
                    <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{s.dose} · {phase.label} · Tolerance: {s.patientTolerance}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {s.sae && <span style={S.badge("red")}>SAE</span>}
                    {s.remsFormSubmitted ? <span style={S.badge("green")}>REMS ✓</span> : <span style={S.badge("amber")}>REMS Pending</span>}
                    {s.sideEffects.length > 0 && s.sideEffects[0] !== "None observed" && (
                      <span style={S.badge("amber")}>{s.sideEffects.length} SE</span>
                    )}
                    <span style={{ fontSize: 18, color: C.gray400 }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded && (
                  <div style={{ padding: "0 20px 18px", borderTop: `1px solid ${C.gray100}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14, marginBottom: 14 }}>
                      {[
                        ["BP Pre-Admin", `${s.bpPreSystolic || "—"}/${s.bpPreDiastolic || "—"} mmHg`],
                        ["BP ~40min", `${s.bpPost40Systolic || "—"}/${s.bpPost40Diastolic || "—"} mmHg`],
                        ["BP Discharge", `${s.bpPostSystolic || "—"}/${s.bpPostDiastolic || "—"} mmHg`],
                        ["Pulse Ox Pre", `${s.pulseOxPre || "—"}%`],
                        ["Pulse Ox During", `${s.pulseOxDuring || "—"}%`],
                        ["Pulse Ox Post", `${s.pulseOxPost || "—"}%`]
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ background: C.gray50, borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{lbl}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.gray900 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {s.sideEffects.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 6 }}>Side Effects</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {s.sideEffects.map(se => <span key={se} style={{ ...S.badge(se === "None observed" ? "green" : "amber"), fontSize: 11 }}>{se}</span>)}
                        </div>
                        {s.sideEffectNotes && <div style={{ fontSize: 12, color: C.gray700, marginTop: 6 }}>{s.sideEffectNotes}</div>}
                      </div>
                    )}
                    {s.clinicalNotes && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 4 }}>Clinical Notes</div>
                        <div style={{ fontSize: 13, color: C.gray700, lineHeight: 1.5 }}>{s.clinicalNotes}</div>
                      </div>
                    )}
                    {s.sae && s.saeDescription && (
                      <div style={{ padding: "10px 14px", background: C.redLight, borderRadius: 8, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: "uppercase", marginBottom: 4 }}>SAE Description</div>
                        <div style={{ fontSize: 13, color: C.red }}>{s.saeDescription}</div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => deleteSession(s.id)} style={S.btn("danger")}>Delete Session</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PA Tracker ────────────────────────────────────────────────────────────
function PATracker({ patient, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [pa, setPa] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const upd = (field, value) => setPa(prev => ({ ...prev, [field]: value }));

  const savePA = () => {
    const updated = { ...patient, paRecords: [...(patient.paRecords || []), pa] };
    onUpdate(updated);
    setAdding(false); setPa(null);
  };

  const updatePAStatus = (id, newStatus) => {
    const updated = { ...patient, paRecords: patient.paRecords.map(r => r.id === id ? { ...r, status: newStatus } : r) };
    onUpdate(updated);
  };

  const deletePA = (id) => {
    if (!confirm("Delete this PA record?")) return;
    onUpdate({ ...patient, paRecords: patient.paRecords.filter(r => r.id !== id) });
  };

  const records = [...(patient.paRecords || [])].sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));
  const activePA = records.find(r => r.status === "Approved");
  const urgentCount = records.filter(r => { const u = paUrgency(r); return u && (u.color === C.red || u.color === C.amber); }).length;

  const statusColor = (status) => {
    if (status === "Approved") return "green";
    if (status === "Pending") return "blue";
    if (status === "Denied") return "red";
    if (status === "Under Appeal") return "amber";
    if (status === "Reauth Due") return "amber";
    if (status === "Expired") return "red";
    return "";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={S.sectionTitle}>Prior Authorization Tracker</div>
          <div style={{ display: "flex", gap: 10, marginTop: -10 }}>
            <span style={{ fontSize: 13, color: C.gray500 }}>{records.length} PA record{records.length !== 1 ? "s" : ""}</span>
            {urgentCount > 0 && <span style={{ ...S.badge("amber"), fontSize: 11 }}>⚠ {urgentCount} need attention</span>}
            {activePA && <span style={{ ...S.badge("green"), fontSize: 11 }}>✓ Active auth through {activePA.expirationDate || "?"}</span>}
          </div>
        </div>
        {!adding && <button onClick={() => { setPa(emptyPA()); setAdding(true); }} style={S.btn()}>+ Add PA Record</button>}
      </div>

      {/* New PA form */}
      {adding && pa && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, background: "#f9feff" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 18 }}>New Prior Authorization Record</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <Field label="Payer / Insurance Plan">
              <Input value={pa.payer} onChange={v => upd("payer", v)} placeholder={patient.insurerName || "Insurance company"} />
            </Field>
            <Field label="Benefit Type">
              <Select value={pa.benefitType} onChange={v => upd("benefitType", v)} options={[
                { value: "medical", label: "Medical Benefit" },
                { value: "pharmacy", label: "Pharmacy Benefit" },
                { value: "both", label: "Both" }
              ]} />
            </Field>
            <Field label="Submission Date">
              <Input type="date" value={pa.submittedDate} onChange={v => upd("submittedDate", v)} />
            </Field>
            <Field label="Status">
              <Select value={pa.status} onChange={v => upd("status", v)} options={PA_STATUSES.map(s => ({ value: s, label: s }))} />
            </Field>
            <Field label="Auth / Reference Number">
              <Input value={pa.authNumber} onChange={v => upd("authNumber", v)} placeholder="Auth #" />
            </Field>
            <Field label="Auth Start Date">
              <Input type="date" value={pa.startDate} onChange={v => upd("startDate", v)} />
            </Field>
            <Field label="Authorization Expiration Date">
              <Input type="date" value={pa.expirationDate} onChange={v => upd("expirationDate", v)} />
            </Field>
          </div>

          {(pa.status === "Denied" || pa.status === "Under Appeal") && (
            <div style={{ background: C.redLight, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red, textTransform: "uppercase", marginBottom: 12 }}>Denial / Appeal Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Denial Reason">
                  <Select value={pa.denialReason} onChange={v => upd("denialReason", v)}
                    options={[{ value: "", label: "Select reason..." }, ...DENIAL_REASONS.map(r => ({ value: r, label: r }))]} />
                </Field>
                <Field label="Appeal Submitted Date">
                  <Input type="date" value={pa.appealDate} onChange={v => upd("appealDate", v)} />
                </Field>
                <Field label="Appeal Notes" span={2}>
                  <Textarea value={pa.appealNotes} onChange={v => upd("appealNotes", v)} placeholder="Letter of Medical Necessity submitted, additional documentation..." rows={2} />
                </Field>
              </div>
            </div>
          )}

          {pa.status === "Reauth Due" && (
            <div style={{ background: C.amberLight, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", textTransform: "uppercase", marginBottom: 10 }}>Reauthorization</div>
              <Field label="Reauth Submission Date">
                <Input type="date" value={pa.reauthSubmittedDate} onChange={v => upd("reauthSubmittedDate", v)} style={{ width: 200 }} />
              </Field>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>Notes</label>
            <Textarea value={pa.notes} onChange={v => upd("notes", v)} placeholder="CoverMyMeds reference, payer contact notes, follow-up needed..." rows={2} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => { setAdding(false); setPa(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={savePA} style={S.btn("success")}>✓ Save PA Record</button>
          </div>
        </div>
      )}

      {/* PA records list */}
      {records.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No PA records yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Add a record when the PA is submitted</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {records.map(r => {
            const urgency = paUrgency(r);
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} style={{ ...S.card, marginBottom: 0, padding: 0, overflow: "hidden", border: urgency && urgency.color === C.red ? `2px solid ${C.red}` : `1px solid ${C.gray200}` }}>
                <div onClick={() => setExpandedId(expanded ? null : r.id)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.gray900 }}>
                      {r.payer || patient.insurerName || "Payer TBD"}
                      <span style={{ fontSize: 12, fontWeight: 500, color: C.gray500, marginLeft: 10 }}>
                        {r.benefitType === "medical" ? "Medical Benefit" : r.benefitType === "pharmacy" ? "Pharmacy Benefit" : "Medical + Pharmacy"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      Submitted: {r.submittedDate}
                      {r.authNumber && ` · Auth #${r.authNumber}`}
                      {r.expirationDate && ` · Expires: ${r.expirationDate}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={S.badge(statusColor(r.status))}>{r.status}</span>
                    {urgency && <span style={{ ...S.badge(""), background: urgency.bg, color: urgency.color, fontSize: 11 }}>{urgency.label}</span>}
                    {/* Quick status change buttons */}
                    {r.status === "Pending" && (
                      <button onClick={e => { e.stopPropagation(); updatePAStatus(r.id, "Approved"); }}
                        style={{ ...S.btn("success"), padding: "5px 12px", fontSize: 11 }}>Mark Approved</button>
                    )}
                    {r.status === "Pending" && (
                      <button onClick={e => { e.stopPropagation(); updatePAStatus(r.id, "Denied"); }}
                        style={{ ...S.btn("danger"), padding: "5px 12px", fontSize: 11 }}>Mark Denied</button>
                    )}
                    {r.status === "Approved" && (
                      <button onClick={e => { e.stopPropagation(); updatePAStatus(r.id, "Reauth Due"); }}
                        style={{ ...S.btn("amber"), padding: "5px 12px", fontSize: 11 }}>Flag Reauth</button>
                    )}
                    <span style={{ fontSize: 18, color: C.gray400 }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${C.gray100}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 14 }}>
                      {[
                        ["Auth Start", r.startDate || "—"],
                        ["Auth Expiration", r.expirationDate || "—"],
                        ["Auth Number", r.authNumber || "—"],
                        ["Benefit Type", r.benefitType]
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ background: C.gray50, borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{lbl}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.gray900 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {r.denialReason && (
                      <div style={{ marginTop: 12, padding: "10px 14px", background: C.redLight, borderRadius: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: "uppercase", marginBottom: 3 }}>Denial Reason</div>
                        <div style={{ fontSize: 13, color: C.red }}>{r.denialReason}</div>
                        {r.appealNotes && <div style={{ fontSize: 12, color: C.gray700, marginTop: 6 }}><strong>Appeal:</strong> {r.appealNotes}</div>}
                      </div>
                    )}
                    {r.notes && (
                      <div style={{ marginTop: 10, fontSize: 13, color: C.gray700 }}><strong>Notes:</strong> {r.notes}</div>
                    )}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                      <button onClick={() => deletePA(r.id)} style={S.btn("danger")}>Delete Record</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Form Summary ──────────────────────────────────────────────────────────
function FormSummary({ patient }) {
  const phq9Score = patient.phq9.every(v => v !== null) ? patient.phq9.reduce((s, v) => s + v, 0) : null;
  const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;
  const Section = ({ title, rows }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingBottom: 6, borderBottom: `1.5px solid ${C.gray100}` }}>{title}</div>
      {rows.map(([label, value], i) => (
        <div key={i} style={{ display: "flex", gap: 16, padding: "5px 0", borderBottom: `1px solid ${C.gray50}` }}>
          <div style={{ width: 170, flexShrink: 0, fontSize: 11, color: C.gray500, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 13, color: C.gray900 }}>{value || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
        <div style={{ padding: "14px 18px", background: C.tealLight, borderRadius: 12, border: `1px solid #bae6fd` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", marginBottom: 4 }}>REMS Status</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: patient.remsEnrolled ? C.green : C.red }}>{patient.remsEnrolled ? "✓ Enrolled" : "⏳ Pending"}</div>
        </div>
        <div style={{ padding: "14px 18px", background: C.greenLight, borderRadius: 12, border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#166534", textTransform: "uppercase", marginBottom: 4 }}>withMe Status</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: patient.withMeEnrolled ? C.green : C.red }}>{patient.withMeEnrolled ? "✓ Enrolled" : "⏳ Pending"}</div>
        </div>
      </div>
      <Section title="Demographics" rows={[
        ["Name", `${patient.firstName} ${patient.lastName}`],
        ["DOB / Gender", `${patient.dob} · ${patient.gender}`],
        ["Phone / Email", `${patient.phone} · ${patient.email}`],
        ["Address", `${patient.address}, ${patient.city}, ${patient.state} ${patient.zip}`]
      ]} />
      <Section title="Insurance" rows={[
        ["Insurer", patient.insurerName], ["Plan Type", patient.planType],
        ["Policyholder", patient.policyHolder], ["Policy ID", patient.policyId],
        ["Group #", patient.groupNumber],
        ["Cards", patient.insuranceCardFront && patient.insuranceCardBack ? "✓ Both captured" : patient.insuranceCardFront ? "Front only" : "Not captured"]
      ]} />
      <Section title="Clinical" rows={[
        ["ICD-10", patient.diagnosisCode], ["Dx Date", patient.diagnosisDate],
        ["Trial 1", patient.trialOne.drug ? `${patient.trialOne.drug} | ${patient.trialOne.dose} | ${patient.trialOne.duration}` : ""],
        ["Trial 2", patient.trialTwo.drug ? `${patient.trialTwo.drug} | ${patient.trialTwo.dose} | ${patient.trialTwo.duration}` : ""],
        ["Psychotherapy", patient.psychotherapy],
        ["Psych Consult", patient.psychiatristConsult ? `Yes — ${patient.psychiatristName}` : "No"]
      ]} />
      {phq9Score !== null && sev && (
        <Section title="PHQ-9" rows={[
          ["Date", patient.phq9Date], ["Score", `${phq9Score} — ${sev.label}`],
          ["Q9 (SI)", patient.phq9[8] > 0 ? `⚠ Positive (${patient.phq9[8]})` : "Negative"]
        ]} />
      )}
      {patient.insuranceCardFront && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, textTransform: "uppercase", marginBottom: 8 }}>Insurance Cards</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {patient.insuranceCardFront && <div><div style={S.label}>Front</div><img src={patient.insuranceCardFront} style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.gray200}` }} alt="Front" /></div>}
            {patient.insuranceCardBack && <div><div style={S.label}>Back</div><img src={patient.insuranceCardBack} style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.gray200}` }} alt="Back" /></div>}
          </div>
        </div>
      )}
      <div style={{ padding: "14px 18px", background: C.amberLight, borderRadius: 12, border: "1px solid #fde68a", fontSize: 13, color: "#78350f" }}>
        <strong>Next Steps:</strong> Use this data to complete (1) Spravato withMe Enrollment, (2) REMS Patient Enrollment at SpravatoREMS.com, (3) Prior Authorization package.
      </div>
    </div>
  );
}

// ─── Patient Form (intake) ─────────────────────────────────────────────────
function PatientForm({ patient: initial, onSave, onCancel }) {
  const [p, setP] = useState(initial);
  const [step, setStep] = useState(0);
  const update = (field, value) => setP(prev => ({ ...prev, [field]: value }));
  const updateNested = (parent, field, value) => setP(prev => ({ ...prev, [parent]: { ...prev[parent], [field]: value } }));
  const steps = ["Demographics", "Insurance", "Clinical", "PHQ-9", "Summary"];
  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 22px" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            padding: "7px 15px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: "pointer", border: "none", fontFamily: "inherit",
            background: step === i ? `linear-gradient(135deg,${C.teal},${C.tealDark})` : C.gray100,
            color: step === i ? "#fff" : C.gray500, transition: "all 0.15s",
            boxShadow: step === i ? `0 2px 8px ${C.teal}30` : "none"
          }}><span style={{ opacity: 0.6, marginRight: 5 }}>{i + 1}.</span>{s}</button>
        ))}
      </div>

      {step === 0 && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Patient Demographics</div>
          <div style={grid}>
            {[["First Name", "firstName", "First name"], ["Last Name", "lastName", "Last name"]].map(([lbl, key, ph]) => (
              <div key={key}><label style={S.label}>{lbl}</label><Input value={p[key]} onChange={v => update(key, v)} placeholder={ph} /></div>
            ))}
            <div><label style={S.label}>Date of Birth</label><Input type="date" value={p.dob} onChange={v => update("dob", v)} /></div>
            <div><label style={S.label}>Gender</label>
              <Select value={p.gender} onChange={v => update("gender", v)} options={[{ value: "", label: "Select..." }, "Male", "Female", "Non-binary", "Prefer not to say"]} />
            </div>
            <div><label style={S.label}>Phone</label><Input value={p.phone} onChange={v => update("phone", v)} placeholder="(555) 555-5555" /></div>
            <div><label style={S.label}>Email</label><Input type="email" value={p.email} onChange={v => update("email", v)} placeholder="email@example.com" /></div>
            <div style={{ gridColumn: "span 2" }}><label style={S.label}>Street Address</label><Input value={p.address} onChange={v => update("address", v)} placeholder="Street address" /></div>
            <div><label style={S.label}>City</label><Input value={p.city} onChange={v => update("city", v)} placeholder="City" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={S.label}>State</label><Input value={p.state} onChange={v => update("state", v)} placeholder="NY" /></div>
              <div><label style={S.label}>ZIP</label><Input value={p.zip} onChange={v => update("zip", v)} placeholder="10001" /></div>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Insurance Information</div>
          <div style={grid}>
            <div><label style={S.label}>Insurance Company</label><Input value={p.insurerName} onChange={v => update("insurerName", v)} placeholder="e.g. Aetna, BCBS" /></div>
            <div><label style={S.label}>Plan Type</label>
              <Select value={p.planType} onChange={v => update("planType", v)} options={[
                { value: "commercial", label: "Commercial / Private" }, { value: "medicare", label: "Medicare" },
                { value: "medicaid", label: "Medicaid" }, { value: "other", label: "Other" }
              ]} />
            </div>
            <div><label style={S.label}>Policyholder Name</label><Input value={p.policyHolder} onChange={v => update("policyHolder", v)} placeholder="Name on card" /></div>
            <div><label style={S.label}>Policy / Member ID</label><Input value={p.policyId} onChange={v => update("policyId", v)} placeholder="Policy ID" /></div>
            <div><label style={S.label}>Group Number</label><Input value={p.groupNumber} onChange={v => update("groupNumber", v)} placeholder="Group #" /></div>
          </div>
          {p.planType !== "commercial" && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
              ⚠ Non-commercial insurance: Patient may not qualify for Spravato withMe savings program.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 22 }}>
            <ImageCapture label="Insurance Card — Front" value={p.insuranceCardFront} onChange={v => update("insuranceCardFront", v)} />
            <ImageCapture label="Insurance Card — Back" value={p.insuranceCardBack} onChange={v => update("insuranceCardBack", v)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={S.card}>
            <div style={S.sectionTitle}>Diagnosis</div>
            <div style={grid}>
              <div><label style={S.label}>ICD-10 Code</label>
                <Select value={p.diagnosisCode} onChange={v => update("diagnosisCode", v)} options={[
                  { value: "F32.2", label: "F32.2 — MDD, single episode, severe" },
                  { value: "F32.1", label: "F32.1 — MDD, single episode, moderate" },
                  { value: "F32.0", label: "F32.0 — MDD, single episode, mild" },
                  { value: "F32.9", label: "F32.9 — MDD, single episode, unspecified" },
                  { value: "F33.2", label: "F33.2 — MDD, recurrent, severe" },
                  { value: "F33.1", label: "F33.1 — MDD, recurrent, moderate" },
                  { value: "F33.0", label: "F33.0 — MDD, recurrent, mild" },
                  { value: "R45.851", label: "R45.851 — Suicidal Ideation (MDSI)" }
                ]} />
              </div>
              <div><label style={S.label}>Diagnosis Date</label><Input type="date" value={p.diagnosisDate} onChange={v => update("diagnosisDate", v)} /></div>
            </div>
          </div>
          <div style={S.card}>
            <div style={S.sectionTitle}>Antidepressant Trial History (Required for PA)</div>
            {[["trialOne", "Trial 1 (Required)"], ["trialTwo", "Trial 2 (Required)"]].map(([key, lbl]) => (
              <div key={key} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.gray500, marginBottom: 10 }}>{lbl}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <div><label style={S.label}>Medication</label>
                    <Select value={p[key].drug} onChange={v => updateNested(key, "drug", v)} options={[{ value: "", label: "Select..." }, ...ANTIDEPRESSANTS.map(a => ({ value: a, label: a }))]} />
                  </div>
                  <div><label style={S.label}>Dose</label><Input value={p[key].dose} onChange={v => updateNested(key, "dose", v)} placeholder="e.g. 20mg" /></div>
                  <div><label style={S.label}>Duration</label><Input value={p[key].duration} onChange={v => updateNested(key, "duration", v)} placeholder="e.g. 8 weeks" /></div>
                  <div><label style={S.label}>Reason D/C</label><Input value={p[key].reason} onChange={v => updateNested(key, "reason", v)} placeholder="Inadequate response" /></div>
                </div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.sectionTitle}>Additional History & Screening</div>
            <div style={{ display: "grid", gap: 14 }}>
              <div><label style={S.label}>Psychotherapy History</label>
                <Select value={p.psychotherapy} onChange={v => update("psychotherapy", v)} options={[
                  { value: "", label: "Select..." }, { value: "None", label: "None" },
                  { value: "CBT — adequate trial", label: "CBT — adequate trial" },
                  { value: "CBT — partial", label: "CBT — partial / incomplete" },
                  { value: "Other therapy", label: "Other therapy" },
                  { value: "Refused", label: "Patient refused" }
                ]} />
              </div>
              <Checkbox checked={p.psychiatristConsult} onChange={v => update("psychiatristConsult", v)} label="Psychiatrist consultation completed" />
              {p.psychiatristConsult && <div><label style={S.label}>Psychiatrist Name</label><Input value={p.psychiatristName} onChange={v => update("psychiatristName", v)} placeholder="Dr. Name" /></div>}
              <div><label style={S.label}>Concomitant Medications (CNS depressants, MAOIs, stimulants)</label>
                <Textarea value={p.concomitantMeds} onChange={v => update("concomitantMeds", v)} placeholder="List relevant medications..." />
              </div>
            </div>
          </div>
          <div style={S.card}>
            <div style={S.sectionTitle}>Contraindication Screening</div>
            <div style={{ padding: "12px 16px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 10, textTransform: "uppercase" }}>Absolute Contraindications — check if PRESENT</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Checkbox checked={p.contraindications.aneurysm} onChange={v => updateNested("contraindications", "aneurysm", v)} label="Aneurysmal vascular disease (aortic, intracranial, or peripheral)" />
                <Checkbox checked={p.contraindications.avmHistory} onChange={v => updateNested("contraindications", "avmHistory", v)} label="History of arteriovenous malformation (AVM)" />
                <Checkbox checked={p.contraindications.ich} onChange={v => updateNested("contraindications", "ich", v)} label="History of intracerebral hemorrhage" />
                <Checkbox checked={p.contraindications.hypersensitivity} onChange={v => updateNested("contraindications", "hypersensitivity", v)} label="Hypersensitivity to esketamine or ketamine" />
              </div>
            </div>
            {Object.values(p.contraindications).some(Boolean) && (
              <div style={{ padding: "12px 16px", background: C.redLight, borderRadius: 10, border: `2px solid ${C.red}`, marginBottom: 12 }}>
                <strong style={{ color: C.red }}>⛔ CONTRAINDICATED</strong><span style={{ color: C.red, fontSize: 13 }}> — Patient NOT eligible for Spravato. Notify prescribing physician immediately.</span>
              </div>
            )}
            <div style={{ padding: "12px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 10, textTransform: "uppercase" }}>Use with Caution — check if present</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Checkbox checked={p.hypertension} onChange={v => update("hypertension", v)} label="History of hypertension or baseline BP >140/90" />
                <Checkbox checked={p.substanceHistory} onChange={v => update("substanceHistory", v)} label="History of substance use disorder" />
                <Checkbox checked={p.psychosisHistory} onChange={v => update("psychosisHistory", v)} label="History of psychosis" />
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <Checkbox checked={p.remsEnrolled} onChange={v => update("remsEnrolled", v)} label="Patient enrolled in SPRAVATO REMS (www.SpravatoREMS.com)" />
              <Checkbox checked={p.withMeEnrolled} onChange={v => update("withMeEnrolled", v)} label="Patient enrolled in Spravato withMe support program" />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={S.card}>
          <ErrorBoundary>
            <PHQ9Form answers={p.phq9} onChange={v => update("phq9", v)} date={p.phq9Date} onDateChange={v => update("phq9Date", v)} />
          </ErrorBoundary>
        </div>
      )}

      {step === 4 && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Patient Summary & Form Data</div>
          <FormSummary patient={p} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <button onClick={onCancel} style={S.btn("ghost")}>Cancel</button>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && <button onClick={() => setStep(s => s - 1)} style={S.btn("secondary")}>← Back</button>}
          {step < steps.length - 1
            ? <button onClick={() => setStep(s => s + 1)} style={S.btn()}>Next →</button>
            : <button onClick={() => onSave(p)} style={S.btn("success")}>✓ Save Patient</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Print Helpers ─────────────────────────────────────────────────────────
function printHTML(html) {
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

const printStyles = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a2332; background: #fff; padding: 28px 32px; }
    h1 { font-size: 18px; font-weight: 800; color: #0d1f35; }
    h2 { font-size: 13px; font-weight: 700; color: #1a7fa8; text-transform: uppercase; letter-spacing: 0.06em; margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #e2e8f0; }
    h3 { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 6px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    td, th { padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; }
    .label-col { width: 200px; font-weight: 600; color: #475569; background: #f8fafc; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 3px solid #1a7fa8; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .alert-box { padding: 10px 14px; border-radius: 6px; margin: 10px 0; font-size: 11px; }
    .alert-red { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .alert-amber { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .alert-green { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .alert-blue { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .section-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; }
    .vitals-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .vital-cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
    .vital-label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 3px; }
    .vital-val { font-size: 14px; font-weight: 800; color: #1a2332; }
    .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    .sig-line { border-bottom: 1px solid #334155; width: 260px; height: 32px; display: inline-block; margin-right: 40px; }
    .phq9-row td { font-size: 10px; }
    .phq9-answered { background: #f0f9ff; }
    @media print {
      body { padding: 16px 20px; }
      @page { margin: 0.5in; size: letter; }
    }
  </style>`;

function headerBlock(title, patient, subtitle = "") {
  return `
    <div class="header">
      <div>
        <div style="font-size:11px;color:#1a7fa8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">PsychX · Spravato Program</div>
        <h1>${title}</h1>
        ${subtitle ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">${subtitle}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:800;color:#0d1f35;">${patient.firstName} ${patient.lastName}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">DOB: ${patient.dob || "—"}</div>
        <div style="font-size:11px;color:#64748b;">Generated: ${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
      </div>
    </div>`;
}

function footerBlock(note = "") {
  return `
    <div class="footer">
      <div>PsychX Spravato Program · Prototype · Not for clinical use without physician review${note ? " · " + note : ""}</div>
      <div>Printed: ${new Date().toLocaleString()}</div>
    </div>`;
}

// ─── Export 1: Patient Summary ─────────────────────────────────────────────
function exportPatientSummary(patient) {
  const phq9Score = patient.phq9.every(v => v !== null) ? patient.phq9.reduce((s, v) => s + v, 0) : null;
  const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;
  const hasContra = Object.values(patient.contraindications).some(Boolean);
  const activePA = (patient.paRecords || []).find(r => r.status === "Approved");

  const row = (label, value) => `<tr><td class="label-col">${label}</td><td>${value || "<span style='color:#94a3b8'>—</span>"}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><title>Patient Summary — ${patient.firstName} ${patient.lastName}</title>${printStyles}</head><body>
    ${headerBlock("Patient Summary", patient, `${patient.diagnosisCode} · ${patient.insurerName || "Insurance pending"}`)}

    ${hasContra ? `<div class="alert-box alert-red">⛔ CONTRAINDICATION FLAGGED — Patient may NOT be eligible for Spravato. Physician review required.</div>` : ""}
    ${activePA ? `<div class="alert-box alert-green">✓ Active prior authorization on file through ${activePA.expirationDate || "TBD"} · Auth #${activePA.authNumber || "pending"}</div>` : `<div class="alert-box alert-amber">⚠ No active prior authorization on file</div>`}

    <h2>Demographics</h2>
    <table>
      ${row("Full Name", `${patient.firstName} ${patient.lastName}`)}
      ${row("Date of Birth", patient.dob)}
      ${row("Gender", patient.gender)}
      ${row("Phone", patient.phone)}
      ${row("Email", patient.email)}
      ${row("Address", [patient.address, patient.city, patient.state, patient.zip].filter(Boolean).join(", "))}
    </table>

    <h2>Insurance</h2>
    <table>
      ${row("Insurance Company", patient.insurerName)}
      ${row("Plan Type", patient.planType)}
      ${row("Policyholder", patient.policyHolder)}
      ${row("Policy / Member ID", patient.policyId)}
      ${row("Group Number", patient.groupNumber)}
      ${row("Card Images", patient.insuranceCardFront ? "✓ Captured in system" : "Not yet captured")}
    </table>

    <div class="two-col">
      <div>
        <h2>Diagnosis</h2>
        <table>
          ${row("ICD-10 Code", patient.diagnosisCode)}
          ${row("Diagnosis Date", patient.diagnosisDate)}
          ${row("REMS Enrolled", patient.remsEnrolled ? `<span class="badge badge-green">✓ Yes</span>` : `<span class="badge badge-amber">Pending</span>`)}
          ${row("withMe Enrolled", patient.withMeEnrolled ? `<span class="badge badge-green">✓ Yes</span>` : `<span class="badge badge-amber">Pending</span>`)}
        </table>
      </div>
      <div>
        <h2>PHQ-9</h2>
        <table>
          ${row("Assessment Date", patient.phq9Date)}
          ${row("Total Score", phq9Score !== null ? `<strong style="font-size:14px">${phq9Score}</strong> — ${sev.label}` : "Not completed")}
          ${row("Q9 Suicidal Ideation", patient.phq9[8] > 0 ? `<span class="badge badge-red">⚠ Positive (${patient.phq9[8]})</span>` : patient.phq9[8] === 0 ? "Negative" : "Not answered")}
          ${row("Spravato Candidacy", phq9Score >= 10 ? "PHQ-9 ≥10 — supports evaluation" : phq9Score !== null ? "PHQ-9 <10 — reassess" : "—")}
        </table>
      </div>
    </div>

    <h2>Antidepressant Trial History</h2>
    <table>
      <tr><th>Trial</th><th>Medication</th><th>Dose</th><th>Duration</th><th>Reason Discontinued</th></tr>
      <tr><td>Trial 1</td><td>${patient.trialOne.drug || "—"}</td><td>${patient.trialOne.dose || "—"}</td><td>${patient.trialOne.duration || "—"}</td><td>${patient.trialOne.reason || "—"}</td></tr>
      <tr><td>Trial 2</td><td>${patient.trialTwo.drug || "—"}</td><td>${patient.trialTwo.dose || "—"}</td><td>${patient.trialTwo.duration || "—"}</td><td>${patient.trialTwo.reason || "—"}</td></tr>
    </table>

    <div class="two-col">
      <div>
        <h2>Additional History</h2>
        <table>
          ${row("Psychotherapy", patient.psychotherapy)}
          ${row("Psychiatrist Consult", patient.psychiatristConsult ? `Yes — ${patient.psychiatristName || "name not entered"}` : "No")}
          ${row("Concomitant Meds", patient.concomitantMeds || "None listed")}
        </table>
      </div>
      <div>
        <h2>Contraindication Screening</h2>
        <table>
          ${row("Aneurysmal vascular disease", patient.contraindications.aneurysm ? `<span class="badge badge-red">PRESENT</span>` : "Negative")}
          ${row("AVM history", patient.contraindications.avmHistory ? `<span class="badge badge-red">PRESENT</span>` : "Negative")}
          ${row("Intracerebral hemorrhage", patient.contraindications.ich ? `<span class="badge badge-red">PRESENT</span>` : "Negative")}
          ${row("Esketamine hypersensitivity", patient.contraindications.hypersensitivity ? `<span class="badge badge-red">PRESENT</span>` : "Negative")}
          ${row("Hypertension (caution)", patient.hypertension ? `<span class="badge badge-amber">Yes</span>` : "No")}
          ${row("Substance use history (caution)", patient.substanceHistory ? `<span class="badge badge-amber">Yes</span>` : "No")}
          ${row("Psychosis history (caution)", patient.psychosisHistory ? `<span class="badge badge-amber">Yes</span>` : "No")}
        </table>
      </div>
    </div>

    <h2>Program Status</h2>
    <table>
      ${row("Sessions Completed", patient.sessions?.length || 0)}
      ${row("Current Phase", patient.sessions?.length > 0 ? sessionPhase(patient.sessions.length).label : "Not started")}
      ${row("PA Status", activePA ? `Active — expires ${activePA.expirationDate || "TBD"}` : (patient.paRecords?.length > 0 ? patient.paRecords[patient.paRecords.length-1].status : "No PA filed"))}
    </table>

    ${footerBlock()}
  </body></html>`;
  printHTML(html);
}

// ─── Export 2: PA Documentation Package ───────────────────────────────────
function exportPAPackage(patient) {
  const phq9Score = patient.phq9.every(v => v !== null) ? patient.phq9.reduce((s, v) => s + v, 0) : null;
  const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;

  const checkRow = (label, value, required = false) =>
    `<tr><td class="label-col">${label}${required ? " <span style='color:#dc2626'>*</span>" : ""}</td><td>${value || `<span style="color:#94a3b8;font-style:italic">Required — complete before submission</span>`}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><title>PA Package — ${patient.firstName} ${patient.lastName}</title>${printStyles}</head><body>
    ${headerBlock("Prior Authorization Documentation Package", patient, "Spravato (esketamine) — Treatment-Resistant Depression")}

    <div class="alert-box alert-blue">
      <strong>Instructions:</strong> Use this document to complete your payer's PA form. Required fields are marked with *.
      Submit via CoverMyMeds (1-866-452-5017) or Spravato withMe (1-844-479-4846).
      Download payer-specific PA forms at <strong>SpravatoHCP.com</strong>.
    </div>

    <h2>Section 1 — Patient Information</h2>
    <table>
      ${checkRow("Patient Full Name", `${patient.firstName} ${patient.lastName}`, true)}
      ${checkRow("Date of Birth", patient.dob, true)}
      ${checkRow("Gender", patient.gender)}
      ${checkRow("Phone", patient.phone, true)}
      ${checkRow("Address", [patient.address, patient.city, patient.state, patient.zip].filter(Boolean).join(", "), true)}
      ${checkRow("Insurance Company", patient.insurerName, true)}
      ${checkRow("Policy / Member ID", patient.policyId, true)}
      ${checkRow("Group Number", patient.groupNumber)}
      ${checkRow("Policyholder Name", patient.policyHolder)}
      ${checkRow("Benefit Type", "☐ Medical Benefit (CMS 1500)   ☐ Pharmacy Benefit")}
    </table>

    <h2>Section 2 — Diagnosis & Clinical Indication</h2>
    <table>
      ${checkRow("Primary ICD-10 Diagnosis Code", patient.diagnosisCode, true)}
      ${checkRow("Diagnosis Description", patient.diagnosisCode === "R45.851" ? "Major Depressive Disorder with Suicidal Ideation (MDSI)" : "Major Depressive Disorder — Treatment-Resistant")}
      ${checkRow("Diagnosis Date", patient.diagnosisDate, true)}
      ${checkRow("Indication", "Treatment-Resistant Depression (TRD) — failed ≥2 adequate antidepressant trials")}
      ${checkRow("Baseline PHQ-9 Score", phq9Score !== null ? `${phq9Score} — ${sev.label} (Date: ${patient.phq9Date || "—"})` : "", true)}
      ${checkRow("Bipolar Disorder Ruled Out", "☐ Yes — confirmed by clinical evaluation")}
      ${checkRow("Substance/Alcohol Screening", patient.substanceHistory ? "History of substance use — screened and documented" : "No history of substance use disorder")}
    </table>

    <h2>Section 3 — Antidepressant Trial History (Minimum 2 Required)</h2>
    <table>
      <tr><th>#</th><th>Drug Name</th><th>Dose</th><th>Duration</th><th>Reason Discontinued</th><th>Adequate Trial?</th></tr>
      <tr>
        <td>1</td>
        <td>${patient.trialOne.drug || "<span style='color:#dc2626'>Required</span>"}</td>
        <td>${patient.trialOne.dose || "—"}</td>
        <td>${patient.trialOne.duration || "<span style='color:#dc2626'>Required</span>"}</td>
        <td>${patient.trialOne.reason || "<span style='color:#dc2626'>Required</span>"}</td>
        <td>☐ Yes (≥6 weeks at adequate dose)</td>
      </tr>
      <tr>
        <td>2</td>
        <td>${patient.trialTwo.drug || "<span style='color:#dc2626'>Required</span>"}</td>
        <td>${patient.trialTwo.dose || "—"}</td>
        <td>${patient.trialTwo.duration || "<span style='color:#dc2626'>Required</span>"}</td>
        <td>${patient.trialTwo.reason || "<span style='color:#dc2626'>Required</span>"}</td>
        <td>☐ Yes (≥6 weeks at adequate dose)</td>
      </tr>
    </table>
    <div class="alert-box alert-amber" style="font-size:10px;">Note: Payers require documentation of drug name, dose, duration (minimum 6–8 weeks), fill dates, and reason for discontinuation. Attach pharmacy records or medical notes if available.</div>

    <h2>Section 4 — Psychotherapy History</h2>
    <table>
      ${checkRow("Psychotherapy History", patient.psychotherapy || "")}
      ${checkRow("Psychiatrist Consultation", patient.psychiatristConsult ? `Yes — ${patient.psychiatristName || "name TBD"}` : "Not completed — verify if required by payer")}
    </table>

    <h2>Section 5 — Drug Information</h2>
    <table>
      ${checkRow("Drug Name", "Spravato® (esketamine) Nasal Spray, CIII")}
      ${checkRow("Starting Dose", "56mg (two 28mg devices) — NDC 50458-028-02")}
      ${checkRow("Maintenance Dose", "56mg or 84mg per physician order — NDC 50458-028-03")}
      ${checkRow("Sessions Requested", "16 (Induction: 2x/week × 4 weeks; Maintenance: 1x/week × 4 weeks)")}
      ${checkRow("Route of Administration", "Intranasal, self-administered under direct clinical observation")}
      ${checkRow("REMS Enrolled — Patient", patient.remsEnrolled ? "✓ Yes" : "Pending")}
      ${checkRow("REMS Enrolled — Setting", "☐ Confirm outpatient setting REMS certification number: ___________")}
    </table>

    <h2>Section 6 — Prescriber & Facility</h2>
    <table>
      ${checkRow("Prescribing Physician Name", "______________________________", true)}
      ${checkRow("Physician NPI", "______________________________", true)}
      ${checkRow("Physician DEA Number", "______________________________")}
      ${checkRow("Practice / Facility Name", "______________________________", true)}
      ${checkRow("Facility NPI", "______________________________", true)}
      ${checkRow("Facility Tax ID", "______________________________", true)}
      ${checkRow("Facility Address", "______________________________", true)}
      ${checkRow("Place of Service Code", "11 — Office")}
    </table>

    <h2>Prescriber Signature & Attestation</h2>
    <div style="margin-top:16px;padding:14px;border:1px solid #e2e8f0;border-radius:6px;">
      <p style="font-size:11px;color:#475569;margin-bottom:16px;">
        I certify that the above information is accurate and complete to the best of my knowledge. This patient has a confirmed diagnosis of Treatment-Resistant Depression with ≥2 documented adequate antidepressant treatment failures, and Spravato is medically necessary.
      </p>
      <div style="display:flex;gap:40px;margin-top:8px;">
        <div><span class="sig-line"></span><br/><span style="font-size:10px;color:#64748b">Prescriber Signature</span></div>
        <div><span class="sig-line" style="width:160px"></span><br/><span style="font-size:10px;color:#64748b">Date</span></div>
      </div>
    </div>

    ${footerBlock("Submit via CoverMyMeds or Spravato withMe · SpravatoHCP.com for payer-specific forms")}
  </body></html>`;
  printHTML(html);
}

// ─── Export 3: REMS Monitoring Form Data ──────────────────────────────────
function exportREMSSession(patient, session) {
  const phase = sessionPhase(session.sessionNumber);
  const bpElevated = parseInt(session.bpPreSystolic) > 140 || parseInt(session.bpPreDiastolic) > 90;

  const row = (label, value) => `<tr><td class="label-col">${label}</td><td>${value || "—"}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><title>REMS Monitoring — Session #${session.sessionNumber} — ${patient.firstName} ${patient.lastName}</title>${printStyles}</head><body>
    ${headerBlock(`REMS Patient Monitoring Form — Session #${session.sessionNumber}`, patient, `${phase.label} Phase · ${session.date} · ${session.dose}`)}

    <div class="alert-box alert-blue">
      <strong>Instructions:</strong> Use this pre-filled data to complete the official REMS Patient Monitoring Form at <strong>SpravatoREMS.com</strong> or by fax.
      This form must be submitted after EVERY treatment session. Failure to submit = REMS compliance violation.
    </div>

    ${session.sae ? `<div class="alert-box alert-red">⚠ <strong>SERIOUS ADVERSE EVENT REPORTED</strong> — SAE reporting required. Contact REMS program at 1-855-382-6022 immediately.</div>` : ""}
    ${bpElevated ? `<div class="alert-box alert-amber">⚠ Pre-administration BP was elevated (&gt;140/90) — confirm physician evaluation was documented before proceeding.</div>` : ""}

    <h2>Section A — Patient Information</h2>
    <table>
      ${row("Patient Full Name", `${patient.firstName} ${patient.lastName}`)}
      ${row("Date of Birth", patient.dob)}
      ${row("REMS Patient ID / Enrollment #", patient.remsEnrolled ? "Enrolled — confirm # at SpravatoREMS.com" : "<span style='color:#dc2626'>NOT YET ENROLLED — enroll before submitting form</span>")}
    </table>

    <h2>Section B — Concomitant Medications</h2>
    <table>
      ${row("CNS Depressants / MAOIs / Other relevant meds", patient.concomitantMeds || "None documented")}
    </table>

    <h2>Section C — Monitoring Healthcare Professional</h2>
    <table>
      ${row("Monitoring HCP Name", "______________________________")}
      ${row("HCP Role / Credentials", "______________________________")}
      ${row("REMS-Certified Setting Name", "______________________________")}
      ${row("Setting REMS Certification #", "______________________________")}
    </table>

    <h2>Section D — Vital Signs (REMS Required)</h2>
    <div class="vitals-grid" style="margin-bottom:12px;">
      <div class="vital-cell">
        <div class="vital-label">Blood Pressure — Pre-Admin</div>
        <div class="vital-val">${session.bpPreSystolic || "—"}/${session.bpPreDiastolic || "—"} <span style="font-size:11px;font-weight:400">mmHg</span></div>
      </div>
      <div class="vital-cell">
        <div class="vital-label">Blood Pressure — ~40 min Post</div>
        <div class="vital-val">${session.bpPost40Systolic || "—"}/${session.bpPost40Diastolic || "—"} <span style="font-size:11px;font-weight:400">mmHg</span></div>
      </div>
      <div class="vital-cell">
        <div class="vital-label">Blood Pressure — Discharge</div>
        <div class="vital-val">${session.bpPostSystolic || "—"}/${session.bpPostDiastolic || "—"} <span style="font-size:11px;font-weight:400">mmHg</span></div>
      </div>
      <div class="vital-cell">
        <div class="vital-label">Pulse Oximetry — Pre</div>
        <div class="vital-val">${session.pulseOxPre || "—"}<span style="font-size:11px;font-weight:400">%</span></div>
      </div>
      <div class="vital-cell">
        <div class="vital-label">Pulse Oximetry — During</div>
        <div class="vital-val">${session.pulseOxDuring || "—"}<span style="font-size:11px;font-weight:400">%</span></div>
      </div>
      <div class="vital-cell">
        <div class="vital-label">Pulse Oximetry — Discharge</div>
        <div class="vital-val">${session.pulseOxPost || "—"}<span style="font-size:11px;font-weight:400">%</span></div>
      </div>
    </div>

    <h2>Section E — Administration Details</h2>
    <table>
      ${row("Dose Administered", session.dose)}
      ${row("Session Number", `#${session.sessionNumber} — ${phase.label}`)}
      ${row("Session Date", session.date)}
      ${row("Patient Tolerance", session.patientTolerance)}
      ${row("Side Effects Observed", session.sideEffects.length > 0 ? session.sideEffects.join(", ") : "None")}
      ${session.sideEffectNotes ? row("Side Effect Notes", session.sideEffectNotes) : ""}
    </table>

    <h2>Section F — Serious Adverse Event</h2>
    <table>
      ${row("SAE Occurred?", session.sae ? `<strong style="color:#dc2626">YES — SAE reported</strong>` : "No")}
      ${session.sae && session.saeDescription ? row("SAE Description", session.saeDescription) : ""}
    </table>

    <h2>Section G — Discharge</h2>
    <table>
      ${row("Patient Discharged?", session.discharged ? "Yes — clinically stable at discharge" : "Pending")}
      ${row("Transportation Confirmed?", session.transportArranged ? "Yes — patient did not drive home" : "<span style='color:#dc2626'>NOT CONFIRMED — required by REMS</span>")}
      ${row("REMS Form Submitted?", session.remsFormSubmitted ? "✓ Yes" : "<span style='color:#dc2626'>NOT YET — submit at SpravatoREMS.com</span>")}
    </table>

    ${session.clinicalNotes ? `<h2>Clinical Notes</h2><div class="section-box" style="font-size:11px;line-height:1.6;">${session.clinicalNotes}</div>` : ""}

    <h2>Monitoring HCP Signature</h2>
    <div style="margin-top:12px;padding:14px;border:1px solid #e2e8f0;border-radius:6px;">
      <p style="font-size:11px;color:#475569;margin-bottom:16px;">I confirm that this patient received Spravato under direct clinical observation per REMS requirements, was monitored for the required minimum 2 hours post-administration, and was assessed as clinically stable prior to discharge.</p>
      <div style="display:flex;gap:40px;margin-top:8px;">
        <div><span class="sig-line"></span><br/><span style="font-size:10px;color:#64748b">Monitoring HCP Signature</span></div>
        <div><span class="sig-line" style="width:160px"></span><br/><span style="font-size:10px;color:#64748b">Date</span></div>
      </div>
    </div>

    ${footerBlock("Submit to SpravatoREMS.com or fax after every session")}
  </body></html>`;
  printHTML(html);
}

// ─── Export 4: Session History Report ─────────────────────────────────────
function exportSessionReport(patient) {
  const sessions = [...(patient.sessions || [])].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const phq9Score = patient.phq9.every(v => v !== null) ? patient.phq9.reduce((s, v) => s + v, 0) : null;
  const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;

  const sessionRows = sessions.map(s => {
    const phase = sessionPhase(s.sessionNumber);
    return `<tr>
      <td style="font-weight:700;text-align:center">${s.sessionNumber}</td>
      <td>${s.date}</td>
      <td>${phase.label}</td>
      <td>${s.dose}</td>
      <td>${s.bpPreSystolic || "—"}/${s.bpPreDiastolic || "—"}</td>
      <td>${s.bpPost40Systolic || "—"}/${s.bpPost40Diastolic || "—"}</td>
      <td>${s.bpPostSystolic || "—"}/${s.bpPostDiastolic || "—"}</td>
      <td style="text-align:center">${s.pulseOxPre || "—"}%</td>
      <td>${s.sideEffects.filter(e => e !== "None observed").join(", ") || "None"}</td>
      <td style="text-align:center">${s.patientTolerance}</td>
      <td style="text-align:center">${s.remsFormSubmitted ? "✓" : "<span style='color:#dc2626'>⚠</span>"}</td>
      <td style="text-align:center">${s.sae ? "<span style='color:#dc2626'>SAE</span>" : "—"}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><title>Session Report — ${patient.firstName} ${patient.lastName}</title>${printStyles}
    <style>
      table td, table th { font-size: 9.5px; padding: 5px 7px; }
      body { font-size: 10px; }
    </style>
  </head><body>
    ${headerBlock("Treatment Session Report", patient, `${sessions.length} sessions · ${patient.diagnosisCode} · ${patient.insurerName || "Insurance pending"}`)}

    <div class="two-col" style="margin-bottom:14px;">
      <div class="section-box">
        <h3>Baseline PHQ-9</h3>
        <div style="font-size:20px;font-weight:800;color:#1a2332;">${phq9Score !== null ? phq9Score : "—"}</div>
        <div style="font-size:11px;color:#64748b;">${sev ? sev.label : "Not scored"} · ${patient.phq9Date || "No date"}</div>
      </div>
      <div class="section-box">
        <h3>Program Status</h3>
        <div style="font-size:13px;font-weight:700;color:#1a2332;">${sessions.length > 0 ? sessionPhase(sessions.length).label : "Not started"}</div>
        <div style="font-size:11px;color:#64748b;">${sessions.length} of 16+ planned sessions completed</div>
        <div style="font-size:11px;color:${sessions.filter(s => !s.remsFormSubmitted).length > 0 ? "#dc2626" : "#059669"};">
          ${sessions.filter(s => !s.remsFormSubmitted).length > 0 ? `⚠ ${sessions.filter(s => !s.remsFormSubmitted).length} REMS form(s) pending` : "✓ All REMS forms submitted"}
        </div>
      </div>
    </div>

    <h2>Session Log</h2>
    ${sessions.length === 0 ? `<div class="alert-box alert-amber">No sessions recorded yet.</div>` : `
    <table>
      <tr>
        <th>#</th><th>Date</th><th>Phase</th><th>Dose</th>
        <th>BP Pre</th><th>BP 40min</th><th>BP D/C</th>
        <th>SpO₂</th><th>Side Effects</th><th>Tolerance</th>
        <th>REMS</th><th>SAE</th>
      </tr>
      ${sessionRows}
    </table>`}

    ${sessions.filter(s => s.clinicalNotes).length > 0 ? `
    <h2>Clinical Notes by Session</h2>
    ${sessions.filter(s => s.clinicalNotes).map(s => `
      <div class="section-box" style="margin-bottom:8px;">
        <strong style="font-size:11px;">Session #${s.sessionNumber} — ${s.date}</strong>
        <p style="margin-top:6px;font-size:11px;line-height:1.6;color:#334155;">${s.clinicalNotes}</p>
      </div>`).join("")}` : ""}

    ${sessions.filter(s => s.sae).length > 0 ? `
    <h2>Serious Adverse Events</h2>
    <div class="alert-box alert-red">
      ${sessions.filter(s => s.sae).map(s => `<div style="margin-bottom:6px;"><strong>Session #${s.sessionNumber} (${s.date}):</strong> ${s.saeDescription || "SAE documented — description not entered"}</div>`).join("")}
    </div>` : ""}

    <h2>Reauthorization Documentation</h2>
    <div class="alert-box alert-blue" style="font-size:11px;">
      This session report serves as clinical support documentation for prior authorization renewal.
      Include updated PHQ-9 score and physician attestation of continued medical necessity.
      Reauthorization typically required every 1–12 months depending on payer.
    </div>
    <table>
      <tr><td class="label-col">Sessions at Reauth</td><td>${sessions.length}</td></tr>
      <tr><td class="label-col">Clinical Response</td><td>☐ Full remission &nbsp;&nbsp; ☐ Partial response &nbsp;&nbsp; ☐ Minimal response &nbsp;&nbsp; ☐ No response</td></tr>
      <tr><td class="label-col">Updated PHQ-9 Score</td><td>________ / Date: ________</td></tr>
      <tr><td class="label-col">Continued MN Rationale</td><td style="height:48px;"></td></tr>
    </table>

    <div style="margin-top:16px;display:flex;gap:40px;">
      <div><span class="sig-line"></span><br/><span style="font-size:10px;color:#64748b">Prescribing Physician Signature</span></div>
      <div><span class="sig-line" style="width:160px"></span><br/><span style="font-size:10px;color:#64748b">Date</span></div>
    </div>

    ${footerBlock("For reauthorization submission — attach to payer PA renewal form")}
  </body></html>`;
  printHTML(html);
}

// ─── Export Panel Component ────────────────────────────────────────────────
function ExportPanel({ patient }) {
  const [selectedSession, setSelectedSession] = useState(
    patient.sessions?.length > 0 ? patient.sessions[patient.sessions.length - 1].id : null
  );
  const session = (patient.sessions || []).find(s => s.id === selectedSession);

  const ExportCard = ({ icon, title, desc, action, disabled, warning }) => (
    <div style={{ ...S.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontSize: 28, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.gray900, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: C.gray500, lineHeight: 1.5 }}>{desc}</div>
          {warning && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginTop: 6 }}>⚠ {warning}</div>}
        </div>
      </div>
      <button onClick={action} disabled={disabled}
        style={{ ...S.btn(disabled ? "ghost" : "primary"), width: "100%", opacity: disabled ? 0.5 : 1 }}>
        🖨 Print / Export
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={S.sectionTitle}>Form Export & Print</div>
        <div style={{ fontSize: 13, color: C.gray500 }}>All exports open in a new tab and trigger your browser's print dialog. Save as PDF using "Save as PDF" in the print destination.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ExportCard
          icon="📋" title="Patient Summary"
          desc="Complete patient profile — demographics, insurance, diagnosis, PHQ-9, contraindication screening, antidepressant trial history, and program status. Use as your internal intake record."
          action={() => exportPatientSummary(patient)}
          warning={!patient.firstName ? "Demographics incomplete" : null}
        />
        <ExportCard
          icon="📄" title="PA Documentation Package"
          desc="Pre-filled prior authorization submission package with all required payer fields. Attach to any payer's PA form. Includes prescriber signature section."
          action={() => exportPAPackage(patient)}
          warning={!patient.trialOne.drug || !patient.trialTwo.drug ? "Antidepressant trials incomplete — required for PA" : null}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ ...S.card, marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ fontSize: 28 }}>🏥</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.gray900, marginBottom: 4 }}>REMS Monitoring Form Data</div>
              <div style={{ fontSize: 12, color: C.gray500, lineHeight: 1.5 }}>Pre-filled data for a specific session's REMS Patient Monitoring Form. Use to quickly complete the official submission at SpravatoREMS.com.</div>
            </div>
          </div>
          {patient.sessions?.length > 0 ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Select Session</label>
                <Select
                  value={selectedSession || ""}
                  onChange={v => setSelectedSession(v)}
                  options={[...patient.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber).map(s => ({
                    value: s.id,
                    label: `Session #${s.sessionNumber} — ${s.date} — ${s.dose}${!s.remsFormSubmitted ? " ⚠ REMS pending" : " ✓"}`
                  }))}
                />
              </div>
              {session && !session.remsFormSubmitted && (
                <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 10 }}>⚠ REMS form not yet marked as submitted for this session</div>
              )}
              <button onClick={() => session && exportREMSSession(patient, session)}
                disabled={!session}
                style={{ ...S.btn("primary"), width: "100%", opacity: session ? 1 : 0.5 }}>
                🖨 Print REMS Session Data
              </button>
            </>
          ) : (
            <div style={{ padding: "14px", background: C.gray50, borderRadius: 10, fontSize: 12, color: C.gray400, textAlign: "center" }}>
              No sessions logged yet — log a session first
            </div>
          )}
        </div>

        <ExportCard
          icon="📊" title="Session History Report"
          desc="Full treatment log — all sessions with vitals, side effects, tolerance, and REMS submission status. Use for reauthorization documentation. Includes signature section."
          action={() => exportSessionReport(patient)}
          disabled={!patient.sessions?.length}
          warning={patient.sessions?.length === 0 ? "No sessions logged yet" : null}
        />
      </div>

      <div style={{ marginTop: 16, padding: "14px 18px", background: C.tealLight, borderRadius: 12, border: `1px solid #bae6fd`, fontSize: 12, color: "#0369a1" }}>
        <strong>💡 Tip:</strong> In the print dialog, select <strong>"Save as PDF"</strong> as the destination to save a digital copy.
        For PA submissions, print the PA Package and attach it to your payer's specific form from <strong>SpravatoHCP.com</strong>.
      </div>
    </div>
  );
}

// ─── Patient Detail View ───────────────────────────────────────────────────
function PatientDetail({ patient, onUpdate, onDelete, onBack }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const phq9Score = patient.phq9.every(v => v !== null) ? patient.phq9.reduce((s, v) => s + v, 0) : null;
  const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;
  const activePA = (patient.paRecords || []).find(r => r.status === "Approved");
  const urgentPA = (patient.paRecords || []).filter(r => { const u = paUrgency(r); return u && u.color === C.red; });
  const remsUnsent = (patient.sessions || []).filter(s => !s.remsFormSubmitted).length;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: `Sessions (${patient.sessions?.length || 0})` },
    { id: "pa", label: `Prior Auth (${patient.paRecords?.length || 0})` },
    { id: "intake", label: "Intake Data" },
    { id: "exports", label: "🖨 Export" }
  ];

  if (editing) return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <button onClick={() => setEditing(false)} style={S.btn("ghost")}>← Cancel Edit</button>
      </div>
      <PatientForm patient={patient} onSave={p => { onUpdate(p); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );

  return (
    <div>
      {/* Patient header */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>{patient.firstName?.[0]}{patient.lastName?.[0]}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.gray900 }}>{patient.firstName} {patient.lastName}</div>
            <div style={{ fontSize: 13, color: C.gray500, marginTop: 3 }}>
              DOB: {patient.dob} · {patient.insurerName || "Insurance pending"} · {patient.diagnosisCode}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {Object.values(patient.contraindications).some(Boolean) && <span style={S.badge("red")}>⛔ Contraindicated</span>}
            {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color }}>PHQ-9: {phq9Score} — {sev.label}</span>}
            {activePA && <span style={S.badge("green")}>Auth Active</span>}
            {urgentPA.length > 0 && <span style={S.badge("red")}>Auth Expiring</span>}
            {remsUnsent > 0 && <span style={S.badge("amber")}>{remsUnsent} REMS Pending</span>}
            {patient.remsEnrolled && <span style={S.badge("green")}>REMS ✓</span>}
            {patient.withMeEnrolled && <span style={S.badge("green")}>withMe ✓</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            <button onClick={() => setEditing(true)} style={S.btn("ghost")}>Edit</button>
            <button onClick={onDelete} style={S.btn("danger")}>Delete</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.gray100, borderRadius: 12, padding: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "8px 12px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
            background: tab === t.id ? "#fff" : "transparent",
            color: tab === t.id ? C.teal : C.gray500,
            boxShadow: tab === t.id ? "0 1px 6px rgba(0,0,0,0.08)" : "none"
          }}>{t.label}</button>
        ))}
      </div>

      <ErrorBoundary>
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Quick stats */}
            {[
              { label: "Sessions Completed", value: patient.sessions?.length || 0, color: C.teal, bg: C.tealLight },
              { label: "Current Phase", value: patient.sessions?.length > 0 ? sessionPhase(patient.sessions.length).label : "Not Started", color: C.purple, bg: C.purpleLight },
              { label: "PHQ-9 Score", value: phq9Score !== null ? `${phq9Score} (${sev.label})` : "Not scored", color: sev ? sev.color : C.gray400, bg: sev ? sev.bg : C.gray50 },
              { label: "PA Status", value: activePA ? `Active — expires ${activePA.expirationDate || "TBD"}` : patient.paRecords?.length > 0 ? patient.paRecords[patient.paRecords.length - 1].status : "No PA filed", color: activePA ? C.green : C.amber, bg: activePA ? C.greenLight : C.amberLight }
            ].map(stat => (
              <div key={stat.label} style={{ padding: "16px 20px", background: stat.bg, borderRadius: 12, border: `1px solid ${stat.color}20` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: stat.color, textTransform: "uppercase", marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
            {/* Alerts */}
            {(remsUnsent > 0 || urgentPA.length > 0) && (
              <div style={{ gridColumn: "span 2", padding: "14px 18px", background: C.redLight, borderRadius: 12, border: `1px solid #fecaca` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.red, textTransform: "uppercase", marginBottom: 8 }}>⚠ Action Required</div>
                {remsUnsent > 0 && <div style={{ fontSize: 13, color: C.red, marginBottom: 4 }}>• {remsUnsent} REMS Patient Monitoring Form{remsUnsent > 1 ? "s" : ""} not yet submitted to SpravatoREMS.com</div>}
                {urgentPA.map(r => <div key={r.id} style={{ fontSize: 13, color: C.red }}>• PA authorization expired or expiring imminently — reauthorization needed</div>)}
              </div>
            )}
            {/* Contact info */}
            <div style={{ gridColumn: "span 2", ...S.card, marginBottom: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 12 }}>Contact & Insurance</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[["Phone", patient.phone], ["Email", patient.email], ["Insurer", patient.insurerName], ["Policy ID", patient.policyId], ["Group #", patient.groupNumber], ["Plan Type", patient.planType]].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>{lbl}</div>
                    <div style={{ fontSize: 13, color: C.gray900, fontWeight: 500 }}>{val || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "sessions" && <SessionTracker patient={patient} onUpdate={onUpdate} />}
        {tab === "pa" && <PATracker patient={patient} onUpdate={onUpdate} />}
        {tab === "intake" && <div style={S.card}><FormSummary patient={patient} /></div>}
        {tab === "exports" && <ExportPanel patient={patient} />}
      </ErrorBoundary>
    </div>
  );
}

// ─── Patient List ──────────────────────────────────────────────────────────
function PatientList({ patients, onSelect, onNew }) {
  const [search, setSearch] = useState("");
  const filtered = patients.filter(p =>
    `${p.firstName} ${p.lastName} ${p.email} ${p.insurerName}`.toLowerCase().includes(search.toLowerCase())
  );
  const completeness = (p) => {
    let s = 0;
    if (p.firstName && p.lastName) s++;
    if (p.insurerName && p.policyId) s++;
    if (p.trialOne.drug && p.trialTwo.drug) s++;
    if (p.phq9.every(v => v !== null)) s++;
    if (p.remsEnrolled) s++;
    if (p.withMeEnrolled) s++;
    return Math.round((s / 6) * 100);
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.gray900 }}>Patient Registry</div>
          <div style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{patients.length} patient{patients.length !== 1 ? "s" : ""} enrolled</div>
        </div>
        <button onClick={onNew} style={S.btn()}>+ New Patient</button>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients..."
        style={{ ...S.input, marginBottom: 16, fontSize: 14 }} />
      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: "50px 32px" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🏥</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.gray900, marginBottom: 6 }}>No patients yet</div>
          <button onClick={onNew} style={{ ...S.btn(), marginTop: 8 }}>+ Add First Patient</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map(p => {
            const pct = completeness(p);
            const phq9Score = p.phq9.every(v => v !== null) ? p.phq9.reduce((s, v) => s + v, 0) : null;
            const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;
            const hasContra = Object.values(p.contraindications).some(Boolean);
            const remsUnsent = (p.sessions || []).filter(s => !s.remsFormSubmitted).length;
            const urgentPA = (p.paRecords || []).filter(r => { const u = paUrgency(r); return u && u.color === C.red; });
            return (
              <div key={p.id} onClick={() => onSelect(p)}
                style={{ ...S.card, marginBottom: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 18, padding: "16px 22px" }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 20px ${C.teal}20`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{p.firstName?.[0]}{p.lastName?.[0]}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.gray900 }}>{p.firstName} {p.lastName}</div>
                  <div style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>
                    {p.dob} · {p.insurerName || "Insurance pending"} · {p.sessions?.length || 0} sessions
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {hasContra && <span style={S.badge("red")}>⛔</span>}
                  {urgentPA.length > 0 && <span style={S.badge("red")}>Auth!</span>}
                  {remsUnsent > 0 && <span style={S.badge("amber")}>REMS</span>}
                  {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color, fontSize: 11 }}>PHQ-9: {phq9Score}</span>}
                  {p.remsEnrolled && <span style={S.badge("green")}>REMS ✓</span>}
                  <div style={{ width: 72 }}>
                    <div style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textAlign: "right" }}>{pct}%</div>
                    <div style={{ height: 3, background: C.gray200, borderRadius: 4 }}>
                      <div style={{ height: 3, borderRadius: 4, background: pct === 100 ? C.green : pct > 50 ? C.teal : C.amber, width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
function Dashboard({ patients, onNew, onNavigate }) {
  const total = patients.length;
  const totalSessions = patients.reduce((s, p) => s + (p.sessions?.length || 0), 0);
  const remsUnsent = patients.reduce((s, p) => s + (p.sessions || []).filter(se => !se.remsFormSubmitted).length, 0);
  const urgentPAs = patients.filter(p => (p.paRecords || []).some(r => { const u = paUrgency(r); return u && u.color === C.red; }));
  const phq9Done = patients.filter(p => p.phq9.every(v => v !== null));
  const avgScore = phq9Done.length > 0
    ? Math.round(phq9Done.reduce((s, p) => s + p.phq9.reduce((a, b) => a + b, 0), 0) / phq9Done.length) : null;
  const activeAuths = patients.filter(p => (p.paRecords || []).some(r => r.status === "Approved")).length;

  const StatCard = ({ label, value, sub, color = C.teal, bg = C.tealLight, alert }) => (
    <div style={{ background: bg, borderRadius: 14, padding: "18px 20px", border: `1px solid ${color}20`, position: "relative" }}>
      {alert && <div style={{ position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: "50%", background: C.red, boxShadow: `0 0 6px ${C.red}` }} />}
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.gray700, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.gray500, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.gray900 }}>Program Dashboard</div>
          <div style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>Spravato program overview</div>
        </div>
        <button onClick={onNew} style={S.btn()}>+ New Patient</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Patients" value={total} sub="In registry" />
        <StatCard label="Total Sessions" value={totalSessions} sub="All patients" color={C.purple} bg={C.purpleLight} />
        <StatCard label="Active Auths" value={activeAuths} sub="Approved PAs" color={C.green} bg={C.greenLight} />
        <StatCard label="PHQ-9 Avg" value={avgScore !== null ? avgScore : "—"} sub={phq9Done.length > 0 ? `${phq9Done.length} scored` : "None yet"} color="#d97706" bg={C.amberLight} />
        <StatCard label="REMS Pending" value={remsUnsent} sub="Forms to submit" color={remsUnsent > 0 ? C.red : C.green} bg={remsUnsent > 0 ? C.redLight : C.greenLight} alert={remsUnsent > 0} />
        <StatCard label="Auth Alerts" value={urgentPAs.length} sub="Need attention" color={urgentPAs.length > 0 ? C.red : C.green} bg={urgentPAs.length > 0 ? C.redLight : C.greenLight} alert={urgentPAs.length > 0} />
      </div>

      {/* Alerts panel */}
      {(remsUnsent > 0 || urgentPAs.length > 0) && (
        <div style={{ ...S.card, background: C.redLight, border: `1px solid #fecaca`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 12 }}>⚠ Action Required</div>
          {remsUnsent > 0 && (
            <div style={{ fontSize: 13, color: C.red, marginBottom: 6 }}>
              • {remsUnsent} REMS Patient Monitoring Form{remsUnsent > 1 ? "s" : ""} need to be submitted at SpravatoREMS.com
            </div>
          )}
          {urgentPAs.map(p => (
            <div key={p.id} style={{ fontSize: 13, color: C.red, marginBottom: 4 }}>
              • {p.firstName} {p.lastName} — prior authorization expired or expiring soon
            </div>
          ))}
        </div>
      )}

      {total === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: "50px 32px" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚀</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.gray900, marginBottom: 8 }}>Ready to launch your Spravato program</div>
          <div style={{ fontSize: 13, color: C.gray500, marginBottom: 20 }}>Add your first patient to get started</div>
          <button onClick={onNew} style={S.btn()}>+ Add First Patient</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 18 }}>
          <div style={S.card}>
            <div style={S.sectionTitle}>Recent Patients</div>
            {patients.slice(-6).reverse().map(p => {
              const phq9Score = p.phq9.every(v => v !== null) ? p.phq9.reduce((s, v) => s + v, 0) : null;
              const sev = phq9Score !== null ? phq9Severity(phq9Score) : null;
              const remsU = (p.sessions || []).filter(s => !s.remsFormSubmitted).length;
              return (
                <div key={p.id} onClick={() => onNavigate("detail", p)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: `1px solid ${C.gray100}`, cursor: "pointer" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>{p.firstName?.[0]}{p.lastName?.[0]}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</div>
                    <div style={{ fontSize: 11, color: C.gray500 }}>{p.sessions?.length || 0} sessions · {p.insurerName || "No insurer"}</div>
                  </div>
                  {sev && <span style={{ fontSize: 11, fontWeight: 700, color: sev.color }}>PHQ:{phq9Score}</span>}
                  {remsU > 0 && <span style={{ ...S.badge("amber"), fontSize: 10 }}>REMS</span>}
                  {p.remsEnrolled ? <span style={{ ...S.badge("green"), fontSize: 10 }}>REMS✓</span> : <span style={{ ...S.badge("amber"), fontSize: 10 }}>Pending</span>}
                </div>
              );
            })}
          </div>
          <div style={S.card}>
            <div style={S.sectionTitle}>Quick Reference</div>
            {[
              ["REMS Enrollment", "www.SpravatoREMS.com", C.teal],
              ["Spravato withMe", "1-844-479-4846", C.green],
              ["CoverMyMeds PA", "1-866-452-5017", C.amber],
              ["HCP Resources", "www.spravatohcp.com", C.purple]
            ].map(([label, val, color]) => (
              <div key={label} style={{ padding: "10px 14px", background: C.gray50, borderRadius: 10, marginBottom: 8, borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color, fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [patients, setPatients] = useState([]);
  const [view, setView] = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPatients().then(p => { setPatients(p); setLoading(false); }); }, []);

  const handleSave = async (patient) => {
    const updated = patients.some(p => p.id === patient.id)
      ? patients.map(p => p.id === patient.id ? patient : p)
      : [...patients, patient];
    setPatients(updated);
    await savePatients(updated);
    setView("list");
    setSelected(null);
  };

  const handleUpdate = async (patient) => {
    const updated = patients.map(p => p.id === patient.id ? patient : p);
    setPatients(updated);
    await savePatients(updated);
    setSelected(patient);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this patient record? This cannot be undone.")) return;
    const updated = patients.filter(p => p.id !== id);
    setPatients(updated); await savePatients(updated);
    setView("list"); setSelected(null);
  };

  const navigate = (v, patient = null) => { setView(v); if (patient) setSelected(patient); };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "list", label: "Patients", icon: "👥" }
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.gray50 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⚕️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.gray500 }}>Loading...</div>
      </div>
    </div>
  );

  const headerTitle = view === "dashboard" ? "Dashboard" : view === "list" ? "Patient Registry"
    : view === "new" ? "New Patient Intake" : selected ? `${selected.firstName} ${selected.lastName}` : "";

  return (
    <div style={{ ...S.app, display: "flex" }}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={{ padding: "24px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${C.teal},#60c4e8)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 16 }}>⚕️</span>
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>PsychX</div>
              <div style={{ color: "#60a5fa", fontSize: 10, fontWeight: 500 }}>Spravato Program v0.3</div>
            </div>
          </div>
        </div>
        <div style={{ padding: "0 10px", flex: 1 }}>
          {navItems.map(item => (
            <div key={item.id} onClick={() => navigate(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, cursor: "pointer", marginBottom: 2,
                background: (view === item.id || (view === "detail" && item.id === "list")) ? "rgba(26,127,168,0.25)" : "transparent",
                color: (view === item.id || (view === "detail" && item.id === "list")) ? "#60c4e8" : "#94a3b8",
                fontWeight: 600, fontSize: 13, transition: "all 0.15s",
                border: (view === item.id || (view === "detail" && item.id === "list")) ? "1px solid rgba(96,196,232,0.2)" : "1px solid transparent"
              }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
              {item.id === "list" && patients.length > 0 && (
                <span style={{ marginLeft: "auto", background: "rgba(26,127,168,0.4)", color: "#60c4e8", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                  {patients.length}
                </span>
              )}
            </div>
          ))}
          <div style={{ margin: "14px 0 6px", padding: "0 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Actions</div>
          </div>
          <div onClick={() => { setSelected(emptyPatient()); setView("new"); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", color: "#34d399", fontWeight: 600, fontSize: 13, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }}>
            <span>＋</span> New Patient
          </div>
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 10, color: "#475569" }}>Prototype v0.2 · Demo only</div>
          <div style={{ fontSize: 9, color: "#334155", marginTop: 1 }}>No real PHI should be entered</div>
        </div>
      </div>

      {/* Main */}
      <div style={S.main}>
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {(view === "detail" || view === "new") && (
              <button onClick={() => navigate("list")} style={{ ...S.btn("ghost"), padding: "6px 12px", fontSize: 12 }}>← Back</button>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: C.gray900 }}>{headerTitle}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: C.gray400 }}>{patients.length} patient{patients.length !== 1 ? "s" : ""} · Pilot Mode</div>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
          </div>
        </div>
        <div style={S.content}>
          <ErrorBoundary>
            {view === "dashboard" && <Dashboard patients={patients} onNew={() => { setSelected(emptyPatient()); setView("new"); }} onNavigate={navigate} />}
            {view === "list" && <PatientList patients={patients} onNew={() => { setSelected(emptyPatient()); setView("new"); }} onSelect={p => navigate("detail", p)} />}
            {view === "new" && selected && <PatientForm patient={selected} onSave={handleSave} onCancel={() => navigate("list")} />}
            {view === "detail" && selected && (
              <PatientDetail patient={selected} onUpdate={handleUpdate} onDelete={() => handleDelete(selected.id)} onBack={() => navigate("list")} />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
