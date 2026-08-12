import { firebaseConfig } from "./firebase-config.js";

const DAY = 86400000;
const today = new Date();

const state = { user: null, members: [], tasks: [], currentView: "overview", taskScope: "team-tasks", statusFilter: "All", priorityFilter: "all", search: "", firebase: null };
const $ = (id) => document.getElementById(id);
const firebaseReady = !Object.values(firebaseConfig).some((value) => value.startsWith("REPLACE_"));

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
      try {
        state.user = { id: user.uid, name: user.displayName || user.email.split("@")[0], email: user.email, initials: (user.displayName || user.email)[0].toUpperCase() };
        await ensureMemberProfile();
        await loadFirebaseData();
        showApp();
      } catch (error) {
        console.error("Workboard data could not be loaded", error);
        $("loginMessage").textContent = error.code === "permission-denied"
          ? "You are signed in, but the database rules have not been published yet."
          : "You are signed in, but the shared workspace could not be loaded.";
      }
    });
    return true;
  } catch (error) {
    console.error("Firebase initialization failed", error);
    $("loginMessage").textContent = "Sign-in is temporarily unavailable. Please try again later.";
    return false;
  }
}

async function signIn(event) {
  event.preventDefault();
  $("loginMessage").textContent = "";
  if (!state.firebase) {
    $("loginMessage").textContent = "Sign-in is temporarily unavailable. Please refresh and try again.";
    return;
  }
  const { auth, authModule } = state.firebase;
  $("signInButton").disabled = true;
  $("signInButton").textContent = "Signing in...";
  try { await authModule.signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value); }
  catch (error) { $("loginMessage").textContent = "We could not sign you in. Check your email and password, then try again."; }
  finally { $("signInButton").disabled = false; $("signInButton").textContent = "Sign in"; }
}

async function resetPassword() {
  $("loginMessage").textContent = "";
  const email = $("loginEmail").value.trim();
  if (!email) { $("loginMessage").textContent = "Enter your email address first, then select Forgot password."; return; }
  if (!state.firebase) { $("loginMessage").textContent = "Password reset is temporarily unavailable."; return; }
  try {
    state.firebase.auth.useDeviceLanguage();
    await state.firebase.authModule.sendPasswordResetEmail(state.firebase.auth, email, {
      url: "https://tsimarketing.github.io/TSI-Marketing-Workboard/",
      handleCodeInApp: false
    });
    $("loginMessage").textContent = "Reset email requested. Check your inbox and spam folder.";
  } catch (error) {
    console.error("Password reset request failed", error);
    const messages = {
      "auth/unauthorized-continue-uri": "The Workboard URL must be added to Firebase Authentication authorized domains.",
      "auth/invalid-continue-uri": "The password reset return URL is not configured correctly.",
      "auth/too-many-requests": "Too many reset attempts were made. Please wait and try again.",
      "auth/network-request-failed": "The reset request could not reach Firebase. Check your connection and try again."
    };
    $("loginMessage").textContent = messages[error.code] || "The reset email could not be requested. Please contact the Workboard administrator.";
  }
}

async function ensureMemberProfile() {
  const { db, firestoreModule: fs } = state.firebase;
  const memberRef = fs.doc(db, "members", state.user.id);
  const memberSnapshot = await fs.getDoc(memberRef);
  if (!memberSnapshot.exists()) {
    await fs.setDoc(memberRef, { name: state.user.name, email: state.user.email, initials: state.user.initials, role: "Marketing Team", capacity: "At a good level", capacityKey: "balanced", focus: "Add your current focus", createdAt: new Date().toISOString() });
  }
}

