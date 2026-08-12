import { firebaseConfig, workboardConfig } from "./firebase-config.js";

const DAY = 86400000;
const today = new Date();
const isoDate = (offset) => new Date(today.getTime() + offset * DAY).toISOString().slice(0, 10);
const demoMembers = [
  { id: "gian", name: "Gian", email: "demo@tsico.com", role: "Brand Design", initials: "G", capacity: "At a good level", capacityKey: "balanced", focus: "Campaign visual system and launch materials" },
  { id: "alex", name: "Alex", email: "alex@example.com", role: "Content", initials: "A", capacity: "Limited capacity", capacityKey: "limited", focus: "Webinar content and Q3 editorial calendar" },
  { id: "morgan", name: "Morgan", email: "morgan@example.com", role: "Digital Marketing", initials: "M", capacity: "Open to tasks", capacityKey: "available", focus: "Campaign reporting and landing page review" },
  { id: "sam", name: "Sam", email: "sam@example.com", role: "Video", initials: "S", capacity: "Could use support", capacityKey: "support", focus: "Customer story edits and event cutdowns" }
];
const demoTasks = [
  { id: "t1", title: "Finalize Q3 campaign visual system", ownerId: "gian", status: "In progress", priority: "Time-sensitive", project: "Q3 Campaign", due: isoDate(2), note: "Complete final layouts and prepare the review board." },
  { id: "t2", title: "Build webinar social toolkit", ownerId: "gian", status: "To do", priority: "Standard", project: "August Webinar", due: isoDate(6), note: "LinkedIn assets and speaker announcement sizes." },
  { id: "t3", title: "Review landing page copy", ownerId: "gian", status: "Waiting", priority: "Flexible", project: "Healthcare Landing Page", due: isoDate(8), note: "Waiting for the final product notes." },
  { id: "t4", title: "Draft webinar email sequence", ownerId: "alex", status: "In progress", priority: "Time-sensitive", project: "August Webinar", due: isoDate(1), note: "Draft two invite emails and the final reminder." },
  { id: "t5", title: "Complete Q3 editorial calendar", ownerId: "alex", status: "In progress", priority: "Standard", project: "Always-on Content", due: isoDate(4), note: "Confirm SME availability before routing." },
  { id: "t6", title: "Prepare campaign performance snapshot", ownerId: "morgan", status: "In progress", priority: "Standard", project: "Q3 Campaign", due: isoDate(5), note: "Summarize channel performance for the team sync." },
  { id: "t7", title: "Review paid media creative", ownerId: "morgan", status: "To do", priority: "Flexible", project: "Q3 Campaign", due: isoDate(9), note: "Check dimensions and destination links." },
  { id: "t8", title: "Edit customer story cutdown", ownerId: "sam", status: "In progress", priority: "Time-sensitive", project: "Customer Story", due: isoDate(1), note: "Complete the 30-second version for review." },
  { id: "t9", title: "Export event screen loops", ownerId: "sam", status: "Waiting", priority: "Time-sensitive", project: "Fall Event", due: isoDate(3), note: "Waiting for approved speaker titles." },
  { id: "t10", title: "Create short-form video captions", ownerId: "sam", status: "To do", priority: "Standard", project: "Customer Story", due: isoDate(7), note: "Prepare captions for three short clips." }
];

const state = { user: null, members: demoMembers, tasks: [], currentView: "overview", taskScope: "team-tasks", statusFilter: "All", priorityFilter: "all", search: "", firebase: null };
const $ = (id) => document.getElementById(id);
const firebaseReady = !Object.values(firebaseConfig).some((value) => value.startsWith("REPLACE_"));

function loadDemoTasks() {
  const stored = localStorage.getItem("tsi-workboard-demo-tasks");
  state.tasks = stored ? JSON.parse(stored) : structuredClone(demoTasks);
}
function persistDemoTasks() { localStorage.setItem("tsi-workboard-demo-tasks", JSON.stringify(state.tasks)); }
function safeText(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function memberFor(ownerId) { return state.members.find((member) => member.id === ownerId) || state.members[0]; }
function dueSoon(task) { return task.due && new Date(`${task.due}T23:59:59`) - today <= 3 * DAY && task.status !== "Complete"; }

async function initFirebase() {
  if (!firebaseReady) return false;
  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);
    state.firebase = { auth, db, authModule, firestoreModule };
    authModule.onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      if ((user.email || "").split("@")[1]?.toLowerCase() !== workboardConfig.allowedDomain) {
        await authModule.signOut(auth);
        $("loginMessage").textContent = "This account is not approved for the TSI Marketing Workboard.";
        return;
      }
      state.user = { id: user.uid, name: user.displayName || user.email.split("@")[0], email: user.email, initials: (user.displayName || user.email)[0].toUpperCase() };
      await loadFirebaseData();
      showApp();
    });
    return true;
  } catch (error) {
    console.error("Firebase initialization failed", error);
    $("loginMessage").textContent = "Sign-in is temporarily unavailable. Please try again later.";
    return false;
  }
}

