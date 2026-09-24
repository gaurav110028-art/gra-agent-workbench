/* =========================================================
   calendarStore.js
   Manages all calendar data: tasks, compliance dates, entities,
   Instagram post tracking, and auth.
   Persists to localStorage - no database needed.
========================================================= */

const TASKS_KEY = "gra-calendar-tasks";
const ENTITIES_KEY = "gra-calendar-entities";
const INSTAGRAM_KEY = "gra-instagram-posts";
const AUTH_USERS_KEY = "gra-auth-users";
const AUTH_SESSION_KEY = "gra-auth-session";

const DEFAULT_ENTITIES = [
  "GRA",
  "The Blue Circle",
  "Shriram Consultation House",
];

export const STATUTORY_COMPLIANCES = [
  { id: "st-tds-7", dayOfMonth: 7, months: null, label: "TDS / TCS Deposit", description: "TDS and TCS payment deposit. Challan ITNS 281 to be filed.", entity: "GRA", urgency: "high", isStatutory: true, category: "TDS" },
  { id: "st-gstr1-11", dayOfMonth: 11, months: null, label: "GSTR-1 Filing", description: "GSTR-1 monthly return for outward supplies. Monthly filers.", entity: "GRA", urgency: "high", isStatutory: true, category: "GST" },
  { id: "st-gstr1iff-13", dayOfMonth: 13, months: null, label: "GSTR-1 IFF (QRMP)", description: "Invoice Furnishing Facility for QRMP taxpayers. Also GSTR-6 for ISD.", entity: "GRA", urgency: "medium", isStatutory: true, category: "GST" },
  { id: "st-pf-15", dayOfMonth: 15, months: null, label: "PF / ESI Deposit", description: "Provident Fund and ESI deposit for previous month.", entity: "GRA", urgency: "high", isStatutory: true, category: "Payroll" },
  { id: "st-gstr3b-20", dayOfMonth: 20, months: null, label: "GSTR-3B Filing", description: "GSTR-3B monthly return with tax payment. Monthly filers.", entity: "GRA", urgency: "high", isStatutory: true, category: "GST" },
  { id: "st-gstr3b-22", dayOfMonth: 22, months: null, label: "GSTR-3B QRMP Cat X", description: "GSTR-3B for QRMP quarterly filers - Category X states.", entity: "GRA", urgency: "medium", isStatutory: true, category: "GST" },
  { id: "st-gstr3b-24", dayOfMonth: 24, months: null, label: "GSTR-3B QRMP Cat Y", description: "GSTR-3B for QRMP quarterly filers - Category Y states.", entity: "GRA", urgency: "medium", isStatutory: true, category: "GST" },
  { id: "st-pt-30", dayOfMonth: 30, months: null, label: "Professional Tax", description: "Professional Tax payment and return (state specific).", entity: "GRA", urgency: "medium", isStatutory: true, category: "Tax" },
  { id: "st-adv-jun", dayOfMonth: 15, months: [6], label: "Advance Tax 2nd (45%)", description: "Second installment of Advance Tax. 45% cumulative by June 15.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-adv-sep", dayOfMonth: 15, months: [9], label: "Advance Tax 3rd (75%)", description: "Third installment of Advance Tax. 75% cumulative by Sept 15.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-adv-dec", dayOfMonth: 15, months: [12], label: "Advance Tax 4th (100%)", description: "Final installment of Advance Tax. 100% by Dec 15.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-adv-mar", dayOfMonth: 15, months: [3], label: "Advance Tax Final", description: "Advance Tax final payment for companies and presumptive scheme.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-itr-jul", dayOfMonth: 31, months: [7], label: "ITR Filing (Non-Audit)", description: "Income Tax Return due date for individuals and non-audit cases.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-tds-q1", dayOfMonth: 31, months: [7], label: "TDS Return Q1 (26Q/24Q)", description: "TDS quarterly return for Q1 (April-June). Salary and non-salary.", entity: "GRA", urgency: "high", isStatutory: true, category: "TDS" },
  { id: "st-form16", dayOfMonth: 15, months: [6], label: "Form 16 / 16A Issuance", description: "Issue Form 16 (salary) and Form 16A (non-salary) TDS certificates.", entity: "GRA", urgency: "high", isStatutory: true, category: "TDS" },
  { id: "st-tax-audit-sep", dayOfMonth: 30, months: [9], label: "Tax Audit (3CA/3CB-3CD)", description: "Tax Audit Report filing. Also DIR-3 KYC for directors.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-itr-oct", dayOfMonth: 31, months: [10], label: "ITR Filing (Audit Cases)", description: "ITR for companies, LLPs, audit cases, and partners of audit firms.", entity: "GRA", urgency: "high", isStatutory: true, category: "Income Tax" },
  { id: "st-tds-q2", dayOfMonth: 31, months: [10], label: "TDS Return Q2 (26Q/24Q)", description: "TDS quarterly return for Q2 (July-September).", entity: "GRA", urgency: "high", isStatutory: true, category: "TDS" },
  { id: "st-gstr9-dec", dayOfMonth: 31, months: [12], label: "GST Annual Return (GSTR-9/9C)", description: "GSTR-9 Annual Return and GSTR-9C Reconciliation Statement.", entity: "GRA", urgency: "high", isStatutory: true, category: "GST" },
  { id: "st-tds-q3", dayOfMonth: 31, months: [1], label: "TDS Return Q3 (26Q/24Q)", description: "TDS quarterly return for Q3 (October-December).", entity: "GRA", urgency: "high", isStatutory: true, category: "TDS" },
  { id: "st-tds-q4", dayOfMonth: 31, months: [5], label: "TDS Return Q4 (26Q/24Q)", description: "TDS quarterly return for Q4 (January-March).", entity: "GRA", urgency: "high", isStatutory: true, category: "TDS" },
  { id: "st-dpt3-jun", dayOfMonth: 30, months: [6], label: "DPT-3 (ROC)", description: "Return of deposits - DPT-3 filing with ROC for companies.", entity: "GRA", urgency: "medium", isStatutory: true, category: "ROC" },
];

