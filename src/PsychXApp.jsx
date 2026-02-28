import { useState, useEffect, useRef, Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, background: "#fef2f2", borderRadius: 16, border: "2px solid #fecaca", margin: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 16, fontFamily: "monospace", background: "#fff", padding: 12, borderRadius: 8 }}>{this.state.error?.message || "Unknown error"}</div>
        <button onClick={() => this.setState({ error: null })} style={{ padding: "8px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

const STORAGE_KEY = "psychx_patients_v4";
async function loadPatients() {
  try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
}
async function savePatients(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

// ── Constants ──────────────────────────────────────────────────────────────
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

const DRUG_CLASSES = {
  "Fluoxetine (Prozac)": "SSRI", "Sertraline (Zoloft)": "SSRI", "Escitalopram (Lexapro)": "SSRI",
  "Citalopram (Celexa)": "SSRI", "Paroxetine (Paxil)": "SSRI", "Fluvoxamine (Luvox)": "SSRI",
  "Vilazodone (Viibryd)": "SSRI",
  "Venlafaxine (Effexor)": "SNRI", "Duloxetine (Cymbalta)": "SNRI", "Desvenlafaxine (Pristiq)": "SNRI",
  "Levomilnacipran (Fetzima)": "SNRI",
  "Bupropion (Wellbutrin)": "NDRI",
  "Mirtazapine (Remeron)": "NaSSA",
  "Amitriptyline": "TCA", "Nortriptyline": "TCA", "Imipramine": "TCA", "Clomipramine": "TCA",
  "Phenelzine (Nardil)": "MAOI", "Tranylcypromine (Parnate)": "MAOI", "Selegiline (EMSAM)": "MAOI",
  "Trazodone": "SARI",
  "Vortioxetine (Trintellix)": "SMS",
  "Lithium augmentation": "Augmentation", "Aripiprazole (Abilify) augmentation": "Augmentation",
  "Quetiapine (Seroquel) augmentation": "Augmentation", "Lamotrigine augmentation": "Augmentation",
  "Other": "Other"
};
const ANTIDEPRESSANTS = Object.keys(DRUG_CLASSES);

const SIDE_EFFECTS = [
  "Dissociation", "Dizziness", "Nausea", "Sedation", "Headache",
  "Blood pressure elevation", "Anxiety", "Vomiting", "Vertigo",
  "Perceptual changes", "Euphoria", "Increased heart rate", "None observed"
];

const PA_STATUSES = ["Pending", "Approved", "Denied", "Under Appeal", "Reauth Due", "Expired"];
const DENIAL_REASONS = [
  "Missing information / errors", "Diagnosis-related denial", "Wrong benefit submitted",
  "Step therapy — insufficient trials", "Must be prescribed by psychiatrist",
  "Specialty pharmacy out-of-network", "Not medically necessary",
  "Incomplete documentation", "Auth expired before submission", "Other"
];

const US_STATES = ["","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY","DC"];

const DISC_REASONS = ["","Inadequate response","Partial response only","Intolerable side effects",
  "Patient preference","Cost / access","Drug interaction","Allergic reaction","Physician recommendation","Other"];

const PSYCH_OPTIONS = [
  { value: "", label: "Select..." }, { value: "None", label: "None" },
  { value: "CBT — adequate trial (≥8 sessions)", label: "CBT — adequate trial (≥8 sessions)" },
  { value: "CBT — partial / incomplete", label: "CBT — partial / incomplete" },
  { value: "DBT", label: "DBT (Dialectical Behavior Therapy)" },
  { value: "IPT", label: "IPT (Interpersonal Therapy)" },
  { value: "Mindfulness-based cognitive therapy", label: "Mindfulness-based cognitive therapy" },
  { value: "Psychodynamic therapy", label: "Psychodynamic therapy" },
  { value: "Other therapy", label: "Other therapy" },
  { value: "Refused", label: "Patient refused" }
];

// ── Helpers ────────────────────────────────────────────────────────────────
function phq9Severity(s) {
  if (s <= 4) return { label: "Minimal", color: "#22c55e", bg: "#f0fdf4" };
  if (s <= 9) return { label: "Mild", color: "#84cc16", bg: "#f7fee7" };
  if (s <= 14) return { label: "Moderate", color: "#f59e0b", bg: "#fffbeb" };
  if (s <= 19) return { label: "Moderately Severe", color: "#f97316", bg: "#fff7ed" };
  return { label: "Severe", color: "#ef4444", bg: "#fef2f2" };
}
function sessionPhase(n) {
  if (n <= 8) return { label: "Induction", color: "#1a7fa8", bg: "#f0f9ff" };
  if (n <= 16) return { label: "Early Maintenance", color: "#7c3aed", bg: "#faf5ff" };
  return { label: "Ongoing Maintenance", color: "#059669", bg: "#f0fdf4" };
}
function daysUntil(d) { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 86400000); }
function paUrgency(pa) {
  if (!pa.expirationDate || pa.status === "Denied" || pa.status === "Expired") return null;
  const d = daysUntil(pa.expirationDate);
  if (d === null) return null;
  if (d < 0) return { label: "Expired", color: "#dc2626", bg: "#fef2f2" };
  if (d <= 14) return { label: `${d}d left`, color: "#dc2626", bg: "#fef2f2" };
  if (d <= 30) return { label: `${d}d left`, color: "#f59e0b", bg: "#fffbeb" };
  return { label: `${d}d left`, color: "#059669", bg: "#f0fdf4" };
}

// ── Data models ────────────────────────────────────────────────────────────
const emptyTrial = () => ({
  id: Date.now().toString() + Math.random(),
  drug: "", drugClass: "", dose: "", startDate: "", endDate: "",
  durationWeeks: "", reason: "", adequateTrial: true, notes: ""
});
const emptySession = (num) => ({
  id: Date.now().toString(), sessionNumber: num,
  date: new Date().toISOString().split("T")[0], dose: "56mg",
  bpPreSystolic: "", bpPreDiastolic: "", bpPost40Systolic: "", bpPost40Diastolic: "",
  bpPostSystolic: "", bpPostDiastolic: "", pulseOxPre: "", pulseOxDuring: "", pulseOxPost: "",
  sideEffects: [], sideEffectNotes: "", patientTolerance: "Good",
  remsFormSubmitted: false, sae: false, saeDescription: "",
  clinicalNotes: "", transportArranged: true, discharged: false
});
const emptyPA = () => ({
  id: Date.now().toString(), submittedDate: new Date().toISOString().split("T")[0],
  payer: "", benefitType: "medical", authNumber: "", status: "Pending",
  startDate: "", expirationDate: "", denialReason: "", appealDate: "",
  appealNotes: "", reauthSubmittedDate: "", notes: ""
});
const emptyShipment = () => ({
  id: Date.now().toString(), receivedDate: new Date().toISOString().split("T")[0],
  dose: "56mg", devices: "1", lotNumber: "", expirationDate: "", notes: ""
});
const emptyPatient = () => ({
  id: Date.now().toString(), createdAt: new Date().toISOString(),
  firstName: "", lastName: "", dob: "", gender: "", phone: "", email: "",
  address: "", city: "", state: "", zip: "",
  insurerName: "", planType: "commercial", policyHolder: "", policyId: "", groupNumber: "",
  insuranceCardFront: null, insuranceCardBack: null,
  diagnosisCode: "F33.2", diagnosisDate: "",
  priorSpravatoUse: false, priorSpravatoDetails: "",
  currentOralAD: "", currentOralADDose: "",
  tmsHistory: false, tmsDetails: "",
  treatmentGoals: "", patientAgreesGoals: false,
  trials: [emptyTrial(), emptyTrial()],
  psychotherapy: "", psychiatristConsult: false, psychiatristName: "",
  contraindications: { aneurysm: false, avmHistory: false, ich: false, hypersensitivity: false },
  hypertension: false, substanceHistory: false, psychosisHistory: false,
  concomitantMeds: "",
  phq9: Array(9).fill(null), phq9Date: "",
  hamd17Score: "", hamd17Date: "",
  remsEnrolled: false, remsEnrollmentDate: "", remsPatientId: "",
  remsHcpSigned: false, remsPatientSigned: false,
  withMeEnrolled: false, withMeEnrollmentDate: "",
  sessions: [], paRecords: [], shipments: [], notes: ""
});

// ── Colors & Styles ────────────────────────────────────────────────────────
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
  sidebar: { width: 260, background: `linear-gradient(180deg,${C.navy},${C.navyMid})`, minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100, boxShadow: "4px 0 24px rgba(0,0,0,0.18)" },
  main: { marginLeft: 260, minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: { background: "#fff", borderBottom: `1px solid ${C.gray200}`, padding: "0 32px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" },
  content: { padding: "28px 32px", flex: 1 },
  card: { background: "#fff", borderRadius: 16, padding: "24px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${C.gray200}`, marginBottom: 20 },
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
  inp: (err) => ({ width: "100%", padding: "9px 13px", borderRadius: 10, border: `1.5px solid ${err ? C.red : C.gray200}`, fontSize: 13, fontFamily: "inherit", color: C.gray900, background: err ? "#fff8f8" : "#fff", outline: "none", boxSizing: "border-box" }),
  lbl: { fontSize: 11, fontWeight: 700, color: C.gray500, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  secTitle: { fontSize: 16, fontWeight: 700, color: C.gray900, marginBottom: 18, paddingBottom: 10, borderBottom: `2px solid ${C.gray100}` },
  badge: (color) => ({
    display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
    background: color === "green" ? "#dcfce7" : color === "amber" ? "#fef3c7" : color === "red" ? "#fee2e2" : color === "blue" ? "#dbeafe" : color === "purple" ? "#ede9fe" : "#f1f5f9",
    color: color === "green" ? "#166534" : color === "amber" ? "#92400e" : color === "red" ? "#991b1b" : color === "blue" ? "#1e40af" : color === "purple" ? "#5b21b6" : "#475569"
  })
};

// ── Validation ─────────────────────────────────────────────────────────────
function validatePatient(p) {
  const e = {};
  if (!p.firstName?.trim()) e.firstName = "First name required";
  if (!p.lastName?.trim()) e.lastName = "Last name required";
  if (!p.dob) e.dob = "Date of birth required";
  if (!p.gender) e.gender = "Gender required";
  if (!p.phone?.trim()) e.phone = "Phone required";
  if (!p.insurerName?.trim()) e.insurerName = "Insurance company required";
  if (!p.policyId?.trim()) e.policyId = "Policy ID required";
  if (!p.diagnosisCode) e.diagnosisCode = "Diagnosis code required";
  if (!p.diagnosisDate) e.diagnosisDate = "Diagnosis date required";
  const t0 = p.trials?.[0]; const t1 = p.trials?.[1];
  if (!t0?.drug) e.t0drug = "Trial 1 medication required";
  if (!t0?.durationWeeks) e.t0dur = "Trial 1 duration required";
  if (!t0?.reason) e.t0reason = "Trial 1 reason required";
  if (!t1?.drug) e.t1drug = "Trial 2 medication required";
  if (!t1?.durationWeeks) e.t1dur = "Trial 2 duration required";
  if (!t1?.reason) e.t1reason = "Trial 2 reason required";
  const hasSSRISNRI = (p.trials || []).some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI");
  if (!hasSSRISNRI) e.trialClass = "At least one SSRI or SNRI required for PA";
  return e;
}
function stepErrors(p, step) {
  const all = validatePatient(p);
  const map = {
    0: ["firstName","lastName","dob","gender","phone"],
    1: ["insurerName","policyId"],
    2: ["diagnosisCode","diagnosisDate","t0drug","t0dur","t0reason","t1drug","t1dur","t1reason","trialClass"],
    3: [], 4: []
  };
  return Object.fromEntries(Object.entries(all).filter(([k]) => (map[step]||[]).includes(k)));
}

// ── UI Primitives ──────────────────────────────────────────────────────────
function Input({ value, onChange, placeholder, type = "text", style = {}, disabled, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ ...S.inp(error), borderColor: focused ? C.teal : error ? C.red : C.gray200, opacity: disabled ? 0.6 : 1, ...style }} />
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 3, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
function Select({ value, onChange, options, style = {}, error }) {
  return (
    <div>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)}
        style={{ ...S.inp(error), appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 36, ...style }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 3, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
function Checkbox({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: C.gray700 }}>
      <div onClick={() => onChange(!checked)} style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, border: `2px solid ${checked ? C.teal : "#cbd5e1"}`, background: checked ? C.teal : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", cursor: "pointer" }}>
        {checked && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
      </div>
      <span style={{ lineHeight: 1.5 }}>{label}</span>
    </label>
  );
}
function Textarea({ value, onChange, placeholder, rows = 3 }) {
  const [f, setF] = useState(false);
  return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    onFocus={() => setF(true)} onBlur={() => setF(false)}
    style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6, borderColor: f ? C.teal : C.gray200 }} />;
}
function FL({ label, required }) {
  return <label style={{ ...S.lbl, display: "flex", gap: 4 }}>{label}{required && <span style={{ color: C.red }}>*</span>}</label>;
}
function Field({ label, required, children, span = 1 }) {
  return <div style={{ gridColumn: `span ${span}` }}><FL label={label} required={required} />{children}</div>;
}
function MultiSelect({ options, selected, onChange, label }) {
  const toggle = o => onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o]);
  return (
    <div>
      {label && <FL label={label} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {options.map(o => {
          const on = selected.includes(o);
          return <div key={o} onClick={() => toggle(o)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? C.teal : C.gray100, color: on ? "#fff" : C.gray500, border: `1.5px solid ${on ? C.teal : C.gray200}`, transition: "all 0.15s" }}>{o}</div>;
        })}
      </div>
    </div>
  );
}
function VitalsInput({ label, systolic, diastolic, onSys, onDia, ox, onOx, type = "bp" }) {
  if (type === "ox") return (
    <div><FL label={label} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input value={ox ?? ""} onChange={e => onOx(e.target.value)} placeholder="98" style={{ ...S.inp(false), width: 72 }} />
        <span style={{ fontSize: 12, color: C.gray500 }}>%</span>
      </div>
    </div>
  );
  return (
    <div><FL label={label} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input value={systolic ?? ""} onChange={e => onSys(e.target.value)} placeholder="120" style={{ ...S.inp(false), width: 64 }} />
        <span style={{ fontSize: 16, color: C.gray400, fontWeight: 700 }}>/</span>
        <input value={diastolic ?? ""} onChange={e => onDia(e.target.value)} placeholder="80" style={{ ...S.inp(false), width: 64 }} />
        <span style={{ fontSize: 10, color: C.gray500 }}>mmHg</span>
      </div>
    </div>
  );
}
function ImageCapture({ label, value, onChange }) {
  const ref = useRef();
  const handle = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onChange(ev.target.result); r.readAsDataURL(f); };
  return (
    <div><FL label={label} />
      <input type="file" ref={ref} accept="image/*" capture="environment" onChange={handle} style={{ display: "none" }} />
      {value ? (
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `2px solid ${C.teal}` }}>
          <img src={value} alt={label} style={{ width: "100%", maxHeight: 140, objectFit: "cover", display: "block" }} />
          <button onClick={() => onChange(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, color: "#fff", padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>Remove</button>
        </div>
      ) : (
        <div onClick={() => ref.current?.click()} style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "22px 16px", textAlign: "center", cursor: "pointer", background: C.gray50 }}>
          <div style={{ fontSize: 22, marginBottom: 5 }}>📷</div>
          <div style={{ fontSize: 12, color: C.gray500 }}>Click to capture or upload</div>
        </div>
      )}
    </div>
  );
}
function EnrollBtn({ label, url, icon }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, color: "#fff", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 13, boxShadow: `0 2px 8px ${C.teal}40` }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div><div style={{ fontWeight: 700 }}>{label}</div><div style={{ fontSize: 10, opacity: 0.8, marginTop: 1 }}>Opens in new tab →</div></div>
    </a>
  );
}

