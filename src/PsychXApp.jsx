import { useState, useEffect, useRef, useCallback, Component } from "react";

// ── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, background: "#fef2f2", borderRadius: 16, border: "2px solid #fecaca", margin: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: "#7f1d1d", fontFamily: "monospace", background: "#fff", padding: 12, borderRadius: 8, marginBottom: 16 }}>{this.state.error?.message || "Unknown error"}</div>
        <button onClick={() => this.setState({ error: null })} style={{ padding: "8px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

// ── Storage ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "psychx_patients_v6";
const SETTINGS_KEY = "psychx_settings_v1";
const SCHEDULE_KEY = "psychx_schedule_v1";

function migratePatient(p) {
  // Normalize any legacy format safely
  return {
    ...p,
    phq9History: Array.isArray(p.phq9History) ? p.phq9History
      : (Array.isArray(p.phq9) && p.phq9.some(v => v !== null))
        ? [{ id: "legacy", date: p.phq9Date || "", answers: p.phq9, score: p.phq9.reduce((s, v) => s + (v ?? 0), 0) }]
        : [],
    notes: Array.isArray(p.notes) ? p.notes : [],
    sessions: Array.isArray(p.sessions) ? p.sessions : [],
    paRecords: Array.isArray(p.paRecords) ? p.paRecords : [],
    shipments: Array.isArray(p.shipments) ? p.shipments : [],
    trials: Array.isArray(p.trials) ? p.trials : [emptyTrial(), emptyTrial()],
    contraindications: p.contraindications || { aneurysm: false, avmHistory: false, ich: false, hypersensitivity: false },
    treatmentGoals: Array.isArray(p.treatmentGoals) ? p.treatmentGoals : [],
    concomitantMeds: Array.isArray(p.concomitantMeds) ? p.concomitantMeds : [],
    claimHistory: Array.isArray(p.claimHistory) ? p.claimHistory : [],
    psychxMRN: p.psychxMRN || generateMRN(),
    emrMRN: p.emrMRN || "",
    scheduledSessions: Array.isArray(p.scheduledSessions) ? p.scheduledSessions : [],
  };
}

async function loadPatients() {
  try {
    const v6 = localStorage.getItem(STORAGE_KEY);
    if (v6) return JSON.parse(v6).map(migratePatient);
    // Try migrating from v5
    const v5 = localStorage.getItem("psychx_patients_v5");
    if (v5) { const m = JSON.parse(v5).map(migratePatient); localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); return m; }
    const v4 = localStorage.getItem("psychx_patients_v4");
    if (v4) { const m = JSON.parse(v4).map(migratePatient); localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); return m; }
    return [];
  } catch { return []; }
}
async function savePatients(p) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {} }

function loadSettings() {
  try { const s = localStorage.getItem(SETTINGS_KEY); return s ? JSON.parse(s) : defaultSettings(); } catch { return defaultSettings(); }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

function loadSchedule() {
  try { const s = localStorage.getItem(SCHEDULE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveSchedule(s) { try { localStorage.setItem(SCHEDULE_KEY, JSON.stringify(s)); } catch {} }

function defaultSettings() {
  return {
    practiceName: "", practiceAddress: "", practiceCity: "", practiceState: "",
    practiceZip: "", practicePhone: "", practiceFax: "",
    billingNPI: "", taxId: "", taxonomyCode: "",
    renderingProviderName: "", renderingProviderNPI: "",
    supervisingProviderName: "", supervisingProviderNPI: "",
    placeOfService: "11", acceptsAssignment: true, signatureOnFile: true,
    defaultPOS: "11",
  };
}

// ── MRN Generator ──────────────────────────────────────────────────────────
function generateMRN() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `PX-${year}-${rand}`;
}

// ── Psychiatrist Directory ─────────────────────────────────────────────────
const PSYCHX_PSYCHIATRISTS = [
  { id: "rjones", name: "Dr. Ron Jones", practice: "Ron Jones Mind Therapy", specialty: "Psychiatry", address: "123 Light Tree Ln", city: "Boyton Beach", state: "FL", zip: "33437", phone: "561-622-6963", npi: "5756632", affiliated: true },
  { id: "pstevenson", name: "Peter Stevenson, NP", practice: "Psych Partners of Long Island", specialty: "Psychiatry", address: "34 Milburn Lane", city: "Melville", state: "NY", zip: "13325", phone: "516-999-9321", npi: "6333398", affiliated: true },
  { id: "other", name: "Other (enter manually)", practice: "", specialty: "", address: "", city: "", state: "", zip: "", phone: "", npi: "", affiliated: false }
];

// ── Billing Codes ──────────────────────────────────────────────────────────
const DRUG_CODES = [
  { code: "J0013", desc: "Esketamine, nasal spray, 1mg per unit (buy-and-bill)", type: "drug", unitNote: "Units = mg dose (56mg=56 units, 84mg=84 units)", autoCalc: true },
  { code: "G2082", desc: "SPRAVATO® ≤56mg — bundled drug + services (check payer policy)", type: "drug_bundle", unitNote: "1 unit per session" },
  { code: "G2083", desc: "SPRAVATO® >56mg — bundled drug + services (check payer policy)", type: "drug_bundle", unitNote: "1 unit per session" },
];

const EM_CODES = [
  { code: "99212", desc: "Office visit, established patient — low complexity (~10-19 min)", type: "em", baseMinutes: 15 },
  { code: "99213", desc: "Office visit, established patient — low-moderate complexity (~20-29 min)", type: "em", baseMinutes: 25 },
  { code: "99214", desc: "Office visit, established patient — moderate complexity (~30-39 min)", type: "em", baseMinutes: 35 },
  { code: "99215", desc: "Office visit, established patient — high complexity (~40-54 min)", type: "em", baseMinutes: 47 },
];

const PROLONGED_CODES_COMMERCIAL = [
  { code: "99415", desc: "Clinical staff monitoring, first additional hour beyond E/M (REMS-mandated 2hr monitoring)", type: "prolonged", units: 1 },
  { code: "99416", desc: "Clinical staff monitoring, each additional 30 min beyond 99415", type: "prolonged", units: 1 },
  { code: "99417", desc: "Prolonged office visit, each additional 15 min beyond base E/M time", type: "prolonged", units: 2, unitNote: "×2 = 30 min standard" },
];

const PROLONGED_CODES_MEDICARE = [
  { code: "99415", desc: "Clinical staff monitoring, first additional hour beyond E/M (REMS 2hr monitoring)", type: "prolonged", units: 1 },
  { code: "99416", desc: "Clinical staff monitoring, each additional 30 min beyond 99415", type: "prolonged", units: 1 },
  { code: "G2212", desc: "Prolonged office visit (Medicare), each additional 15 min beyond base E/M", type: "prolonged", units: 2, unitNote: "×2 = 30 min standard" },
];

const PSYCH_ADDON_CODES = [
  { code: "90833", desc: "Psychotherapy add-on with E/M, 16-37 min (use with 99213/99214)", type: "addon" },
  { code: "90836", desc: "Psychotherapy add-on with E/M, 38-52 min (use with 99214/99215)", type: "addon" },
  { code: "90838", desc: "Psychotherapy add-on with E/M, 53+ min (use with 99215)", type: "addon" },
];

const MODIFIER_OPTIONS = ["25", "59", "GT", "GQ", "76", "77", "GX", "GY"];

const ICD10_COMMON = [
  { code: "F32.0", desc: "MDD, single episode, mild" },
  { code: "F32.1", desc: "MDD, single episode, moderate" },
  { code: "F32.2", desc: "MDD, single episode, severe without psychotic features" },
  { code: "F32.3", desc: "MDD, single episode, severe with psychotic features" },
  { code: "F32.9", desc: "MDD, single episode, unspecified" },
  { code: "F33.0", desc: "MDD, recurrent, mild" },
  { code: "F33.1", desc: "MDD, recurrent, moderate" },
  { code: "F33.2", desc: "MDD, recurrent, severe without psychotic features" },
  { code: "F33.3", desc: "MDD, recurrent, severe with psychotic features" },
  { code: "F33.9", desc: "MDD, recurrent, unspecified" },
  { code: "F33.40", desc: "MDD, recurrent, in remission, unspecified" },
  { code: "R45.851", desc: "Suicidal ideation (MDSI indication)" },
  { code: "F41.1", desc: "Generalized anxiety disorder (comorbid)" },
  { code: "F43.10", desc: "PTSD, unspecified (comorbid)" },
];

// ── Constants ──────────────────────────────────────────────────────────────
const PHQ9_QUESTIONS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things",
  "Moving or speaking so slowly that others noticed, or fidgety/restless",
  "Thoughts that you would be better off dead, or of hurting yourself"
];
const PHQ9_OPTIONS = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

const DRUG_CLASSES = {
  "Fluoxetine (Prozac)": "SSRI", "Sertraline (Zoloft)": "SSRI", "Escitalopram (Lexapro)": "SSRI",
  "Citalopram (Celexa)": "SSRI", "Paroxetine (Paxil)": "SSRI", "Fluvoxamine (Luvox)": "SSRI",
  "Vilazodone (Viibryd)": "SSRI",
  "Venlafaxine (Effexor)": "SNRI", "Duloxetine (Cymbalta)": "SNRI", "Desvenlafaxine (Pristiq)": "SNRI",
  "Levomilnacipran (Fetzima)": "SNRI",
  "Bupropion (Wellbutrin)": "NDRI", "Mirtazapine (Remeron)": "NaSSA",
  "Amitriptyline": "TCA", "Nortriptyline": "TCA", "Imipramine": "TCA", "Clomipramine": "TCA",
  "Phenelzine (Nardil)": "MAOI", "Tranylcypromine (Parnate)": "MAOI", "Selegiline (EMSAM)": "MAOI",
  "Trazodone": "SARI", "Vortioxetine (Trintellix)": "SMS",
  "Lithium augmentation": "Augmentation", "Aripiprazole (Abilify) augmentation": "Augmentation",
  "Quetiapine (Seroquel) augmentation": "Augmentation", "Lamotrigine augmentation": "Augmentation",
  "Other": "Other"
};
const ANTIDEPRESSANTS = Object.keys(DRUG_CLASSES);

const SIDE_EFFECTS = [
  "Anxiety", "Blood pressure elevation", "Dissociation", "Dizziness", "Euphoria",
  "Headache", "Increased heart rate", "Nausea", "Perceptual changes", "Sedation",
  "Vertigo", "Vomiting", "None observed"
];

const CONCOMITANT_MED_OPTIONS = [
  "Alprazolam (Xanax)", "Amphetamine salts (Adderall)", "Aripiprazole (Abilify)",
  "Benzodiazepines (other)", "Buprenorphine", "Buspirone", "Clonazepam (Klonopin)",
  "Clozapine", "Gabapentin (Neurontin)", "Haloperidol", "Lithium",
  "Lorazepam (Ativan)", "Lisdexamfetamine (Vyvanse)", "Memantine",
  "Methylphenidate (Ritalin/Concerta)", "Modafinil", "Naltrexone",
  "Olanzapine (Zyprexa)", "Phenelzine (Nardil) — MAOI ⚠",
  "Quetiapine (Seroquel)", "Risperidone", "Selegiline — MAOI ⚠",
  "Topiramate", "Tranylcypromine (Parnate) — MAOI ⚠",
  "Valproate / Depakote", "Zolpidem (Ambien)", "Other"
];

const TREATMENT_GOAL_OPTIONS = [
  "Alleviate active suicidal ideation", "Improve ability to perform daily activities",
  "Improve ability to return to work or school", "Improve concentration and cognitive function",
  "Improve energy and motivation", "Improve mood stability", "Improve quality of life overall",
  "Improve relationships and social functioning", "Improve sleep quality",
  "Reduce anxiety symptoms", "Reduce depressive episode frequency",
  "Reduce PHQ-9 score by ≥50% from baseline", "Reduce PHQ-9 score to below 10",
  "Reduce reliance on acute psychiatric services", "Stabilize mood for upcoming life event",
  "Other (specify below)"
];

const PA_STATUSES = ["Pending", "Approved", "Denied", "Under Appeal", "Reauth Due", "Expired"];
const DENIAL_REASONS = [
  "Auth expired before submission", "Diagnosis-related denial", "Incomplete documentation",
  "Missing information / errors", "Must be prescribed by psychiatrist", "Not medically necessary",
  "Other", "Specialty pharmacy out-of-network", "Step therapy — insufficient trials", "Wrong benefit submitted"
];
const US_STATES = ["","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const DISC_REASONS = ["","Allergic reaction","Cost / access","Drug interaction","Inadequate response",
  "Intolerable side effects","Other","Partial response only","Patient preference","Physician recommendation"];
const PSYCH_OPTIONS = [
  { value: "", label: "Select..." }, { value: "None", label: "None" },
  { value: "CBT — adequate trial (≥8 sessions)", label: "CBT — Cognitive Behavioral Therapy (≥8 sessions)" },
  { value: "CBT — partial / incomplete", label: "CBT — partial / incomplete trial" },
  { value: "DBT", label: "DBT — Dialectical Behavior Therapy" },
  { value: "IPT", label: "IPT — Interpersonal Therapy" },
  { value: "Mindfulness-based cognitive therapy", label: "Mindfulness-Based Cognitive Therapy (MBCT)" },
  { value: "Psychodynamic therapy", label: "Psychodynamic Therapy" },
  { value: "Talk therapy / traditional therapy", label: "Talk Therapy / Traditional Therapy (Psychologist/LCSW)" },
  { value: "Other therapy", label: "Other therapy" },
  { value: "Refused", label: "Patient refused" }
];

const NOTE_TEMPLATES = [
  { id: "pa_submitted", label: "PA Submitted", text: "Prior authorization submitted to [PAYER] via [METHOD]. Reference #: [REF]. Expected decision within [X] business days." },
  { id: "pa_approved", label: "PA Approved", text: "Prior authorization approved by [PAYER]. Auth #: [AUTH]. Effective [START] through [END]. Benefit type: [MEDICAL/PHARMACY]." },
  { id: "pa_denied", label: "PA Denied", text: "Prior authorization denied by [PAYER]. Denial reason: [REASON]. Appeal period: [X] days. Next steps: [ACTION]." },
  { id: "pt_called", label: "Patient Called", text: "Patient called to [confirm appointment / discuss treatment / report side effects]. Spoke with [patient/family member]. [Summary]." },
  { id: "rems_submitted", label: "REMS Form Submitted", text: "REMS Patient Monitoring Form submitted to SpravatoREMS.com for Session #[X] dated [DATE]. Confirmed submission." },
  { id: "enrollment_rems", label: "REMS Enrollment", text: "Patient enrolled in SPRAVATO® REMS program. HCP and patient enrollment forms signed. REMS Patient ID: [ID]." },
  { id: "enrollment_withme", label: "withMe Enrollment", text: "Patient enrolled in Spravato withMe™ support program. Benefits investigation initiated." },
  { id: "session_scheduled", label: "Session Scheduled", text: "Treatment session #[X] scheduled for [DATE] at [TIME]. Patient confirmed transportation. Reminder sent." },
  { id: "psych_referral", label: "Psychiatrist Referral", text: "Patient referred to [PSYCHIATRIST] at [PRACTICE] for psychiatric evaluation. Referral date: [DATE]." },
  { id: "psych_eval_received", label: "Psych Eval Received", text: "Psychiatrist evaluation received from [PSYCHIATRIST]. Evaluation supports Spravato candidacy." },
  { id: "pharmacy_contact", label: "Pharmacy Contact", text: "Contacted specialty pharmacy [PHARMACY] regarding shipment for [PATIENT]. [Details/resolution]." },
  { id: "insurance_contact", label: "Insurance Contact", text: "Called [PAYER] at [PHONE]. Spoke with [REP]. Re: [TOPIC]. Outcome: [OUTCOME]. Reference #: [REF]." },
  { id: "appeal_submitted", label: "Appeal Submitted", text: "PA appeal submitted to [PAYER] with Letter of Medical Necessity. Supporting docs: [LIST]." },
  { id: "reauth_initiated", label: "Reauth Initiated", text: "PA reauthorization initiated for [PAYER]. Auth expiring [DATE]. Submitted updated PHQ-9 ([SCORE])." },
  { id: "adverse_event", label: "Adverse Event", text: "Adverse event for Session #[X] on [DATE]: [DESCRIPTION]. Physician notified. REMS contacted: 1-855-382-6022." },
  { id: "billing_note", label: "Billing Note", text: "Claim submitted for Session #[X] on [DATE]. Codes: [CODES]. Total billed: $[AMOUNT]. Claim ID: [ID]." },
  { id: "custom", label: "Custom / Free Text", text: "" }
];

const APPOINTMENT_TYPES = ["Spravato Session", "Follow-up", "Psychiatric Evaluation", "Intake / Consultation", "Telehealth Follow-up", "Other"];
const SESSION_DURATION_MINS = [30, 60, 90, 120, 150, 180];
const TIME_SLOTS = ["8:00 AM","8:30 AM","9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM"];

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
  if (!pa?.expirationDate || pa.status === "Denied" || pa.status === "Expired") return null;
  const d = daysUntil(pa.expirationDate);
  if (d === null) return null;
  if (d < 0) return { label: "Expired", color: "#dc2626", bg: "#fef2f2" };
  if (d <= 14) return { label: `${d}d left`, color: "#dc2626", bg: "#fef2f2" };
  if (d <= 30) return { label: `${d}d left`, color: "#f59e0b", bg: "#fffbeb" };
  return { label: `${d}d left`, color: "#059669", bg: "#f0fdf4" };
}
function weeksFromDates(start, end) {
  if (!start || !end) return "";
  const diff = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24 * 7);
  if (diff < 0) return "";
  const w = Math.round(diff);
  if (w < 4) return "<4";
  return String(Math.min(w, 26));
}
function nowISO() { return new Date().toISOString(); }
function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function getWeekDates(refDate) {
  const d = new Date(refDate);
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x.toISOString().split("T")[0]; });
}
function timeToMins(t) {
  const [time, ampm] = t.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}
function autoSuggestCodes(session, isMedicare) {
  const dose = session?.dose || "56mg";
  const mgNum = parseInt(dose);
  const drugUnits = mgNum;
  const lines = [];
  // Drug
  lines.push({ code: "J0013", desc: "Esketamine, nasal spray, 1mg (buy-and-bill)", units: drugUnits, modifier: "", diagRef: "A", fee: "", type: "drug" });
  // E&M default 99214
  lines.push({ code: "99214", desc: "Office visit, established patient — moderate complexity", units: 1, modifier: "25", diagRef: "A", fee: "", type: "em" });
  // Prolonged/monitoring
  lines.push({ code: "99415", desc: "Clinical staff monitoring, first hour beyond E/M (REMS 2hr)", units: 1, modifier: "", diagRef: "A", fee: "", type: "prolonged" });
  lines.push({ code: "99416", desc: "Clinical staff monitoring, additional 30 min", units: 1, modifier: "", diagRef: "A", fee: "", type: "prolonged" });
  lines.push({ code: isMedicare ? "G2212" : "99417", desc: isMedicare ? "Prolonged visit, Medicare, per 15 min" : "Prolonged office visit, per additional 15 min", units: 2, modifier: "", diagRef: "A", fee: "", type: "prolonged" });
  return lines;
}

// ── Data Models ────────────────────────────────────────────────────────────
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
  clinicalNotes: "", transportArranged: true, discharged: false,
  billingLines: [], billingDiagCodes: [], billingNotes: "", claimGenerated: false
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
const emptyNote = () => ({
  id: Date.now().toString(), createdAt: nowISO(), type: "user",
  templateId: "", text: "", attachmentName: "", attachmentData: null
});
const emptyPHQ9 = () => ({
  id: Date.now().toString(), date: new Date().toISOString().split("T")[0],
  answers: Array(9).fill(null), score: null
});
const emptyAppointment = () => ({
  id: Date.now().toString(), patientId: "", patientName: "",
  date: new Date().toISOString().split("T")[0], time: "9:00 AM",
  duration: 150, chair: "1", type: "Spravato Session",
  notes: "", sessionNumber: null, converted: false
});
const emptyPatient = () => ({
  id: Date.now().toString(), createdAt: nowISO(),
  psychxMRN: generateMRN(), emrMRN: "",
  firstName: "", lastName: "", dob: "", gender: "", phone: "", email: "",
  address: "", city: "", state: "", zip: "",
  insurerName: "", planType: "commercial", policyHolder: "", policyId: "", groupNumber: "",
  insuranceCardFront: null, insuranceCardBack: null,
  diagnosisCode: "F33.2", diagnosisDate: "",
  priorSpravatoUse: false, priorSpravatoDetails: "",
  currentOralAD: "", currentOralADDose: "",
  tmsHistory: false, tmsDetails: "",
  treatmentGoals: [], treatmentGoalsOther: "", patientAgreesGoals: false,
  trials: [emptyTrial(), emptyTrial()], psychotherapy: "",
  psychiatristConsult: false, psychiatristId: "",
  psychiatristName: "", psychiatristPractice: "", psychiatristPhone: "",
  psychiatristNPI: "", psychiatristAddress: "",
  contraindications: { aneurysm: false, avmHistory: false, ich: false, hypersensitivity: false },
  hypertension: false, substanceHistory: false, psychosisHistory: false,
  concomitantMeds: [], concomitantMedsOther: "",
  phq9History: [], hamd17Score: "", hamd17Date: "",
  remsEnrolled: false, remsEnrollmentDate: "", remsPatientId: "",
  remsHcpSigned: false, remsPatientSigned: false,
  withMeEnrolled: false, withMeEnrollmentDate: "",
  sessions: [], paRecords: [], shipments: [], notes: [],
  claimHistory: [], scheduledSessions: []
});