export function getEntities() {
  if (typeof window === "undefined") return DEFAULT_ENTITIES;
  try {
    const stored = localStorage.getItem(ENTITIES_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_ENTITIES;
}

export function addEntity(name) {
  const trimmed = name.trim();
  if (!trimmed) return getEntities();
  const current = getEntities();
  if (current.includes(trimmed)) return current;
  const updated = [...current, trimmed];
  localStorage.setItem(ENTITIES_KEY, JSON.stringify(updated));
  return updated;
}

export function removeEntity(name) {
  const current = getEntities();
  const updated = current.filter((e) => e !== name);
  localStorage.setItem(ENTITIES_KEY, JSON.stringify(updated));
  return updated;
}

export function getAllTasks() {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(TASKS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function getTasksForDate(dateStr) {
  return getAllTasks().filter((t) => t.date === dateStr);
}

export function getTasksForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return getAllTasks().filter((t) => t.date.startsWith(prefix));
}

export function getStatutoryForMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const results = [];
  STATUTORY_COMPLIANCES.forEach((comp) => {
    const applies = comp.months === null || comp.months.includes(month);
    if (!applies) return;
    const day = Math.min(comp.dayOfMonth, daysInMonth);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    results.push({ ...comp, date: dateStr, status: "pending" });
  });
  const userTasks = getAllTasks();
  return results.map((comp) => {
    const override = userTasks.find((t) => t.statutoryId === comp.id && t.date === comp.date);
    if (override) return { ...comp, status: override.status, overrideId: override.id };
    return comp;
  });
}

export function addTask(taskData) {
  const tasks = getAllTasks();
  const newTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: taskData.date,
    title: taskData.title || "",
    description: taskData.description || "",
    entity: taskData.entity || "GRA",
    urgency: taskData.urgency || "medium",
    status: taskData.status || "pending",
    isStatutory: false,
    category: taskData.category || "Custom",
    createdAt: new Date().toISOString(),
  };
  saveTasks([...tasks, newTask]);
  return newTask;
}

export function updateTaskStatus(taskIdOrStatutoryId, status, date, isStatutory) {
  if (isStatutory) {
    const tasks = getAllTasks();
    const existing = tasks.find((t) => t.statutoryId === taskIdOrStatutoryId && t.date === date);
    if (existing) {
      saveTasks(tasks.map((t) => t.id === existing.id ? { ...t, status } : t));
    } else {
      saveTasks([...tasks, { id: `override-${Date.now()}`, statutoryId: taskIdOrStatutoryId, date, status, isStatutory: true }]);
    }
    return;
  }
  const tasks = getAllTasks();
  saveTasks(tasks.map((t) => t.id === taskIdOrStatutoryId ? { ...t, status } : t));
}

export function deleteTask(taskId) {
  saveTasks(getAllTasks().filter((t) => t.id !== taskId));
}

/* Instagram post tracking */
export function getAllInstagramPosts() {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(INSTAGRAM_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveInstagramPosts(posts) {
  localStorage.setItem(INSTAGRAM_KEY, JSON.stringify(posts));
}

export function addInstagramPost(postData) {
  const posts = getAllInstagramPosts();
  const newPost = {
    id: `ig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    calendarDate: postData.calendarDate,
    platform: postData.platform || "Instagram",
    caption: postData.caption || "",
    postUrl: postData.postUrl || "",
    complianceRef: postData.complianceRef || "",
    weeklyCheckins: [],
    createdAt: new Date().toISOString(),
  };
  saveInstagramPosts([...posts, newPost]);
  return newPost;
}

export function addWeeklyCheckin(postId, checkinData) {
  const posts = getAllInstagramPosts();
  const updated = posts.map((p) => {
    if (p.id !== postId) return p;
    const checkin = {
      id: `checkin-${Date.now()}`,
      date: checkinData.date || new Date().toISOString().split("T")[0],
      likes: Number(checkinData.likes) || 0,
      comments: Number(checkinData.comments) || 0,
      shares: Number(checkinData.shares) || 0,
      reach: Number(checkinData.reach) || 0,
      notes: checkinData.notes || "",
      recordedAt: new Date().toISOString(),
    };
    return { ...p, weeklyCheckins: [...p.weeklyCheckins, checkin] };
  });
  saveInstagramPosts(updated);
}

export function deleteInstagramPost(postId) {
  saveInstagramPosts(getAllInstagramPosts().filter((p) => p.id !== postId));
}

export function getInstagramPostsForDate(dateStr) {
  return getAllInstagramPosts().filter((p) => p.calendarDate === dateStr);
}

export function getInstagramPostsForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return getAllInstagramPosts().filter((p) => p.calendarDate.startsWith(prefix));
}

/* Auth functions */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return String(Math.abs(hash));
}

const DEFAULT_ADMIN = {
  id: "user-admin",
  email: "admin@gra.in",
  name: "Gaurav (Admin)",
  passwordHash: simpleHash("gra2024admin"),
  role: "admin",
  workspace: "GRA",
  createdAt: new Date().toISOString(),
};

export function getUsers() {
  if (typeof window === "undefined") return [DEFAULT_ADMIN];
  try {
    const stored = localStorage.getItem(AUTH_USERS_KEY);
    if (stored) {
      const users = JSON.parse(stored);
      const hasAdmin = users.find((u) => u.role === "admin");
      if (!hasAdmin) return [DEFAULT_ADMIN, ...users];
      return users;
    }
  } catch { /* ignore */ }
  const users = [DEFAULT_ADMIN];
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
  return users;
}

export function createUser(email, name, password, role = "member", workspace = "GRA") {
  const users = getUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("User with this email already exists.");
  }
  const newUser = {
    id: `user-${Date.now()}`,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: simpleHash(password),
    role,
    workspace,
    createdAt: new Date().toISOString(),
  };
  const updated = [...users, newUser];
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(updated));
  return newUser;
}

export function deleteUser(userId) {
  const users = getUsers().filter((u) => u.id !== userId && u.role !== "admin");
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

export function loginUser(email, password) {
  const users = getUsers();
  const hash = simpleHash(password);
  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === hash
  );
  if (!user) throw new Error("Invalid email or password.");
  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspace: user.workspace,
    loginAt: new Date().toISOString(),
  };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(AUTH_SESSION_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

export function logoutUser() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

export function generatePosterText(year, month) {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthName = monthNames[month - 1];
  const compliances = getStatutoryForMonth(year, month);
  compliances.sort((a, b) => parseInt(a.date.split("-")[2]) - parseInt(b.date.split("-")[2]));
  const lines = compliances.map((c) => {
    const day = parseInt(c.date.split("-")[2]);
    return `${day} ${monthName} - ${c.label}`;
  });
  return ["Compliance Due Dates - " + monthName + " " + year, "", ...lines, "", "Stay compliant. Stay ahead.", "GRA - Your trusted CA partner."].join("\n");
}