// ── PHQ-9 ──────────────────────────────────────────────────────────────────
function PHQ9Form({ answers, onChange, date, onDateChange }) {
  const score = answers.reduce((s, v) => s + (v ?? 0), 0);
  const complete = answers.every(v => v !== null);
  const sev = complete ? phq9Severity(score) : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={S.secTitle}>PHQ-9 Depression Screening</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FL label="Assessment Date" required />
          <input type="date" value={date ?? ""} onChange={e => onDateChange(e.target.value)} style={{ ...S.inp(false), width: "auto" }} />
        </div>
      </div>
      <div style={{ background: C.gray50, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.gray500 }}>
        Over the <strong>last 2 weeks</strong>, how often have you been bothered by any of the following problems?
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 88px)", gap: 6, padding: "4px 10px", marginBottom: 3 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textTransform: "uppercase" }}>Question</div>
        {PHQ9_OPTIONS.map((o, i) => <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textAlign: "center", textTransform: "uppercase" }}>{o}<br/>({i})</div>)}
      </div>
      {PHQ9_QUESTIONS.map((q, qi) => (
        <div key={qi} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 88px)", gap: 6, padding: "11px 10px", borderRadius: 8, marginBottom: 3, alignItems: "center", background: answers[qi] !== null ? "#f0f9ff" : qi % 2 === 0 ? C.gray50 : "#fff", border: `1px solid ${answers[qi] !== null ? "#bae6fd" : C.gray100}` }}>
          <div style={{ fontSize: 12, color: C.gray700, lineHeight: 1.4 }}>
            <span style={{ color: C.gray400, marginRight: 6, fontWeight: 700 }}>{qi + 1}.</span>{q}
          </div>
          {[0,1,2,3].map(val => (
            <div key={val} style={{ display: "flex", justifyContent: "center" }}>
              <div onClick={() => { const a = [...answers]; a[qi] = val; onChange(a); }} style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${answers[qi] === val ? C.teal : "#cbd5e1"}`, background: answers[qi] === val ? C.teal : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {answers[qi] === val && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
            </div>
          ))}
        </div>
      ))}
      {complete && sev && (
        <div style={{ marginTop: 14, padding: "16px 20px", borderRadius: 12, background: sev.bg, border: `2px solid ${sev.color}30`, display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 38, fontWeight: 800, color: sev.color, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 10, color: C.gray500, fontWeight: 700, textTransform: "uppercase", marginTop: 2 }}>Score</div>
          </div>
          <div style={{ width: 1, height: 48, background: C.gray200 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: sev.color }}>{sev.label} Depression</div>
            <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{score >= 10 ? "PHQ-9 ≥10 — supports Spravato candidacy" : "PHQ-9 <10 — reassess TRD eligibility"}</div>
          </div>
          {answers[8] > 0 && (
            <div style={{ padding: "10px 14px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.red }}>⚠ Q9 Positive</div>
              <div style={{ fontSize: 11, color: C.red }}>Safety assessment required</div>
            </div>
          )}
        </div>
      )}
      {!complete && answers.filter(v => v !== null).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.gray400, textAlign: "center" }}>{answers.filter(v => v !== null).length}/9 answered</div>
      )}
    </div>
  );
}

// ── Trial Editor ───────────────────────────────────────────────────────────
function TrialEditor({ trials, onChange }) {
  const updateTrial = (idx, field, value) => {
    const updated = trials.map((t, i) => {
      if (i !== idx) return t;
      const u = { ...t, [field]: value };
      if (field === "drug") u.drugClass = DRUG_CLASSES[value] || "";
      return u;
    });
    onChange(updated);
  };
  const addTrial = () => onChange([...trials, emptyTrial()]);
  const removeTrial = idx => { if (trials.length <= 2) return; onChange(trials.filter((_, i) => i !== idx)); };
  const hasSSRISNRI = trials.some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI");
  const classColor = { SSRI: C.green, SNRI: C.teal, NDRI: "#d97706", TCA: C.purple, MAOI: C.red, NaSSA: "#0891b2", SARI: "#7c3aed", SMS: C.teal, Augmentation: "#6b7280", Other: C.gray500 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={S.secTitle}>Antidepressant Trial History</div>
        <button onClick={addTrial} style={{ ...S.btn("ghost"), fontSize: 12, padding: "6px 14px" }}>+ Add Trial</button>
      </div>
      {!hasSSRISNRI && trials.some(t => t.drug) && (
        <div style={{ padding: "10px 14px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: 14 }}>
          ⚠ PA Requirement: At least one trial must be an SSRI or SNRI. Add an SSRI or SNRI trial before submitting PA.
        </div>
      )}
      {trials.map((trial, idx) => (
        <div key={trial.id} style={{ border: `1.5px solid ${C.gray200}`, borderRadius: 14, padding: "16px 18px", marginBottom: 12, background: trial.drug ? "#fafeff" : "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: C.teal, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>{idx + 1}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Trial {idx + 1}{idx < 2 ? " (Required)" : " (Additional)"}</span>
              {trial.drugClass && <span style={{ ...S.badge(""), background: `${classColor[trial.drugClass]||C.gray500}20`, color: classColor[trial.drugClass]||C.gray500 }}>{trial.drugClass}</span>}
              {(trial.drugClass === "SSRI" || trial.drugClass === "SNRI") && <span style={S.badge("green")}>✓ Qualifies for PA</span>}
            </div>
            {trials.length > 2 && <button onClick={() => removeTrial(idx)} style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: 11 }}>Remove</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
            <Field label="Medication" required={idx < 2}>
              <Select value={trial.drug} onChange={v => updateTrial(idx, "drug", v)}
                options={[{ value: "", label: "Select medication..." }, ...ANTIDEPRESSANTS.map(a => ({ value: a, label: a }))]}
                error={idx < 2 && !trial.drug ? "Required" : null} />
            </Field>
            <Field label="Drug Class (auto)">
              <div style={{ ...S.inp(false), background: C.gray50, color: trial.drugClass ? classColor[trial.drugClass]||C.gray700 : C.gray400, fontWeight: 600 }}>{trial.drugClass || "Auto-fills on selection"}</div>
            </Field>
            <Field label="Dose"><Input value={trial.dose} onChange={v => updateTrial(idx, "dose", v)} placeholder="e.g. 20mg" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
            <Field label="Start Date"><Input type="date" value={trial.startDate} onChange={v => updateTrial(idx, "startDate", v)} /></Field>
            <Field label="End Date"><Input type="date" value={trial.endDate} onChange={v => updateTrial(idx, "endDate", v)} /></Field>
            <Field label="Duration (weeks)" required={idx < 2}>
              <Select value={trial.durationWeeks} onChange={v => updateTrial(idx, "durationWeeks", v)}
                options={[{ value: "", label: "Select..." }, ...["<4","4","5","6","7","8","9","10","11","12","16","20","24","26+"].map(w => ({ value: w, label: `${w} weeks` }))]}
                error={idx < 2 && !trial.durationWeeks ? "Required" : null} />
            </Field>
            <Field label="Adequate Trial?">
              <Select value={trial.adequateTrial ? "yes" : "no"} onChange={v => updateTrial(idx, "adequateTrial", v === "yes")}
                options={[{ value: "yes", label: "Yes (≥6 weeks)" }, { value: "no", label: "No — subtherapeutic" }]} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Reason Discontinued" required={idx < 2}>
              <Select value={trial.reason} onChange={v => updateTrial(idx, "reason", v)}
                options={DISC_REASONS.map(r => ({ value: r, label: r || "Select..." }))}
                error={idx < 2 && !trial.reason ? "Required" : null} />
            </Field>
            <Field label="Notes"><Input value={trial.notes} onChange={v => updateTrial(idx, "notes", v)} placeholder="Fill dates, pharmacy records, etc." /></Field>
          </div>
          {trial.durationWeeks && parseInt(trial.durationWeeks) < 6 && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: C.amberLight, borderRadius: 8, fontSize: 11, color: "#92400e", fontWeight: 600 }}>
              ⚠ Duration &lt;6 weeks — may not meet payer definition of adequate trial
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Session Tracker ────────────────────────────────────────────────────────
function SessionTracker({ patient, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [session, setSession] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const upd = (f, v) => setSession(p => ({ ...p, [f]: v }));
  const startNew = () => { setSession(emptySession((patient.sessions||[]).length + 1)); setAdding(true); };
  const save = () => { onUpdate({ ...patient, sessions: [...(patient.sessions||[]), session] }); setAdding(false); setSession(null); };
  const del = id => { if (!window.confirm("Delete this session?")) return; onUpdate({ ...patient, sessions: patient.sessions.filter(s => s.id !== id) }); };
  const sessions = [...(patient.sessions||[])].sort((a,b) => b.sessionNumber - a.sessionNumber);
  const remsUnsent = (patient.sessions||[]).filter(s => !s.remsFormSubmitted).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={S.secTitle}>Session Log</div>
          <div style={{ display: "flex", gap: 10, marginTop: -10 }}>
            <span style={{ fontSize: 13, color: C.gray500 }}>{(patient.sessions||[]).length} sessions</span>
            {remsUnsent > 0 && <span style={{ ...S.badge("red"), fontSize: 11 }}>⚠ {remsUnsent} REMS pending</span>}
          </div>
        </div>
        {!adding && <button onClick={startNew} style={S.btn()}>+ Log New Session</button>}
      </div>
      {adding && session && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, background: "#f9feff" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 16 }}>Session #{session.sessionNumber} — {sessionPhase(session.sessionNumber).label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            <Field label="Date" required><Input type="date" value={session.date} onChange={v => upd("date", v)} /></Field>
            <Field label="Dose" required>
              <Select value={session.dose} onChange={v => upd("dose", v)} options={[{ value: "56mg", label: "56mg (2 devices)" }, { value: "84mg", label: "84mg (3 devices)" }]} />
            </Field>
            <Field label="Tolerance">
              <Select value={session.patientTolerance} onChange={v => upd("patientTolerance", v)} options={["Good","Fair","Poor"].map(o => ({ value: o, label: o }))} />
            </Field>
          </div>
          <div style={{ background: C.gray50, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 12 }}>Vital Signs — REMS Required</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
              <VitalsInput label="BP Pre-Admin" systolic={session.bpPreSystolic} diastolic={session.bpPreDiastolic} onSys={v => upd("bpPreSystolic",v)} onDia={v => upd("bpPreDiastolic",v)} />
              <VitalsInput label="BP ~40min" systolic={session.bpPost40Systolic} diastolic={session.bpPost40Diastolic} onSys={v => upd("bpPost40Systolic",v)} onDia={v => upd("bpPost40Diastolic",v)} />
              <VitalsInput label="BP Discharge" systolic={session.bpPostSystolic} diastolic={session.bpPostDiastolic} onSys={v => upd("bpPostSystolic",v)} onDia={v => upd("bpPostDiastolic",v)} />
              <VitalsInput label="SpO₂ Pre" type="ox" ox={session.pulseOxPre} onOx={v => upd("pulseOxPre",v)} />
              <VitalsInput label="SpO₂ During" type="ox" ox={session.pulseOxDuring} onOx={v => upd("pulseOxDuring",v)} />
              <VitalsInput label="SpO₂ D/C" type="ox" ox={session.pulseOxPost} onOx={v => upd("pulseOxPost",v)} />
            </div>
            {(parseInt(session.bpPreSystolic) > 140 || parseInt(session.bpPreDiastolic) > 90) && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", fontWeight: 600 }}>⚠ Pre-admin BP >140/90 — physician must evaluate before proceeding</div>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <MultiSelect label="Side Effects Observed" options={SIDE_EFFECTS} selected={session.sideEffects} onChange={v => upd("sideEffects", v)} />
            {session.sideEffects.length > 0 && !session.sideEffects.includes("None observed") && (
              <div style={{ marginTop: 10 }}><FL label="Side Effect Notes" /><Textarea value={session.sideEffectNotes} onChange={v => upd("sideEffectNotes",v)} placeholder="Severity, timing, resolution..." rows={2} /></div>
            )}
          </div>
          <div style={{ marginBottom: 14, padding: "12px 16px", background: C.redLight, borderRadius: 12, border: "1px solid #fecaca" }}>
            <Checkbox checked={session.sae} onChange={v => upd("sae",v)} label="Serious Adverse Event (SAE) — sedation, respiratory depression, or hypertension requiring emergency intervention" />
            {session.sae && <div style={{ marginTop: 10 }}><FL label="SAE Description" required /><Textarea value={session.saeDescription} onChange={v => upd("saeDescription",v)} placeholder="Describe the event..." rows={2} /></div>}
          </div>
          <div style={{ marginBottom: 14 }}><FL label="Clinical Notes" /><Textarea value={session.clinicalNotes} onChange={v => upd("clinicalNotes",v)} placeholder="Patient response, observations, plan for next session..." rows={3} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Checkbox checked={session.remsFormSubmitted} onChange={v => upd("remsFormSubmitted",v)} label="REMS Monitoring Form submitted at SpravatoREMS.com" />
            <Checkbox checked={session.transportArranged} onChange={v => upd("transportArranged",v)} label="Transportation home confirmed — patient not driving" />
            <Checkbox checked={session.discharged} onChange={v => upd("discharged",v)} label="Patient discharged (clinically stable)" />
          </div>
          {!session.remsFormSubmitted && <div style={{ marginBottom: 12, padding: "10px 14px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", fontWeight: 600 }}>⚠ REMS Patient Monitoring Form must be submitted within 7 days of each session</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => { setAdding(false); setSession(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ Save Session</button>
          </div>
        </div>
      )}
      {sessions.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}><div style={{ fontSize: 32, marginBottom: 8 }}>💉</div><div style={{ fontSize: 14, fontWeight: 600 }}>No sessions logged yet</div></div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {sessions.map(s => {
            const phase = sessionPhase(s.sessionNumber);
            const expanded = expandedId === s.id;
            return (
              <div key={s.id} style={{ ...S.card, marginBottom: 0, padding: 0, overflow: "hidden" }}>
                <div onClick={() => setExpandedId(expanded ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", background: expanded ? "#f9feff" : "#fff" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: phase.bg, border: `2px solid ${phase.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: phase.color }}>#{s.sessionNumber}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
                    <div style={{ fontSize: 11, color: C.gray500 }}>{s.dose} · {phase.label} · {s.patientTolerance} tolerance</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {s.sae && <span style={S.badge("red")}>SAE</span>}
                    {s.remsFormSubmitted ? <span style={S.badge("green")}>REMS ✓</span> : <span style={S.badge("amber")}>REMS ⚠</span>}
                    <span style={{ fontSize: 16, color: C.gray400 }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.gray100}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12, marginBottom: 12 }}>
                      {[["BP Pre",`${s.bpPreSystolic||"—"}/${s.bpPreDiastolic||"—"} mmHg`],["BP 40m",`${s.bpPost40Systolic||"—"}/${s.bpPost40Diastolic||"—"} mmHg`],["BP D/C",`${s.bpPostSystolic||"—"}/${s.bpPostDiastolic||"—"} mmHg`],["SpO₂ Pre",`${s.pulseOxPre||"—"}%`],["SpO₂ During",`${s.pulseOxDuring||"—"}%`],["SpO₂ D/C",`${s.pulseOxPost||"—"}%`]].map(([l,v]) => (
                        <div key={l} style={{ background: C.gray50, borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 9, color: C.gray400, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div></div>
                      ))}
                    </div>
                    {s.sideEffects.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 4 }}>Side Effects</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{s.sideEffects.map(se => <span key={se} style={S.badge(se === "None observed" ? "green" : "amber")}>{se}</span>)}</div>{s.sideEffectNotes && <div style={{ fontSize: 12, color: C.gray700, marginTop: 4 }}>{s.sideEffectNotes}</div>}</div>}
                    {s.clinicalNotes && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 4 }}>Clinical Notes</div><div style={{ fontSize: 12, color: C.gray700, lineHeight: 1.5 }}>{s.clinicalNotes}</div></div>}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}><button onClick={() => del(s.id)} style={S.btn("danger")}>Delete Session</button></div>
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