async function loadFirebaseData() {
  const { db, firestoreModule: fs } = state.firebase;
  const [membersSnapshot, tasksSnapshot] = await Promise.all([fs.getDocs(fs.collection(db, "members")), fs.getDocs(fs.collection(db, "tasks"))]);
  state.members = membersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  state.tasks = tasksSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function showApp() {
  $("loginView").hidden = true; $("appView").hidden = false;
  $("sidebarName").textContent = state.user.name; $("sidebarEmail").textContent = state.user.email; $("sidebarAvatar").textContent = state.user.initials;
  $("accountName").textContent = state.user.name; $("accountEmail").textContent = state.user.email; $("accountAvatar").textContent = state.user.initials;
  render();
}
async function signOut() {
  if (state.firebase?.auth.currentUser) await state.firebase.authModule.signOut(state.firebase.auth);
  state.user = null; $("accountDialog").close(); closeSidebar(); $("appView").hidden = true; $("loginView").hidden = false;
}

function openAccountSettings() {
  $("accountMessage").textContent = "";
  $("editProfileForm").hidden = true;
  $("changePasswordForm").hidden = true;
  closeSidebar();
  $("accountDialog").showModal();
}

function showProfileForm() {
  const member = state.members.find((item) => item.id === state.user.id) || {};
  $("changePasswordForm").hidden = true;
  $("accountMessage").textContent = "";
  $("profileName").value = member.name || state.user.name;
  $("profileRole").value = member.role || "Marketing Team";
  $("profileFocus").value = member.focus === "Add your current focus" ? "" : (member.focus || "");
  $("profileCapacity").value = member.capacityKey || "balanced";
  $("editProfileForm").hidden = false;
  $("profileName").focus();
}

function hideProfileForm() {
  $("editProfileForm").reset();
  $("editProfileForm").hidden = true;
}

async function saveProfile(event) {
  event.preventDefault();
  if (!state.firebase || !state.user) return;
  const capacityLabels = { available: "Open to tasks", balanced: "At a good level", limited: "Limited capacity", support: "Could use support" };
  const capacityKey = $("profileCapacity").value;
  const profile = {
    name: $("profileName").value.trim(),
    email: state.user.email,
    initials: $("profileName").value.trim().slice(0, 1).toUpperCase(),
    role: $("profileRole").value.trim() || "Marketing Team",
    focus: $("profileFocus").value.trim() || "No current focus added",
    capacity: capacityLabels[capacityKey],
    capacityKey,
    updatedAt: new Date().toISOString()
  };
  $("saveProfileButton").disabled = true;
  try {
    const { auth, authModule, db, firestoreModule: fs } = state.firebase;
    await Promise.all([
      fs.setDoc(fs.doc(db, "members", state.user.id), profile, { merge: true }),
      authModule.updateProfile(auth.currentUser, { displayName: profile.name })
    ]);
    state.user.name = profile.name;
    state.user.initials = profile.initials;
    const memberIndex = state.members.findIndex((item) => item.id === state.user.id);
    const updatedMember = { id: state.user.id, ...(memberIndex >= 0 ? state.members[memberIndex] : {}), ...profile };
    if (memberIndex >= 0) state.members[memberIndex] = updatedMember; else state.members.push(updatedMember);
    $("sidebarName").textContent = profile.name; $("sidebarAvatar").textContent = profile.initials;
    $("accountName").textContent = profile.name; $("accountAvatar").textContent = profile.initials;
    hideProfileForm();
    $("accountMessage").textContent = "Your profile and current focus have been updated.";
    render();
  } catch (error) {
    console.error("Profile update failed", error);
    $("accountMessage").textContent = error.code === "permission-denied"
      ? "Your profile could not be saved because the Firestore rules need to be updated."
      : "We could not save your profile. Please try again.";
  } finally {
    $("saveProfileButton").disabled = false;
  }
}

function showPasswordForm() {
  $("accountMessage").textContent = "";
  $("editProfileForm").hidden = true;
  $("changePasswordForm").hidden = false;
  $("currentPassword").focus();
}

function hidePasswordForm() {
  $("changePasswordForm").reset();
  $("changePasswordForm").hidden = true;
}

async function changePassword(event) {
  event.preventDefault();
  if (!state.user?.email || !state.firebase) return;
  const currentPassword = $("currentPassword").value;
  const newPassword = $("newPassword").value;
  if (newPassword !== $("confirmPassword").value) { $("accountMessage").textContent = "The new passwords do not match."; return; }
  if (newPassword.length < 10) { $("accountMessage").textContent = "Use at least 10 characters for the new password."; return; }
  $("savePasswordButton").disabled = true;
  try {
    const { auth, authModule } = state.firebase;
    const policy = await authModule.validatePassword(auth, newPassword);
    if (!policy.isValid) {
      const requirements = [];
      if (policy.meetsMinPasswordLength === false) requirements.push("the required minimum length");
      if (policy.containsLowercaseLetter === false) requirements.push("a lowercase letter");
      if (policy.containsUppercaseLetter === false) requirements.push("an uppercase letter");
      if (policy.containsNumericCharacter === false) requirements.push("a number");
      if (policy.containsNonAlphanumericCharacter === false) requirements.push("a special character");
      $("accountMessage").textContent = `Your new password needs ${requirements.join(", ")}.`;
      return;
    }
    const credential = authModule.EmailAuthProvider.credential(state.user.email, currentPassword);
    await authModule.reauthenticateWithCredential(auth.currentUser, credential);
    await authModule.updatePassword(auth.currentUser, newPassword);
    hidePasswordForm();
    $("accountMessage").textContent = "Your password has been updated.";
  } catch (error) {
    console.error("Password update failed", error);
    const messages = {
      "auth/invalid-credential": "Your current password is incorrect.",
      "auth/wrong-password": "Your current password is incorrect.",
      "auth/weak-password": "The new password does not meet the Firebase password policy.",
      "auth/password-does-not-meet-requirements": "The new password does not meet the Firebase password policy.",
      "auth/requires-recent-login": "Please sign out, sign back in, and try changing your password again.",
      "auth/too-many-requests": "Too many attempts were made. Please wait and try again.",
      "auth/network-request-failed": "Firebase could not be reached. Check your connection and try again.",
      "auth/operation-not-allowed": "Email and password authentication is not enabled in Firebase."
    };
    $("accountMessage").textContent = messages[error.code] || `Password update failed (${error.code || "unknown error"}).`;
  } finally {
    $("savePasswordButton").disabled = false;
  }
}

function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebarBackdrop").classList.add("open");
  $("menuButton").setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebarBackdrop").classList.remove("open");
  $("menuButton").setAttribute("aria-expanded", "false");
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
  if (state.taskScope === "my-tasks") tasks = tasks.filter((task) => task.ownerId === state.user.id);
  else if (!['team-tasks','overview'].includes(state.taskScope)) tasks = tasks.filter((task) => task.ownerId === state.taskScope);
  if (state.statusFilter !== "All") tasks = tasks.filter((task) => task.status === state.statusFilter);
  if (state.priorityFilter !== "all") tasks = tasks.filter((task) => task.priority === state.priorityFilter);
  if (state.search) tasks = tasks.filter((task) => `${task.title} ${task.project} ${task.note}`.toLowerCase().includes(state.search));
  $("taskList").innerHTML = tasks.length ? tasks.map((task) => `<article class="task-row"><span class="task-signal ${task.priority === "Time-sensitive" ? "sensitive" : ""}"></span><div class="task-main"><strong>${safeText(task.title)}</strong><small>${safeText(task.note || "No note added")}</small></div><span class="task-meta">${safeText(task.project || "No project")}</span><span class="status-chip ${task.status.toLowerCase().replace(" ", "-")}">${safeText(task.status)}</span><span class="task-meta">${task.due ? new Date(`${task.due}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "No due date"}<br>${safeText(memberFor(task.ownerId).name)}</span>${task.ownerId === state.user.id ? `<button class="row-action" data-edit="${task.id}" type="button" aria-label="Edit task">⋯</button>` : `<span aria-hidden="true"></span>`}</article>`).join("") : `<div class="empty-state">No tasks match these filters.</div>`;
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
  render(); closeSidebar();
}
function render() { $("pageKicker").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}); if(state.currentView==="overview") renderOverview(); if(["my-tasks","team-tasks"].includes(state.currentView)) renderTasks(); if(state.currentView==="projects") renderProjects(); }

function openTaskDialog(id) {
  const task = state.tasks.find((item) => item.id === id);
  $("dialogTitle").textContent = task ? "Edit task" : "Add a task"; $("taskId").value = task?.id || ""; $("taskTitle").value = task?.title || ""; $("taskStatus").value = task?.status || "To do"; $("taskPriority").value = task?.priority || "Standard"; $("taskProject").value = task?.project || ""; $("taskDue").value = task?.due || ""; $("taskNote").value = task?.note || ""; $("taskDialog").showModal();
}
async function saveTask(event) {
  event.preventDefault(); if (!$("taskForm").reportValidity()) return;
  const id = $("taskId").value || `task-${Date.now()}`;
  const task = { id, title: $("taskTitle").value.trim(), ownerId: state.user.id, status: $("taskStatus").value, priority: $("taskPriority").value, project: $("taskProject").value.trim(), due: $("taskDue").value, note: $("taskNote").value.trim(), updatedAt: new Date().toISOString() };
  const existingIndex = state.tasks.findIndex((item) => item.id === id); if(existingIndex >= 0) state.tasks[existingIndex] = task; else state.tasks.unshift(task);
  if (!state.firebase) return;
  const { db, firestoreModule: fs } = state.firebase;
  await fs.setDoc(fs.doc(db,"tasks",id), task);
  $("taskDialog").close(); setView("my-tasks");
}

$("loginForm").addEventListener("submit", signIn); $("resetPasswordButton").addEventListener("click", resetPassword); $("profileButton").addEventListener("click", openAccountSettings); $("editProfileButton").addEventListener("click", showProfileForm); $("editProfileForm").addEventListener("submit", saveProfile); $("cancelProfileButton").addEventListener("click", hideProfileForm); $("signOutButton").addEventListener("click", signOut); $("changePasswordButton").addEventListener("click", showPasswordForm); $("changePasswordForm").addEventListener("submit", changePassword); $("cancelPasswordButton").addEventListener("click", hidePasswordForm); $("closeAccountDialog").addEventListener("click", () => $("accountDialog").close()); $("addTaskButton").addEventListener("click", () => openTaskDialog()); $("saveTaskButton").addEventListener("click", saveTask); $("closeTaskDialog").addEventListener("click", () => $("taskDialog").close()); $("menuButton").addEventListener("click", () => $("sidebar").classList.contains("open") ? closeSidebar() : openSidebar()); $("sidebarBackdrop").addEventListener("click", closeSidebar);
document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
$("priorityFilter").addEventListener("change", (event) => { state.priorityFilter = event.target.value; renderTasks(); });
$("globalSearch").addEventListener("input", (event) => { state.search = event.target.value.trim().toLowerCase(); if(state.search) setView("team-tasks"); else render(); });
initFirebase();