function auditNote(text) {
  return { id: Date.now().toString() + Math.random(), createdAt: nowISO(), type: "system", templateId: "", text, attachmentName: "", attachmentData: null };
}

// ── Design Tokens ──────────────────────────────────────────────────────────
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
  sidebar: { width: 240, background: `linear-gradient(180deg,${C.navy},${C.navyMid})`, minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100, boxShadow: "4px 0 24px rgba(0,0,0,0.18)" },
  main: { marginLeft: 240, minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: { background: "#fff", borderBottom: `1px solid ${C.gray200}`, padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" },
  content: { padding: "24px 28px", flex: 1 },
  card: { background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${C.gray200}`, marginBottom: 16 },
  btn: (v = "primary") => ({
    padding: "8px 18px", borderRadius: 9, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
    ...(v === "primary" ? { background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, color: "#fff", boxShadow: `0 2px 8px ${C.teal}40` }
      : v === "success" ? { background: `linear-gradient(135deg,${C.green},#047857)`, color: "#fff" }
      : v === "danger" ? { background: C.redLight, color: C.red, border: `1px solid #fecaca` }
      : v === "amber" ? { background: C.amberLight, color: "#92400e", border: `1px solid #fde68a` }
      : v === "purple" ? { background: C.purpleLight, color: C.purple, border: `1px solid #ddd6fe` }
      : v === "ghost" ? { background: "transparent", color: C.gray500, border: `1px solid ${C.gray200}` }
      : { background: C.gray100, color: "#475569", border: `1px solid ${C.gray200}` })
  }),
  inp: (err) => ({ width: "100%", padding: "8px 12px", borderRadius: 9, border: `1.5px solid ${err ? C.red : C.gray200}`, fontSize: 13, fontFamily: "inherit", color: C.gray900, background: err ? "#fff8f8" : "#fff", outline: "none", boxSizing: "border-box" }),
  lbl: { fontSize: 11, fontWeight: 700, color: C.gray500, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  secTitle: { fontSize: 15, fontWeight: 700, color: C.gray900, marginBottom: 16, paddingBottom: 8, borderBottom: `2px solid ${C.gray100}` },
  badge: (color) => ({
    display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
    background: color === "green" ? "#dcfce7" : color === "amber" ? "#fef3c7" : color === "red" ? "#fee2e2" : color === "blue" ? "#dbeafe" : color === "purple" ? "#ede9fe" : color === "teal" ? "#ccfbf1" : "#f1f5f9",
    color: color === "green" ? "#166534" : color === "amber" ? "#92400e" : color === "red" ? "#991b1b" : color === "blue" ? "#1e40af" : color === "purple" ? "#5b21b6" : color === "teal" ? "#0f766e" : "#475569"
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
  if (!(p.trials || []).some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI")) e.trialClass = "At least one SSRI or SNRI required";
  return e;
}
function stepErrors(p, step) {
  const all = validatePatient(p);
  const map = { 0: ["firstName","lastName","dob","gender","phone"], 1: ["insurerName","policyId"], 2: ["diagnosisCode","diagnosisDate","t0drug","t0dur","t0reason","t1drug","t1dur","t1reason","trialClass"], 3: [], 4: [] };
  return Object.fromEntries(Object.entries(all).filter(([k]) => (map[step] || []).includes(k)));
}

// ── UI Primitives ──────────────────────────────────────────────────────────
function Input({ value, onChange, placeholder, type = "text", style = {}, disabled, error, readOnly }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <input type={type} value={value ?? ""} onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled} readOnly={readOnly}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ ...S.inp(error), borderColor: focused ? C.teal : error ? C.red : C.gray200, opacity: disabled ? 0.6 : 1, background: readOnly ? C.gray50 : error ? "#fff8f8" : "#fff", ...style }} />
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 3, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
function Select({ value, onChange, options, style = {}, error }) {
  return (
    <div>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)}
        style={{ ...S.inp(error), appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 34, ...style }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 3, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
function Checkbox({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", fontSize: 13, color: C.gray700 }}>
      <div onClick={() => onChange(!checked)} style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2, border: `2px solid ${checked ? C.teal : "#cbd5e1"}`, background: checked ? C.teal : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", cursor: "pointer" }}>
        {checked && <svg width="9" height="7" viewBox="0 0 9 7"><path d="M1 3.5L3 5.5L8 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
      </div>
      <span style={{ lineHeight: 1.5 }}>{label}</span>
    </label>
  );
}
function Textarea({ value, onChange, placeholder, rows = 3, readOnly }) {
  const [f, setF] = useState(false);
  return <textarea value={value ?? ""} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder} rows={rows} readOnly={readOnly}
    onFocus={() => setF(true)} onBlur={() => setF(false)}
    style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6, borderColor: f ? C.teal : C.gray200, background: readOnly ? C.gray50 : "#fff" }} />;
}
function FL({ label, required }) {
  return <label style={{ ...S.lbl, display: "flex", gap: 3 }}>{label}{required && <span style={{ color: C.red }}>*</span>}</label>;
}
function Field({ label, required, children, span = 1 }) {
  return <div style={{ gridColumn: `span ${span}` }}><FL label={label} required={required} />{children}</div>;
}
function CheckboxGroup({ label, options, selected = [], onChange, otherValue = "", onOtherChange, required }) {
  const toggle = o => onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o]);
  const hasOther = selected.includes("Other (specify below)") || selected.includes("Other");
  return (
    <div>
      {label && <FL label={label} required={required} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: hasOther ? 8 : 0 }}>
        {options.map(o => {
          const on = selected.includes(o);
          return <div key={o} onClick={() => toggle(o)} style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? C.teal : C.gray100, color: on ? "#fff" : C.gray500, border: `1.5px solid ${on ? C.teal : C.gray200}`, transition: "all 0.15s", userSelect: "none" }}>{o}</div>;
        })}
      </div>
      {hasOther && onOtherChange && <input value={otherValue ?? ""} onChange={e => onOtherChange(e.target.value)} placeholder="Describe other..." style={{ ...S.inp(false), fontSize: 13, marginTop: 6 }} />}
    </div>
  );
}
function VitalsInput({ label, systolic, diastolic, onSys, onDia, ox, onOx, type = "bp" }) {
  if (type === "ox") return (
    <div><FL label={label} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input value={ox ?? ""} onChange={e => onOx(e.target.value)} placeholder="98" style={{ ...S.inp(false), width: 68 }} />
        <span style={{ fontSize: 12, color: C.gray500 }}>%</span>
      </div>
    </div>
  );
  return (
    <div><FL label={label} />
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input value={systolic ?? ""} onChange={e => onSys(e.target.value)} placeholder="120" style={{ ...S.inp(false), width: 58 }} />
        <span style={{ color: C.gray400, fontWeight: 700 }}>/</span>
        <input value={diastolic ?? ""} onChange={e => onDia(e.target.value)} placeholder="80" style={{ ...S.inp(false), width: 58 }} />
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
        <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: `2px solid ${C.teal}` }}>
          <img src={value} alt={label} style={{ width: "100%", maxHeight: 130, objectFit: "cover", display: "block" }} />
          <button onClick={() => onChange(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 5, color: "#fff", padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>✕</button>
        </div>
      ) : (
        <div onClick={() => ref.current?.click()} style={{ border: "2px dashed #cbd5e1", borderRadius: 10, padding: "18px 12px", textAlign: "center", cursor: "pointer", background: C.gray50 }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
          <div style={{ fontSize: 11, color: C.gray500 }}>Click to capture or upload</div>
        </div>
      )}
    </div>
  );
}
function EnrollBtn({ label, url, icon, sub }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <div><div style={{ fontWeight: 700 }}>{label}</div><div style={{ fontSize: 10, opacity: 0.8, marginTop: 1 }}>{sub || "Opens in new tab →"}</div></div>
    </a>
  );
}

// ── PHQ-9 Components ───────────────────────────────────────────────────────
function PHQ9Form({ assessment, onChange }) {
  const { answers, date } = assessment;
  const score = answers.every(v => v !== null) ? answers.reduce((s, v) => s + v, 0) : null;
  const sev = score !== null ? phq9Severity(score) : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>PHQ-9 Assessment</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.lbl}>Date</span>
          <input type="date" value={date ?? ""} onChange={e => onChange({ ...assessment, date: e.target.value })} style={{ ...S.inp(false), width: "auto" }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.gray500, background: C.gray50, borderRadius: 8, padding: "7px 12px", marginBottom: 10 }}>
        Over the <strong>last 2 weeks</strong>, how often bothered by:
      </div>
      {PHQ9_QUESTIONS.map((q, qi) => (
        <div key={qi} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4,72px)", gap: 4, padding: "8px 10px", borderRadius: 7, marginBottom: 2, alignItems: "center", background: answers[qi] !== null ? "#f0f9ff" : qi % 2 === 0 ? C.gray50 : "#fff" }}>
          <div style={{ fontSize: 12, color: C.gray700 }}><span style={{ color: C.gray400, marginRight: 4, fontWeight: 700 }}>{qi + 1}.</span>{q}</div>
          {[0, 1, 2, 3].map(val => (
            <div key={val} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ fontSize: 9, color: C.gray400, textAlign: "center" }}>{PHQ9_OPTIONS[val].split(" ")[0]}<br/>({val})</div>
              <div onClick={() => { const a = [...answers]; a[qi] = val; onChange({ ...assessment, answers: a }); }}
                style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${answers[qi] === val ? C.teal : "#cbd5e1"}`, background: answers[qi] === val ? C.teal : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {answers[qi] === val && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
              </div>
            </div>
          ))}
        </div>
      ))}
      {sev && (
        <div style={{ marginTop: 10, padding: "12px 16px", borderRadius: 10, background: sev.bg, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: sev.color }}>{score}</div>
            <div style={{ fontSize: 9, color: C.gray400, fontWeight: 700, textTransform: "uppercase" }}>Score</div>
          </div>
          <div style={{ width: 1, height: 40, background: C.gray200 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: sev.color }}>{sev.label} Depression</div>
            <div style={{ fontSize: 12, color: C.gray500 }}>{score >= 10 ? "✓ Supports Spravato candidacy (PHQ-9 ≥10)" : "PHQ-9 <10 — reassess eligibility"}</div>
          </div>
          {answers[8] > 0 && <div style={{ marginLeft: "auto", padding: "7px 12px", background: C.redLight, borderRadius: 8, fontSize: 12, fontWeight: 700, color: C.red }}>⚠ Q9 Positive</div>}
        </div>
      )}
    </div>
  );
}

function PHQ9History({ patient, onUpdate, addAudit }) {
  const [adding, setAdding] = useState(false);
  const [current, setCurrent] = useState(null);
  const history = [...(patient.phq9History || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  const trend = [...history].filter(a => a.score !== null).slice(0, 6).reverse();

  const save = () => {
    if (!current.date) { alert("Please enter assessment date."); return; }
    const score = current.answers.every(v => v !== null) ? current.answers.reduce((s, v) => s + v, 0) : null;
    const saved = { ...current, score };
    const updated = { ...patient, phq9History: [...(patient.phq9History || []), saved] };
    addAudit(updated, `PHQ-9 recorded — Score: ${score ?? "incomplete"} (${current.date})`);
    onUpdate(updated); setAdding(false); setCurrent(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={S.secTitle}>PHQ-9 History</div>
        {!adding && <button onClick={() => { setCurrent(emptyPHQ9()); setAdding(true); }} style={S.btn()}>+ New Assessment</button>}
      </div>
      {trend.length >= 2 && (
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray700, marginBottom: 10 }}>Score Trend</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 70 }}>
            {trend.map(a => {
              const sev = phq9Severity(a.score);
              const h = Math.max(10, Math.round((a.score / 27) * 64));
              return (
                <div key={a.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: sev.color }}>{a.score}</div>
                  <div style={{ width: "100%", height: h, background: sev.color, borderRadius: "3px 3px 0 0", opacity: 0.75 }} />
                  <div style={{ fontSize: 9, color: C.gray400 }}>{new Date(a.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
              );
            })}
          </div>
          {trend.length >= 2 && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.gray500 }}>
              {trend[trend.length - 1].score < trend[0].score
                ? <span style={{ color: C.green }}>▼ Improved {trend[0].score - trend[trend.length - 1].score} pts from baseline</span>
                : trend[trend.length - 1].score > trend[0].score
                  ? <span style={{ color: C.red }}>▲ Worsened {trend[trend.length - 1].score - trend[0].score} pts from baseline</span>
                  : <span>→ No change from baseline</span>}
            </div>
          )}
        </div>
      )}
      {adding && current && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}` }}>
          <PHQ9Form assessment={current} onChange={setCurrent} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button onClick={() => { setAdding(false); setCurrent(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ Save</button>
          </div>
        </div>
      )}
      {history.length === 0 && !adding
        ? <div style={{ textAlign: "center", padding: "32px 20px", color: C.gray400 }}><div style={{ fontSize: 28 }}>📊</div><div style={{ fontSize: 13, marginTop: 6 }}>No assessments yet</div></div>
        : history.map(a => {
          const sev = a.score !== null ? phq9Severity(a.score) : null;
          return (
            <div key={a.id} style={{ ...S.card, marginBottom: 8, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, background: sev ? sev.bg : C.gray100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: sev ? sev.color : C.gray400 }}>{a.score ?? "?"}</div>
                <div style={{ fontSize: 8, color: C.gray400, fontWeight: 700, textTransform: "uppercase" }}>PHQ-9</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDate(a.date)}</div>
                <div style={{ fontSize: 12, color: C.gray500 }}>{sev ? sev.label : "Incomplete"}{a.answers?.[8] > 0 ? " · ⚠ Q9 Positive" : ""}</div>
              </div>
              {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color }}>{sev.label}</span>}
              <button onClick={() => { if (window.confirm("Delete?")) onUpdate({ ...patient, phq9History: patient.phq9History.filter(x => x.id !== a.id) }); }} style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: 11 }}>✕</button>
            </div>
          );
        })}
    </div>
  );
}