// ── PA Tracker ─────────────────────────────────────────────────────────────
function PATracker({ patient, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [pa, setPa] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const upd = (f, v) => setPa(p => ({ ...p, [f]: v }));
  const save = () => {
    const updated = editId
      ? { ...patient, paRecords: patient.paRecords.map(r => r.id === editId ? pa : r) }
      : { ...patient, paRecords: [...(patient.paRecords||[]), pa] };
    onUpdate(updated); setAdding(false); setEditId(null); setPa(null);
  };
  const edit = r => { setPa({ ...r }); setEditId(r.id); setAdding(true); };
  const del = id => { if (!window.confirm("Delete this PA record?")) return; onUpdate({ ...patient, paRecords: patient.paRecords.filter(r => r.id !== id) }); };
  const quickStatus = (id, status) => onUpdate({ ...patient, paRecords: patient.paRecords.map(r => r.id === id ? { ...r, status } : r) });
  const records = [...(patient.paRecords||[])].sort((a,b) => new Date(b.submittedDate) - new Date(a.submittedDate));
  const activePA = records.find(r => r.status === "Approved");
  const urgentCount = records.filter(r => { const u = paUrgency(r); return u && (u.color === C.red || u.color === C.amber); }).length;
  const sColor = s => s === "Approved" ? "green" : s === "Pending" ? "blue" : s === "Denied" ? "red" : s === "Expired" ? "red" : "amber";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={S.secTitle}>Prior Authorization Tracker</div>
          <div style={{ display: "flex", gap: 10, marginTop: -10 }}>
            <span style={{ fontSize: 13, color: C.gray500 }}>{records.length} record{records.length !== 1 ? "s" : ""}</span>
            {urgentCount > 0 && <span style={{ ...S.badge("amber"), fontSize: 11 }}>⚠ {urgentCount} need attention</span>}
            {activePA && <span style={{ ...S.badge("green"), fontSize: 11 }}>✓ Active through {activePA.expirationDate||"?"}</span>}
          </div>
        </div>
        {!adding && <button onClick={() => { setPa(emptyPA()); setAdding(true); }} style={S.btn()}>+ Add PA Record</button>}
      </div>

      {adding && pa && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, background: "#f9feff", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 16 }}>{editId ? "Edit PA Record" : "New Prior Authorization Record"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Payer" required><Input value={pa.payer} onChange={v => upd("payer",v)} placeholder={patient.insurerName || "Insurance company"} /></Field>
            <Field label="Benefit Type" required>
              <Select value={pa.benefitType} onChange={v => upd("benefitType",v)} options={[{ value:"medical",label:"Medical Benefit" },{ value:"pharmacy",label:"Pharmacy Benefit" },{ value:"both",label:"Both" }]} />
            </Field>
            <Field label="Submission Date" required><Input type="date" value={pa.submittedDate} onChange={v => upd("submittedDate",v)} /></Field>
            <Field label="Status" required>
              <Select value={pa.status} onChange={v => upd("status",v)} options={PA_STATUSES.map(s => ({ value:s,label:s }))} />
            </Field>
            <Field label="Auth / Reference Number"><Input value={pa.authNumber} onChange={v => upd("authNumber",v)} placeholder="Auth #" /></Field>
            <Field label="Auth Start Date"><Input type="date" value={pa.startDate} onChange={v => upd("startDate",v)} /></Field>
            <Field label="Authorization Expiration"><Input type="date" value={pa.expirationDate} onChange={v => upd("expirationDate",v)} /></Field>
          </div>
          {(pa.status === "Denied" || pa.status === "Under Appeal") && (
            <div style={{ background: C.redLight, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: "uppercase", marginBottom: 10 }}>Denial / Appeal</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Denial Reason">
                  <Select value={pa.denialReason} onChange={v => upd("denialReason",v)} options={[{ value:"",label:"Select..." },...DENIAL_REASONS.map(r => ({ value:r,label:r }))]} />
                </Field>
                <Field label="Appeal Date"><Input type="date" value={pa.appealDate} onChange={v => upd("appealDate",v)} /></Field>
                <Field label="Appeal Notes" span={2}><Textarea value={pa.appealNotes} onChange={v => upd("appealNotes",v)} placeholder="LMN submitted, additional docs..." rows={2} /></Field>
              </div>
            </div>
          )}
          {pa.status === "Reauth Due" && (
            <div style={{ background: C.amberLight, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
              <Field label="Reauth Submitted Date"><Input type="date" value={pa.reauthSubmittedDate} onChange={v => upd("reauthSubmittedDate",v)} style={{ width: 200 }} /></Field>
            </div>
          )}
          <div style={{ marginBottom: 14 }}><FL label="Notes" /><Textarea value={pa.notes} onChange={v => upd("notes",v)} placeholder="CoverMyMeds ref, payer contact, follow-up..." rows={2} /></div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => { setAdding(false); setEditId(null); setPa(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ {editId ? "Update" : "Save"} PA Record</button>
          </div>
        </div>
      )}

      {records.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}><div style={{ fontSize: 32, marginBottom: 8 }}>📋</div><div style={{ fontSize: 14, fontWeight: 600 }}>No PA records yet</div></div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {records.map(r => {
            const urgency = paUrgency(r);
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} style={{ ...S.card, marginBottom: 0, padding: 0, overflow: "hidden", border: urgency?.color === C.red ? `2px solid ${C.red}` : `1px solid ${C.gray200}` }}>
                <div onClick={() => setExpandedId(expanded ? null : r.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.payer || patient.insurerName || "Payer TBD"}<span style={{ fontSize: 11, color: C.gray500, marginLeft: 8 }}>{r.benefitType}</span></div>
                    <div style={{ fontSize: 11, color: C.gray500 }}>Submitted: {r.submittedDate}{r.authNumber && ` · Auth #${r.authNumber}`}{r.expirationDate && ` · Expires: ${r.expirationDate}`}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={S.badge(sColor(r.status))}>{r.status}</span>
                    {urgency && <span style={{ ...S.badge(""), background: urgency.bg, color: urgency.color, fontSize: 11 }}>{urgency.label}</span>}
                    {r.status === "Pending" && <button onClick={e => { e.stopPropagation(); quickStatus(r.id,"Approved"); }} style={{ ...S.btn("success"), padding: "4px 10px", fontSize: 11 }}>Mark Approved</button>}
                    {r.status === "Pending" && <button onClick={e => { e.stopPropagation(); quickStatus(r.id,"Denied"); }} style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: 11 }}>Mark Denied</button>}
                    {r.status === "Approved" && <button onClick={e => { e.stopPropagation(); quickStatus(r.id,"Reauth Due"); }} style={{ ...S.btn("amber"), padding: "4px 10px", fontSize: 11 }}>Flag Reauth</button>}
                    <button onClick={e => { e.stopPropagation(); edit(r); }} style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: 11 }}>Edit</button>
                    <span style={{ fontSize: 16, color: C.gray400 }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: "0 18px 14px", borderTop: `1px solid ${C.gray100}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
                      {[["Auth Start",r.startDate||"—"],["Expiration",r.expirationDate||"—"],["Auth #",r.authNumber||"—"],["Benefit",r.benefitType]].map(([l,v]) => (
                        <div key={l} style={{ background: C.gray50, borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 9, color: C.gray400, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div></div>
                      ))}
                    </div>
                    {r.denialReason && <div style={{ marginTop: 10, padding: "8px 12px", background: C.redLight, borderRadius: 8 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.red, textTransform: "uppercase" }}>Denial</div><div style={{ fontSize: 12, color: C.red }}>{r.denialReason}</div>{r.appealNotes && <div style={{ fontSize: 11, color: C.gray700, marginTop: 4 }}><strong>Appeal:</strong> {r.appealNotes}</div>}</div>}
                    {r.notes && <div style={{ marginTop: 8, fontSize: 12, color: C.gray700 }}><strong>Notes:</strong> {r.notes}</div>}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><button onClick={() => del(r.id)} style={S.btn("danger")}>Delete Record</button></div>
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

// ── Shipment Log ───────────────────────────────────────────────────────────
function ShipmentLog({ patient, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [ship, setShip] = useState(null);
  const upd = (f,v) => setShip(p => ({ ...p, [f]: v }));
  const save = () => { onUpdate({ ...patient, shipments: [...(patient.shipments||[]), ship] }); setAdding(false); setShip(null); };
  const del = id => { if (!window.confirm("Delete shipment?")) return; onUpdate({ ...patient, shipments: patient.shipments.filter(s => s.id !== id) }); };
  const shipments = [...(patient.shipments||[])].sort((a,b) => new Date(b.receivedDate) - new Date(a.receivedDate));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={S.secTitle}>Drug Shipment / Inventory Log</div>
        {!adding && <button onClick={() => { setShip(emptyShipment()); setAdding(true); }} style={S.btn()}>+ Log Shipment</button>}
      </div>
      <div style={{ padding: "10px 14px", background: C.tealLight, borderRadius: 10, fontSize: 12, color: "#0369a1", marginBottom: 14 }}>
        REMS Requirement: Maintain records of all shipments received — patient name, dose, number of devices, date administered.
      </div>
      {adding && ship && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, background: "#f9feff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Date Received" required><Input type="date" value={ship.receivedDate} onChange={v => upd("receivedDate",v)} /></Field>
            <Field label="Dose" required>
              <Select value={ship.dose} onChange={v => upd("dose",v)} options={[{ value:"56mg",label:"56mg kit" },{ value:"84mg",label:"84mg kit" }]} />
            </Field>
            <Field label="Number of Devices" required>
              <Select value={ship.devices} onChange={v => upd("devices",v)} options={["1","2","3","4","5","6","8","10","12","16"].map(n => ({ value:n,label:n }))} />
            </Field>
            <Field label="Lot Number"><Input value={ship.lotNumber} onChange={v => upd("lotNumber",v)} placeholder="Lot #" /></Field>
            <Field label="Product Expiration"><Input type="date" value={ship.expirationDate} onChange={v => upd("expirationDate",v)} /></Field>
            <Field label="Notes"><Input value={ship.notes} onChange={v => upd("notes",v)} placeholder="Pharmacy, temp on arrival..." /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => { setAdding(false); setShip(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ Save Shipment</button>
          </div>
        </div>
      )}
      {shipments.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "32px 20px", color: C.gray400 }}><div style={{ fontSize: 28, marginBottom: 8 }}>📦</div><div style={{ fontSize: 14, fontWeight: 600 }}>No shipments logged</div></div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {shipments.map(s => (
            <div key={s.id} style={{ ...S.card, marginBottom: 0, display: "flex", alignItems: "center", gap: 14, padding: "12px 18px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.dose} · {s.devices} device{s.devices > 1 ? "s" : ""} — received {s.receivedDate}</div>
                <div style={{ fontSize: 11, color: C.gray500 }}>{s.lotNumber && `Lot: ${s.lotNumber} · `}{s.expirationDate && `Expires: ${s.expirationDate}`}{s.notes && ` · ${s.notes}`}</div>
              </div>
              <button onClick={() => del(s.id)} style={S.btn("danger")}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Enrollment Panel ───────────────────────────────────────────────────────
function EnrollmentPanel({ patient, onUpdate }) {
  const upd = (f,v) => onUpdate({ ...patient, [f]: v });
  return (
    <div>
      <div style={S.secTitle}>REMS & withMe Enrollment</div>
      <div style={{ ...S.card, border: `2px solid ${patient.remsEnrolled ? C.green : C.gray200}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>SPRAVATO® REMS Enrollment</div>
            <div style={{ fontSize: 12, color: C.gray500 }}>Patient must be enrolled before first treatment. Both patient and HCP must sign the enrollment form.</div>
          </div>
          {patient.remsEnrolled ? <span style={S.badge("green")}>✓ Enrolled</span> : <span style={S.badge("amber")}>Pending</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <Field label="Enrollment Date"><Input type="date" value={patient.remsEnrollmentDate} onChange={v => upd("remsEnrollmentDate",v)} /></Field>
          <Field label="REMS Patient ID"><Input value={patient.remsPatientId} onChange={v => upd("remsPatientId",v)} placeholder="REMS Patient ID #" /></Field>
        </div>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <Checkbox checked={patient.remsHcpSigned} onChange={v => upd("remsHcpSigned",v)} label="HCP has signed the Patient Enrollment Form" />
          <Checkbox checked={patient.remsPatientSigned} onChange={v => upd("remsPatientSigned",v)} label="Patient has signed the Patient Enrollment Form" />
          <Checkbox checked={patient.remsEnrolled} onChange={v => upd("remsEnrolled",v)} label="REMS enrollment confirmed — form submitted to SpravatoREMS.com" />
        </div>
        {(!patient.remsHcpSigned || !patient.remsPatientSigned) && (
          <div style={{ padding: "8px 12px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 14 }}>⚠ Both HCP and patient signatures required before treatment can begin</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <EnrollBtn label="Complete REMS Patient Enrollment" url="https://www.spravatorems.com" icon="🏥" />
          <EnrollBtn label="REMS Program Overview & Forms" url="https://www.spravatorems.com/pdfs/REMSProgramOverview" icon="📋" />
        </div>
      </div>
      <div style={{ ...S.card, border: `2px solid ${patient.withMeEnrolled ? C.green : C.gray200}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Spravato withMe™ Support Program</div>
            <div style={{ fontSize: 12, color: C.gray500 }}>J&J patient support — PA assistance, benefits investigation, $0 copay program (commercial), transportation support.</div>
          </div>
          {patient.withMeEnrolled ? <span style={S.badge("green")}>✓ Enrolled</span> : <span style={S.badge("amber")}>Pending</span>}
        </div>
        {patient.planType !== "commercial" && (
          <div style={{ padding: "8px 12px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 14 }}>⚠ withMe savings program is for commercially insured patients only.</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <Field label="withMe Enrollment Date"><Input type="date" value={patient.withMeEnrollmentDate} onChange={v => upd("withMeEnrollmentDate",v)} /></Field>
        </div>
        <Checkbox checked={patient.withMeEnrolled} onChange={v => upd("withMeEnrolled",v)} label="Patient enrolled in Spravato withMe program" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <EnrollBtn label="Enroll via Spravato withMe" url="https://www.spravatohcp.com/spravato-with-me/" icon="💊" />
          <EnrollBtn label="Call withMe: 1-844-479-4846" url="tel:18444794846" icon="📞" />
        </div>
      </div>
    </div>
  );
}

// ── Patient Form ───────────────────────────────────────────────────────────
function PatientForm({ patient: initial, onSave, onCancel }) {
  const [p, setP] = useState(initial);
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const update = (f,v) => setP(prev => ({ ...prev, [f]: v }));
  const steps = ["Demographics","Insurance","Clinical","PHQ-9","Summary"];
  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" };
  const errs = attempted ? stepErrors(p, step) : {};
  const tryNext = () => {
    setAttempted(true);
    if (Object.keys(stepErrors(p, step)).length === 0) { setAttempted(false); setStep(s => s + 1); }
  };
  const pct = () => {
    let s = 0;
    if (p.firstName && p.lastName) s++;
    if (p.insurerName && p.policyId) s++;
    if ((p.trials||[]).filter(t => t.drug).length >= 2) s++;
    if (p.phq9.every(v => v !== null)) s++;
    if (p.remsEnrolled) s++;
    if (p.withMeEnrolled) s++;
    return Math.round((s/6)*100);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
        {steps.map((s,i) => {
          const hasErr = Object.keys(stepErrors(p,i)).length > 0;
          return (
            <button key={i} onClick={() => setStep(i)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: step===i ? `linear-gradient(135deg,${C.teal},${C.tealDark})` : hasErr ? C.redLight : C.gray100, color: step===i ? "#fff" : hasErr ? C.red : C.gray500 }}>
              <span style={{ opacity: 0.6, marginRight: 4 }}>{i+1}.</span>{s}{hasErr ? " ⚠" : ""}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.gray500 }}>{pct()}% complete</span>
          <div style={{ width: 80, height: 4, background: C.gray200, borderRadius: 4 }}><div style={{ height: 4, borderRadius: 4, background: C.teal, width: `${pct()}%` }} /></div>
        </div>
      </div>

      {step === 0 && (
        <div style={S.card}>
          <div style={S.secTitle}>Patient Demographics</div>
          <div style={g2}>
            <Field label="First Name" required><Input value={p.firstName} onChange={v => update("firstName",v)} placeholder="First name" error={errs.firstName} /></Field>
            <Field label="Last Name" required><Input value={p.lastName} onChange={v => update("lastName",v)} placeholder="Last name" error={errs.lastName} /></Field>
            <Field label="Date of Birth" required><Input type="date" value={p.dob} onChange={v => update("dob",v)} error={errs.dob} /></Field>
            <Field label="Gender" required>
              <Select value={p.gender} onChange={v => update("gender",v)} error={errs.gender} options={[{ value:"",label:"Select..." },{ value:"Male",label:"Male" },{ value:"Female",label:"Female" },{ value:"Non-binary",label:"Non-binary" },{ value:"Prefer not to say",label:"Prefer not to say" }]} />
            </Field>
            <Field label="Phone" required><Input value={p.phone} onChange={v => update("phone",v)} placeholder="(555) 555-5555" error={errs.phone} /></Field>
            <Field label="Email"><Input type="email" value={p.email} onChange={v => update("email",v)} placeholder="email@example.com" /></Field>
            <Field label="Street Address" span={2}><Input value={p.address} onChange={v => update("address",v)} placeholder="Street address" /></Field>
            <Field label="City"><Input value={p.city} onChange={v => update("city",v)} placeholder="City" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="State"><Select value={p.state} onChange={v => update("state",v)} options={US_STATES.map(s => ({ value:s,label:s||"Select..." }))} /></Field>
              <Field label="ZIP"><Input value={p.zip} onChange={v => update("zip",v)} placeholder="10001" /></Field>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={S.card}>
          <div style={S.secTitle}>Insurance Information</div>
          <div style={g2}>
            <Field label="Insurance Company" required><Input value={p.insurerName} onChange={v => update("insurerName",v)} placeholder="e.g. Aetna, BCBS" error={errs.insurerName} /></Field>
            <Field label="Plan Type" required>
              <Select value={p.planType} onChange={v => update("planType",v)} options={[{ value:"commercial",label:"Commercial / Private" },{ value:"medicare",label:"Medicare" },{ value:"medicaid",label:"Medicaid" },{ value:"tricare",label:"TRICARE" },{ value:"other",label:"Other / Self-pay" }]} />
            </Field>
            <Field label="Policyholder Name"><Input value={p.policyHolder} onChange={v => update("policyHolder",v)} placeholder="Name on card" /></Field>
            <Field label="Policy / Member ID" required><Input value={p.policyId} onChange={v => update("policyId",v)} placeholder="Policy ID" error={errs.policyId} /></Field>
            <Field label="Group Number"><Input value={p.groupNumber} onChange={v => update("groupNumber",v)} placeholder="Group #" /></Field>
          </div>
          {p.planType !== "commercial" && <div style={{ marginTop: 14, padding: "10px 14px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>⚠ Non-commercial plan: Patient may not qualify for withMe savings program.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
            <ImageCapture label="Insurance Card — Front" value={p.insuranceCardFront} onChange={v => update("insuranceCardFront",v)} />
            <ImageCapture label="Insurance Card — Back" value={p.insuranceCardBack} onChange={v => update("insuranceCardBack",v)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={S.card}>
            <div style={S.secTitle}>Diagnosis</div>
            <div style={g2}>
              <Field label="ICD-10 Code" required>
                <Select value={p.diagnosisCode} onChange={v => update("diagnosisCode",v)} error={errs.diagnosisCode} options={[
                  { value:"F32.2",label:"F32.2 — MDD, single episode, severe" },
                  { value:"F32.1",label:"F32.1 — MDD, single episode, moderate" },
                  { value:"F32.0",label:"F32.0 — MDD, single episode, mild" },
                  { value:"F32.9",label:"F32.9 — MDD, single episode, unspecified" },
                  { value:"F33.2",label:"F33.2 — MDD, recurrent, severe" },
                  { value:"F33.1",label:"F33.1 — MDD, recurrent, moderate" },
                  { value:"F33.0",label:"F33.0 — MDD, recurrent, mild" },
                  { value:"R45.851",label:"R45.851 — Suicidal Ideation (MDSI)" }
                ]} />
              </Field>
              <Field label="Diagnosis Date" required><Input type="date" value={p.diagnosisDate} onChange={v => update("diagnosisDate",v)} error={errs.diagnosisDate} /></Field>
            </div>
          </div>
          <div style={S.card}><TrialEditor trials={p.trials||[emptyTrial(),emptyTrial()]} onChange={v => update("trials",v)} /></div>
          <div style={S.card}>
            <div style={S.secTitle}>Additional Clinical History</div>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={g2}>
                <Field label="Current Oral Antidepressant (for this treatment episode)">
                  <Select value={p.currentOralAD} onChange={v => update("currentOralAD",v)} options={[{ value:"",label:"Select or N/A..." },...ANTIDEPRESSANTS.map(a => ({ value:a,label:a }))]} />
                </Field>
                <Field label="Dose"><Input value={p.currentOralADDose} onChange={v => update("currentOralADDose",v)} placeholder="e.g. 20mg daily" /></Field>
              </div>
              <Field label="Psychotherapy History"><Select value={p.psychotherapy} onChange={v => update("psychotherapy",v)} options={PSYCH_OPTIONS} /></Field>
              <Checkbox checked={p.psychiatristConsult} onChange={v => update("psychiatristConsult",v)} label="Psychiatrist consultation completed" />
              {p.psychiatristConsult && <Field label="Psychiatrist Name"><Input value={p.psychiatristName} onChange={v => update("psychiatristName",v)} placeholder="Dr. Name" /></Field>}
              <Checkbox checked={p.priorSpravatoUse} onChange={v => update("priorSpravatoUse",v)} label="Patient has prior history of Spravato treatment" />
              {p.priorSpravatoUse && <Field label="Prior Spravato Details"><Textarea value={p.priorSpravatoDetails} onChange={v => update("priorSpravatoDetails",v)} placeholder="Date of last treatment, sessions, response, reason stopped..." rows={2} /></Field>}
              <Checkbox checked={p.tmsHistory} onChange={v => update("tmsHistory",v)} label="History of TMS (Transcranial Magnetic Stimulation)" />
              {p.tmsHistory && <Field label="TMS Details"><Input value={p.tmsDetails} onChange={v => update("tmsDetails",v)} placeholder="Dates, sessions, response..." /></Field>}
              <Field label="Concomitant Medications (CNS depressants, MAOIs, stimulants)"><Textarea value={p.concomitantMeds} onChange={v => update("concomitantMeds",v)} placeholder="List all relevant medications..." rows={2} /></Field>
              <Field label="Treatment Goals / Desired Observable Outcomes"><Textarea value={p.treatmentGoals} onChange={v => update("treatmentGoals",v)} placeholder="Reduction in PHQ-9 score, return to work, improved daily functioning..." rows={2} /></Field>
              <Checkbox checked={p.patientAgreesGoals} onChange={v => update("patientAgreesGoals",v)} label="Patient agrees with treatment goals and has been counseled on risks, monitoring requirements, and transportation restrictions" />
            </div>
          </div>
          <div style={S.card}>
            <div style={S.secTitle}>Contraindication Screening</div>
            <div style={{ padding: "12px 16px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 10, textTransform: "uppercase" }}>Absolute Contraindications — check if PRESENT</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Checkbox checked={p.contraindications.aneurysm} onChange={v => update("contraindications",{...p.contraindications,aneurysm:v})} label="Aneurysmal vascular disease (aortic, intracranial, or peripheral)" />
                <Checkbox checked={p.contraindications.avmHistory} onChange={v => update("contraindications",{...p.contraindications,avmHistory:v})} label="History of arteriovenous malformation (AVM)" />
                <Checkbox checked={p.contraindications.ich} onChange={v => update("contraindications",{...p.contraindications,ich:v})} label="History of intracerebral hemorrhage" />
                <Checkbox checked={p.contraindications.hypersensitivity} onChange={v => update("contraindications",{...p.contraindications,hypersensitivity:v})} label="Hypersensitivity to esketamine or ketamine" />
              </div>
            </div>
            {Object.values(p.contraindications).some(Boolean) && (
              <div style={{ padding: "12px 16px", background: C.redLight, borderRadius: 10, border: `2px solid ${C.red}`, marginBottom: 12 }}>
                <strong style={{ color: C.red }}>⛔ CONTRAINDICATED</strong><span style={{ color: C.red, fontSize: 13 }}> — Patient NOT eligible. Notify prescribing physician immediately.</span>
              </div>
            )}
            <div style={{ padding: "12px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 10, textTransform: "uppercase" }}>Use With Caution — check if present</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Checkbox checked={p.hypertension} onChange={v => update("hypertension",v)} label="History of hypertension or baseline BP >140/90 mmHg" />
                <Checkbox checked={p.substanceHistory} onChange={v => update("substanceHistory",v)} label="History of substance use disorder" />
                <Checkbox checked={p.psychosisHistory} onChange={v => update("psychosisHistory",v)} label="History of psychosis or schizophrenia" />
              </div>
            </div>
          </div>
          <div style={S.card}>
            <div style={S.secTitle}>Optional: Additional Clinical Scores</div>
            <div style={g2}>
              <Field label="HAM-D 17 Score">
                <Select value={p.hamd17Score} onChange={v => update("hamd17Score",v)} options={[{ value:"",label:"Not administered" },...Array.from({length:53},(_,i) => ({ value:String(i),label:`${i} — ${i<=7?"Normal":i<=13?"Mild":i<=18?"Moderate":i<=22?"Severe":"Very Severe"}` }))]} />
              </Field>
              <Field label="HAM-D Date"><Input type="date" value={p.hamd17Date} onChange={v => update("hamd17Date",v)} /></Field>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={S.card}>
          <ErrorBoundary><PHQ9Form answers={p.phq9} onChange={v => update("phq9",v)} date={p.phq9Date} onDateChange={v => update("phq9Date",v)} /></ErrorBoundary>
        </div>
      )}

      {step === 4 && (
        <div style={S.card}>
          <div style={S.secTitle}>Patient Summary</div>
          {Object.keys(validatePatient(p)).length > 0 && (
            <div style={{ padding: "12px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>⚠ Incomplete required fields — patient will save but PA package will be incomplete:</div>
              {Object.values(validatePatient(p)).map((v,i) => <div key={i} style={{ fontSize: 12, color: "#92400e" }}>• {v}</div>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["Full Name",`${p.firstName} ${p.lastName}`],["DOB / Gender",`${p.dob} · ${p.gender}`],["Phone",p.phone],["Email",p.email||"—"],["Insurance",`${p.insurerName||"—"} · ${p.planType}`],["Policy ID",p.policyId],["ICD-10",p.diagnosisCode],["Dx Date",p.diagnosisDate],["AD Trials",`${(p.trials||[]).filter(t=>t.drug).length} documented`],["SSRI/SNRI Trial",(p.trials||[]).some(t=>t.drugClass==="SSRI"||t.drugClass==="SNRI")?"✓ Yes":"⚠ Missing"],["PHQ-9",p.phq9.every(v=>v!==null)?`${p.phq9.reduce((s,v)=>s+v,0)} — ${phq9Severity(p.phq9.reduce((s,v)=>s+v,0)).label}`:"Not completed"],["REMS",p.remsEnrolled?"✓ Enrolled":"Pending"],["withMe",p.withMeEnrolled?"✓ Enrolled":"Pending"],["Contraindications",Object.values(p.contraindications).some(Boolean)?"⛔ FLAGGED":"None"]].map(([l,v]) => (
              <div key={l} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.gray50}` }}>
                <div style={{ width: 140, flexShrink: 0, fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 13 }}>{v || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button onClick={onCancel} style={S.btn("ghost")}>Cancel</button>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && <button onClick={() => setStep(s => s-1)} style={S.btn("secondary")}>← Back</button>}
          {step < steps.length-1
            ? <button onClick={tryNext} style={S.btn()}>Next →</button>
            : <button onClick={() => onSave(p)} style={S.btn("success")}>✓ Save Patient</button>}
        </div>
      </div>
    </div>
  );
}

// ── Print / Export Helpers ─────────────────────────────────────────────────
function printHTML(html) {
  const win = window.open("","_blank");
  if (!win) { alert("Please allow popups to use print export."); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 400);
}
const PS = `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1a2332;padding:28px 32px}h1{font-size:18px;font-weight:800}h2{font-size:12px;font-weight:700;color:#1a7fa8;text-transform:uppercase;letter-spacing:.06em;margin:16px 0 7px;padding-bottom:4px;border-bottom:2px solid #e2e8f0}table{width:100%;border-collapse:collapse;margin-bottom:10px}td,th{padding:5px 9px;border:1px solid #e2e8f0;font-size:11px;vertical-align:top}th{background:#f1f5f9;font-weight:700;color:#475569;text-transform:uppercase;font-size:10px}.lc{width:180px;font-weight:600;color:#475569;background:#f8fafc}.hdr{display:flex;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #1a7fa8}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.vg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.vc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px}.vl{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:2px}.vv{font-size:14px;font-weight:800}.bg{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#dcfce7;color:#166534}.br{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#fee2e2;color:#991b1b}.ba{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e}.bb{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e40af}.ab{padding:8px 12px;border-radius:6px;margin:8px 0;font-size:11px}.ar{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.aa{background:#fffbeb;border:1px solid #fde68a;color:#92400e}.ag{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}.al{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}.sl{border-bottom:1px solid #334155;width:240px;height:30px;display:inline-block;margin-right:30px}.ftr{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}@media print{body{padding:14px 18px}@page{margin:.5in;size:letter}}</style>`;
const hdr = (title,p,sub="") => `<div class="hdr"><div><div style="font-size:10px;color:#1a7fa8;font-weight:700;text-transform:uppercase;margin-bottom:3px">PsychX · Spravato Program</div><h1>${title}</h1>${sub?`<div style="font-size:11px;color:#64748b;margin-top:3px">${sub}</div>`:""}</div><div style="text-align:right"><div style="font-size:15px;font-weight:800">${p.firstName} ${p.lastName}</div><div style="font-size:11px;color:#64748b;margin-top:2px">DOB: ${p.dob||"—"}</div><div style="font-size:11px;color:#64748b">Generated: ${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div></div></div>`;
const ftr = (n="") => `<div class="ftr"><div>PsychX Spravato Program · v0.4${n?" · "+n:""}</div><div>Printed: ${new Date().toLocaleString()}</div></div>`;
const row = (l,v) => `<tr><td class="lc">${l}</td><td>${v||"<span style='color:#cbd5e1'>—</span>"}</td></tr>`;

function exportPatientSummary(patient) {
  const phq9Score = patient.phq9.every(v=>v!==null) ? patient.phq9.reduce((s,v)=>s+v,0) : null;
  const sev = phq9Score!==null ? phq9Severity(phq9Score) : null;
  const hasContra = Object.values(patient.contraindications).some(Boolean);
  const activePA = (patient.paRecords||[]).find(r=>r.status==="Approved");
  const hasSSRISNRI = (patient.trials||[]).some(t=>t.drugClass==="SSRI"||t.drugClass==="SNRI");
  const html = `<!DOCTYPE html><html><head><title>Patient Summary — ${patient.firstName} ${patient.lastName}</title>${PS}</head><body>
${hdr("Patient Summary",patient,`${patient.diagnosisCode} · ${patient.insurerName||"Insurance pending"}`)}
${hasContra?`<div class="ab ar">⛔ CONTRAINDICATION FLAGGED — Patient may NOT be eligible. Physician review required.</div>`:""}
${activePA?`<div class="ab ag">✓ Active prior authorization through ${activePA.expirationDate||"TBD"} · Auth #${activePA.authNumber||"pending"}</div>`:`<div class="ab aa">⚠ No active prior authorization on file</div>`}
${!hasSSRISNRI&&(patient.trials||[]).some(t=>t.drug)?`<div class="ab aa">⚠ PA Alert: No SSRI or SNRI trial documented — required by most payers</div>`:""}
<h2>Demographics</h2><table>${row("Full Name",`${patient.firstName} ${patient.lastName}`)}${row("DOB / Gender",`${patient.dob} · ${patient.gender}`)}${row("Phone",patient.phone)}${row("Email",patient.email)}${row("Address",[patient.address,patient.city,patient.state,patient.zip].filter(Boolean).join(", "))}</table>
<div class="two">
<div><h2>Insurance</h2><table>${row("Insurer",patient.insurerName)}${row("Plan Type",patient.planType)}${row("Policyholder",patient.policyHolder)}${row("Policy ID",patient.policyId)}${row("Group #",patient.groupNumber)}</table></div>
<div><h2>Scores</h2><table>${row("PHQ-9",phq9Score!==null?`${phq9Score} — ${sev.label} (${patient.phq9Date||"no date"})`:"")}${row("HAM-D 17",patient.hamd17Score?`${patient.hamd17Score} (${patient.hamd17Date||"no date"})`:"Not administered")}${row("Q9 SI Item",patient.phq9[8]>0?`⚠ Positive (${patient.phq9[8]})`:"Negative")}</table></div>
</div>
<h2>Antidepressant Trials</h2>
<table><tr><th>#</th><th>Medication</th><th>Class</th><th>Dose</th><th>Start</th><th>End</th><th>Weeks</th><th>Adequate</th><th>Reason D/C</th></tr>
${(patient.trials||[]).map((t,i)=>`<tr><td>${i+1}</td><td>${t.drug||"—"}</td><td><span class="${t.drugClass==="SSRI"||t.drugClass==="SNRI"?"bg":"bb"}">${t.drugClass||"—"}</span></td><td>${t.dose||"—"}</td><td>${t.startDate||"—"}</td><td>${t.endDate||"—"}</td><td>${t.durationWeeks||"—"}</td><td>${t.adequateTrial?"Yes":"No"}</td><td>${t.reason||"—"}</td></tr>`).join("")}
</table>
<div class="two">
<div><h2>Additional History</h2><table>${row("Current Oral AD",patient.currentOralAD?`${patient.currentOralAD} ${patient.currentOralADDose}`:"—")}${row("Psychotherapy",patient.psychotherapy)}${row("Psychiatrist",patient.psychiatristConsult?`Yes — ${patient.psychiatristName||"TBD"}`:"No")}${row("Prior Spravato",patient.priorSpravatoUse?"Yes — "+patient.priorSpravatoDetails:"No")}${row("TMS History",patient.tmsHistory?"Yes — "+patient.tmsDetails:"No")}${row("Concomitant Meds",patient.concomitantMeds||"None")}</table></div>
<div><h2>Contraindications</h2><table>${row("Aneurysmal vascular dz",patient.contraindications.aneurysm?`<span class="br">PRESENT</span>`:"Negative")}${row("AVM history",patient.contraindications.avmHistory?`<span class="br">PRESENT</span>`:"Negative")}${row("Intracerebral hemorrhage",patient.contraindications.ich?`<span class="br">PRESENT</span>`:"Negative")}${row("Esketamine hypersensitivity",patient.contraindications.hypersensitivity?`<span class="br">PRESENT</span>`:"Negative")}${row("Hypertension (caution)",patient.hypertension?`<span class="ba">Yes</span>`:"No")}${row("Substance use hx",patient.substanceHistory?`<span class="ba">Yes</span>`:"No")}${row("Psychosis hx",patient.psychosisHistory?`<span class="ba">Yes</span>`:"No")}</table></div>
</div>
<h2>Enrollment & Program Status</h2>
<table>${row("REMS Enrolled",patient.remsEnrolled?`<span class="bg">✓ Yes — ${patient.remsEnrollmentDate||"date TBD"}</span>`:`<span class="ba">Pending</span>`)}${row("REMS Patient ID",patient.remsPatientId||"—")}${row("withMe Enrolled",patient.withMeEnrolled?`<span class="bg">✓ Yes</span>`:`<span class="ba">Pending</span>`)}${row("Sessions Completed",patient.sessions?.length||0)}${row("PA Status",(patient.paRecords||[]).find(r=>r.status==="Approved")?`Active — expires ${activePA?.expirationDate||"TBD"}`:(patient.paRecords?.length>0?patient.paRecords[0].status:"None filed"))}</table>
${ftr()}
</body></html>`;
  printHTML(html);
}

function exportPAPackage(patient) {
  const phq9Score = patient.phq9.every(v=>v!==null) ? patient.phq9.reduce((s,v)=>s+v,0) : null;
  const sev = phq9Score!==null ? phq9Severity(phq9Score) : null;
  const hasSSRISNRI = (patient.trials||[]).some(t=>t.drugClass==="SSRI"||t.drugClass==="SNRI");
  const html = `<!DOCTYPE html><html><head><title>PA Package — ${patient.firstName} ${patient.lastName}</title>${PS}</head><body>
${hdr("Prior Authorization Documentation Package",patient,"Spravato® (esketamine) — Treatment-Resistant Depression")}
<div class="ab al"><strong>Instructions:</strong> Use this data to complete the payer's PA form. Submit via CoverMyMeds (1-866-452-5017) or Spravato withMe (1-844-479-4846). Payer-specific forms at SpravatoHCP.com.</div>
${!hasSSRISNRI?`<div class="ab ar">⚠ PA RISK: No SSRI or SNRI trial documented — most payers require at least one. Add trial before submitting.</div>`:""}
<h2>Section 1 — Patient Information</h2>
<table>${row("Patient Full Name *",`${patient.firstName} ${patient.lastName}`)}${row("Date of Birth *",patient.dob)}${row("Gender",patient.gender)}${row("Phone *",patient.phone)}${row("Address *",[patient.address,patient.city,patient.state,patient.zip].filter(Boolean).join(", "))}${row("Insurance Company *",patient.insurerName)}${row("Policy / Member ID *",patient.policyId)}${row("Group Number",patient.groupNumber)}${row("Policyholder",patient.policyHolder)}${row("Benefit Type","☐ Medical (CMS 1500) &nbsp; ☐ Pharmacy Benefit")}</table>
<h2>Section 2 — Diagnosis & Clinical</h2>
<table>${row("ICD-10 Code *",patient.diagnosisCode)}${row("Diagnosis Date *",patient.diagnosisDate)}${row("Indication","Treatment-Resistant Depression — failed ≥2 adequate antidepressant trials")}${row("Baseline PHQ-9 *",phq9Score!==null?`${phq9Score} — ${sev.label} (${patient.phq9Date||"—"})`:"Not completed")}${row("HAM-D 17",patient.hamd17Score?`${patient.hamd17Score} (${patient.hamd17Date||"no date"})`:"Not administered")}${row("Current Oral AD",patient.currentOralAD?`${patient.currentOralAD} ${patient.currentOralADDose}`:"—")}${row("Treatment Goals",patient.treatmentGoals||"—")}${row("Patient Agrees w/ Goals",patient.patientAgreesGoals?"Yes — counseled on risks and monitoring":"Pending")}${row("Prior Spravato Use",patient.priorSpravatoUse?"Yes — "+patient.priorSpravatoDetails:"No")}${row("TMS History",patient.tmsHistory?"Yes — "+patient.tmsDetails:"No")}${row("Bipolar Ruled Out","☐ Yes")}${row("Substance Screening",patient.substanceHistory?"History documented — screened":"No history")}</table>
<h2>Section 3 — Antidepressant Trial History (Min. 2 Required; at least 1 SSRI or SNRI)</h2>
<table><tr><th>#</th><th>Medication</th><th>Class</th><th>Dose</th><th>Start Date</th><th>End Date</th><th>Duration</th><th>Adequate ≥6wk</th><th>Reason D/C</th></tr>
${(patient.trials||[]).map((t,i)=>`<tr><td>${i+1}</td><td>${t.drug||`<span style="color:#dc2626">Required</span>`}</td><td><span class="${t.drugClass==="SSRI"||t.drugClass==="SNRI"?"bg":""}">${t.drugClass||"—"}</span></td><td>${t.dose||"—"}</td><td>${t.startDate||"—"}</td><td>${t.endDate||"—"}</td><td>${t.durationWeeks?t.durationWeeks+" wks":`<span style="color:#dc2626">Required</span>`}</td><td>${t.adequateTrial?"✓ Yes":"No"}</td><td>${t.reason||`<span style="color:#dc2626">Required</span>`}</td></tr>`).join("")}
</table>
<div class="ab aa" style="font-size:10px">Attach pharmacy records or chart notes documenting trial dates. At least one trial must be SSRI or SNRI for most payer approvals.</div>
<h2>Section 4 — Additional History</h2>
<table>${row("Psychotherapy",patient.psychotherapy||"—")}${row("Psychiatrist Consult",patient.psychiatristConsult?`Yes — ${patient.psychiatristName||"name TBD"}`:"No")}</table>
<h2>Section 5 — Drug Information</h2>
<table>${row("Drug Name","Spravato® (esketamine) Nasal Spray, CIII")}${row("Starting Dose","56mg — NDC 50458-028-02")}${row("Escalation Dose","84mg — NDC 50458-028-03")}${row("Sessions Requested","16 (Induction 2x/wk × 4wk; Maintenance 1x/wk × 4wk)")}${row("Route","Intranasal, self-administered under direct HCP observation")}${row("REMS — Patient",patient.remsEnrolled?"✓ Enrolled":"Pending")}${row("REMS — Setting","☐ Setting REMS cert # ___________")}</table>
<h2>Section 6 — Prescriber & Facility</h2>
<table>${row("Prescribing Physician *","______________________________")}${row("Physician NPI *","______________________________")}${row("Facility Name *","______________________________")}${row("Facility NPI *","______________________________")}${row("Facility Tax ID *","______________________________")}${row("Place of Service","11 — Office")}</table>
<h2>Prescriber Attestation</h2>
<div style="border:1px solid #e2e8f0;border-radius:6px;padding:14px"><p style="font-size:11px;color:#475569;margin-bottom:14px">I certify the above is accurate. This patient has confirmed TRD with ≥2 documented adequate antidepressant failures and Spravato is medically necessary. I will monitor for black box warning risks including sedation/dissociation, BP elevation, and potential for abuse.</p><span class="sl"></span><span class="sl" style="width:150px"></span><br/><span style="font-size:10px;color:#64748b">Prescriber Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</span></div>
${ftr("Submit via CoverMyMeds or Spravato withMe · SpravatoHCP.com for payer-specific forms")}
</body></html>`;
  printHTML(html);
}

function exportREMSSession(patient, session) {
  const phase = sessionPhase(session.sessionNumber);
  const bpHigh = parseInt(session.bpPreSystolic)>140 || parseInt(session.bpPreDiastolic)>90;
  const html = `<!DOCTYPE html><html><head><title>REMS Session #${session.sessionNumber} — ${patient.firstName} ${patient.lastName}</title>${PS}</head><body>
${hdr(`REMS Monitoring — Session #${session.sessionNumber}`,patient,`${phase.label} · ${session.date} · ${session.dose}`)}
<div class="ab al"><strong>Instructions:</strong> Use this data to complete the REMS Patient Monitoring Form at <strong>SpravatoREMS.com</strong> within 7 days of each session.</div>
${session.sae?`<div class="ab ar">⚠ SERIOUS ADVERSE EVENT — Contact REMS Program at 1-855-382-6022 immediately.</div>`:""}
${bpHigh?`<div class="ab aa">⚠ Pre-admin BP elevated >140/90 — physician must evaluate before proceeding per REMS protocol.</div>`:""}
<h2>Patient Info</h2>
<table>${row("Patient Name",`${patient.firstName} ${patient.lastName}`)}${row("Date of Birth",patient.dob)}${row("REMS Patient ID",patient.remsPatientId||"Confirm at SpravatoREMS.com")}${row("REMS Enrolled",patient.remsEnrolled?"✓ Yes":"NOT ENROLLED — must enroll before submitting")}</table>
<h2>Concomitant Medications</h2>
<table>${row("CNS Depressants / MAOIs / Other",patient.concomitantMeds||"None documented")}</table>
<h2>Vital Signs</h2>
<div class="vg"><div class="vc"><div class="vl">BP Pre-Admin</div><div class="vv">${session.bpPreSystolic||"—"}/${session.bpPreDiastolic||"—"} <span style="font-size:11px;font-weight:400">mmHg</span></div></div><div class="vc"><div class="vl">BP ~40 min</div><div class="vv">${session.bpPost40Systolic||"—"}/${session.bpPost40Diastolic||"—"} <span style="font-size:11px;font-weight:400">mmHg</span></div></div><div class="vc"><div class="vl">BP Discharge</div><div class="vv">${session.bpPostSystolic||"—"}/${session.bpPostDiastolic||"—"} <span style="font-size:11px;font-weight:400">mmHg</span></div></div><div class="vc"><div class="vl">SpO₂ Pre</div><div class="vv">${session.pulseOxPre||"—"}<span style="font-size:11px;font-weight:400">%</span></div></div><div class="vc"><div class="vl">SpO₂ During</div><div class="vv">${session.pulseOxDuring||"—"}<span style="font-size:11px;font-weight:400">%</span></div></div><div class="vc"><div class="vl">SpO₂ Discharge</div><div class="vv">${session.pulseOxPost||"—"}<span style="font-size:11px;font-weight:400">%</span></div></div></div>
<h2>Session Details</h2>
<table>${row("Dose",session.dose)}${row("Session # / Phase",`${session.sessionNumber} — ${phase.label}`)}${row("Date",session.date)}${row("Tolerance",session.patientTolerance)}${row("Side Effects",session.sideEffects.length>0?session.sideEffects.join(", "):"None")}${session.sideEffectNotes?row("SE Notes",session.sideEffectNotes):""}</table>
<h2>Safety & Discharge</h2>
<table>${row("SAE",session.sae?`<strong style="color:#dc2626">YES — ${session.saeDescription||"description not entered"}</strong>`:"No")}${row("Clinically Stable / Discharged",session.discharged?"Yes":"Pending")}${row("Transport Home Confirmed",session.transportArranged?"Yes — patient did not drive":"NOT CONFIRMED")}${row("REMS Form Submitted",session.remsFormSubmitted?"✓ Yes":"NOT YET — submit at SpravatoREMS.com")}</table>
${session.clinicalNotes?`<h2>Clinical Notes</h2><div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;font-size:11px;line-height:1.6">${session.clinicalNotes}</div>`:""}
<h2>HCP Monitoring Attestation</h2>
<div style="border:1px solid #e2e8f0;border-radius:6px;padding:14px"><p style="font-size:11px;color:#475569;margin-bottom:14px">I confirm this patient received Spravato under direct observation per REMS requirements, was monitored for a minimum of 2 hours, and was assessed as clinically stable prior to discharge.</p><span class="sl"></span><span class="sl" style="width:150px"></span><br/><span style="font-size:10px;color:#64748b">Monitoring HCP Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</span></div>
${ftr("Submit to SpravatoREMS.com within 7 days")}
</body></html>`;
  printHTML(html);
}

function exportSessionReport(patient) {
  const sessions = [...(patient.sessions||[])].sort((a,b) => a.sessionNumber - b.sessionNumber);
  const phq9Score = patient.phq9.every(v=>v!==null) ? patient.phq9.reduce((s,v)=>s+v,0) : null;
  const sev = phq9Score!==null ? phq9Severity(phq9Score) : null;
  const remsUnsent = sessions.filter(s=>!s.remsFormSubmitted).length;
  const html = `<!DOCTYPE html><html><head><title>Session Report — ${patient.firstName} ${patient.lastName}</title>${PS}<style>table td,table th{font-size:9.5px;padding:4px 6px}</style></head><body>
${hdr("Treatment Session Report",patient,`${sessions.length} sessions · ${patient.diagnosisCode} · ${patient.insurerName||"Insurance pending"}`)}
<div class="two" style="margin-bottom:12px">
<div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px"><strong style="font-size:10px;color:#64748b;text-transform:uppercase">Baseline PHQ-9</strong><div style="font-size:22px;font-weight:800;margin:4px 0">${phq9Score!==null?phq9Score:"—"}</div><div style="font-size:11px;color:#64748b">${sev?sev.label:"Not scored"} · ${patient.phq9Date||"No date"}</div></div>
<div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px"><strong style="font-size:10px;color:#64748b;text-transform:uppercase">REMS Status</strong><div style="font-size:14px;font-weight:700;margin:4px 0">${sessions.length>0?sessionPhase(sessions.length).label:"Not started"}</div><div style="font-size:11px;color:${remsUnsent>0?"#dc2626":"#059669"}">${remsUnsent>0?`⚠ ${remsUnsent} REMS form(s) pending submission`:"✓ All REMS forms submitted"}</div></div>
</div>
${sessions.length===0?`<div class="ab aa">No sessions recorded yet.</div>`:`
<h2>Session Log</h2>
<table><tr><th>#</th><th>Date</th><th>Phase</th><th>Dose</th><th>BP Pre</th><th>BP 40m</th><th>BP D/C</th><th>SpO₂</th><th>Side Effects</th><th>Tol</th><th>REMS</th><th>SAE</th></tr>
${sessions.map(s=>`<tr><td style="font-weight:700;text-align:center">${s.sessionNumber}</td><td>${s.date}</td><td>${sessionPhase(s.sessionNumber).label}</td><td>${s.dose}</td><td>${s.bpPreSystolic||"—"}/${s.bpPreDiastolic||"—"}</td><td>${s.bpPost40Systolic||"—"}/${s.bpPost40Diastolic||"—"}</td><td>${s.bpPostSystolic||"—"}/${s.bpPostDiastolic||"—"}</td><td>${s.pulseOxPre||"—"}%</td><td>${s.sideEffects.filter(e=>e!=="None observed").join(", ")||"None"}</td><td>${s.patientTolerance}</td><td style="text-align:center">${s.remsFormSubmitted?"✓":"⚠"}</td><td style="text-align:center;color:#dc2626">${s.sae?"SAE":""}</td></tr>`).join("")}
</table>`}
${sessions.filter(s=>s.clinicalNotes).length>0?`<h2>Clinical Notes</h2>${sessions.filter(s=>s.clinicalNotes).map(s=>`<div style="border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:6px"><strong style="font-size:11px">Session #${s.sessionNumber} — ${s.date}</strong><p style="margin-top:5px;font-size:11px;line-height:1.5;color:#334155">${s.clinicalNotes}</p></div>`).join("")}`:""}
<h2>Reauthorization Documentation</h2>
<div class="ab al" style="font-size:10px">This session report supports prior authorization renewal. Attach updated PHQ-9 and physician attestation.</div>
<table>${row("Sessions Completed",sessions.length)}${row("Clinical Response","☐ Full remission &nbsp; ☐ Partial response &nbsp; ☐ Minimal response &nbsp; ☐ No response")}${row("Updated PHQ-9","_______ / Date: _______")}${row("Continued Medical Necessity",`<span style="height:40px;display:block"></span>`)}</table>
<div style="margin-top:14px"><span class="sl"></span><span class="sl" style="width:150px"></span><br/><span style="font-size:10px;color:#64748b">Prescribing Physician Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</span></div>
${ftr("Attach to payer PA renewal form")}
</body></html>`;
  printHTML(html);
}

// ── Export Panel ───────────────────────────────────────────────────────────
function ExportPanel({ patient }) {
  const [selSession, setSelSession] = useState(patient.sessions?.length > 0 ? patient.sessions[patient.sessions.length-1].id : null);
  const session = (patient.sessions||[]).find(s => s.id === selSession);
  const ExCard = ({ icon, title, desc, action, disabled, warn }) => (
    <div style={{ ...S.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ fontSize: 26, flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 12, color: C.gray500, lineHeight: 1.5 }}>{desc}</div>
          {warn && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginTop: 4 }}>⚠ {warn}</div>}
        </div>
      </div>
      <button onClick={action} disabled={disabled} style={{ ...S.btn(disabled?"ghost":"primary"), width: "100%", opacity: disabled ? 0.5 : 1 }}>🖨 Print / Export</button>
    </div>
  );
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={S.secTitle}>Form Export & Print</div>
        <div style={{ fontSize: 13, color: C.gray500 }}>Opens in new tab with print dialog. Select "Save as PDF" in printer options to save a digital copy.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <ExCard icon="📋" title="Patient Summary" desc="Complete profile — demographics, insurance, diagnosis, PHQ-9, all trials, contraindications, enrollment status." action={() => exportPatientSummary(patient)} warn={!patient.firstName ? "Demographics incomplete" : null} />
        <ExCard icon="📄" title="PA Documentation Package" desc="Pre-filled PA submission package with all payer-required fields, trial documentation table, and prescriber signature." action={() => exportPAPackage(patient)} warn={(patient.trials||[]).filter(t=>t.drug).length < 2 ? "Antidepressant trials incomplete" : null} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...S.card, marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 26 }}>🏥</span>
            <div><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>REMS Monitoring Form Data</div><div style={{ fontSize: 12, color: C.gray500 }}>Pre-filled session vitals and safety data for submission at SpravatoREMS.com.</div></div>
          </div>
          {patient.sessions?.length > 0 ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <FL label="Select Session" />
                <Select value={selSession||""} onChange={v => setSelSession(v)}
                  options={[...patient.sessions].sort((a,b)=>b.sessionNumber-a.sessionNumber).map(s => ({ value:s.id, label:`Session #${s.sessionNumber} — ${s.date} — ${s.dose}${!s.remsFormSubmitted?" ⚠":" ✓"}` }))} />
              </div>
              {session && !session.remsFormSubmitted && <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 8 }}>⚠ REMS form not yet submitted for this session</div>}
              <button onClick={() => session && exportREMSSession(patient, session)} disabled={!session} style={{ ...S.btn("primary"), width: "100%", opacity: session?1:0.5 }}>🖨 Print REMS Session Data</button>
            </>
          ) : <div style={{ fontSize: 12, color: C.gray400, textAlign: "center", padding: 14 }}>No sessions logged yet</div>}
        </div>
        <ExCard icon="📊" title="Session History Report" desc="Full treatment log with all vitals, side effects, REMS status, clinical notes, and reauth documentation section." action={() => exportSessionReport(patient)} disabled={!patient.sessions?.length} warn={!patient.sessions?.length ? "No sessions logged yet" : null} />
      </div>
      <div style={{ marginTop: 14, padding: "12px 16px", background: C.tealLight, borderRadius: 10, fontSize: 12, color: "#0369a1" }}>
        💡 <strong>Tip:</strong> In the print dialog, select <strong>"Save as PDF"</strong> to save digitally. For PA submissions, attach the PA Package to the payer form from <strong>SpravatoHCP.com</strong>.
      </div>
    </div>
  );
}

// ── Patient Detail ─────────────────────────────────────────────────────────
function PatientDetail({ patient, onUpdate, onDelete, onBack }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const phq9Score = patient.phq9.every(v=>v!==null) ? patient.phq9.reduce((s,v)=>s+v,0) : null;
  const sev = phq9Score!==null ? phq9Severity(phq9Score) : null;
  const activePA = (patient.paRecords||[]).find(r=>r.status==="Approved");
  const remsUnsent = (patient.sessions||[]).filter(s=>!s.remsFormSubmitted).length;
  const hasSSRISNRI = (patient.trials||[]).some(t=>t.drugClass==="SSRI"||t.drugClass==="SNRI");
  const hasContra = Object.values(patient.contraindications).some(Boolean);
  const allErrors = validatePatient(patient);

  const tabs = [
    { id:"overview", label:"Overview" },
    { id:"sessions", label:`Sessions (${(patient.sessions||[]).length})` },
    { id:"pa", label:`Prior Auth (${(patient.paRecords||[]).length})` },
    { id:"enrollment", label:"Enrollment" },
    { id:"shipments", label:`Shipments (${(patient.shipments||[]).length})` },
    { id:"exports", label:"🖨 Export" }
  ];

  if (editing) return (
    <div>
      <div style={{ marginBottom: 20 }}><button onClick={() => setEditing(false)} style={S.btn("ghost")}>← Cancel Edit</button></div>
      <PatientForm patient={patient} onSave={p => { onUpdate(p); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );

  return (
    <div>
      {/* Patient header */}
      <div style={{ ...S.card, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{patient.firstName?.[0]}{patient.lastName?.[0]}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{patient.firstName} {patient.lastName}</div>
            <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>DOB: {patient.dob} · {patient.insurerName||"Insurance pending"} · {patient.diagnosisCode}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 320 }}>
            {hasContra && <span style={S.badge("red")}>⛔ Contraindicated</span>}
            {!hasSSRISNRI && (patient.trials||[]).some(t=>t.drug) && <span style={S.badge("amber")}>⚠ No SSRI/SNRI</span>}
            {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color }}>PHQ-9: {phq9Score} — {sev.label}</span>}
            {activePA && <span style={S.badge("green")}>Auth Active</span>}
            {remsUnsent > 0 && <span style={S.badge("amber")}>{remsUnsent} REMS ⚠</span>}
            {patient.remsEnrolled && <span style={S.badge("green")}>REMS ✓</span>}
            {patient.withMeEnrolled && <span style={S.badge("green")}>withMe ✓</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            <button onClick={() => setEditing(true)} style={S.btn("ghost")}>Edit</button>
            <button onClick={onDelete} style={S.btn("danger")}>Delete</button>
          </div>
        </div>
      </div>

      {/* Completeness banner */}
      {Object.keys(allErrors).length > 0 && (
        <div style={{ padding: "10px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span>⚠ {Object.keys(allErrors).length} required field{Object.keys(allErrors).length>1?"s":""} incomplete — PA package will be partial until resolved.</span>
          <button onClick={() => setEditing(true)} style={{ ...S.btn("amber"), padding: "4px 12px", fontSize: 11, marginLeft: "auto" }}>Complete Now</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, background: C.gray100, borderRadius: 12, padding: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "7px 8px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", background: tab===t.id ? "#fff" : "transparent", color: tab===t.id ? C.teal : C.gray500, boxShadow: tab===t.id ? "0 1px 6px rgba(0,0,0,0.08)" : "none" }}>{t.label}</button>
        ))}
      </div>

      <ErrorBoundary>
        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={S.card}>
                <div style={S.secTitle}>Demographics</div>
                {[["Name",`${patient.firstName} ${patient.lastName}`],["DOB",patient.dob],["Gender",patient.gender],["Phone",patient.phone],["Email",patient.email],["Address",[patient.address,patient.city,patient.state,patient.zip].filter(Boolean).join(", ")]].map(([l,v]) => (
                  <div key={l} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.gray50}` }}>
                    <div style={{ width: 100, fontSize: 11, color: C.gray500, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
                    <div style={{ fontSize: 13 }}>{v || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
                  </div>
                ))}
              </div>
              <div style={S.card}>
                <div style={S.secTitle}>Insurance</div>
                {[["Insurer",patient.insurerName],["Plan",patient.planType],["Policy ID",patient.policyId],["Group #",patient.groupNumber],["Policyholder",patient.policyHolder]].map(([l,v]) => (
                  <div key={l} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.gray50}` }}>
                    <div style={{ width: 100, fontSize: 11, color: C.gray500, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
                    <div style={{ fontSize: 13 }}>{v || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.secTitle}>Antidepressant Trials</div>
              {(patient.trials||[]).filter(t=>t.drug).length === 0 ? (
                <div style={{ color: C.gray400, fontSize: 13 }}>No trials documented yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: C.gray50 }}>{["#","Medication","Class","Dose","Start","End","Weeks","Adequate","Reason"].map(h => <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", textAlign: "left", borderBottom: `2px solid ${C.gray200}` }}>{h}</th>)}</tr></thead>
                    <tbody>{(patient.trials||[]).map((t,i) => t.drug ? (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.gray100}` }}>
                        <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700 }}>{i+1}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.drug}</td>
                        <td style={{ padding: "8px 10px" }}>{t.drugClass && <span style={{ ...S.badge(t.drugClass==="SSRI"||t.drugClass==="SNRI"?"green":""), fontSize: 11 }}>{t.drugClass}</span>}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.dose||"—"}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.startDate||"—"}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.endDate||"—"}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.durationWeeks||"—"}</td>
                        <td style={{ padding: "8px 10px" }}><span style={S.badge(t.adequateTrial?"green":"amber")}>{t.adequateTrial?"Yes":"No"}</span></td>
                        <td style={{ padding: "8px 10px", fontSize: 12, color: C.gray700 }}>{t.reason||"—"}</td>
                      </tr>
                    ) : null)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {phq9Score !== null && sev && (
              <div style={{ ...S.card, background: sev.bg, border: `2px solid ${sev.color}20` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 48, fontWeight: 900, color: sev.color, lineHeight: 1 }}>{phq9Score}</div>
                    <div style={{ fontSize: 10, color: C.gray500, fontWeight: 700, textTransform: "uppercase" }}>PHQ-9</div>
                  </div>
                  <div style={{ width: 1, height: 60, background: C.gray200 }} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: sev.color }}>{sev.label} Depression</div>
                    <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Assessed: {patient.phq9Date||"date not set"}</div>
                    {patient.hamd17Score && <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>HAM-D 17: {patient.hamd17Score} ({patient.hamd17Date||"no date"})</div>}
                  </div>
                  {patient.phq9[8] > 0 && (
                    <div style={{ marginLeft: "auto", padding: "10px 14px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.red }}>⚠ Q9 Positive</div>
                      <div style={{ fontSize: 11, color: C.red }}>Safety assessment required</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "sessions" && <SessionTracker patient={patient} onUpdate={onUpdate} />}
        {tab === "pa" && <PATracker patient={patient} onUpdate={onUpdate} />}
        {tab === "enrollment" && <EnrollmentPanel patient={patient} onUpdate={onUpdate} />}
        {tab === "shipments" && <ShipmentLog patient={patient} onUpdate={onUpdate} />}
        {tab === "exports" && <ExportPanel patient={patient} />}
      </ErrorBoundary>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ patients, onSelect, onAddNew }) {
  const total = patients.length;
  const remsAlert = patients.filter(p => (p.sessions||[]).some(s=>!s.remsFormSubmitted)).length;
  const paUrgent = patients.filter(p => (p.paRecords||[]).some(r => { const u = paUrgency(r); return u && u.color === "#dc2626"; })).length;
  const noPA = patients.filter(p => !(p.paRecords||[]).some(r=>r.status==="Approved")).length;
  const unEnrolled = patients.filter(p => !p.remsEnrolled).length;
  const contraFlagged = patients.filter(p => Object.values(p.contraindications||{}).some(Boolean)).length;
  const induction = patients.filter(p => (p.sessions||[]).length > 0 && (p.sessions||[]).length <= 8).length;
  const maintenance = patients.filter(p => (p.sessions||[]).length > 8).length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Dashboard</div>
        <div style={{ fontSize: 13, color: C.gray500 }}>{new Date().toLocaleDateString("en-US",{ weekday:"long", month:"long", day:"numeric", year:"numeric" })}</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Patients", value: total, color: C.teal, icon: "👥" },
          { label: "REMS Forms Due", value: remsAlert, color: remsAlert > 0 ? C.amber : C.green, icon: "📋", urgent: remsAlert > 0 },
          { label: "Auth Expiring", value: paUrgent, color: paUrgent > 0 ? C.red : C.green, icon: "⚠️", urgent: paUrgent > 0 },
          { label: "No Active Auth", value: noPA, color: noPA > 0 ? C.amber : C.green, icon: "📄", urgent: noPA > 0 }
        ].map(s => (
          <div key={s.label} style={{ ...S.card, marginBottom: 0, border: s.urgent ? `2px solid ${s.color}` : `1px solid ${C.gray200}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.gray500, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
              </div>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(remsAlert > 0 || paUrgent > 0 || contraFlagged > 0) && (
        <div style={{ ...S.card, border: `2px solid ${C.red}`, background: "#fff8f8", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 12 }}>🚨 Action Required</div>
          <div style={{ display: "grid", gap: 8 }}>
            {patients.filter(p=>(p.sessions||[]).some(s=>!s.remsFormSubmitted)).map(p => {
              const unsent = (p.sessions||[]).filter(s=>!s.remsFormSubmitted).length;
              return (
                <div key={p.id} onClick={() => onSelect(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 10, border: "1px solid #fecaca", cursor: "pointer" }}>
                  <span style={S.badge("amber")}>REMS ⚠</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</span>
                  <span style={{ fontSize: 12, color: C.gray500 }}>{unsent} session form{unsent>1?"s":""} pending submission at SpravatoREMS.com</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.teal }}>View →</span>
                </div>
              );
            })}
            {patients.filter(p=>(p.paRecords||[]).some(r=>{ const u=paUrgency(r); return u&&u.color==="#dc2626"; })).map(p => {
              const urgRec = (p.paRecords||[]).find(r=>{ const u=paUrgency(r); return u&&u.color==="#dc2626"; });
              return (
                <div key={p.id} onClick={() => onSelect(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 10, border: "1px solid #fecaca", cursor: "pointer" }}>
                  <span style={S.badge("red")}>Auth ⚠</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</span>
                  <span style={{ fontSize: 12, color: C.gray500 }}>Authorization {paUrgency(urgRec)?.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.teal }}>View →</span>
                </div>
              );
            })}
            {patients.filter(p=>Object.values(p.contraindications||{}).some(Boolean)).map(p => (
              <div key={p.id} onClick={() => onSelect(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 10, border: "1px solid #fecaca", cursor: "pointer" }}>
                <span style={S.badge("red")}>⛔ Contra</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</span>
                <span style={{ fontSize: 12, color: C.gray500 }}>Contraindication flagged — physician review required</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.teal }}>View →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patient list */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>All Patients ({total})</div>
        <button onClick={onAddNew} style={S.btn()}>+ Add Patient</button>
      </div>
      {patients.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏥</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No patients yet</div>
          <div style={{ fontSize: 14, color: C.gray500, marginBottom: 24 }}>Add your first Spravato patient to get started.</div>
          <button onClick={onAddNew} style={S.btn()}>+ Add First Patient</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {patients.map(p => {
            const phq9Score = p.phq9.every(v=>v!==null) ? p.phq9.reduce((s,v)=>s+v,0) : null;
            const sev = phq9Score!==null ? phq9Severity(phq9Score) : null;
            const activePA = (p.paRecords||[]).find(r=>r.status==="Approved");
            const hasContra = Object.values(p.contraindications||{}).some(Boolean);
            return (
              <div key={p.id} onClick={() => onSelect(p)} style={{ ...S.card, marginBottom: 0, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all 0.15s", ":hover": { boxShadow: "0 4px 20px rgba(0,0,0,0.1)" } }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: hasContra ? C.redLight : `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: hasContra ? C.red : "#fff", fontWeight: 800, fontSize: 14 }}>{p.firstName?.[0]}{p.lastName?.[0]}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.firstName} {p.lastName}</div>
                  <div style={{ fontSize: 11, color: C.gray500 }}>{p.insurerName||"Insurance pending"} · DOB: {p.dob} · {(p.sessions||[]).length} session{(p.sessions||[]).length!==1?"s":""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 280 }}>
                  {hasContra && <span style={S.badge("red")}>⛔ Contra</span>}
                  {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color, fontSize: 10 }}>PHQ-9: {phq9Score}</span>}
                  {activePA ? <span style={S.badge("green")}>Auth Active</span> : (p.paRecords||[]).length>0 ? <span style={S.badge("amber")}>Auth Pending</span> : <span style={S.badge("")}>No Auth</span>}
                  {p.remsEnrolled ? <span style={S.badge("green")}>REMS ✓</span> : <span style={S.badge("amber")}>REMS ⚠</span>}
                </div>
                <span style={{ fontSize: 16, color: C.gray400 }}>›</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard"); // dashboard | add | detail
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [navItem, setNavItem] = useState("dashboard");

  useEffect(() => { loadPatients().then(p => { setPatients(p); setLoading(false); }); }, []);

  const persist = (updated) => { setPatients(updated); savePatients(updated); };

  const addPatient = (p) => { persist([...patients, p]); setView("dashboard"); };

  const updatePatient = (updated) => {
    const list = patients.map(p => p.id === updated.id ? updated : p);
    persist(list);
    setSelectedPatient(updated);
  };

  const deletePatient = (id) => {
    if (!window.confirm("Permanently delete this patient record?")) return;
    persist(patients.filter(p => p.id !== id));
    setView("dashboard");
    setSelectedPatient(null);
  };

  const selectPatient = (p) => { setSelectedPatient(p); setView("detail"); setNavItem("patients"); };
  const goToAdd = () => { setView("add"); setNavItem("add"); };

  const navItems = [
    { id:"dashboard", label:"Dashboard", icon:"📊" },
    { id:"patients", label:"Patients", icon:"👥" },
    { id:"add", label:"Add Patient", icon:"➕" },
  ];

  if (loading) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💊</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.teal }}>Loading PsychX...</div>
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={{ padding: "24px 20px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>Px</span>
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, lineHeight: 1 }}>PsychX</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Spravato Program</div>
            </div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 8 }}>v0.4 · {patients.length} patient{patients.length!==1?"s":""}</div>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />
        <nav style={{ padding: "12px 10px", flex: 1 }}>
          {navItems.map(item => (
            <div key={item.id} onClick={() => { setNavItem(item.id); if(item.id==="dashboard"){setView("dashboard");} else if(item.id==="patients"){setView(selectedPatient?"detail":"dashboard");} else if(item.id==="add"){goToAdd();} }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 3, background: navItem===item.id ? "rgba(255,255,255,0.12)" : "transparent", transition: "all 0.15s" }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ color: navItem===item.id ? "#fff" : "rgba(255,255,255,0.6)", fontWeight: navItem===item.id ? 700 : 500, fontSize: 13 }}>{item.label}</span>
            </div>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>QUICK LINKS</div>
          {[["SpravatoREMS.com","https://www.spravatorems.com"],["SpravatoHCP.com","https://www.spravatohcp.com"],["withMe Program","https://www.spravatohcp.com/spravato-with-me/"],["CoverMyMeds","https://www.covermymeds.com"]].map(([l,u]) => (
            <a key={l} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none", padding: "3px 0", transition: "color 0.15s" }}>{l} ↗</a>
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={S.main}>
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {(view === "detail" || view === "add") && (
              <button onClick={() => { setView("dashboard"); setNavItem("dashboard"); }} style={{ ...S.btn("ghost"), padding: "6px 12px", fontSize: 12 }}>← Back</button>
            )}
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {view === "dashboard" ? "Dashboard" : view === "add" ? "Add Patient" : selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, color: C.gray500 }}>REMS: <a href="tel:18553826022" style={{ color: C.teal, textDecoration: "none", fontWeight: 600 }}>1-855-382-6022</a></div>
            <div style={{ fontSize: 12, color: C.gray500 }}>withMe: <a href="tel:18444794846" style={{ color: C.teal, textDecoration: "none", fontWeight: 600 }}>1-844-479-4846</a></div>
          </div>
        </div>
        <div style={S.content}>
          <ErrorBoundary>
            {view === "dashboard" && (
              <Dashboard patients={patients} onSelect={selectPatient} onAddNew={goToAdd} />
            )}
            {view === "add" && (
              <PatientForm patient={emptyPatient()} onSave={addPatient} onCancel={() => setView("dashboard")} />
            )}
            {view === "detail" && selectedPatient && (
              <PatientDetail
                patient={patients.find(p=>p.id===selectedPatient.id) || selectedPatient}
                onUpdate={updatePatient}
                onDelete={() => deletePatient(selectedPatient.id)}
                onBack={() => setView("dashboard")}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