async function signIn() {
  $("loginMessage").textContent = "";
  if (!state.firebase) {
    $("loginMessage").textContent = "Firebase setup is required before Microsoft sign-in can be used.";
    return;
  }
  const { auth, authModule } = state.firebase;
  const provider = new authModule.OAuthProvider("microsoft.com");
  provider.setCustomParameters({ tenant: "common", prompt: "select_account" });
  try { await authModule.signInWithPopup(auth, provider); }
  catch (error) { if (error.code !== "auth/popup-closed-by-user") $("loginMessage").textContent = "We could not complete sign-in. Please use your TSI Microsoft account."; }
}

async function loadFirebaseData() {
  const { db, firestoreModule: fs } = state.firebase;
  const [membersSnapshot, tasksSnapshot] = await Promise.all([fs.getDocs(fs.collection(db, "members")), fs.getDocs(fs.collection(db, "tasks"))]);
  state.members = membersSnapshot.empty ? [{ ...state.user, role: "Marketing Team", capacity: "At a good level", capacityKey: "balanced", focus: "Add your current focus" }] : membersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  state.tasks = tasksSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function previewDemo() {
  state.user = demoMembers[0];
  loadDemoTasks();
  showApp();
}
function showApp() {
  $("loginView").hidden = true; $("appView").hidden = false;
  $("sidebarName").textContent = state.user.name; $("sidebarEmail").textContent = state.user.email; $("sidebarAvatar").textContent = state.user.initials;
  render();
}
async function signOut() {
  if (state.firebase?.auth.currentUser) await state.firebase.authModule.signOut(state.firebase.auth);
  state.user = null; $("appView").hidden = true; $("loginView").hidden = false;
}

function renderOverview() {
  const active = state.tasks.filter((task) => task.status === "In progress").length;
  const urgent = state.tasks.filter(dueSoon).length;
  const waiting = state.tasks.filter((task) => task.status === "Waiting").length;
  $("weekSummary").innerHTML = [[active,"in progress"],[urgent,"due soon"],[waiting,"waiting"]].map(([count,label]) => `<div class="summary-item"><strong>${count}</strong><span>${label}</span></div>`).join("");
  $("teamList").innerHTML = state.members.map((member) => {
    const tasks = state.tasks.filter((task) => task.ownerId === member.id);
    const inProgress = tasks.filter((task) => task.status === "In progress").length;
    const timeSensitive = tasks.filter((task) => task.priority === "Time-sensitive" && task.status !== "Complete").length;
    const blocked = tasks.filter((task) => task.status === "Waiting").length;
    return `<article class="team-row"><div class="person-cell"><span class="avatar">${safeText(member.initials || member.name[0])}</span><div><strong>${safeText(member.name)}</strong><small>${safeText(member.role || "Marketing Team")}</small></div></div><div class="focus-cell"><p>${safeText(member.focus || "No focus note yet")}</p><small>Current focus</small></div><span class="capacity ${safeText(member.capacityKey)}">${safeText(member.capacity)}</span><div class="count-cell"><strong>${inProgress}</strong><small>in progress</small></div><div class="count-cell"><strong>${timeSensitive}</strong><small>time-sensitive</small></div><div class="count-cell"><strong>${blocked}</strong><small>waiting</small></div><button class="row-action" data-member="${safeText(member.id)}" type="button" aria-label="View ${safeText(member.name)} tasks">›</button></article>`;
  }).join("") + `<p class="demo-caveat">${firebaseReady ? "Team workload updates appear here." : "Demo workspace with illustrative names and tasks. Connect Firebase before production use."}</p>`;
  document.querySelectorAll("[data-member]").forEach((button) => button.addEventListener("click", () => { state.taskScope = button.dataset.member; setView("team-tasks", `${memberFor(button.dataset.member).name}’s tasks`); }));
}

function renderTasks() {
  const statuses = ["All", "To do", "In progress", "Waiting", "Complete"];
  $("taskTabs").innerHTML = statuses.map((status) => `<button class="tab ${state.statusFilter === status ? "active" : ""}" data-status="${status}" role="tab" aria-selected="${state.statusFilter === status}">${status}</button>`).join("");
  document.querySelectorAll("[data-status]").forEach((tab) => tab.addEventListener("click", () => { state.statusFilter = tab.dataset.status; renderTasks(); }));
  let tasks = state.tasks;
  if (state.taskScope === "my-tasks") tasks = tasks.filter((task) => task.ownerId === state.user.id || task.ownerId === "gian");
  else if (!['team-tasks','overview'].includes(state.taskScope)) tasks = tasks.filter((task) => task.ownerId === state.taskScope);
  if (state.statusFilter !== "All") tasks = tasks.filter((task) => task.status === state.statusFilter);
  if (state.priorityFilter !== "all") tasks = tasks.filter((task) => task.priority === state.priorityFilter);
  if (state.search) tasks = tasks.filter((task) => `${task.title} ${task.project} ${task.note}`.toLowerCase().includes(state.search));
  $("taskList").innerHTML = tasks.length ? tasks.map((task) => `<article class="task-row"><span class="task-signal ${task.priority === "Time-sensitive" ? "sensitive" : ""}"></span><div class="task-main"><strong>${safeText(task.title)}</strong><small>${safeText(task.note || "No note added")}</small></div><span class="task-meta">${safeText(task.project || "No project")}</span><span class="status-chip ${task.status.toLowerCase().replace(" ", "-")}">${safeText(task.status)}</span><span class="task-meta">${task.due ? new Date(`${task.due}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "No due date"}<br>${safeText(memberFor(task.ownerId).name)}</span><button class="row-action" data-edit="${task.id}" type="button" aria-label="Edit task">⋯</button></article>`).join("") : `<div class="empty-state">No tasks match these filters.</div>`;
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openTaskDialog(button.dataset.edit)));
}

function renderProjects() {
  const groups = Object.groupBy ? Object.groupBy(state.tasks, (task) => task.project || "Unassigned") : state.tasks.reduce((all,task)=>{(all[task.project||"Unassigned"]??=[]).push(task);return all;},{});
  $("projectList").innerHTML = Object.entries(groups).sort((a,b) => b[1].length-a[1].length).map(([name,tasks]) => { const owners = new Set(tasks.map((task)=>task.ownerId)).size; const active=tasks.filter((task)=>task.status!=="Complete").length; return `<article class="project-row"><h3>${safeText(name)}</h3><p>${safeText(tasks.find((task)=>task.note)?.note || "Shared marketing initiative")}</p><div class="project-stats"><div><strong>${active}</strong><small>open tasks</small></div><div><strong>${owners}</strong><small>contributors</small></div></div></article>`; }).join("");
}

function setView(view, customTitle) {
  state.currentView = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $("overviewView").hidden = view !== "overview"; $("tasksView").hidden = !["my-tasks","team-tasks"].includes(view); $("projectsView").hidden = view !== "projects";
  const titles = { overview: "Team overview", "my-tasks": "My tasks", "team-tasks": "Team tasks", projects: "Projects" };
  $("pageTitle").textContent = customTitle || titles[view];
  if (view === "my-tasks") state.taskScope = "my-tasks"; else if (view === "team-tasks" && !customTitle) state.taskScope = "team-tasks";
  render(); $("sidebar").classList.remove("open");
}
function render() { $("pageKicker").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}); if(state.currentView==="overview") renderOverview(); if(["my-tasks","team-tasks"].includes(state.currentView)) renderTasks(); if(state.currentView==="projects") renderProjects(); }

function openTaskDialog(id) {
  const task = state.tasks.find((item) => item.id === id);
  $("dialogTitle").textContent = task ? "Edit task" : "Add a task"; $("taskId").value = task?.id || ""; $("taskTitle").value = task?.title || ""; $("taskStatus").value = task?.status || "To do"; $("taskPriority").value = task?.priority || "Standard"; $("taskProject").value = task?.project || ""; $("taskDue").value = task?.due || ""; $("taskNote").value = task?.note || ""; $("taskDialog").showModal();
}
async function saveTask(event) {
  event.preventDefault(); if (!$("taskForm").reportValidity()) return;
  const id = $("taskId").value || `task-${Date.now()}`;
  const task = { id, title: $("taskTitle").value.trim(), ownerId: state.user.id === demoMembers[0].id ? "gian" : state.user.id, status: $("taskStatus").value, priority: $("taskPriority").value, project: $("taskProject").value.trim(), due: $("taskDue").value, note: $("taskNote").value.trim(), updatedAt: new Date().toISOString() };
  const existingIndex = state.tasks.findIndex((item) => item.id === id); if(existingIndex >= 0) state.tasks[existingIndex] = task; else state.tasks.unshift(task);
  if (state.firebase) { const { db, firestoreModule: fs } = state.firebase; await fs.setDoc(fs.doc(db,"tasks",id), task); } else persistDemoTasks();
  $("taskDialog").close(); setView("my-tasks");
}

$("signInButton").addEventListener("click", signIn); $("demoButton").addEventListener("click", previewDemo); $("signOutButton").addEventListener("click", signOut); $("addTaskButton").addEventListener("click", () => openTaskDialog()); $("saveTaskButton").addEventListener("click", saveTask); $("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
$("priorityFilter").addEventListener("change", (event) => { state.priorityFilter = event.target.value; renderTasks(); });
$("globalSearch").addEventListener("input", (event) => { state.search = event.target.value.trim().toLowerCase(); if(state.search) setView("team-tasks"); else render(); });
if (!workboardConfig.demoMode) $("demoButton").hidden = true;
initFirebase();