// ── Trial Editor ───────────────────────────────────────────────────────────
function TrialEditor({ trials, onChange }) {
  const classColor = { SSRI: C.green, SNRI: C.teal, NDRI: "#d97706", TCA: C.purple, MAOI: C.red, NaSSA: "#0891b2", SARI: "#7c3aed", SMS: C.teal, Augmentation: "#6b7280", Other: C.gray500 };
  const upd = (idx, field, value) => {
    const updated = trials.map((t, i) => {
      if (i !== idx) return t;
      const u = { ...t, [field]: value };
      if (field === "drug") u.drugClass = DRUG_CLASSES[value] || "";
      if (field === "startDate" || field === "endDate") {
        const w = weeksFromDates(field === "startDate" ? value : t.startDate, field === "endDate" ? value : t.endDate);
        if (w) u.durationWeeks = w;
      }
      return u;
    });
    onChange(updated);
  };
  const hasSSRISNRI = trials.some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI");
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={S.secTitle}>Antidepressant Trial History</div>
        {trials.length < 6 && <button onClick={() => onChange([...trials, emptyTrial()])} style={{ ...S.btn("ghost"), fontSize: 12, padding: "5px 12px" }}>+ Add Trial</button>}
      </div>
      {!hasSSRISNRI && trials.some(t => t.drug) && (
        <div style={{ padding: "8px 12px", background: C.amberLight, borderRadius: 8, fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: 12 }}>⚠ PA requires at least one SSRI or SNRI trial</div>
      )}
      {trials.map((trial, idx) => (
        <div key={trial.id} style={{ border: `1.5px solid ${C.gray200}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, background: trial.drug ? "#fafeff" : "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: C.teal, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 11 }}>{idx + 1}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Trial {idx + 1}{idx < 2 ? " *" : ""}</span>
              {trial.drugClass && <span style={{ ...S.badge(""), background: `${classColor[trial.drugClass] || C.gray500}18`, color: classColor[trial.drugClass] || C.gray500, fontSize: 10 }}>{trial.drugClass}</span>}
              {(trial.drugClass === "SSRI" || trial.drugClass === "SNRI") && <span style={S.badge("green")}>✓ PA Qualifies</span>}
            </div>
            {trials.length > 2 && <button onClick={() => onChange(trials.filter((_, i) => i !== idx))} style={{ ...S.btn("danger"), padding: "3px 9px", fontSize: 11 }}>Remove</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
            <Field label="Medication" required={idx < 2}>
              <Select value={trial.drug} onChange={v => upd(idx, "drug", v)} options={[{ value: "", label: "Select..." }, ...ANTIDEPRESSANTS.map(a => ({ value: a, label: a }))]} />
            </Field>
            <Field label="Class (auto)">
              <div style={{ ...S.inp(false), background: C.gray50, color: trial.drugClass ? classColor[trial.drugClass] || C.gray700 : C.gray400, fontWeight: 600, fontSize: 12 }}>{trial.drugClass || "Auto-fills"}</div>
            </Field>
            <Field label="Dose"><Input value={trial.dose} onChange={v => upd(idx, "dose", v)} placeholder="e.g. 20mg" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
            <Field label="Start Date"><Input type="date" value={trial.startDate} onChange={v => upd(idx, "startDate", v)} /></Field>
            <Field label="End Date"><Input type="date" value={trial.endDate} onChange={v => upd(idx, "endDate", v)} /></Field>
            <Field label="Duration (wk)" required={idx < 2}>
              <Select value={trial.durationWeeks} onChange={v => upd(idx, "durationWeeks", v)}
                options={[{ value: "", label: "Select..." }, ...["<4","4","5","6","7","8","9","10","11","12","16","20","24","26+"].map(w => ({ value: w, label: `${w} wk` }))]} />
            </Field>
            <Field label="Adequate Trial?">
              <Select value={trial.adequateTrial ? "yes" : "no"} onChange={v => upd(idx, "adequateTrial", v === "yes")}
                options={[{ value: "yes", label: "Yes (≥6 wk)" }, { value: "no", label: "No" }]} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Reason Discontinued" required={idx < 2}>
              <Select value={trial.reason} onChange={v => upd(idx, "reason", v)} options={DISC_REASONS.map(r => ({ value: r, label: r || "Select..." }))} />
            </Field>
            <Field label="Notes"><Input value={trial.notes} onChange={v => upd(idx, "notes", v)} placeholder="Pharmacy records, notes..." /></Field>
          </div>
          {trial.startDate && trial.endDate && weeksFromDates(trial.startDate, trial.endDate) && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.teal, fontWeight: 600 }}>✓ Auto-calculated: {weeksFromDates(trial.startDate, trial.endDate)} weeks</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Psychiatrist Selector ──────────────────────────────────────────────────
function PsychiatristSelector({ patient, onChange }) {
  return (
    <div>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {PSYCHX_PSYCHIATRISTS.map(doc => (
          <div key={doc.id} onClick={() => {
            if (doc.id === "other") onChange({ psychiatristId: "other", psychiatristName: "", psychiatristPractice: "", psychiatristPhone: "", psychiatristNPI: "", psychiatristAddress: "" });
            else onChange({ psychiatristId: doc.id, psychiatristName: doc.name, psychiatristPractice: doc.practice, psychiatristPhone: doc.phone, psychiatristNPI: doc.npi, psychiatristAddress: `${doc.address}, ${doc.city}, ${doc.state} ${doc.zip}` });
          }} style={{ border: `2px solid ${patient.psychiatristId === doc.id ? C.teal : C.gray200}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", background: patient.psychiatristId === doc.id ? C.tealLight : "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${patient.psychiatristId === doc.id ? C.teal : "#cbd5e1"}`, background: patient.psychiatristId === doc.id ? C.teal : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {patient.psychiatristId === doc.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <div style={{ flex: 1 }}>
                {doc.affiliated && <span style={{ ...S.badge("blue"), fontSize: 10 }}>PsychX Affiliated</span>}
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: doc.affiliated ? 3 : 0 }}>{doc.name}</div>
                {doc.practice && <div style={{ fontSize: 11, color: C.gray500 }}>{doc.practice}{doc.npi ? ` · NPI: ${doc.npi}` : ""}</div>}
                {doc.phone && <div style={{ fontSize: 11, color: C.gray400 }}>📞 {doc.phone}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {patient.psychiatristId === "other" && (
        <div style={{ border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "12px 14px", background: C.gray50 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Name"><Input value={patient.psychiatristName} onChange={v => onChange({ psychiatristName: v })} placeholder="Dr. Name" /></Field>
            <Field label="Practice"><Input value={patient.psychiatristPractice} onChange={v => onChange({ psychiatristPractice: v })} /></Field>
            <Field label="Phone"><Input value={patient.psychiatristPhone} onChange={v => onChange({ psychiatristPhone: v })} /></Field>
            <Field label="NPI"><Input value={patient.psychiatristNPI} onChange={v => onChange({ psychiatristNPI: v })} /></Field>
            <Field label="Address" span={2}><Input value={patient.psychiatristAddress} onChange={v => onChange({ psychiatristAddress: v })} /></Field>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Billing Module ─────────────────────────────────────────────────────────
function BillingModule({ session, patient, settings, onSave }) {
  const isMedicare = patient?.planType === "medicare";
  const [lines, setLines] = useState(() => {
    if (session.billingLines?.length > 0) return session.billingLines;
    return autoSuggestCodes(session, isMedicare);
  });
  const [diagCodes, setDiagCodes] = useState(session.billingDiagCodes?.length > 0 ? session.billingDiagCodes : [patient?.diagnosisCode || "F33.2"].filter(Boolean));
  const [billingNotes, setBillingNotes] = useState(session.billingNotes || "");
  const [showAddCode, setShowAddCode] = useState(false);
  const [customCode, setCustomCode] = useState({ code: "", desc: "", units: 1, modifier: "", diagRef: "A", fee: "", type: "custom" });

  const toggleDiag = code => setDiagCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : prev.length >= 6 ? prev : [...prev, code]);
  const diagRef = idx => String.fromCharCode(65 + idx);
  const updLine = (i, f, v) => setLines(prev => prev.map((l, li) => li === i ? { ...l, [f]: v } : l));
  const removeLine = i => setLines(prev => prev.filter((_, li) => li !== i));
  const addCustom = () => {
    if (!customCode.code.trim()) return;
    setLines(prev => [...prev, { ...customCode }]);
    setCustomCode({ code: "", desc: "", units: 1, modifier: "", diagRef: "A", fee: "", type: "custom" });
    setShowAddCode(false);
  };

  const totalBilled = lines.reduce((s, l) => s + (parseFloat(l.fee) * parseInt(l.units) || 0), 0);
  const typeColor = t => t === "drug" ? "purple" : t === "em" ? "teal" : t === "prolonged" ? "blue" : t === "addon" ? "green" : "amber";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: C.tealLight, borderRadius: 10, border: `1px solid #bae6fd` }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <div style={{ fontSize: 12, color: "#0369a1" }}>
          <strong>Auto-suggested codes</strong> based on {session.dose} dose and {patient?.planType} plan. Review and adjust as needed.
          {isMedicare && " Medicare G-codes applied."} Estimated revenue: <strong>$1,300–$2,000/session</strong>
        </div>
      </div>
      <div style={{ padding: "8px 12px", background: C.amberLight, borderRadius: 8, fontSize: 11, color: "#92400e", marginBottom: 14 }}>
        ⚠ Spravato must be administered in a <strong>REMS-certified office setting (POS 11)</strong>. Telepsych E&M on the same date requires a <strong>separate claim</strong> with POS 02.
      </div>

      {/* Diagnosis Codes */}
      <div style={{ ...S.card }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Diagnosis Codes (Box 21) — select up to 6</div>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {ICD10_COMMON.map(dx => {
            const on = diagCodes.includes(dx.code);
            const idx = diagCodes.indexOf(dx.code);
            return (
              <div key={dx.code} onClick={() => toggleDiag(dx.code)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${on ? C.teal : C.gray200}`, background: on ? C.tealLight : "#fff", cursor: "pointer" }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: on ? C.teal : C.gray100, color: on ? "#fff" : C.gray400, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {on ? diagRef(idx) : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{dx.code}</span>
                  <span style={{ fontSize: 12, color: C.gray500, marginLeft: 8 }}>{dx.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
        {diagCodes.length === 0 && <div style={{ fontSize: 12, color: C.red }}>⚠ At least one diagnosis code required</div>}
      </div>

      {/* Service Lines */}
      <div style={{ ...S.card }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Service Lines (Box 24)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {["Type","CPT/HCPCS","Description","Units","Mod","Diag","Fee $",""].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.gray100}` }}>
                  <td style={{ padding: "6px 10px" }}><span style={S.badge(typeColor(l.type))}>{l.type}</span></td>
                  <td style={{ padding: "6px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>{l.code}</td>
                  <td style={{ padding: "6px 10px", maxWidth: 240 }}>
                    <input value={l.desc} onChange={e => updLine(i, "desc", e.target.value)} style={{ ...S.inp(false), fontSize: 11, padding: "4px 8px" }} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <input type="number" value={l.units} onChange={e => updLine(i, "units", e.target.value)} min="1" style={{ ...S.inp(false), width: 56, padding: "4px 8px" }} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <select value={l.modifier || ""} onChange={e => updLine(i, "modifier", e.target.value)} style={{ ...S.inp(false), padding: "4px 8px", width: 60, appearance: "none" }}>
                      <option value="">—</option>
                      {MODIFIER_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <select value={l.diagRef || "A"} onChange={e => updLine(i, "diagRef", e.target.value)} style={{ ...S.inp(false), padding: "4px 8px", width: 56, appearance: "none" }}>
                      {diagCodes.map((_, di) => <option key={di} value={diagRef(di)}>{diagRef(di)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <input type="number" value={l.fee} onChange={e => updLine(i, "fee", e.target.value)} placeholder="0.00" style={{ ...S.inp(false), width: 72, padding: "4px 8px" }} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <button onClick={() => removeLine(i)} style={{ ...S.btn("danger"), padding: "3px 8px", fontSize: 11 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalBilled > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, padding: "8px 12px", background: C.greenLight, borderRadius: 8 }}>
            <span style={{ fontWeight: 700, color: C.green }}>Total Billed: ${totalBilled.toFixed(2)}</span>
          </div>
        )}

        <div style={{ marginTop: 12, borderTop: `1px solid ${C.gray100}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray700, marginBottom: 8 }}>Add Codes</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {[...EM_CODES, ...(isMedicare ? PROLONGED_CODES_MEDICARE : PROLONGED_CODES_COMMERCIAL), ...PSYCH_ADDON_CODES, { code: "G2082", desc: "Bundled ≤56mg", type: "drug_bundle" }, { code: "G2083", desc: "Bundled >56mg", type: "drug_bundle" }].map(c => (
              <button key={c.code} onClick={() => setLines(prev => [...prev, { code: c.code, desc: c.desc, units: c.units || 1, modifier: "", diagRef: "A", fee: "", type: c.type }])}
                style={{ ...S.btn("secondary"), fontSize: 11, padding: "4px 10px" }}>{c.code}</button>
            ))}
          </div>
          {showAddCode ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 60px 60px 80px", gap: 8, alignItems: "end" }}>
              <div><FL label="CPT Code" /><input value={customCode.code} onChange={e => setCustomCode(p => ({ ...p, code: e.target.value }))} placeholder="99XXX" style={S.inp(false)} /></div>
              <div><FL label="Description" /><input value={customCode.desc} onChange={e => setCustomCode(p => ({ ...p, desc: e.target.value }))} placeholder="Service description" style={S.inp(false)} /></div>
              <div><FL label="Units" /><input type="number" value={customCode.units} onChange={e => setCustomCode(p => ({ ...p, units: e.target.value }))} style={S.inp(false)} /></div>
              <div><FL label="Mod" /><input value={customCode.modifier} onChange={e => setCustomCode(p => ({ ...p, modifier: e.target.value }))} placeholder="25" style={S.inp(false)} /></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={addCustom} style={S.btn("success")}>Add</button>
                <button onClick={() => setShowAddCode(false)} style={S.btn("ghost")}>✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddCode(true)} style={{ ...S.btn("ghost"), fontSize: 12 }}>+ Manual Code</button>
          )}
        </div>
      </div>

      <div style={S.card}>
        <FL label="Billing Notes" />
        <Textarea value={billingNotes} onChange={setBillingNotes} placeholder="CoverMyMeds ref, payer notes, prior auth #..." rows={2} />
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => onSave({ billingLines: lines, billingDiagCodes: diagCodes, billingNotes })} style={S.btn("success")}>✓ Save Billing Info</button>
      </div>
    </div>
  );
}

// ── HCFA-1500 Export ───────────────────────────────────────────────────────
function generateHCFA(patient, session, settings) {
  const s = settings || defaultSettings();
  const dob = patient.dob ? patient.dob.replace(/-/g, "") : "";
  const dobFmt = dob.length === 8 ? `${dob.slice(4, 6)}/${dob.slice(6, 8)}/${dob.slice(0, 4)}` : patient.dob || "";
  const dateOfService = session.date ? session.date.replace(/-/g, "").replace(/(\d{4})(\d{2})(\d{2})/, "$2/$3/$1") : "";
  const lines = session.billingLines || [];
  const diags = session.billingDiagCodes || [patient.diagnosisCode];
  const diagRef = i => String.fromCharCode(65 + i);
  const isMedicare = patient.planType === "medicare";

  const box = (label, value, style = "") => `<td style="border:1px solid #000;padding:3px 5px;vertical-align:top;${style}"><div style="font-size:7px;color:#555;font-weight:700;text-transform:uppercase;margin-bottom:1px">${label}</div><div style="font-size:10px;font-weight:600">${value || ""}</div></td>`;
  const hline = (w) => `<div style="border-bottom:1px solid #000;width:${w}%;margin-bottom:2px"></div>`;
  const lineRows = lines.map((l, i) => `
    <tr>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px">${dateOfService}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px">${dateOfService}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px;text-align:center">11</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:10px;font-weight:700">${l.code}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px">${l.modifier || ""}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px;text-align:center">${l.diagRef || diagRef(0)}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px;text-align:right">${l.fee ? `$${parseFloat(l.fee).toFixed(2)}` : ""}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px;text-align:center">${l.units || 1}</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px">NPI</td>
      <td style="border:1px solid #ccc;padding:3px 4px;font-size:9px">${s.renderingProviderNPI || ""}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><title>HCFA-1500 Claim</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; background: #fff; padding: 12px; }
.form { border: 2px solid #000; max-width: 800px; margin: 0 auto; }
.row { display: flex; border-bottom: 1px solid #000; }
.cell { border-right: 1px solid #000; padding: 3px 5px; flex: 1; }
.cell:last-child { border-right: none; }
.label { font-size: 7px; color: #555; font-weight: 700; text-transform: uppercase; margin-bottom: 1px; }
.val { font-size: 10px; font-weight: 600; min-height: 14px; }
.hdr { background: #000; color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 800; text-align: center; letter-spacing: 0.1em; }
.sec { background: #e8e8e8; padding: 2px 5px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #000; }
table.svc { width: 100%; border-collapse: collapse; }
table.svc th { background: #e8e8e8; border: 1px solid #000; padding: 3px 4px; font-size: 8px; font-weight: 700; text-align: left; text-transform: uppercase; }
.watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 72px; color: rgba(0,0,0,0.04); font-weight: 900; pointer-events: none; z-index: 0; white-space: nowrap; }
@media print { body { padding: 0; } @page { margin: 0.25in; size: letter; } }
.missing { background: #fffbeb; border: 1px dashed #f59e0b; }
</style></head><body>
<div class="watermark">PSYCHX — NOT FOR OFFICIAL SUBMISSION</div>
<div style="max-width:800px;margin:0 auto">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:6px 8px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px">
  <div><strong style="color:#0369a1">PsychX Billing · HCFA-1500</strong> <span style="font-size:10px;color:#64748b">Session #${session.sessionNumber} · ${patient.psychxMRN}</span></div>
  <div style="font-size:10px;color:#64748b">Generated: ${new Date().toLocaleDateString()}</div>
</div>
<div style="font-size:9px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:4px 8px;margin-bottom:8px">
  ⚠ Review all fields before submission. Replace any dashed fields with accurate data. This form is for reference — submit via your clearinghouse or payer portal.
</div>
<div class="form">
  <div class="hdr">HEALTH INSURANCE CLAIM FORM — HCFA-1500 (02-12)</div>

  <!-- Row 1: Insurance type -->
  <div class="row" style="min-height:28px">
    <div class="cell" style="flex:3">
      <div class="label">1. Insurance Type</div>
      <div class="val" style="display:flex;gap:12px;font-size:9px">
        <span>☐ Medicare</span><span>☐ Medicaid</span><span>☐ Tricare</span><span>☐ CHAMPVA</span>
        <span>☐ Group</span><span>☑ ${isMedicare ? "Medicare" : "Other"}</span>
      </div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">1a. Insured's ID Number</div>
      <div class="val">${patient.policyId || "_______________"}</div>
    </div>
  </div>

  <!-- Row 2: Patient & Insured names -->
  <div class="row">
    <div class="cell" style="flex:3">
      <div class="label">2. Patient's Name (Last, First, MI)</div>
      <div class="val">${patient.lastName || "___"}, ${patient.firstName || "___"}</div>
    </div>
    <div class="cell">
      <div class="label">3. Patient DOB / Sex</div>
      <div class="val">${dobFmt} / ${patient.gender ? patient.gender[0] : "_"}</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">4. Insured's Name</div>
      <div class="val">${patient.policyHolder || patient.firstName + " " + patient.lastName}</div>
    </div>
  </div>

  <!-- Row 3 -->
  <div class="row">
    <div class="cell" style="flex:3">
      <div class="label">5. Patient's Address</div>
      <div class="val">${patient.address || ""} ${patient.city || ""}, ${patient.state || ""} ${patient.zip || ""}</div>
    </div>
    <div class="cell">
      <div class="label">6. Patient Relationship</div>
      <div class="val">☑ Self  ☐ Spouse  ☐ Child  ☐ Other</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">7. Insured's Address</div>
      <div class="val">Same as patient</div>
    </div>
  </div>

  <!-- Row 9-11: Insurance -->
  <div class="sec">Patient/Insurance Information</div>
  <div class="row">
    <div class="cell" style="flex:2">
      <div class="label">9. Other Insured's Name</div>
      <div class="val">N/A</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">10. Patient Condition Related To</div>
      <div class="val" style="font-size:9px">☐ Employment  ☐ Auto Accident  ☐ Other</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">11. Insured's Policy Group</div>
      <div class="val ${patient.groupNumber ? "" : "missing"}">${patient.groupNumber || "— MISSING —"}</div>
    </div>
  </div>
  <div class="row">
    <div class="cell" style="flex:2">
      <div class="label">11a. Insured DOB / Sex</div>
      <div class="val">${dobFmt} / ${patient.gender ? patient.gender[0] : "_"}</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">11b. Other Claim ID</div>
      <div class="val">N/A</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">11c. Insurance Plan Name</div>
      <div class="val">${patient.insurerName || "_______________"}</div>
    </div>
  </div>

  <!-- 12-13 Signatures -->
  <div class="row">
    <div class="cell" style="flex:3">
      <div class="label">12. Patient Authorization Signature</div>
      <div class="val">${s.signatureOnFile ? "Signature on File" : "______________________"} &nbsp; Date: ${dateOfService}</div>
    </div>
    <div class="cell" style="flex:3">
      <div class="label">13. Insured Authorization</div>
      <div class="val">${s.signatureOnFile ? "Signature on File" : "______________________"}</div>
    </div>
  </div>

  <!-- 14-18 Clinical -->
  <div class="sec">Clinical Information</div>
  <div class="row">
    <div class="cell" style="flex:2">
      <div class="label">14. Date of Current Illness/Injury</div>
      <div class="val">${patient.diagnosisDate || "_______________"}</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">15. Other Date</div>
      <div class="val">N/A</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">16. Dates Unable to Work</div>
      <div class="val">N/A</div>
    </div>
  </div>
  <div class="row">
    <div class="cell" style="flex:3">
      <div class="label">17. Referring Provider Name</div>
      <div class="val">${patient.psychiatristName || s.renderingProviderName || "_______________"}</div>
    </div>
    <div class="cell">
      <div class="label">17a. NPI</div>
      <div class="val">${patient.psychiatristNPI || "_______________"}</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">18. Hospitalization Dates</div>
      <div class="val">N/A</div>
    </div>
  </div>

  <!-- 19-20 -->
  <div class="row">
    <div class="cell" style="flex:3">
      <div class="label">19. Additional Claim Info</div>
      <div class="val">${session.billingNotes || "PsychX MRN: " + patient.psychxMRN + (patient.emrMRN ? " | EMR MRN: " + patient.emrMRN : "")} </div>
    </div>
    <div class="cell">
      <div class="label">20. Outside Lab?</div>
      <div class="val">☑ No</div>
    </div>
  </div>

  <!-- 21: Diagnosis Codes -->
  <div class="sec">Diagnosis Codes (Box 21)</div>
  <div class="row" style="flex-wrap:wrap">
    ${diags.slice(0, 6).map((d, i) => `<div class="cell"><div class="label">${diagRef(i)}.</div><div class="val" style="font-weight:700">${d}</div></div>`).join("")}
    ${Array.from({ length: Math.max(0, 4 - diags.length) }).map(() => `<div class="cell"><div class="label">&nbsp;</div><div class="val">___________</div></div>`).join("")}
  </div>

  <!-- 22: Resubmission -->
  <div class="row">
    <div class="cell" style="flex:2">
      <div class="label">22. Resubmission Code</div>
      <div class="val">N/A</div>
    </div>
    <div class="cell" style="flex:4">
      <div class="label">23. Prior Auth Number</div>
      <div class="val ${!((patient.paRecords || []).find(r => r.status === "Approved")?.authNumber) ? "missing" : ""}">${(patient.paRecords || []).find(r => r.status === "Approved")?.authNumber || "— ENTER AUTH # —"}</div>
    </div>
  </div>

  <!-- 24: Service Lines -->
  <div class="sec">Service Lines (Box 24)</div>
  <div style="padding:4px">
    <table class="svc">
      <thead>
        <tr>
          <th style="width:70px">24A. DOS From</th>
          <th style="width:70px">DOS To</th>
          <th style="width:40px">24B. POS</th>
          <th style="width:70px">24D. Procedure</th>
          <th style="width:40px">Modifier</th>
          <th style="width:40px">24E. Diag</th>
          <th style="width:70px">24F. Charges</th>
          <th style="width:40px">24G. Units</th>
          <th style="width:40px">24I. Type</th>
          <th style="width:80px">24J. Rendering NPI</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows || `<tr><td colspan="10" style="text-align:center;padding:10px;color:#94a3b8;font-size:11px">No service lines — add billing codes above</td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- 25-29 -->
  <div class="sec">Provider/Payment Information</div>
  <div class="row">
    <div class="cell" style="flex:2">
      <div class="label">25. Federal Tax ID</div>
      <div class="val ${!s.taxId ? "missing" : ""}">${s.taxId || "— ENTER TAX ID —"}</div>
    </div>
    <div class="cell">
      <div class="label">26. Patient Account #</div>
      <div class="val">${patient.psychxMRN}</div>
    </div>
    <div class="cell">
      <div class="label">27. Accept Assignment</div>
      <div class="val">${s.acceptsAssignment ? "☑ YES  ☐ NO" : "☐ YES  ☑ NO"}</div>
    </div>
    <div class="cell">
      <div class="label">28. Total Charge</div>
      <div class="val">$${lines.reduce((sum, l) => sum + (parseFloat(l.fee) * parseInt(l.units) || 0), 0).toFixed(2)}</div>
    </div>
    <div class="cell">
      <div class="label">29. Amt Paid</div>
      <div class="val">$0.00</div>
    </div>
    <div class="cell">
      <div class="label">30. Reserved</div>
      <div class="val">&nbsp;</div>
    </div>
  </div>

  <!-- 31-33 -->
  <div class="row" style="min-height:50px">
    <div class="cell" style="flex:2">
      <div class="label">31. Signature of Physician / Supplier</div>
      <div class="val" style="margin-top:16px">${s.renderingProviderName || "______________________"}</div>
      <div style="font-size:8px;color:#666;margin-top:2px">Date: ${dateOfService}</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">32. Service Facility Location</div>
      <div class="val">${s.practiceName || "_______________"}</div>
      <div style="font-size:9px;color:#555">${s.practiceAddress || ""} ${s.practiceCity || ""}, ${s.practiceState || ""} ${s.practiceZip || ""}</div>
    </div>
    <div class="cell" style="flex:2">
      <div class="label">33. Billing Provider Info & Phone</div>
      <div class="val ${!s.practiceName ? "missing" : ""}">${s.practiceName || "— ENTER PRACTICE —"}</div>
      <div style="font-size:9px;color:#555">${s.practiceAddress || ""} ${s.practiceCity || ""}, ${s.practiceState || ""} ${s.practiceZip || ""}</div>
      <div style="font-size:9px;color:#555">${s.practicePhone || ""}  NPI: ${s.billingNPI || "_______________"}</div>
    </div>
  </div>
</div>
<div style="margin-top:8px;font-size:8px;color:#94a3b8;text-align:center">Generated by PsychX v0.6 · ${new Date().toLocaleString()} · Review all fields before submission</div>
</div>
</body></html>`;
}

// ── Session Tracker (fixed focus + billing) ────────────────────────────────
function SessionTracker({ patient, onUpdate, addAudit, settings, onSchedule }) {
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [showBilling, setShowBilling] = useState(false);

  // Use local state for form fields to prevent focus-jumping
  const [form, setForm] = useState({});
  const setField = useCallback((f, v) => setForm(p => ({ ...p, [f]: v })), []);

  const startNew = (prefill = null) => {
    const s = prefill || emptySession((patient.sessions || []).length + 1);
    setForm(s); setEditing(s); setIsNew(true); setShowBilling(false);
  };
  const startEdit = s => { setForm({ ...s }); setEditing(s); setIsNew(false); setShowBilling(false); };
  const cancel = () => { setEditing(null); setIsNew(false); setShowBilling(false); };

  const save = () => {
    const merged = { ...editing, ...form };
    let updated;
    if (isNew) {
      updated = { ...patient, sessions: [...(patient.sessions || []), merged] };
      addAudit(updated, `Session #${merged.sessionNumber} logged — ${merged.date} — ${merged.dose}`);
    } else {
      updated = { ...patient, sessions: patient.sessions.map(s => s.id === merged.id ? merged : s) };
      addAudit(updated, `Session #${merged.sessionNumber} updated`);
    }
    onUpdate(updated); setEditing(null); setIsNew(false); setShowBilling(false);
  };

  const saveBilling = (billingData) => {
    const merged = { ...editing, ...form, ...billingData };
    setEditing(merged); setForm(merged);
    setShowBilling(false);
  };

  const sessions = [...(patient.sessions || [])].sort((a, b) => b.sessionNumber - a.sessionNumber);
  const remsUnsent = (patient.sessions || []).filter(s => !s.remsFormSubmitted).length;

  // Upcoming scheduled appointments for this patient
  const upcoming = (patient.scheduledSessions || []).filter(a => !a.converted && a.date >= new Date().toISOString().split("T")[0]).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={S.secTitle}>Session Log</div>
          <div style={{ display: "flex", gap: 8, marginTop: -8 }}>
            <span style={{ fontSize: 12, color: C.gray500 }}>{(patient.sessions || []).length} sessions logged</span>
            {remsUnsent > 0 && <span style={S.badge("amber")}>⚠ {remsUnsent} REMS pending</span>}
          </div>
        </div>
        {!editing && <button onClick={() => startNew()} style={S.btn()}>+ Log New Session</button>}
      </div>

      {/* Upcoming sessions */}
      {upcoming.length > 0 && !editing && (
        <div style={{ ...S.card, border: `1px solid #bae6fd`, background: C.tealLight, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 10 }}>📅 Upcoming Scheduled Sessions</div>
          {upcoming.slice(0, 3).map(appt => (
            <div key={appt.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.gray200}` }}>
              <span style={S.badge("blue")}>Chair {appt.chair}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtDate(appt.date)}</span>
              <span style={{ fontSize: 12, color: C.gray500 }}>{appt.time} · {appt.type}</span>
              <button onClick={() => {
                const newSess = emptySession((patient.sessions || []).length + 1);
                newSess.date = appt.date;
                startNew(newSess);
              }} style={{ ...S.btn("success"), padding: "4px 12px", fontSize: 11, marginLeft: "auto" }}>▶ Start Session</button>
            </div>
          ))}
        </div>
      )}

      {/* Session Form */}
      {editing && !showBilling && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 14 }}>
            {isNew ? "Log New Session" : `Edit Session #${form.sessionNumber}`} — {sessionPhase(form.sessionNumber || 1).label}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <FL label="Date" required />
              <input type="date" value={form.date || ""} onChange={e => setField("date", e.target.value)} style={S.inp(false)} />
            </div>
            <div>
              <FL label="Dose" required />
              <select value={form.dose || "56mg"} onChange={e => setField("dose", e.target.value)} style={{ ...S.inp(false), appearance: "none" }}>
                <option value="56mg">56mg (2 devices)</option>
                <option value="84mg">84mg (3 devices)</option>
              </select>
            </div>
            <div>
              <FL label="Patient Tolerance" />
              <select value={form.patientTolerance || "Good"} onChange={e => setField("patientTolerance", e.target.value)} style={{ ...S.inp(false), appearance: "none" }}>
                {["Good","Fair","Poor"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ background: C.gray50, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 10 }}>Vital Signs (REMS Required)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
              <VitalsInput label="BP Pre" systolic={form.bpPreSystolic} diastolic={form.bpPreDiastolic} onSys={v => setField("bpPreSystolic", v)} onDia={v => setField("bpPreDiastolic", v)} />
              <VitalsInput label="BP ~40min" systolic={form.bpPost40Systolic} diastolic={form.bpPost40Diastolic} onSys={v => setField("bpPost40Systolic", v)} onDia={v => setField("bpPost40Diastolic", v)} />
              <VitalsInput label="BP D/C" systolic={form.bpPostSystolic} diastolic={form.bpPostDiastolic} onSys={v => setField("bpPostSystolic", v)} onDia={v => setField("bpPostDiastolic", v)} />
              <VitalsInput label="SpO₂ Pre" type="ox" ox={form.pulseOxPre} onOx={v => setField("pulseOxPre", v)} />
              <VitalsInput label="SpO₂ During" type="ox" ox={form.pulseOxDuring} onOx={v => setField("pulseOxDuring", v)} />
              <VitalsInput label="SpO₂ D/C" type="ox" ox={form.pulseOxPost} onOx={v => setField("pulseOxPost", v)} />
            </div>
            {(parseInt(form.bpPreSystolic) > 140 || parseInt(form.bpPreDiastolic) > 90) && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: C.amberLight, borderRadius: 6, fontSize: 11, color: "#92400e", fontWeight: 600 }}>⚠ BP >140/90 — physician must evaluate before proceeding</div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <CheckboxGroup label="Side Effects Observed" options={SIDE_EFFECTS} selected={form.sideEffects || []} onChange={v => setField("sideEffects", v)} />
            {(form.sideEffects || []).length > 0 && !(form.sideEffects || []).includes("None observed") && (
              <div style={{ marginTop: 8 }}>
                <FL label="Side Effect Notes" />
                <textarea value={form.sideEffectNotes || ""} onChange={e => setField("sideEffectNotes", e.target.value)} rows={2} style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6 }} />
              </div>
            )}
          </div>
          <div style={{ padding: "10px 14px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", marginBottom: 12 }}>
            <Checkbox checked={form.sae || false} onChange={v => setField("sae", v)} label="Serious Adverse Event (SAE)" />
            {form.sae && <div style={{ marginTop: 8 }}><FL label="SAE Description" /><textarea value={form.saeDescription || ""} onChange={e => setField("saeDescription", e.target.value)} rows={2} style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6 }} /></div>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <FL label="Clinical Notes" />
            <textarea value={form.clinicalNotes || ""} onChange={e => setField("clinicalNotes", e.target.value)} rows={3} placeholder="Patient response, plan for next session..." style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Checkbox checked={form.remsFormSubmitted || false} onChange={v => setField("remsFormSubmitted", v)} label="REMS form submitted at SpravatoREMS.com" />
            <Checkbox checked={form.transportArranged || false} onChange={v => setField("transportArranged", v)} label="Transportation confirmed" />
            <Checkbox checked={form.discharged || false} onChange={v => setField("discharged", v)} label="Patient discharged (stable)" />
          </div>
          {!form.remsFormSubmitted && <div style={{ marginBottom: 10, padding: "7px 12px", background: C.amberLight, borderRadius: 7, fontSize: 11, color: "#92400e", fontWeight: 600 }}>⚠ REMS form must be submitted within 7 days at SpravatoREMS.com</div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancel} style={S.btn("ghost")}>Cancel</button>
              <button onClick={() => { setEditing(p => ({ ...p, ...form })); setShowBilling(true); }} style={S.btn("purple")}>💰 Billing Codes</button>
            </div>
            <button onClick={save} style={S.btn("success")}>✓ {isNew ? "Save Session" : "Update Session"}</button>
          </div>
        </div>
      )}

      {/* Billing sub-panel */}
      {editing && showBilling && (
        <div style={{ ...S.card, border: `2px solid ${C.purple}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>💰 Billing Codes — Session #{form.sessionNumber}</div>
            <button onClick={() => setShowBilling(false)} style={S.btn("ghost")}>← Back to Session</button>
          </div>
          <BillingModule session={{ ...editing, ...form }} patient={patient} settings={settings} onSave={saveBilling} />
        </div>
      )}

      {sessions.length === 0 && !editing
        ? <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}><div style={{ fontSize: 32 }}>💉</div><div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>No sessions logged yet</div></div>
        : !editing && sessions.map(s => {
          const phase = sessionPhase(s.sessionNumber);
          const expanded = expandedId === s.id;
          const hasBilling = (s.billingLines || []).length > 0;
          return (
            <div key={s.id} style={{ ...S.card, marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <div onClick={() => setExpandedId(expanded ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: phase.bg, border: `2px solid ${phase.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: phase.color }}>#{s.sessionNumber}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDate(s.date)} · {s.dose}</div>
                  <div style={{ fontSize: 11, color: C.gray500 }}>{phase.label} · {s.patientTolerance} tolerance</div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {s.sae && <span style={S.badge("red")}>SAE</span>}
                  {s.remsFormSubmitted ? <span style={S.badge("green")}>REMS ✓</span> : <span style={S.badge("amber")}>REMS ⚠</span>}
                  {hasBilling ? <span style={S.badge("purple")}>Billed ✓</span> : <span style={S.badge("")}>No Billing</span>}
                  <button onClick={e => { e.stopPropagation(); startEdit(s); }} style={{ ...S.btn("ghost"), padding: "3px 9px", fontSize: 11 }}>Edit</button>
                  <span style={{ fontSize: 14, color: C.gray400 }}>{expanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded && (
                <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.gray100}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginTop: 10, marginBottom: 10 }}>
                    {[["BP Pre",`${s.bpPreSystolic||"—"}/${s.bpPreDiastolic||"—"}`],["BP 40m",`${s.bpPost40Systolic||"—"}/${s.bpPost40Diastolic||"—"}`],["BP D/C",`${s.bpPostSystolic||"—"}/${s.bpPostDiastolic||"—"}`],["SpO₂ Pre",`${s.pulseOxPre||"—"}%`],["SpO₂ During",`${s.pulseOxDuring||"—"}%`],["SpO₂ D/C",`${s.pulseOxPost||"—"}%`]].map(([l,v]) => (
                      <div key={l} style={{ background: C.gray50, borderRadius: 7, padding: "6px 10px" }}><div style={{ fontSize: 9, color: C.gray400, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 700 }}>{v}</div></div>
                    ))}
                  </div>
                  {(s.sideEffects || []).length > 0 && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textTransform: "uppercase", marginBottom: 4 }}>Side Effects</div><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{s.sideEffects.map(se => <span key={se} style={S.badge(se === "None observed" ? "green" : "amber")}>{se}</span>)}</div></div>}
                  {s.clinicalNotes && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textTransform: "uppercase", marginBottom: 4 }}>Clinical Notes</div><div style={{ fontSize: 12, color: C.gray700, lineHeight: 1.5 }}>{s.clinicalNotes}</div></div>}
                  {hasBilling && <div style={{ marginTop: 8, padding: "8px 12px", background: C.purpleLight, borderRadius: 8 }}><div style={{ fontSize: 10, fontWeight: 700, color: C.purple, textTransform: "uppercase", marginBottom: 4 }}>Billing Codes</div><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{s.billingLines.map((l,i) => <span key={i} style={S.badge("purple")}>{l.code} ×{l.units}</span>)}</div></div>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// ── Scheduling Module ──────────────────────────────────────────────────────
function SchedulingModule({ patients, schedule, onScheduleUpdate, onPatientUpdate }) {
  const [weekRef, setWeekRef] = useState(new Date().toISOString().split("T")[0]);
  const [showForm, setShowForm] = useState(false);
  const [editAppt, setEditAppt] = useState(null);
  const [draft, setDraft] = useState(null);
  const [view, setView] = useState("week"); // "week" | "list"

  const weekDates = getWeekDates(weekRef);
  const prevWeek = () => { const d = new Date(weekRef); d.setDate(d.getDate() - 7); setWeekRef(d.toISOString().split("T")[0]); };
  const nextWeek = () => { const d = new Date(weekRef); d.setDate(d.getDate() + 7); setWeekRef(d.toISOString().split("T")[0]); };
  const goToday = () => setWeekRef(new Date().toISOString().split("T")[0]);

  const openNew = (date = null, chair = "1") => {
    setDraft({ ...emptyAppointment(), date: date || new Date().toISOString().split("T")[0], chair });
    setEditAppt(null); setShowForm(true);
  };
  const openEdit = appt => { setDraft({ ...appt }); setEditAppt(appt.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setDraft(null); setEditAppt(null); };

  const isConflict = (draft, excludeId = null) => {
    return schedule.some(a => {
      if (a.id === excludeId) return false;
      if (a.date !== draft.date || a.chair !== draft.chair) return false;
      const aStart = timeToMins(a.time);
      const aEnd = aStart + (a.duration || 150);
      const bStart = timeToMins(draft.time);
      const bEnd = bStart + (draft.duration || 150);
      return bStart < aEnd && bEnd > aStart;
    });
  };

  const saveAppt = () => {
    if (!draft.patientId) { alert("Please select a patient."); return; }
    if (isConflict(draft, editAppt)) { alert(`⚠ Chair ${draft.chair} is already booked at this time! Please choose a different time or chair.`); return; }
    const patient = patients.find(p => p.id === draft.patientId);
    const apptWithName = { ...draft, patientName: patient ? `${patient.firstName} ${patient.lastName}` : draft.patientName };
    let updated;
    if (editAppt) {
      updated = schedule.map(a => a.id === editAppt ? apptWithName : a);
    } else {
      updated = [...schedule, apptWithName];
      // Also add to patient's scheduledSessions
      if (patient) {
        const updatedPatient = { ...patient, scheduledSessions: [...(patient.scheduledSessions || []), apptWithName] };
        onPatientUpdate(updatedPatient);
      }
    }
    onScheduleUpdate(updated); closeForm();
  };

  const deleteAppt = id => {
    if (!window.confirm("Delete this appointment?")) return;
    onScheduleUpdate(schedule.filter(a => a.id !== id));
  };

  const convertToSession = (appt) => {
    // Mark appointment as converted
    const updatedSchedule = schedule.map(a => a.id === appt.id ? { ...a, converted: true } : a);
    onScheduleUpdate(updatedSchedule);
  };

  const today = new Date().toISOString().split("T")[0];
  const dayName = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = d => new Date(d + "T12:00:00").getDate();
  const monthLabel = `${new Date(weekDates[0] + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

  const getAppts = (date, chair) => schedule.filter(a => a.date === date && a.chair === chair);
  const chairColors = { "1": { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", accent: "#3b82f6" }, "2": { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", accent: "#22c55e" } };
  const typeIcon = t => t === "Spravato Session" ? "💊" : t === "Follow-up" ? "📋" : t === "Psychiatric Evaluation" ? "🧠" : t === "Intake / Consultation" ? "📝" : "📅";

  const upcoming = [...schedule].filter(a => a.date >= today && !a.converted).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Schedule</div>
          <div style={{ fontSize: 12, color: C.gray500 }}>{schedule.filter(a => !a.converted).length} upcoming appointments · 2 chairs</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView(view === "week" ? "list" : "week")} style={S.btn("ghost")}>{view === "week" ? "List View" : "Calendar View"}</button>
          <button onClick={() => openNew()} style={S.btn()}>+ Book Appointment</button>
        </div>
      </div>

      {/* Appointment Form */}
      {showForm && draft && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 14 }}>{editAppt ? "Edit Appointment" : "Book New Appointment"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <FL label="Patient" required />
              <select value={draft.patientId} onChange={e => { const p = patients.find(x => x.id === e.target.value); setDraft(d => ({ ...d, patientId: e.target.value, patientName: p ? `${p.firstName} ${p.lastName}` : "" })); }}
                style={{ ...S.inp(false), appearance: "none" }}>
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} — {p.psychxMRN}</option>)}
              </select>
            </div>
            <div>
              <FL label="Date" required />
              <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} style={S.inp(false)} />
            </div>
            <div>
              <FL label="Time" required />
              <select value={draft.time} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} style={{ ...S.inp(false), appearance: "none" }}>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <FL label="Chair" required />
              <select value={draft.chair} onChange={e => setDraft(d => ({ ...d, chair: e.target.value }))} style={{ ...S.inp(false), appearance: "none" }}>
                <option value="1">Chair 1</option>
                <option value="2">Chair 2</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <FL label="Appointment Type" />
              <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))} style={{ ...S.inp(false), appearance: "none" }}>
                {APPOINTMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <FL label="Duration (min)" />
              <select value={draft.duration} onChange={e => setDraft(d => ({ ...d, duration: parseInt(e.target.value) }))} style={{ ...S.inp(false), appearance: "none" }}>
                {SESSION_DURATION_MINS.map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <FL label="Session # (if Spravato)" />
              <input type="number" value={draft.sessionNumber || ""} onChange={e => setDraft(d => ({ ...d, sessionNumber: e.target.value ? parseInt(e.target.value) : null }))} placeholder="e.g. 4" style={S.inp(false)} />
            </div>
          </div>
          <div>
            <FL label="Notes" />
            <input value={draft.notes || ""} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Transportation confirmed, fasting, etc." style={S.inp(false)} />
          </div>
          {isConflict(draft, editAppt) && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: C.redLight, borderRadius: 8, fontSize: 12, color: C.red, fontWeight: 700 }}>
              ⛔ Chair {draft.chair} is already booked during this time slot. Select a different time or chair.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button onClick={closeForm} style={S.btn("ghost")}>Cancel</button>
            <button onClick={saveAppt} style={S.btn("success")}>✓ {editAppt ? "Update" : "Book"} Appointment</button>
          </div>
        </div>
      )}

      {/* Week Calendar View */}
      {view === "week" && (
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <button onClick={prevWeek} style={S.btn("ghost")}>← Prev</button>
            <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{monthLabel}</div>
            <button onClick={goToday} style={S.btn("ghost")}>Today</button>
            <button onClick={nextWeek} style={S.btn("ghost")}>Next →</button>
          </div>
          {/* Chair legend */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            {["1","2"].map(c => <div key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: chairColors[c].accent }} /><span style={{ fontSize: 12, fontWeight: 600, color: C.gray700 }}>Chair {c}</span></div>)}
          </div>
          {/* Days */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {weekDates.map(date => {
              const isToday = date === today;
              const c1 = getAppts(date, "1");
              const c2 = getAppts(date, "2");
              return (
                <div key={date} style={{ minHeight: 120, border: `1.5px solid ${isToday ? C.teal : C.gray200}`, borderRadius: 10, padding: 6, background: isToday ? C.tealLight : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? C.teal : C.gray400, textTransform: "uppercase" }}>{dayName(date)}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? C.teal : C.gray900 }}>{dayNum(date)}</div>
                    </div>
                    <button onClick={() => openNew(date)} style={{ width: 20, height: 20, borderRadius: 5, background: C.teal, border: "none", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                  </div>
                  {[...c1.map(a => ({ ...a, _chair: "1" })), ...c2.map(a => ({ ...a, _chair: "2" }))].map(appt => (
                    <div key={appt.id} onClick={() => openEdit(appt)} style={{ marginBottom: 3, padding: "3px 6px", borderRadius: 5, background: chairColors[appt._chair].bg, border: `1px solid ${chairColors[appt._chair].border}`, cursor: "pointer" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: chairColors[appt._chair].text }}>Chair {appt._chair} · {appt.time}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: chairColors[appt._chair].text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeIcon(appt.type)} {appt.patientName}</div>
                      {appt.converted && <div style={{ fontSize: 9, color: C.green }}>✓ Done</div>}
                    </div>
                  ))}
                  {c1.length === 0 && c2.length === 0 && <div style={{ fontSize: 10, color: C.gray200, textAlign: "center", marginTop: 16 }}>Open</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <div>
          {upcoming.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}><div style={{ fontSize: 32 }}>📅</div><div style={{ fontSize: 13, marginTop: 8 }}>No upcoming appointments</div></div>
            : upcoming.map(appt => (
              <div key={appt.id} style={{ ...S.card, marginBottom: 8, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: chairColors[appt.chair].bg, border: `2px solid ${chairColors[appt.chair].border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: chairColors[appt.chair].text }}>C{appt.chair}</div>
                  <div style={{ fontSize: 16 }}>{typeIcon(appt.type)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{appt.patientName}</div>
                  <div style={{ fontSize: 12, color: C.gray500 }}>{fmtDate(appt.date)} · {appt.time} · {appt.duration}min · {appt.type}</div>
                  {appt.notes && <div style={{ fontSize: 11, color: C.gray400 }}>{appt.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {appt.date === today && appt.type === "Spravato Session" && <button onClick={() => convertToSession(appt)} style={{ ...S.btn("success"), padding: "4px 10px", fontSize: 11 }}>▶ Start</button>}
                  <button onClick={() => openEdit(appt)} style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: 11 }}>Edit</button>
                  <button onClick={() => deleteAppt(appt.id)} style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: 11 }}>✕</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Practice Settings ──────────────────────────────────────────────────────
function PracticeSettings({ settings, onSave }) {
  const [form, setForm] = useState({ ...settings });
  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const save = () => { onSave(form); alert("Settings saved! These will auto-populate all HCFA-1500 claims."); };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Practice Settings</div>
      <div style={{ fontSize: 13, color: C.gray500, marginBottom: 20 }}>Configure once — auto-populates all HCFA-1500 claim forms.</div>

      <div style={{ ...S.card }}>
        <div style={S.secTitle}>Practice / Billing Entity (Box 33)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Practice / Facility Name" required><Input value={form.practiceName} onChange={v => upd("practiceName", v)} placeholder="ABC Psychiatry Associates" /></Field>
          <Field label="Phone"><Input value={form.practicePhone} onChange={v => upd("practicePhone", v)} placeholder="555-555-5555" /></Field>
          <Field label="Street Address" span={2}><Input value={form.practiceAddress} onChange={v => upd("practiceAddress", v)} placeholder="123 Main Street, Suite 100" /></Field>
          <Field label="City"><Input value={form.practiceCity} onChange={v => upd("practiceCity", v)} placeholder="New York" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="State"><Select value={form.practiceState || ""} onChange={v => upd("practiceState", v)} options={US_STATES.map(s => ({ value: s, label: s || "Select..." }))} /></Field>
            <Field label="ZIP"><Input value={form.practiceZip} onChange={v => upd("practiceZip", v)} placeholder="10001" /></Field>
          </div>
          <Field label="Fax"><Input value={form.practiceFax} onChange={v => upd("practiceFax", v)} placeholder="555-555-5556" /></Field>
        </div>
      </div>

      <div style={{ ...S.card }}>
        <div style={S.secTitle}>Tax / NPI Information (Boxes 25, 33)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Federal Tax ID / EIN (Box 25)" required><Input value={form.taxId} onChange={v => upd("taxId", v)} placeholder="XX-XXXXXXX" /></Field>
          <Field label="Billing NPI (Box 33)" required><Input value={form.billingNPI} onChange={v => upd("billingNPI", v)} placeholder="10-digit NPI" /></Field>
          <Field label="Taxonomy / Specialty Code"><Input value={form.taxonomyCode} onChange={v => upd("taxonomyCode", v)} placeholder="2084P0800X (Psychiatry)" /></Field>
          <Field label="Place of Service Default">
            <Select value={form.placeOfService || "11"} onChange={v => upd("placeOfService", v)} options={[
              { value: "11", label: "11 — Office (REMS required for Spravato)" },
              { value: "02", label: "02 — Telehealth (separate from Spravato claims)" },
              { value: "22", label: "22 — On Campus Outpatient Hospital" },
              { value: "49", label: "49 — Independent Clinic" },
            ]} />
          </Field>
        </div>
      </div>

      <div style={{ ...S.card }}>
        <div style={S.secTitle}>Rendering / Supervising Provider (Box 31, 24J)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Rendering Provider Name" required><Input value={form.renderingProviderName} onChange={v => upd("renderingProviderName", v)} placeholder="Dr. Jane Smith" /></Field>
          <Field label="Rendering Provider NPI" required><Input value={form.renderingProviderNPI} onChange={v => upd("renderingProviderNPI", v)} placeholder="10-digit NPI" /></Field>
          <Field label="Supervising Provider Name (if NP/PA)"><Input value={form.supervisingProviderName} onChange={v => upd("supervisingProviderName", v)} placeholder="Optional" /></Field>
          <Field label="Supervising Provider NPI"><Input value={form.supervisingProviderNPI} onChange={v => upd("supervisingProviderNPI", v)} placeholder="Optional" /></Field>
        </div>
      </div>

      <div style={{ ...S.card }}>
        <div style={S.secTitle}>Claim Defaults (Boxes 27, 13)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Checkbox checked={form.acceptsAssignment} onChange={v => upd("acceptsAssignment", v)} label="Accept Assignment (Box 27) — recommended: Yes" />
          <Checkbox checked={form.signatureOnFile} onChange={v => upd("signatureOnFile", v)} label="Signature on File (Boxes 12 & 13) — recommended: Yes" />
        </div>
      </div>

      <div style={{ padding: "12px 16px", background: C.tealLight, borderRadius: 10, fontSize: 12, color: "#0369a1", marginBottom: 16 }}>
        💡 <strong>Tip:</strong> POS 11 (Office) is locked for all Spravato sessions — Spravato cannot be administered via telehealth under REMS requirements. Telepsych E&M must be billed separately.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} style={S.btn("success")}>✓ Save Practice Settings</button>
      </div>
    </div>
  );
}

// ── PA Tracker ─────────────────────────────────────────────────────────────
function PATracker({ patient, onUpdate, addAudit }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const openNew = () => { setDraft({ ...emptyPA() }); setEditId(null); setFormOpen(true); };
  const openEdit = r => { setDraft({ ...r }); setEditId(r.id); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setDraft(null); setEditId(null); };
  const upd = (f, v) => setDraft(d => ({ ...d, [f]: v }));

  const save = () => {
    if (!draft.payer?.trim()) { alert("Please enter a payer name."); return; }
    let updated;
    if (editId) {
      updated = { ...patient, paRecords: patient.paRecords.map(r => r.id === editId ? draft : r) };
      addAudit(updated, `PA updated — ${draft.payer} — Status: ${draft.status}`);
    } else {
      updated = { ...patient, paRecords: [...(patient.paRecords || []), draft] };
      addAudit(updated, `PA added — ${draft.payer} — Status: ${draft.status}`);
    }
    onUpdate(updated); closeForm();
  };

  const quickStatus = (id, status) => {
    const rec = (patient.paRecords || []).find(r => r.id === id);
    const updated = { ...patient, paRecords: patient.paRecords.map(r => r.id === id ? { ...r, status } : r) };
    addAudit(updated, `PA status → "${status}" — ${rec?.payer || ""}`);
    onUpdate(updated);
  };

  const records = [...(patient.paRecords || [])].sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));
  const activePA = records.find(r => r.status === "Approved");
  const sColor = s => s === "Approved" ? "green" : s === "Pending" ? "blue" : s === "Denied" ? "red" : s === "Expired" ? "red" : "amber";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={S.secTitle}>Prior Authorization</div>
          {activePA && <span style={{ ...S.badge("green"), fontSize: 11, marginTop: -8, display: "block" }}>✓ Active auth through {activePA.expirationDate || "TBD"}</span>}
        </div>
        {!formOpen && <button onClick={openNew} style={S.btn()}>+ Add PA Record</button>}
      </div>

      {formOpen && draft && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 14 }}>{editId ? "Edit" : "New"} PA Record</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><FL label="Payer" required /><input value={draft.payer} onChange={e => upd("payer", e.target.value)} placeholder="Insurance company" style={S.inp(false)} /></div>
            <div><FL label="Benefit Type" /><select value={draft.benefitType} onChange={e => upd("benefitType", e.target.value)} style={{ ...S.inp(false), appearance: "none" }}><option value="medical">Medical Benefit</option><option value="pharmacy">Pharmacy Benefit</option><option value="both">Both</option></select></div>
            <div><FL label="Submitted Date" /><input type="date" value={draft.submittedDate} onChange={e => upd("submittedDate", e.target.value)} style={S.inp(false)} /></div>
            <div><FL label="Status" /><select value={draft.status} onChange={e => upd("status", e.target.value)} style={{ ...S.inp(false), appearance: "none" }}>{PA_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><FL label="Auth Number" /><input value={draft.authNumber} onChange={e => upd("authNumber", e.target.value)} placeholder="Auth #" style={S.inp(false)} /></div>
            <div><FL label="Start Date" /><input type="date" value={draft.startDate} onChange={e => upd("startDate", e.target.value)} style={S.inp(false)} /></div>
            <div><FL label="Expiration Date" /><input type="date" value={draft.expirationDate} onChange={e => upd("expirationDate", e.target.value)} style={S.inp(false)} /></div>
          </div>
          {(draft.status === "Denied" || draft.status === "Under Appeal") && (
            <div style={{ background: C.redLight, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><FL label="Denial Reason" /><select value={draft.denialReason} onChange={e => upd("denialReason", e.target.value)} style={{ ...S.inp(false), appearance: "none" }}><option value="">Select...</option>{DENIAL_REASONS.map(r => <option key={r}>{r}</option>)}</select></div>
                <div><FL label="Appeal Date" /><input type="date" value={draft.appealDate} onChange={e => upd("appealDate", e.target.value)} style={S.inp(false)} /></div>
                <div style={{ gridColumn: "span 2" }}><FL label="Appeal Notes" /><textarea value={draft.appealNotes} onChange={e => upd("appealNotes", e.target.value)} rows={2} style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6 }} /></div>
              </div>
            </div>
          )}
          <div><FL label="Notes" /><textarea value={draft.notes} onChange={e => upd("notes", e.target.value)} rows={2} style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.6 }} /></div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button onClick={closeForm} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ {editId ? "Update" : "Save"}</button>
          </div>
        </div>
      )}

      {records.length === 0 && !formOpen
        ? <div style={{ textAlign: "center", padding: "32px 20px", color: C.gray400 }}><div style={{ fontSize: 28 }}>📋</div><div style={{ fontSize: 13, marginTop: 6 }}>No PA records yet</div></div>
        : records.map(r => {
          const urgency = paUrgency(r);
          const expanded = expandedId === r.id;
          return (
            <div key={r.id} style={{ ...S.card, marginBottom: 8, padding: 0, overflow: "hidden", border: urgency?.color === "#dc2626" ? `2px solid ${C.red}` : `1px solid ${C.gray200}` }}>
              <div onClick={() => setExpandedId(expanded ? null : r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.payer || "Payer TBD"} <span style={{ fontSize: 11, color: C.gray500 }}>· {r.benefitType}</span></div>
                  <div style={{ fontSize: 11, color: C.gray500 }}>Submitted: {r.submittedDate}{r.authNumber ? ` · Auth #${r.authNumber}` : ""}{r.expirationDate ? ` · Expires: ${r.expirationDate}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={S.badge(sColor(r.status))}>{r.status}</span>
                  {urgency && <span style={{ ...S.badge(""), background: urgency.bg, color: urgency.color, fontSize: 11 }}>{urgency.label}</span>}
                  {r.status === "Pending" && <button onClick={e => { e.stopPropagation(); quickStatus(r.id, "Approved"); }} style={{ ...S.btn("success"), padding: "3px 9px", fontSize: 11 }}>✓ Approve</button>}
                  {r.status === "Pending" && <button onClick={e => { e.stopPropagation(); quickStatus(r.id, "Denied"); }} style={{ ...S.btn("danger"), padding: "3px 9px", fontSize: 11 }}>Deny</button>}
                  {r.status === "Approved" && <button onClick={e => { e.stopPropagation(); quickStatus(r.id, "Reauth Due"); }} style={{ ...S.btn("amber"), padding: "3px 9px", fontSize: 11 }}>Flag Reauth</button>}
                  <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ ...S.btn("ghost"), padding: "3px 9px", fontSize: 11 }}>Edit</button>
                  <span style={{ fontSize: 13, color: C.gray400 }}>{expanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded && (
                <div style={{ padding: "0 16px 12px", borderTop: `1px solid ${C.gray100}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 10 }}>
                    {[["Start",r.startDate||"—"],["Expiration",r.expirationDate||"—"],["Auth #",r.authNumber||"—"],["Benefit",r.benefitType]].map(([l,v]) => (
                      <div key={l} style={{ background: C.gray50, borderRadius: 7, padding: "6px 10px" }}><div style={{ fontSize: 9, color: C.gray400, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div></div>
                    ))}
                  </div>
                  {r.denialReason && <div style={{ marginTop: 8, padding: "7px 10px", background: C.redLight, borderRadius: 7, fontSize: 12, color: C.red }}><strong>Denial:</strong> {r.denialReason}{r.appealNotes ? ` · Appeal: ${r.appealNotes}` : ""}</div>}
                  {r.notes && <div style={{ marginTop: 6, fontSize: 12, color: C.gray700 }}><strong>Notes:</strong> {r.notes}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button onClick={() => { if (window.confirm("Delete?")) { const u = { ...patient, paRecords: patient.paRecords.filter(x => x.id !== r.id) }; onUpdate(u); } }} style={S.btn("danger")}>Delete Record</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// ── Shipment Log ───────────────────────────────────────────────────────────
function ShipmentLog({ patient, onUpdate, addAudit }) {
  const [adding, setAdding] = useState(false);
  const [ship, setShip] = useState(null);
  const upd = (f, v) => setShip(p => ({ ...p, [f]: v }));
  const save = () => {
    const updated = { ...patient, shipments: [...(patient.shipments || []), ship] };
    addAudit(updated, `Shipment — ${ship.dose}, ${ship.devices} device(s), received ${ship.receivedDate}${ship.lotNumber ? `, Lot: ${ship.lotNumber}` : ""}`);
    onUpdate(updated); setAdding(false); setShip(null);
  };
  const shipments = [...(patient.shipments || [])].sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={S.secTitle}>Drug Shipment / Inventory</div>
        {!adding && <button onClick={() => { setShip(emptyShipment()); setAdding(true); }} style={S.btn()}>+ Log Shipment</button>}
      </div>
      <div style={{ padding: "8px 12px", background: C.tealLight, borderRadius: 8, fontSize: 12, color: "#0369a1", marginBottom: 12 }}>
        📦 REMS: Maintain records of all Spravato shipments — patient name, dose, devices, lot number, date received.
      </div>
      {adding && ship && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Date Received"><Input type="date" value={ship.receivedDate} onChange={v => upd("receivedDate", v)} /></Field>
            <Field label="Dose"><Select value={ship.dose} onChange={v => upd("dose", v)} options={[{ value: "56mg", label: "56mg kit" }, { value: "84mg", label: "84mg kit" }]} /></Field>
            <Field label="# Devices"><Select value={ship.devices} onChange={v => upd("devices", v)} options={["1","2","3","4","5","6","8","10","12","16"].map(n => ({ value: n, label: n }))} /></Field>
            <Field label="Lot Number"><Input value={ship.lotNumber} onChange={v => upd("lotNumber", v)} placeholder="Lot #" /></Field>
            <Field label="Product Expiration"><Input type="date" value={ship.expirationDate} onChange={v => upd("expirationDate", v)} /></Field>
            <Field label="Notes"><Input value={ship.notes} onChange={v => upd("notes", v)} placeholder="Pharmacy, temp..." /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setAdding(false); setShip(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ Save</button>
          </div>
        </div>
      )}
      {shipments.length === 0 && !adding
        ? <div style={{ textAlign: "center", padding: "28px 20px", color: C.gray400 }}><div style={{ fontSize: 26 }}>📦</div><div style={{ fontSize: 12, marginTop: 6 }}>No shipments logged</div></div>
        : shipments.map(s => (
          <div key={s.id} style={{ ...S.card, marginBottom: 8, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{s.dose} · {s.devices} device{parseInt(s.devices) > 1 ? "s" : ""} — {s.receivedDate}</div>
              <div style={{ fontSize: 11, color: C.gray500 }}>{s.lotNumber ? `Lot: ${s.lotNumber} · ` : ""}{s.expirationDate ? `Exp: ${s.expirationDate}` : ""}{s.notes ? ` · ${s.notes}` : ""}</div>
            </div>
            <button onClick={() => { if (window.confirm("Delete?")) onUpdate({ ...patient, shipments: patient.shipments.filter(x => x.id !== s.id) }); }} style={S.btn("danger")}>✕</button>
          </div>
        ))}
    </div>
  );
}

// ── Enrollment Panel ───────────────────────────────────────────────────────
function EnrollmentPanel({ patient, onUpdate, addAudit }) {
  const upd = (f, v) => {
    const updated = { ...patient, [f]: v };
    if (f === "remsEnrolled" && v) addAudit(updated, "REMS enrollment confirmed");
    if (f === "withMeEnrolled" && v) addAudit(updated, "withMe enrollment confirmed");
    onUpdate(updated);
  };
  return (
    <div>
      <div style={S.secTitle}>REMS & withMe Enrollment</div>
      <div style={{ ...S.card, border: `2px solid ${patient.remsEnrolled ? C.green : C.gray200}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>SPRAVATO® REMS</div>
            <div style={{ fontSize: 12, color: C.gray500 }}>Both HCP and patient must sign before first treatment.</div>
          </div>
          {patient.remsEnrolled ? <span style={S.badge("green")}>✓ Enrolled</span> : <span style={S.badge("amber")}>Pending</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Enrollment Date"><Input type="date" value={patient.remsEnrollmentDate} onChange={v => upd("remsEnrollmentDate", v)} /></Field>
          <Field label="REMS Patient ID"><Input value={patient.remsPatientId} onChange={v => upd("remsPatientId", v)} placeholder="REMS Patient ID #" /></Field>
        </div>
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <Checkbox checked={patient.remsHcpSigned} onChange={v => upd("remsHcpSigned", v)} label="HCP signed enrollment form" />
          <Checkbox checked={patient.remsPatientSigned} onChange={v => upd("remsPatientSigned", v)} label="Patient signed enrollment form" />
          <Checkbox checked={patient.remsEnrolled} onChange={v => upd("remsEnrolled", v)} label="Enrollment confirmed at SpravatoREMS.com" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <EnrollBtn label="Patient Enrollment" url="https://www.spravatorems.com/enrollment/patient" icon="🏥" sub="SpravatoREMS.com" />
          <EnrollBtn label="HCP Enrollment" url="https://www.spravatorems.com/enrollment/hcp" icon="👨‍⚕️" sub="SpravatoREMS.com" />
          <EnrollBtn label="Submit Monitoring Form" url="https://www.spravatorems.com/monitoring" icon="📋" sub="Within 7 days of session" />
        </div>
      </div>
      <div style={{ ...S.card, border: `2px solid ${patient.withMeEnrolled ? C.green : C.gray200}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Spravato withMe™</div>
            <div style={{ fontSize: 12, color: C.gray500 }}>PA support, copay assistance (commercial only), benefits investigation, transportation.</div>
          </div>
          {patient.withMeEnrolled ? <span style={S.badge("green")}>✓ Enrolled</span> : <span style={S.badge("amber")}>Pending</span>}
        </div>
        {patient.planType !== "commercial" && <div style={{ padding: "7px 10px", background: C.amberLight, borderRadius: 7, fontSize: 12, color: "#92400e", marginBottom: 10 }}>⚠ Copay savings for commercial patients only.</div>}
        <Field label="withMe Enrollment Date"><Input type="date" value={patient.withMeEnrollmentDate} onChange={v => upd("withMeEnrollmentDate", v)} /></Field>
        <Checkbox checked={patient.withMeEnrolled} onChange={v => upd("withMeEnrolled", v)} label="Enrolled in withMe program" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <EnrollBtn label="withMe Patient Enrollment" url="https://www.janssenprescriptionassistance.com/patient-assistance-program/spravato" icon="💊" sub="Janssen assistance portal" />
          <EnrollBtn label="HCP withMe Form" url="https://www.spravatohcp.com/spravato-with-me/enroll" icon="📝" sub="SpravatoHCP.com" />
        </div>
        <div style={{ marginTop: 10, padding: "10px 14px", background: C.gray50, borderRadius: 8, border: `1px solid ${C.gray200}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>withMe Support</div>
          <div style={{ fontSize: 13, color: C.teal, fontWeight: 700 }}>📞 1-844-479-4846</div>
        </div>
      </div>
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────
function NotesTab({ patient, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const fileRef = useRef();

  const handleTemplate = id => {
    const tpl = NOTE_TEMPLATES.find(t => t.id === id);
    setDraft(d => ({ ...d, templateId: id, text: tpl?.text || "" }));
  };
  const save = () => {
    if (!draft.text?.trim()) { alert("Please enter note text."); return; }
    onUpdate({ ...patient, notes: [...(patient.notes || []), { ...draft, createdAt: nowISO() }] });
    setAdding(false); setDraft(null);
  };
  const notes = [...(patient.notes || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filtered = filterType === "all" ? notes : notes.filter(n => n.type === filterType);
  const typeColor = t => t === "system" ? "blue" : t === "user" ? "green" : "amber";
  const typeLabel = t => t === "system" ? "System" : t === "user" ? "User" : "Template";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={S.secTitle}>Notes & Activity</div>
          <div style={{ display: "flex", gap: 6, marginTop: -8 }}>
            {[["all","All"],["system","System"],["user","User"],["template","Template"]].map(([v, l]) => (
              <button key={v} onClick={() => setFilterType(v)} style={{ ...S.btn(filterType === v ? "primary" : "ghost"), padding: "3px 10px", fontSize: 11 }}>{l}</button>
            ))}
          </div>
        </div>
        {!adding && <button onClick={() => { setDraft({ ...emptyNote() }); setAdding(true); }} style={S.btn()}>+ Add Note</button>}
      </div>
      {adding && draft && (
        <div style={{ ...S.card, border: `2px solid ${C.teal}`, marginBottom: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <FL label="Template (optional)" />
            <select value={draft.templateId} onChange={e => handleTemplate(e.target.value)} style={{ ...S.inp(false), appearance: "none" }}>
              <option value="">Free text or select template...</option>
              {NOTE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <FL label="Note Text" required />
            <textarea value={draft.text} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} rows={5}
              placeholder="Enter note... Replace [BRACKETS] with actual values."
              style={{ ...S.inp(false), resize: "vertical", lineHeight: 1.7 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <FL label="Attachment (optional)" />
            <input type="file" ref={fileRef} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setDraft(d => ({ ...d, attachmentData: ev.target.result, attachmentName: f.name })); r.readAsDataURL(f); }} style={{ display: "none" }} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            {draft.attachmentName
              ? <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.gray50, borderRadius: 7 }}>
                  <span>📎</span><span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{draft.attachmentName}</span>
                  <button onClick={() => setDraft(d => ({ ...d, attachmentData: null, attachmentName: "" }))} style={{ ...S.btn("danger"), padding: "2px 8px", fontSize: 11 }}>✕</button>
                </div>
              : <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #cbd5e1", borderRadius: 9, padding: "12px", textAlign: "center", cursor: "pointer", background: C.gray50 }}>
                  <div style={{ fontSize: 16 }}>📎</div><div style={{ fontSize: 11, color: C.gray500 }}>Attach PDF, image, or document</div>
                </div>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setAdding(false); setDraft(null); }} style={S.btn("ghost")}>Cancel</button>
            <button onClick={save} style={S.btn("success")}>✓ Save Note</button>
          </div>
        </div>
      )}
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: "28px 20px", color: C.gray400 }}><div style={{ fontSize: 26 }}>📝</div><div style={{ fontSize: 12, marginTop: 6 }}>No {filterType === "all" ? "" : filterType + " "}notes yet</div></div>
        : filtered.map(n => (
          <div key={n.id} style={{ ...S.card, marginBottom: 8, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <span style={S.badge(typeColor(n.type))}>{typeLabel(n.type)}</span>
              <div style={{ fontSize: 11, color: C.gray400, flex: 1 }}>{fmtDateTime(n.createdAt)}</div>
              {n.type !== "system" && <button onClick={() => { if (window.confirm("Delete?")) onUpdate({ ...patient, notes: patient.notes.filter(x => x.id !== n.id) }); }} style={{ ...S.btn("danger"), padding: "2px 7px", fontSize: 11 }}>✕</button>}
            </div>
            <div style={{ fontSize: 13, color: C.gray700, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.text}</div>
            {n.attachmentName && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, padding: "5px 9px", background: C.gray50, borderRadius: 7 }}>
                <span>📎</span><span style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>{n.attachmentName}</span>
                {n.attachmentData && <a href={n.attachmentData} download={n.attachmentName} style={{ fontSize: 11, color: C.teal, marginLeft: "auto" }}>Download</a>}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

// ── Print helpers ──────────────────────────────────────────────────────────
function printHTML(html) {
  const win = window.open("", "_blank");
  if (!win) { alert("Allow popups to use print/export."); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 500);
}
const PS = `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1a2332;padding:24px 28px}h1{font-size:17px;font-weight:800}h2{font-size:11px;font-weight:700;color:#1a7fa8;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;padding-bottom:3px;border-bottom:2px solid #e2e8f0}table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{padding:5px 8px;border:1px solid #e2e8f0;font-size:11px;vertical-align:top}th{background:#f1f5f9;font-weight:700;color:#475569;text-transform:uppercase;font-size:10px}.lc{width:160px;font-weight:600;color:#475569;background:#f8fafc}.hdr{display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:10px;border-bottom:3px solid #1a7fa8}.bg{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;background:#dcfce7;color:#166534}.br{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;background:#fee2e2;color:#991b1b}.ba{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e}.bb{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e40af}.ab{padding:6px 10px;border-radius:5px;margin:6px 0;font-size:11px}.ar{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.aa{background:#fffbeb;border:1px solid #fde68a;color:#92400e}.ag{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}.sl{border-bottom:1px solid #334155;width:220px;height:28px;display:inline-block;margin-right:24px}.ftr{margin-top:20px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}@media print{body{padding:12px 16px}@page{margin:.4in;size:letter}}</style>`;
const hdr = (title, p, sub = "") => `<div class="hdr"><div><div style="font-size:9px;color:#1a7fa8;font-weight:700;text-transform:uppercase;margin-bottom:2px">PsychX · Spravato Program</div><h1>${title}</h1>${sub ? `<div style="font-size:11px;color:#64748b;margin-top:2px">${sub}</div>` : ""}</div><div style="text-align:right"><div style="font-size:14px;font-weight:800">${p.firstName} ${p.lastName}</div><div style="font-size:11px;color:#64748b">DOB: ${p.dob || "—"} · MRN: ${p.psychxMRN || "—"}</div><div style="font-size:11px;color:#64748b">Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div></div></div>`;
const ftr = (n = "") => `<div class="ftr"><div>PsychX v0.6${n ? " · " + n : ""}</div><div>${new Date().toLocaleString()}</div></div>`;
const row = (l, v) => `<tr><td class="lc">${l}</td><td>${v || "<span style='color:#cbd5e1'>—</span>"}</td></tr>`;

function exportPatientSummary(patient) {
  const phq9s = (patient.phq9History || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = phq9s[0];
  const sev = latest?.score != null ? phq9Severity(latest.score) : null;
  const activePA = (patient.paRecords || []).find(r => r.status === "Approved");
  const hasSSRISNRI = (patient.trials || []).some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI");
  const html = `<!DOCTYPE html><html><head><title>Patient Summary</title>${PS}</head><body>
${hdr("Patient Summary", patient, `${patient.diagnosisCode} · ${patient.insurerName || "Insurance pending"}`)}
${activePA ? `<div class="ab ag">✓ Active PA through ${activePA.expirationDate || "TBD"} · Auth #${activePA.authNumber || "pending"}</div>` : `<div class="ab aa">⚠ No active prior authorization</div>`}
${!hasSSRISNRI && (patient.trials || []).some(t => t.drug) ? `<div class="ab aa">⚠ No SSRI/SNRI trial — required for PA</div>` : ""}
<h2>Demographics</h2><table>${row("Name", `${patient.firstName} ${patient.lastName}`)}${row("DOB / Gender", `${patient.dob} · ${patient.gender}`)}${row("Phone", patient.phone)}${row("PsychX MRN", patient.psychxMRN)}${row("EMR MRN", patient.emrMRN || "Not entered")}</table>
<h2>Insurance</h2><table>${row("Insurer", patient.insurerName)}${row("Plan", patient.planType)}${row("Policy ID", patient.policyId)}${row("Group #", patient.groupNumber)}</table>
<h2>Trials</h2>
<table><tr><th>#</th><th>Medication</th><th>Class</th><th>Weeks</th><th>Adequate</th><th>Reason D/C</th></tr>
${(patient.trials || []).map((t, i) => `<tr><td>${i + 1}</td><td>${t.drug || "—"}</td><td><span class="${t.drugClass === "SSRI" || t.drugClass === "SNRI" ? "bg" : "bb"}">${t.drugClass || "—"}</span></td><td>${t.durationWeeks || "—"}</td><td>${t.adequateTrial ? "Yes" : "No"}</td><td>${t.reason || "—"}</td></tr>`).join("")}
</table>
<h2>Scores</h2><table>${row("Latest PHQ-9", latest?.score != null ? `${latest.score} — ${sev.label} (${latest.date})` : "Not completed")}${row("HAM-D 17", patient.hamd17Score ? `${patient.hamd17Score} (${patient.hamd17Date})` : "—")}${row("PHQ-9 Count", phq9s.length)}</table>
<h2>Treatment Goals</h2><table>${row("Goals", (patient.treatmentGoals || []).join("; ") || "—")}</table>
<h2>Enrollment</h2><table>${row("REMS", patient.remsEnrolled ? `✓ ${patient.remsEnrollmentDate}` : "Pending")}${row("REMS Patient ID", patient.remsPatientId || "—")}${row("withMe", patient.withMeEnrolled ? "✓ Enrolled" : "Pending")}${row("Sessions", patient.sessions?.length || 0)}</table>
${ftr()}</body></html>`;
  printHTML(html);
}

function exportPAPackage(patient) {
  const phq9s = (patient.phq9History || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = phq9s[0];
  const sev = latest?.score != null ? phq9Severity(latest.score) : null;
  const html = `<!DOCTYPE html><html><head><title>PA Package</title>${PS}</head><body>
${hdr("PA Documentation Package", patient, "Spravato® (esketamine) — Treatment-Resistant Depression")}
<h2>Section 1 — Patient</h2><table>${row("Name", `${patient.firstName} ${patient.lastName}`)}${row("DOB", patient.dob)}${row("PsychX MRN", patient.psychxMRN)}${row("EMR MRN", patient.emrMRN || "—")}${row("Insurer", patient.insurerName)}${row("Policy ID", patient.policyId)}${row("Group #", patient.groupNumber)}${row("Plan", patient.planType)}</table>
<h2>Section 2 — Clinical</h2><table>${row("ICD-10", patient.diagnosisCode)}${row("Dx Date", patient.diagnosisDate)}${row("PHQ-9", latest?.score != null ? `${latest.score} — ${sev.label} (${latest.date})` : "Not completed")}${row("HAM-D 17", patient.hamd17Score ? `${patient.hamd17Score} (${patient.hamd17Date})` : "—")}${row("Current Oral AD", patient.currentOralAD ? `${patient.currentOralAD} ${patient.currentOralADDose}` : "—")}${row("Goals", (patient.treatmentGoals || []).join("; ") || "—")}${row("Prior Spravato", patient.priorSpravatoUse ? "Yes — " + patient.priorSpravatoDetails : "No")}${row("Psychiatrist", patient.psychiatristName ? `${patient.psychiatristName} NPI: ${patient.psychiatristNPI || "—"}` : "—")}</table>
<h2>Section 3 — Trial History</h2>
<table><tr><th>#</th><th>Medication</th><th>Class</th><th>Dose</th><th>Start</th><th>End</th><th>Weeks</th><th>Adequate</th><th>Reason</th></tr>
${(patient.trials || []).map((t, i) => `<tr><td>${i + 1}</td><td>${t.drug || "—"}</td><td><span class="${t.drugClass === "SSRI" || t.drugClass === "SNRI" ? "bg" : "bb"}">${t.drugClass || "—"}</span></td><td>${t.dose || "—"}</td><td>${t.startDate || "—"}</td><td>${t.endDate || "—"}</td><td>${t.durationWeeks || "—"}</td><td>${t.adequateTrial ? "✓" : "No"}</td><td>${t.reason || "—"}</td></tr>`).join("")}
</table>
<h2>Section 4 — Drug</h2><table>${row("Drug", "Spravato® (esketamine) Nasal Spray, CIII")}${row("J-Code", "J0013 — Esketamine, 1mg/unit (buy-and-bill)")}${row("56mg NDC", "50458-028-02 (2 devices)")}${row("84mg NDC", "50458-028-03 (3 devices)")}${row("REMS Patient", patient.remsEnrolled ? "✓ Enrolled" : "Pending")}${row("REMS Patient ID", patient.remsPatientId || "—")}</table>
<h2>Section 5 — Prescriber</h2><table>${row("Prescribing Physician", "______________________________")}${row("NPI", "______________________________")}${row("Facility NPI", "______________________________")}${row("Tax ID", "______________________________")}</table>
<div style="border:1px solid #e2e8f0;border-radius:5px;padding:12px;margin-top:8px"><p style="font-size:11px;color:#475569;margin-bottom:12px">I certify the above is accurate. Patient has confirmed TRD with ≥2 adequate antidepressant failures. Spravato is medically necessary.</p><span class="sl"></span><span class="sl" style="width:130px"></span><br/><span style="font-size:9px;color:#64748b">Prescriber Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</span></div>
${ftr("SpravatoHCP.com for payer forms")}</body></html>`;
  printHTML(html);
}

function exportREMSSession(patient, session) {
  const phase = sessionPhase(session.sessionNumber);
  const html = `<!DOCTYPE html><html><head><title>REMS Session #${session.sessionNumber}</title>${PS}</head><body>
${hdr(`REMS Monitoring — Session #${session.sessionNumber}`, patient, `${phase.label} · ${session.date} · ${session.dose}`)}
<div class="ab" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af">Submit at SpravatoREMS.com within 7 days of session.</div>
${session.sae ? `<div class="ab ar">⚠ SAE — Contact 1-855-382-6022 immediately.</div>` : ""}
<h2>Patient</h2><table>${row("Name", `${patient.firstName} ${patient.lastName}`)}${row("DOB", patient.dob)}${row("PsychX MRN", patient.psychxMRN)}${row("REMS Patient ID", patient.remsPatientId || "Confirm at SpravatoREMS.com")}</table>
<h2>Vitals</h2><table><tr><th>Timepoint</th><th>BP (mmHg)</th><th>SpO₂ (%)</th></tr><tr><td>Pre-admin</td><td>${session.bpPreSystolic || "—"}/${session.bpPreDiastolic || "—"}</td><td>${session.pulseOxPre || "—"}</td></tr><tr><td>~40 min</td><td>${session.bpPost40Systolic || "—"}/${session.bpPost40Diastolic || "—"}</td><td>${session.pulseOxDuring || "—"}</td></tr><tr><td>Discharge</td><td>${session.bpPostSystolic || "—"}/${session.bpPostDiastolic || "—"}</td><td>${session.pulseOxPost || "—"}</td></tr></table>
<h2>Session</h2><table>${row("Dose", session.dose)}${row("Phase", phase.label)}${row("Tolerance", session.patientTolerance)}${row("Side Effects", (session.sideEffects || []).join(", ") || "None")}${row("SAE", session.sae ? "YES — " + session.saeDescription : "No")}${row("Transport", session.transportArranged ? "Yes" : "NOT CONFIRMED")}${row("Discharged", session.discharged ? "Yes" : "Pending")}${row("REMS Submitted", session.remsFormSubmitted ? "✓ Yes" : "NOT YET")}</table>
${session.clinicalNotes ? `<h2>Notes</h2><div style="border:1px solid #e2e8f0;border-radius:5px;padding:10px;font-size:11px;line-height:1.5">${session.clinicalNotes}</div>` : ""}
<span class="sl" style="margin-top:14px;display:inline-block"></span><span class="sl" style="width:130px"></span><br/><span style="font-size:9px;color:#64748b">HCP Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</span>
${ftr("Submit at SpravatoREMS.com within 7 days")}</body></html>`;
  printHTML(html);
}

function exportSessionReport(patient) {
  const sessions = [...(patient.sessions || [])].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const phq9s = (patient.phq9History || []).sort((a, b) => new Date(a.date) - new Date(b.date));
  const baseline = phq9s[0]; const latest = phq9s[phq9s.length - 1];
  const remsUnsent = sessions.filter(s => !s.remsFormSubmitted).length;
  const html = `<!DOCTYPE html><html><head><title>Session Report</title>${PS}<style>table td,table th{font-size:9px;padding:3px 5px}</style></head><body>
${hdr("Session Report", patient, `${sessions.length} sessions · ${patient.diagnosisCode}`)}
${remsUnsent > 0 ? `<div class="ab aa">⚠ ${remsUnsent} REMS form(s) pending</div>` : `<div class="ab ag">✓ All REMS forms submitted</div>`}
<table><tr><th>Baseline PHQ-9</th><td>${baseline?.score ?? "—"} ${baseline ? "— " + phq9Severity(baseline.score).label + " · " + baseline.date : ""}</td><th>Latest PHQ-9</th><td>${latest && latest !== baseline ? latest.score + " — " + phq9Severity(latest.score).label + " · " + latest.date : "Only one assessment"}</td></tr></table>
${sessions.length === 0 ? `<div class="ab aa">No sessions recorded.</div>` : `
<h2>Sessions</h2>
<table><tr><th>#</th><th>Date</th><th>Phase</th><th>Dose</th><th>BP Pre</th><th>BP 40m</th><th>BP D/C</th><th>SpO₂</th><th>Side Effects</th><th>Tol</th><th>REMS</th><th>SAE</th></tr>
${sessions.map(s => `<tr><td style="font-weight:700">${s.sessionNumber}</td><td>${s.date}</td><td>${sessionPhase(s.sessionNumber).label}</td><td>${s.dose}</td><td>${s.bpPreSystolic || "—"}/${s.bpPreDiastolic || "—"}</td><td>${s.bpPost40Systolic || "—"}/${s.bpPost40Diastolic || "—"}</td><td>${s.bpPostSystolic || "—"}/${s.bpPostDiastolic || "—"}</td><td>${s.pulseOxPre || "—"}%</td><td>${(s.sideEffects || []).filter(e => e !== "None observed").join(", ") || "None"}</td><td>${s.patientTolerance}</td><td>${s.remsFormSubmitted ? "✓" : "⚠"}</td><td style="color:#dc2626">${s.sae ? "SAE" : ""}</td></tr>`).join("")}
</table>`}
${ftr()}</body></html>`;
  printHTML(html);
}

// ── Export Panel ───────────────────────────────────────────────────────────
function ExportPanel({ patient, settings }) {
  const [selSession, setSelSession] = useState(patient.sessions?.length > 0 ? patient.sessions[patient.sessions.length - 1].id : null);
  const session = (patient.sessions || []).find(s => s.id === selSession);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={S.secTitle}>Export & Print</div>
        <div style={{ fontSize: 13, color: C.gray500 }}>Opens in new tab — choose "Save as PDF" in the print dialog.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[
          { icon: "📋", title: "Patient Summary", desc: "Full profile — demographics, insurance, trials, PHQ-9 history, enrollment.", action: () => exportPatientSummary(patient) },
          { icon: "📄", title: "PA Package", desc: "Pre-filled PA documentation with trial table, prescriber signature.", action: () => exportPAPackage(patient) },
        ].map(c => (
          <div key={c.title} style={{ ...S.card, marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div><div style={{ fontSize: 12, color: C.gray500 }}>{c.desc}</div></div>
            </div>
            <button onClick={c.action} style={{ ...S.btn("primary"), width: "100%" }}>🖨 Print / Export</button>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ ...S.card, marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>🏥</span>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>REMS Session Data</div><div style={{ fontSize: 12, color: C.gray500 }}>Vitals for SpravatoREMS.com submission.</div></div>
          </div>
          {patient.sessions?.length > 0 ? (
            <>
              <Select value={selSession || ""} onChange={v => setSelSession(v)}
                options={[...patient.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber).map(s => ({ value: s.id, label: `Session #${s.sessionNumber} — ${s.date}${s.remsFormSubmitted ? " ✓" : " ⚠"}` }))} />
              <button onClick={() => session && exportREMSSession(patient, session)} disabled={!session} style={{ ...S.btn("primary"), width: "100%", marginTop: 10, opacity: session ? 1 : 0.5 }}>🖨 Print REMS Data</button>
            </>
          ) : <div style={{ fontSize: 12, color: C.gray400, textAlign: "center", padding: 12 }}>No sessions yet</div>}
        </div>
        <div style={{ ...S.card, marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>📊</span>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>Session History Report</div><div style={{ fontSize: 12, color: C.gray500 }}>Full treatment log with reauth section.</div></div>
          </div>
          <button onClick={() => exportSessionReport(patient)} disabled={!patient.sessions?.length} style={{ ...S.btn("primary"), width: "100%", opacity: patient.sessions?.length ? 1 : 0.5 }}>🖨 Print Report</button>
        </div>
      </div>

      {/* HCFA-1500 Section */}
      <div style={{ ...S.card, marginTop: 12, border: `2px solid ${C.purple}` }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>💰</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>HCFA-1500 Claim Form</div>
            <div style={{ fontSize: 12, color: C.gray500 }}>Generates a pre-filled claim form. Review all fields before submission. Save as PDF from print dialog.</div>
          </div>
        </div>
        {!settings?.practiceName && (
          <div style={{ padding: "8px 12px", background: C.amberLight, borderRadius: 7, fontSize: 12, color: "#92400e", marginBottom: 10 }}>
            ⚠ Practice Settings incomplete — some claim fields will be blank. <strong>Configure Practice Settings before generating claims.</strong>
          </div>
        )}
        {patient.sessions?.length > 0 ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <FL label="Select Session to Bill" />
              <Select value={selSession || ""} onChange={v => setSelSession(v)}
                options={[...patient.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber).map(s => ({ value: s.id, label: `Session #${s.sessionNumber} — ${s.date} — ${s.dose}${(s.billingLines || []).length > 0 ? " 💰" : " (no billing codes)"}` }))} />
            </div>
            {session && (session.billingLines || []).length === 0 && (
              <div style={{ padding: "7px 10px", background: C.amberLight, borderRadius: 7, fontSize: 12, color: "#92400e", marginBottom: 8 }}>
                ⚠ No billing codes for this session. Open the session and click "Billing Codes" to add them first.
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                if (!session) return;
                const missing = [];
                if (!settings?.practiceName) missing.push("Practice name");
                if (!settings?.taxId) missing.push("Tax ID (Box 25)");
                if (!settings?.billingNPI) missing.push("Billing NPI (Box 33)");
                if (!patient.policyId) missing.push("Policy ID");
                if (missing.length > 0) {
                  const proceed = window.confirm(`⚠ Missing information:\n• ${missing.join("\n• ")}\n\nGenerate claim anyway with blank fields?`);
                  if (!proceed) return;
                }
                printHTML(generateHCFA(patient, session, settings));
                // Save to claim history
              }} disabled={!session} style={{ ...S.btn("purple"), flex: 1, opacity: session ? 1 : 0.5 }}>🖨 Generate HCFA-1500 Claim</button>
            </div>
          </>
        ) : <div style={{ fontSize: 12, color: C.gray400, textAlign: "center", padding: 12 }}>No sessions yet — log a session first, then add billing codes.</div>}

        {(patient.claimHistory || []).length > 0 && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.gray100}`, paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 6 }}>Claim History</div>
            {(patient.claimHistory || []).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.gray50}`, fontSize: 12 }}>
                <span style={S.badge("purple")}>HCFA</span>
                <span>Session #{c.sessionNumber} — {c.date}</span>
                <span style={{ color: C.gray400, fontSize: 11 }}>{fmtDateTime(c.generatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Patient Form ───────────────────────────────────────────────────────────
function PatientForm({ patient: initial, onSave, onCancel }) {
  const [p, setP] = useState(() => ({ ...initial, psychxMRN: initial.psychxMRN || generateMRN() }));
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const update = useCallback((f, v) => setP(prev => ({ ...prev, [f]: v })), []);
  const updPsych = useCallback((fields) => setP(prev => ({ ...prev, ...fields })), []);
  const steps = ["Demographics", "Insurance", "Clinical", "PHQ-9", "Summary"];
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
    if ((p.trials || []).filter(t => t.drug).length >= 2) s++;
    if ((p.phq9History || []).length > 0) s++;
    if (p.remsEnrolled) s++;
    if (p.withMeEnrolled) s++;
    return Math.round((s / 6) * 100);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
        {steps.map((s, i) => {
          const hasErr = Object.keys(stepErrors(p, i)).length > 0;
          return (
            <button key={i} onClick={() => setStep(i)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: step === i ? `linear-gradient(135deg,${C.teal},${C.tealDark})` : hasErr ? C.redLight : C.gray100, color: step === i ? "#fff" : hasErr ? C.red : C.gray500 }}>
              <span style={{ opacity: 0.6, marginRight: 4 }}>{i + 1}.</span>{s}{hasErr ? " ⚠" : ""}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.gray500 }}>{pct()}% complete</span>
          <div style={{ width: 80, height: 4, background: C.gray200, borderRadius: 4 }}><div style={{ height: 4, borderRadius: 4, background: C.teal, width: `${pct()}%` }} /></div>
        </div>
      </div>

      {/* Step 0 — Demographics */}
      {step === 0 && (
        <div style={S.card}>
          <div style={S.secTitle}>Patient Demographics</div>
          <div style={{ padding: "10px 14px", background: C.tealLight, borderRadius: 10, fontSize: 12, color: "#0369a1", marginBottom: 16, display: "flex", gap: 20 }}>
            <div><span style={{ fontWeight: 700 }}>PsychX MRN:</span> {p.psychxMRN}</div>
            {p.emrMRN && <div><span style={{ fontWeight: 700 }}>Practice EMR MRN:</span> {p.emrMRN}</div>}
          </div>
          <div style={g2}>
            <Field label="First Name" required><Input value={p.firstName} onChange={v => update("firstName", v)} placeholder="First name" error={errs.firstName} /></Field>
            <Field label="Last Name" required><Input value={p.lastName} onChange={v => update("lastName", v)} placeholder="Last name" error={errs.lastName} /></Field>
            <Field label="Date of Birth" required><Input type="date" value={p.dob} onChange={v => update("dob", v)} error={errs.dob} /></Field>
            <Field label="Gender" required>
              <Select value={p.gender} onChange={v => update("gender", v)} error={errs.gender} options={[{ value: "", label: "Select..." }, { value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Non-binary", label: "Non-binary" }, { value: "Prefer not to say", label: "Prefer not to say" }]} />
            </Field>
            <Field label="Phone" required><Input value={p.phone} onChange={v => update("phone", v)} placeholder="(555) 555-5555" error={errs.phone} /></Field>
            <Field label="Email"><Input type="email" value={p.email} onChange={v => update("email", v)} placeholder="email@example.com" /></Field>
            <Field label="Practice EMR MRN" span={1}><Input value={p.emrMRN} onChange={v => update("emrMRN", v)} placeholder="EMR / chart number from your practice system" /></Field>
            <Field label="PsychX MRN (auto-assigned)" span={1}><Input value={p.psychxMRN} readOnly style={{ background: C.gray50, color: C.teal, fontWeight: 700 }} /></Field>
            <Field label="Street Address" span={2}><Input value={p.address} onChange={v => update("address", v)} placeholder="Street address" /></Field>
            <Field label="City"><Input value={p.city} onChange={v => update("city", v)} placeholder="City" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="State"><Select value={p.state} onChange={v => update("state", v)} options={US_STATES.map(s => ({ value: s, label: s || "Select..." }))} /></Field>
              <Field label="ZIP"><Input value={p.zip} onChange={v => update("zip", v)} placeholder="10001" /></Field>
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — Insurance */}
      {step === 1 && (
        <div style={S.card}>
          <div style={S.secTitle}>Insurance Information</div>
          <div style={g2}>
            <Field label="Insurance Company" required><Input value={p.insurerName} onChange={v => update("insurerName", v)} placeholder="e.g. Aetna, BCBS" error={errs.insurerName} /></Field>
            <Field label="Plan Type" required>
              <Select value={p.planType} onChange={v => update("planType", v)} options={[{ value: "commercial", label: "Commercial / Private" }, { value: "medicare", label: "Medicare" }, { value: "medicaid", label: "Medicaid" }, { value: "tricare", label: "TRICARE" }, { value: "other", label: "Other / Self-pay" }]} />
            </Field>
            <Field label="Policyholder Name"><Input value={p.policyHolder} onChange={v => update("policyHolder", v)} placeholder="Name on card" /></Field>
            <Field label="Policy / Member ID" required><Input value={p.policyId} onChange={v => update("policyId", v)} placeholder="Policy ID" error={errs.policyId} /></Field>
            <Field label="Group Number"><Input value={p.groupNumber} onChange={v => update("groupNumber", v)} placeholder="Group #" /></Field>
            <Field label="Insured Date of Birth (if different)"><Input type="date" value={p.insuredDob || ""} onChange={v => update("insuredDob", v)} /></Field>
            <Field label="Insured Address (if different from patient)" span={2}><Input value={p.insuredAddress || ""} onChange={v => update("insuredAddress", v)} placeholder="Leave blank if same as patient" /></Field>
          </div>
          {p.planType !== "commercial" && <div style={{ marginTop: 14, padding: "10px 14px", background: C.amberLight, borderRadius: 10, fontSize: 12, color: "#92400e" }}>⚠ Non-commercial plan: Patient may not qualify for withMe savings program. Medicare patients: G2212 replaces 99417 for prolonged service billing.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
            <ImageCapture label="Insurance Card — Front" value={p.insuranceCardFront} onChange={v => update("insuranceCardFront", v)} />
            <ImageCapture label="Insurance Card — Back" value={p.insuranceCardBack} onChange={v => update("insuranceCardBack", v)} />
          </div>
        </div>
      )}

      {/* Step 2 — Clinical */}
      {step === 2 && (
        <div>
          <div style={S.card}>
            <div style={S.secTitle}>Diagnosis</div>
            <div style={g2}>
              <Field label="ICD-10 Code" required>
                <Select value={p.diagnosisCode} onChange={v => update("diagnosisCode", v)} error={errs.diagnosisCode} options={[
                  { value: "F32.0", label: "F32.0 — MDD, single episode, mild" },
                  { value: "F32.1", label: "F32.1 — MDD, single episode, moderate" },
                  { value: "F32.2", label: "F32.2 — MDD, single episode, severe" },
                  { value: "F32.9", label: "F32.9 — MDD, single episode, unspecified" },
                  { value: "F33.0", label: "F33.0 — MDD, recurrent, mild" },
                  { value: "F33.1", label: "F33.1 — MDD, recurrent, moderate" },
                  { value: "F33.2", label: "F33.2 — MDD, recurrent, severe" },
                  { value: "R45.851", label: "R45.851 — Suicidal Ideation (MDSI)" }
                ]} />
              </Field>
              <Field label="Diagnosis Date" required><Input type="date" value={p.diagnosisDate} onChange={v => update("diagnosisDate", v)} error={errs.diagnosisDate} /></Field>
            </div>
          </div>
          <div style={S.card}><TrialEditor trials={p.trials || [emptyTrial(), emptyTrial()]} onChange={v => update("trials", v)} /></div>
          <div style={S.card}>
            <div style={S.secTitle}>Additional Clinical History</div>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={g2}>
                <Field label="Current Oral Antidepressant">
                  <Select value={p.currentOralAD || ""} onChange={v => update("currentOralAD", v)} options={[{ value: "", label: "Select or N/A..." }, ...ANTIDEPRESSANTS.map(a => ({ value: a, label: a }))]} />
                </Field>
                <Field label="Dose / Frequency"><Input value={p.currentOralADDose || ""} onChange={v => update("currentOralADDose", v)} placeholder="e.g. 20mg daily" /></Field>
              </div>
              <Field label="Psychotherapy History">
                <Select value={p.psychotherapy || ""} onChange={v => update("psychotherapy", v)} options={PSYCH_OPTIONS} />
              </Field>
              <CheckboxGroup label="Concomitant Medications (CNS depressants, MAOIs, stimulants)" options={CONCOMITANT_MED_OPTIONS} selected={p.concomitantMeds || []} onChange={v => update("concomitantMeds", v)} otherValue={p.concomitantMedsOther || ""} onOtherChange={v => update("concomitantMedsOther", v)} />
              <Checkbox checked={p.priorSpravatoUse || false} onChange={v => update("priorSpravatoUse", v)} label="Patient has prior history of Spravato treatment" />
              {p.priorSpravatoUse && <Field label="Prior Spravato Details"><Textarea value={p.priorSpravatoDetails || ""} onChange={v => update("priorSpravatoDetails", v)} placeholder="Date of last treatment, sessions, response..." rows={2} /></Field>}
              <Checkbox checked={p.tmsHistory || false} onChange={v => update("tmsHistory", v)} label="History of TMS (Transcranial Magnetic Stimulation)" />
              {p.tmsHistory && <Field label="TMS Details"><Input value={p.tmsDetails || ""} onChange={v => update("tmsDetails", v)} placeholder="Dates, sessions, response..." /></Field>}
              <CheckboxGroup label="Treatment Goals & Desired Outcomes" options={TREATMENT_GOAL_OPTIONS} selected={p.treatmentGoals || []} onChange={v => update("treatmentGoals", v)} otherValue={p.treatmentGoalsOther || ""} onOtherChange={v => update("treatmentGoalsOther", v)} />
              <Checkbox checked={p.patientAgreesGoals || false} onChange={v => update("patientAgreesGoals", v)} label="Patient agrees with treatment goals and has been counseled on risks, monitoring requirements, and transportation restrictions" />
            </div>
          </div>
          <div style={S.card}>
            <div style={S.secTitle}>Psychiatrist Consultation</div>
            <div style={{ marginBottom: 14 }}><Checkbox checked={p.psychiatristConsult || false} onChange={v => update("psychiatristConsult", v)} label="Psychiatrist consultation completed or in progress" /></div>
            {p.psychiatristConsult && <PsychiatristSelector patient={p} onChange={updPsych} />}
          </div>
          <div style={S.card}>
            <div style={S.secTitle}>Contraindication Screening</div>
            <div style={{ padding: "12px 16px", background: C.redLight, borderRadius: 10, border: "1px solid #fecaca", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 10, textTransform: "uppercase" }}>Absolute Contraindications — check if PRESENT</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Checkbox checked={p.contraindications?.aneurysm || false} onChange={v => update("contraindications", { ...p.contraindications, aneurysm: v })} label="Aneurysmal vascular disease (aortic, intracranial, or peripheral)" />
                <Checkbox checked={p.contraindications?.avmHistory || false} onChange={v => update("contraindications", { ...p.contraindications, avmHistory: v })} label="History of arteriovenous malformation (AVM)" />
                <Checkbox checked={p.contraindications?.ich || false} onChange={v => update("contraindications", { ...p.contraindications, ich: v })} label="History of intracerebral hemorrhage" />
                <Checkbox checked={p.contraindications?.hypersensitivity || false} onChange={v => update("contraindications", { ...p.contraindications, hypersensitivity: v })} label="Hypersensitivity to esketamine or ketamine" />
              </div>
            </div>
            {Object.values(p.contraindications || {}).some(Boolean) && (
              <div style={{ padding: "12px 16px", background: C.redLight, borderRadius: 10, border: `2px solid ${C.red}`, marginBottom: 12 }}>
                <strong style={{ color: C.red }}>⛔ CONTRAINDICATED</strong><span style={{ color: C.red, fontSize: 13 }}> — Patient NOT eligible. Notify prescribing physician immediately.</span>
              </div>
            )}
            <div style={{ padding: "12px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 10, textTransform: "uppercase" }}>Use With Caution</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Checkbox checked={p.hypertension || false} onChange={v => update("hypertension", v)} label="History of hypertension or baseline BP >140/90 mmHg" />
                <Checkbox checked={p.substanceHistory || false} onChange={v => update("substanceHistory", v)} label="History of substance use disorder" />
                <Checkbox checked={p.psychosisHistory || false} onChange={v => update("psychosisHistory", v)} label="History of psychosis or schizophrenia" />
              </div>
            </div>
          </div>
          <div style={S.card}>
            <div style={S.secTitle}>Additional Scoring</div>
            <div style={g2}>
              <Field label="HAM-D 17 Score">
                <Select value={p.hamd17Score || ""} onChange={v => update("hamd17Score", v)} options={[{ value: "", label: "Not administered" }, ...Array.from({ length: 53 }, (_, i) => ({ value: String(i), label: `${i} — ${i <= 7 ? "Normal" : i <= 13 ? "Mild" : i <= 18 ? "Moderate" : i <= 22 ? "Severe" : "Very Severe"}` }))]} />
              </Field>
              <Field label="HAM-D Date"><Input type="date" value={p.hamd17Date || ""} onChange={v => update("hamd17Date", v)} /></Field>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — PHQ-9 */}
      {step === 3 && (
        <div style={S.card}>
          <div style={S.secTitle}>PHQ-9 Baseline Assessment</div>
          {(p.phq9History || []).length === 0 ? (
            <PHQ9Form assessment={emptyPHQ9()} onChange={a => update("phq9History", [{ ...a, score: a.answers.every(v => v !== null) ? a.answers.reduce((s, v) => s + v, 0) : null }])} />
          ) : (
            <div style={{ padding: "14px 18px", background: C.greenLight, borderRadius: 12, border: `2px solid ${C.green}30` }}>
              <div style={{ fontWeight: 700, color: C.green, marginBottom: 4 }}>✓ PHQ-9 on file</div>
              <div style={{ fontSize: 13, color: C.gray700 }}>{(p.phq9History || []).length} assessment(s) recorded.</div>
            </div>
          )}
        </div>
      )}

      {/* Step 4 — Summary */}
      {step === 4 && (
        <div style={S.card}>
          <div style={S.secTitle}>Review & Save</div>
          {Object.keys(validatePatient(p)).length > 0 && (
            <div style={{ padding: "12px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>⚠ Required fields still missing:</div>
              {Object.values(validatePatient(p)).map((v, i) => <div key={i} style={{ fontSize: 12, color: "#92400e" }}>• {v}</div>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["PsychX MRN", p.psychxMRN], ["EMR MRN", p.emrMRN || "—"],
              ["Full Name", `${p.firstName} ${p.lastName}`], ["DOB / Gender", `${p.dob} · ${p.gender}`],
              ["Phone", p.phone], ["Insurance", `${p.insurerName || "—"} · ${p.planType}`],
              ["Policy ID", p.policyId], ["Group #", p.groupNumber || "—"],
              ["ICD-10", `${p.diagnosisCode} — ${p.diagnosisDate}`],
              ["AD Trials", `${(p.trials || []).filter(t => t.drug).length} documented`],
              ["SSRI/SNRI", (p.trials || []).some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI") ? "✓ Yes" : "⚠ Missing"],
              ["PHQ-9", (p.phq9History || []).length > 0 ? `${(p.phq9History || []).length} assessment(s)` : "Not completed"],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.gray50}` }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 13 }}>{v || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button onClick={onCancel} style={S.btn("ghost")}>Cancel</button>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && <button onClick={() => setStep(s => s - 1)} style={S.btn("secondary")}>← Back</button>}
          {step < steps.length - 1
            ? <button onClick={tryNext} style={S.btn()}>Next →</button>
            : <button onClick={() => onSave(p)} style={S.btn("success")}>✓ Save Patient</button>}
        </div>
      </div>
    </div>
  );
}

// ── Patient Detail ─────────────────────────────────────────────────────────
function PatientDetail({ patient, onUpdate, onDelete, addAudit, settings, schedule, onScheduleUpdate }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);

  const phq9s = (patient.phq9History || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = phq9s[0];
  const sev = latest?.score != null ? phq9Severity(latest.score) : null;
  const activePA = (patient.paRecords || []).find(r => r.status === "Approved");
  const remsUnsent = (patient.sessions || []).filter(s => !s.remsFormSubmitted).length;
  const hasSSRISNRI = (patient.trials || []).some(t => t.drugClass === "SSRI" || t.drugClass === "SNRI");
  const hasContra = Object.values(patient.contraindications || {}).some(Boolean);
  const allErrors = validatePatient(patient);
  const psych = PSYCHX_PSYCHIATRISTS.find(d => d.id === patient.psychiatristId);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: `Sessions (${(patient.sessions || []).length})` },
    { id: "pa", label: `Prior Auth (${(patient.paRecords || []).length})` },
    { id: "phq9", label: `PHQ-9 (${phq9s.length})` },
    { id: "billing", label: "💰 Billing" },
    { id: "enrollment", label: "Enrollment" },
    { id: "shipments", label: `Shipments (${(patient.shipments || []).length})` },
    { id: "notes", label: `Notes (${(patient.notes || []).length})` },
    { id: "exports", label: "🖨 Export" },
  ];

  if (editing) return (
    <div>
      <div style={{ marginBottom: 20 }}><button onClick={() => setEditing(false)} style={S.btn("ghost")}>← Cancel Edit</button></div>
      <PatientForm patient={patient} onSave={p => { addAudit(p, "Patient record edited and saved"); onUpdate(p); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{patient.firstName?.[0]}{patient.lastName?.[0]}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{patient.firstName} {patient.lastName}</div>
            <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
              <span style={{ color: C.teal, fontWeight: 700 }}>{patient.psychxMRN}</span>
              {patient.emrMRN && <span style={{ marginLeft: 10 }}>EMR: {patient.emrMRN}</span>}
              <span style={{ marginLeft: 10 }}>DOB: {patient.dob}</span>
              <span style={{ marginLeft: 10 }}>{patient.insurerName || "Insurance pending"}</span>
              <span style={{ marginLeft: 10 }}>{patient.diagnosisCode}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 360 }}>
            {hasContra && <span style={S.badge("red")}>⛔ Contraindicated</span>}
            {!hasSSRISNRI && (patient.trials || []).some(t => t.drug) && <span style={S.badge("amber")}>⚠ No SSRI/SNRI</span>}
            {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color }}>PHQ-9: {latest.score} — {sev.label}</span>}
            {activePA ? <span style={S.badge("green")}>Auth Active ✓</span> : <span style={S.badge("amber")}>No Active Auth</span>}
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

      {Object.keys(allErrors).length > 0 && (
        <div style={{ padding: "10px 16px", background: C.amberLight, borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span>⚠ {Object.keys(allErrors).length} required field{Object.keys(allErrors).length > 1 ? "s" : ""} incomplete — PA package will be partial.</span>
          <button onClick={() => setEditing(true)} style={{ ...S.btn("amber"), padding: "4px 12px", fontSize: 11, marginLeft: "auto" }}>Complete Now</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 3, marginBottom: 18, background: C.gray100, borderRadius: 12, padding: 4, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, minWidth: 70, padding: "7px 4px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? C.teal : C.gray500, boxShadow: tab === t.id ? "0 1px 6px rgba(0,0,0,0.08)" : "none" }}>{t.label}</button>
        ))}
      </div>

      <ErrorBoundary>
        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={S.card}>
                <div style={S.secTitle}>Demographics</div>
                {[["PsychX MRN", patient.psychxMRN], ["EMR MRN", patient.emrMRN || "—"], ["Name", `${patient.firstName} ${patient.lastName}`], ["DOB", patient.dob], ["Gender", patient.gender], ["Phone", patient.phone], ["Email", patient.email], ["Address", [patient.address, patient.city, patient.state, patient.zip].filter(Boolean).join(", ")]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.gray50}` }}>
                    <div style={{ width: 100, fontSize: 11, color: C.gray500, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
                    <div style={{ fontSize: 13, color: l === "PsychX MRN" ? C.teal : C.gray900, fontWeight: l === "PsychX MRN" ? 700 : 400 }}>{v || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
                  </div>
                ))}
              </div>
              <div style={S.card}>
                <div style={S.secTitle}>Insurance</div>
                {[["Insurer", patient.insurerName], ["Plan", patient.planType], ["Policy ID", patient.policyId], ["Group #", patient.groupNumber], ["Policyholder", patient.policyHolder]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.gray50}` }}>
                    <div style={{ width: 100, fontSize: 11, color: C.gray500, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{l}</div>
                    <div style={{ fontSize: 13 }}>{v || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
                  </div>
                ))}
              </div>
            </div>
            {patient.psychiatristConsult && patient.psychiatristName && (
              <div style={S.card}>
                <div style={S.secTitle}>Psychiatrist</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                  {[["Name", patient.psychiatristName], ["Practice", patient.psychiatristPractice], ["Phone", patient.psychiatristPhone], ["NPI", patient.psychiatristNPI]].map(([l, v]) => (
                    <div key={l}><div style={{ fontSize: 10, fontWeight: 700, color: C.gray400, textTransform: "uppercase", marginBottom: 3 }}>{l}</div><div style={{ fontSize: 13 }}>{v || "—"}</div></div>
                  ))}
                </div>
                {psych?.affiliated && <div style={{ marginTop: 10 }}><span style={S.badge("blue")}>PsychX Affiliated Provider</span></div>}
              </div>
            )}
            <div style={S.card}>
              <div style={S.secTitle}>Antidepressant Trials</div>
              {(patient.trials || []).filter(t => t.drug).length === 0 ? (
                <div style={{ color: C.gray400, fontSize: 13 }}>No trials documented yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: C.gray50 }}>{["#", "Medication", "Class", "Dose", "Start", "End", "Weeks", "Adequate", "Reason"].map(h => <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", textAlign: "left", borderBottom: `2px solid ${C.gray200}` }}>{h}</th>)}</tr></thead>
                    <tbody>{(patient.trials || []).map((t, i) => t.drug ? (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.gray100}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.drug}</td>
                        <td style={{ padding: "8px 10px" }}>{t.drugClass && <span style={{ ...S.badge(t.drugClass === "SSRI" || t.drugClass === "SNRI" ? "green" : ""), fontSize: 11 }}>{t.drugClass}</span>}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.dose || "—"}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.startDate || "—"}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.endDate || "—"}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{t.durationWeeks || "—"}</td>
                        <td style={{ padding: "8px 10px" }}><span style={S.badge(t.adequateTrial ? "green" : "amber")}>{t.adequateTrial ? "Yes" : "No"}</span></td>
                        <td style={{ padding: "8px 10px", fontSize: 12 }}>{t.reason || "—"}</td>
                      </tr>
                    ) : null)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {latest?.score != null && sev && (
              <div style={{ ...S.card, background: sev.bg, border: `2px solid ${sev.color}20` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 44, fontWeight: 900, color: sev.color, lineHeight: 1 }}>{latest.score}</div>
                    <div style={{ fontSize: 10, color: C.gray500, fontWeight: 700, textTransform: "uppercase" }}>PHQ-9</div>
                  </div>
                  <div style={{ width: 1, height: 56, background: C.gray200 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: sev.color }}>{sev.label} Depression</div>
                    <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Assessed: {latest.date} · {phq9s.length} total assessment{phq9s.length !== 1 ? "s" : ""}</div>
                    {patient.hamd17Score && <div style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>HAM-D 17: {patient.hamd17Score} ({patient.hamd17Date || "no date"})</div>}
                  </div>
                </div>
              </div>
            )}
            {(patient.treatmentGoals || []).length > 0 && (
              <div style={S.card}>
                <div style={S.secTitle}>Treatment Goals</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {(patient.treatmentGoals || []).map(g => <span key={g} style={S.badge("blue")}>{g}</span>)}
                  {patient.treatmentGoalsOther && <span style={S.badge("")}>{patient.treatmentGoalsOther}</span>}
                </div>
              </div>
            )}
            {/* Upcoming appointments for this patient */}
            {(() => {
              const upcoming = (schedule || []).filter(a => a.patientId === patient.id && new Date(a.date) >= new Date()).sort((a, b) => new Date(a.date + " " + a.time) - new Date(b.date + " " + b.time)).slice(0, 3);
              if (!upcoming.length) return null;
              return (
                <div style={S.card}>
                  <div style={S.secTitle}>Upcoming Appointments</div>
                  {upcoming.map(a => (
                    <div key={a.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.gray100}`, alignItems: "center" }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: C.tealLight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.teal }}>{new Date(a.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: C.teal, lineHeight: 1 }}>{new Date(a.date + "T12:00:00").getDate()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{a.type}</div>
                        <div style={{ fontSize: 11, color: C.gray500 }}>{a.time} · Chair {a.chair} · {a.duration} min</div>
                      </div>
                      <span style={S.badge("blue")}>Chair {a.chair}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        {tab === "sessions" && <SessionTracker patient={patient} onUpdate={onUpdate} addAudit={addAudit} settings={settings} onSchedule={null} />}
        {tab === "pa" && <PATracker patient={patient} onUpdate={onUpdate} addAudit={addAudit} />}
        {tab === "phq9" && <PHQ9History patient={patient} onUpdate={onUpdate} addAudit={addAudit} />}
        {tab === "billing" && <BillingModule patient={patient} session={(patient.sessions || []).slice(-1)[0]} settings={settings} onSave={onUpdate} />}
        {tab === "enrollment" && <EnrollmentPanel patient={patient} onUpdate={onUpdate} addAudit={addAudit} />}
        {tab === "shipments" && <ShipmentLog patient={patient} onUpdate={onUpdate} addAudit={addAudit} />}
        {tab === "notes" && <NotesTab patient={patient} onUpdate={onUpdate} />}
        {tab === "exports" && <ExportPanel patient={patient} settings={settings} />}
      </ErrorBoundary>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ patients, schedule, onSelect, onAddNew }) {
  const [search, setSearch] = useState("");
  const total = patients.length;
  const remsAlert = patients.filter(p => (p.sessions || []).some(s => !s.remsFormSubmitted)).length;
  const paUrgent = patients.filter(p => (p.paRecords || []).some(r => { const u = paUrgency(r); return u && u.color === "#dc2626"; })).length;
  const noActivePA = patients.filter(p => !(p.paRecords || []).some(r => r.status === "Approved")).length;

  const today = new Date().toISOString().split("T")[0];
  const weekDates = getWeekDates(today);
  const thisWeekAppts = (schedule || []).filter(a => weekDates.includes(a.date)).sort((a, b) => new Date(a.date + " " + a.time) - new Date(b.date + " " + b.time));
  const todayAppts = thisWeekAppts.filter(a => a.date === today);

  const filtered = patients.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.insurerName?.toLowerCase().includes(q) ||
      p.diagnosisCode?.toLowerCase().includes(q) ||
      p.psychxMRN?.toLowerCase().includes(q) ||
      p.emrMRN?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Dashboard</div>
        <div style={{ fontSize: 13, color: C.gray500 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Patients", value: total, color: C.teal, icon: "👥" },
          { label: "REMS Forms Due", value: remsAlert, color: remsAlert > 0 ? C.amber : C.green, icon: "📋", urgent: remsAlert > 0 },
          { label: "Auth Expiring Soon", value: paUrgent, color: paUrgent > 0 ? C.red : C.green, icon: "⚠️", urgent: paUrgent > 0 },
          { label: "No Active Auth", value: noActivePA, color: noActivePA > 0 ? C.amber : C.green, icon: "📄", urgent: noActivePA > 0 },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, marginBottom: 0, border: s.urgent ? `2px solid ${s.color}` : `1px solid ${C.gray200}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div><div style={{ fontSize: 34, fontWeight: 900, color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: C.gray500, marginTop: 2, fontWeight: 600 }}>{s.label}</div></div>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Today's schedule snapshot */}
      {todayAppts.length > 0 && (
        <div style={{ ...S.card, marginBottom: 20, border: `2px solid ${C.teal}30` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 12 }}>📅 Today's Schedule — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[1, 2].map(chair => {
              const chairAppts = todayAppts.filter(a => a.chair === chair);
              return (
                <div key={chair} style={{ background: C.gray50, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", marginBottom: 8 }}>Chair {chair}</div>
                  {chairAppts.length === 0 ? <div style={{ fontSize: 12, color: C.gray400 }}>No appointments</div> : chairAppts.map(a => {
                    const pt = patients.find(p => p.id === a.patientId);
                    return (
                      <div key={a.id} onClick={() => pt && onSelect(pt)} style={{ padding: "8px 10px", background: "#fff", borderRadius: 8, marginBottom: 6, border: `1px solid ${C.gray200}`, cursor: pt ? "pointer" : "default" }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{pt ? `${pt.firstName} ${pt.lastName}` : a.patientName || "Unknown"}</div>
                        <div style={{ fontSize: 11, color: C.gray500 }}>{a.time} · {a.type} · {a.duration}min</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action items */}
      {(remsAlert > 0 || paUrgent > 0) && (
        <div style={{ ...S.card, border: `2px solid ${C.red}`, background: "#fff8f8", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 12 }}>🚨 Action Required</div>
          <div style={{ display: "grid", gap: 8 }}>
            {patients.filter(p => (p.sessions || []).some(s => !s.remsFormSubmitted)).map(p => {
              const unsent = (p.sessions || []).filter(s => !s.remsFormSubmitted).length;
              return (
                <div key={p.id} onClick={() => onSelect(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 10, border: "1px solid #fecaca", cursor: "pointer" }}>
                  <span style={S.badge("amber")}>REMS ⚠</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</span>
                  <span style={{ fontSize: 11, color: C.gray400 }}>{p.psychxMRN}</span>
                  <span style={{ fontSize: 12, color: C.gray500 }}>{unsent} form{unsent > 1 ? "s" : ""} pending</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.teal }}>View →</span>
                </div>
              );
            })}
            {patients.filter(p => (p.paRecords || []).some(r => { const u = paUrgency(r); return u && u.color === "#dc2626"; })).map(p => {
              const r = (p.paRecords || []).find(r => { const u = paUrgency(r); return u && u.color === "#dc2626"; });
              return (
                <div key={p.id} onClick={() => onSelect(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 10, border: "1px solid #fecaca", cursor: "pointer" }}>
                  <span style={S.badge("red")}>Auth ⚠</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.firstName} {p.lastName}</span>
                  <span style={{ fontSize: 11, color: C.gray400 }}>{p.psychxMRN}</span>
                  <span style={{ fontSize: 12, color: C.gray500 }}>Authorization {paUrgency(r)?.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.teal }}>View →</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>All Patients ({total})</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, MRN, insurer, ICD-10..." style={{ ...S.inp(false), flex: 1, maxWidth: 360 }} />
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
          {filtered.map(p => {
            const phq9s = (p.phq9History || []).sort((a, b) => new Date(b.date) - new Date(a.date));
            const latest = phq9s[0];
            const sev = latest?.score != null ? phq9Severity(latest.score) : null;
            const activePA = (p.paRecords || []).find(r => r.status === "Approved");
            const hasContra = Object.values(p.contraindications || {}).some(Boolean);
            return (
              <div key={p.id} onClick={() => onSelect(p)} style={{ ...S.card, marginBottom: 0, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: hasContra ? C.redLight : `linear-gradient(135deg,${C.teal},${C.tealDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: hasContra ? C.red : "#fff", fontWeight: 800, fontSize: 14 }}>{p.firstName?.[0]}{p.lastName?.[0]}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.firstName} {p.lastName}</div>
                  <div style={{ fontSize: 11, color: C.gray500 }}>
                    <span style={{ color: C.teal, fontWeight: 600 }}>{p.psychxMRN}</span>
                    {p.emrMRN && <span style={{ marginLeft: 8 }}>EMR: {p.emrMRN}</span>}
                    <span style={{ marginLeft: 8 }}>{p.insurerName || "Insurance pending"}</span>
                    <span style={{ marginLeft: 8 }}>DOB: {p.dob}</span>
                    <span style={{ marginLeft: 8 }}>{(p.sessions || []).length} session{(p.sessions || []).length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 300 }}>
                  {hasContra && <span style={S.badge("red")}>⛔ Contra</span>}
                  {sev && <span style={{ ...S.badge(""), background: sev.bg, color: sev.color, fontSize: 10 }}>PHQ-9: {latest.score}</span>}
                  {activePA ? <span style={S.badge("green")}>Auth Active ✓</span> : <span style={S.badge("amber")}>No Active Auth</span>}
                  {p.remsEnrolled ? <span style={S.badge("green")}>REMS ✓</span> : <span style={S.badge("amber")}>REMS ⚠</span>}
                </div>
                <span style={{ fontSize: 16, color: C.gray400 }}>›</span>
              </div>
            );
          })}
          {filtered.length === 0 && search && (
            <div style={{ textAlign: "center", padding: "32px 20px", color: C.gray400 }}>No patients matching "{search}"</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  const [patients, setPatients] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [settings, setSettings] = useState(defaultSettings());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [navItem, setNavItem] = useState("dashboard");

  useEffect(() => {
    Promise.all([loadPatients(), Promise.resolve(loadSettings()), Promise.resolve(loadSchedule())])
      .then(([pts, stg, sch]) => { setPatients(pts); setSettings(stg); setSchedule(sch); setLoading(false); });
  }, []);

  const persist = (updated) => { setPatients(updated); savePatients(updated); };
  const persistSchedule = (s) => { setSchedule(s); saveSchedule(s); };
  const persistSettings = (s) => { setSettings(s); saveSettings(s); };

  const auditNote = (text) => ({ id: Date.now().toString() + Math.random(), createdAt: nowISO(), type: "system", templateId: "", text, attachmentName: "", attachmentData: null });

  const addAudit = (patientObj, text) => {
    const updated = { ...patientObj, notes: [...(patientObj.notes || []), auditNote(text)] };
    const list = patients.map(p => p.id === updated.id ? updated : p);
    persist(list);
    setSelectedId(updated.id);
  };

  const addPatient = (p) => {
    const withAudit = { ...p, notes: [...(p.notes || []), auditNote("Patient record created")] };
    persist([...patients, withAudit]);
    setSelectedId(withAudit.id);
    setView("detail");
    setNavItem("patients");
  };

  const updatePatient = (updated) => {
    const list = patients.map(p => p.id === updated.id ? updated : p);
    persist(list);
    setSelectedId(updated.id);
  };

  const deletePatient = (id) => {
    if (!window.confirm("Permanently delete this patient record? This cannot be undone.")) return;
    persist(patients.filter(p => p.id !== id));
    persistSchedule(schedule.filter(a => a.patientId !== id));
    setView("dashboard"); setSelectedId(null); setNavItem("dashboard");
  };

  const selectPatient = (p) => { setSelectedId(p.id); setView("detail"); setNavItem("patients"); };

  const selectedPatient = patients.find(p => p.id === selectedId);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "schedule", label: "Schedule", icon: "📅" },
    { id: "patients", label: "Patients", icon: "👥" },
    { id: "add", label: "Add Patient", icon: "➕" },
    { id: "settings", label: "Practice Settings", icon: "⚙️" },
  ];

  if (loading) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 16 }}>💊</div><div style={{ fontSize: 18, fontWeight: 700, color: C.teal }}>Loading PsychX...</div></div>
    </div>
  );

  return (
    <div style={S.app}>
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
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 8 }}>v0.6 · {patients.length} patient{patients.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />
        <nav style={{ padding: "12px 10px", flex: 1 }}>
          {navItems.map(item => (
            <div key={item.id}
              onClick={() => {
                setNavItem(item.id);
                if (item.id === "dashboard") setView("dashboard");
                else if (item.id === "schedule") setView("schedule");
                else if (item.id === "patients") { if (!selectedPatient) setView("dashboard"); else setView("detail"); }
                else if (item.id === "add") setView("add");
                else if (item.id === "settings") setView("settings");
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", marginBottom: 3, background: navItem === item.id ? "rgba(255,255,255,0.12)" : "transparent", transition: "all 0.15s" }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ color: navItem === item.id ? "#fff" : "rgba(255,255,255,0.6)", fontWeight: navItem === item.id ? 700 : 500, fontSize: 13 }}>{item.label}</span>
            </div>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>Quick Links</div>
          {[
            ["SpravatoREMS.com", "https://www.spravatorems.com"],
            ["SpravatoHCP.com", "https://www.spravatohcp.com"],
            ["withMe Enrollment", "https://www.spravatohcp.com/spravato-with-me/enroll"],
            ["CoverMyMeds", "https://www.covermymeds.com"],
            ["REMS: 1-855-382-6022", "tel:18553826022"],
            ["withMe: 1-844-479-4846", "tel:18444794846"],
          ].map(([l, u]) => (
            <a key={l} href={u} target={u.startsWith("tel") ? "_self" : "_blank"} rel="noopener noreferrer" style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none", padding: "3px 0" }}>{l} ↗</a>
          ))}
        </div>
      </div>

      <div style={S.main}>
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {(view === "detail" || view === "add") && (
              <button onClick={() => { setView("dashboard"); setNavItem("dashboard"); }} style={{ ...S.btn("ghost"), padding: "6px 12px", fontSize: 12 }}>← Back</button>
            )}
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {view === "dashboard" ? "Dashboard"
                : view === "add" ? "Add Patient"
                : view === "schedule" ? "Schedule"
                : view === "settings" ? "Practice Settings"
                : selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName} · ${selectedPatient.psychxMRN}`
                : ""}
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.gray400 }}>
            REMS <a href="tel:18553826022" style={{ color: C.teal, textDecoration: "none", fontWeight: 600 }}>1-855-382-6022</a>
            <span style={{ margin: "0 10px" }}>·</span>
            withMe <a href="tel:18444794846" style={{ color: C.teal, textDecoration: "none", fontWeight: 600 }}>1-844-479-4846</a>
          </div>
        </div>
        <div style={S.content}>
          <ErrorBoundary>
            {view === "dashboard" && <Dashboard patients={patients} schedule={schedule} onSelect={selectPatient} onAddNew={() => setView("add")} />}
            {view === "add" && (
              <PatientForm
                patient={emptyPatient()}
                onSave={addPatient}
                onCancel={() => setView("dashboard")}
              />
            )}
            {view === "detail" && selectedPatient && (
              <PatientDetail
                patient={selectedPatient}
                onUpdate={updatePatient}
                onDelete={() => deletePatient(selectedPatient.id)}
                addAudit={(p, text) => { updatePatient({ ...p, notes: [...(p.notes || []), auditNote(text)] }); }}
                settings={settings}
                schedule={schedule}
                onScheduleUpdate={persistSchedule}
              />
            )}
            {view === "schedule" && (
              <SchedulingModule
                patients={patients}
                schedule={schedule}
                onScheduleUpdate={persistSchedule}
                onPatientUpdate={updatePatient}
              />
            )}
            {view === "settings" && (
              <PracticeSettings
                settings={settings}
                onSave={(s) => { persistSettings(s); alert("Practice settings saved successfully."); }}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
