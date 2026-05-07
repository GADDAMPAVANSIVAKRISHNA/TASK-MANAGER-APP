const state = { user: null, users: [], projects: [], tasks: [], project_members: [], route: location.pathname, filters: {} };
const $ = (sel) => document.querySelector(sel);
const savedTheme = localStorage.getItem("task-manager-theme") || "light";
document.documentElement.dataset.theme = savedTheme;
const fmt = (s) => s ? new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No due date";
const label = (value) => ({ todo: "To Do", in_progress: "In Progress", done: "Done", active: "Active", completed: "Completed", archived: "Archived", admin: "Admin", user: "Member" }[value] || value);
const icon = { "/": "D", "/projects": "P", "/tasks": "T", "/my-tasks": "M", "/team": "U" };

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  $("#toast").append(node);
  setTimeout(() => node.remove(), 3200);
}

function canAdmin() { return state.user?.role === "admin"; }
function canStatus(task) { return canAdmin() || task.assigned_to === state.user.email; }
function isOverdue(task) { return task.due_date && new Date(`${task.due_date}T23:59:59`) < new Date() && task.status !== "done"; }
function initial(name) { return (name || "?").trim()[0]?.toUpperCase() || "?"; }
function escapeHtml(str = "") { return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }

async function bootstrap() {
  const me = await api("/api/auth/me");
  if (!me.user) return showAuth();
  const data = await api("/api/bootstrap");
  Object.assign(state, data);
  showApp();
}

function showAuth() {
  $("#auth").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#top-name").textContent = state.user.full_name;
  $("#account-button").textContent = initial(state.user.full_name);
  $("#menu-avatar").textContent = initial(state.user.full_name);
  $("#menu-name").textContent = state.user.full_name;
  $("#menu-role").textContent = label(state.user.role);
  $("#menu-email").textContent = state.user.email;
  renderNav();
  syncThemeToggle();
  renderRoute();
}

function syncThemeToggle() {
  const theme = document.documentElement.dataset.theme || "light";
  const button = $("#theme-toggle");
  const label = $("#theme-label");
  if (button) button.classList.toggle("dark", theme === "dark");
  if (label) label.textContent = theme === "dark" ? "Dark" : "Light";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("task-manager-theme", next);
  syncThemeToggle();
}

function setStarterLogin(role) {
  const credentials = {
    admin: { email: "admin@taskflow.test", password: "admin123" },
    member: { email: "maya@taskflow.test", password: "member123" }
  }[role];
  if (!credentials) return;
  const form = $("#login-form");
  form.email.value = credentials.email;
  form.password.value = credentials.password;
  document.querySelectorAll("[data-starter-login]").forEach((button) => {
    button.classList.toggle("active", button.dataset.starterLogin === role);
  });
}

function navPath(path) {
  if (path.startsWith("/projects/")) return "/projects";
  return path;
}

function renderNav() {
  const links = [["/", "Dashboard"], ["/projects", "Projects"], ["/tasks", "All Tasks"], ["/my-tasks", "My Tasks"], ["/team", "Team"]];
  $("#nav").innerHTML = links.map(([href, text]) => `<a class="nav-link ${navPath(state.route) === href ? "active" : ""}" href="${href}"><span>${icon[href]}</span>${text}</a>`).join("");
}

function go(path) {
  history.pushState(null, "", path);
  state.route = path;
  state.filters = {};
  renderNav();
  renderRoute();
  closeMobile();
}

function pageHead(title, subtitle, action = "") {
  return `<div class="page-head"><div><h2>${title}</h2><p class="subtle">${subtitle}</p></div><div>${action}</div></div>`;
}

function statCard(labelText, value, subtitle, color, glyph) {
  return `<div class="card stat-card"><div><div class="stat-label">${labelText}</div><div class="stat-value">${value}</div><p class="subtle">${subtitle || ""}</p></div><div class="stat-icon b-${color}">${glyph}</div></div>`;
}

function taskCard(task, showProject = true, i = 0) {
  const due = isOverdue(task) ? `<span class="b-rose badge">Overdue ${fmt(task.due_date)}</span>` : `<span>Due ${fmt(task.due_date)}</span>`;
  const actions = canAdmin() ? `<div class="card-actions"><button class="mini-btn" data-edit-task="${task.id}">Edit</button><button class="mini-btn danger-mini" data-delete-task="${task.id}">Delete</button></div>` : "";
  return `<article class="card clickable" data-task="${task.id}" style="animation-delay:${i * 35}ms">
    ${actions}
    <h3 class="task-title ${task.status === "done" ? "done-title" : ""}">${escapeHtml(task.title)}</h3>
    <p class="line-clamp">${escapeHtml(task.description || "No description yet.")}</p>
    <div class="meta"><span class="badge b-${task.status === "in_progress" ? "progress" : task.status}">${label(task.status)}</span><span class="badge b-${task.priority}">Flag ${label(task.priority)}</span></div>
    <div class="meta">${due}<span>Assigned: ${escapeHtml(task.assigned_to_name)}</span></div>
    ${showProject ? `<div class="task-footer">${escapeHtml(task.project_name)}</div>` : ""}
  </article>`;
}

function projectCard(project, i = 0) {
  const count = state.tasks.filter((t) => t.project_id === project.id).length;
  const done = state.tasks.filter((t) => t.project_id === project.id && t.status === "done").length;
  const progress = count ? Math.round(done / count * 100) : 0;
  const actions = canAdmin() ? `<div class="card-actions"><button class="mini-btn" data-edit-project="${project.id}">Edit</button><button class="mini-btn danger-mini" data-delete-project="${project.id}">Delete</button></div>` : "";
  return `<article class="card clickable" data-project="${project.id}" style="animation-delay:${i * 35}ms">
    ${actions}
    <div class="project-row"><div class="color-box color-${project.color}"></div><div><h3 class="project-title">${escapeHtml(project.name)}</h3><span class="badge b-${project.color}">${label(project.status)}</span></div><span class="arrow">-&gt;</span></div>
    <p class="line-clamp">${escapeHtml(project.description || "No description yet.")}</p>
    <div class="meta"><strong>${count}</strong> tasks - <strong>${progress}%</strong> complete</div>
    <div class="progress"><span style="width:${progress}%"></span></div>
  </article>`;
}

function empty(message, action = "") {
  return `<div class="empty"><strong>${message}</strong>${action ? `<div style="margin-top:14px">${action}</div>` : ""}</div>`;
}

function projectManagementRows() {
  if (!state.projects.length) return empty("No projects yet", canAdmin() ? `<button class="primary-btn" data-new-project>Add Project</button>` : "");
  return `<div class="manager-list">${state.projects.map((project) => {
    const tasks = state.tasks.filter((t) => t.project_id === project.id);
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter(isOverdue).length;
    return `<div class="manager-row">
      <div class="row-title"><span class="color-dot color-${project.color}"></span><div><strong>${escapeHtml(project.name)}</strong><span>${tasks.length} tasks, ${done} done, ${overdue} overdue</span></div></div>
      <span class="badge b-${project.color}">${label(project.status)}</span>
      <div class="row-actions"><button class="mini-btn" data-project="${project.id}">Open</button>${canAdmin() ? `<button class="mini-btn" data-edit-project="${project.id}">Edit Project</button><button class="mini-btn danger-mini" data-delete-project="${project.id}">Delete</button>` : ""}</div>
    </div>`;
  }).join("")}</div>`;
}

function taskManagementRows(tasks) {
  if (!tasks.length) return empty("No tasks match your filters", canAdmin() ? `<button class="primary-btn" data-new-task>Add Task</button>` : "");
  return `<div class="manager-list">${tasks.map((task) => `<div class="manager-row">
    <div class="row-title"><div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.project_name)} - ${escapeHtml(task.assigned_to_name)} - ${fmt(task.due_date)}</span></div></div>
    <span class="badge b-${task.status === "in_progress" ? "progress" : task.status}">${label(task.status)}</span>
    <span class="badge b-${task.priority}">${label(task.priority)}</span>
    <div class="row-actions">
      ${canStatus(task) ? `<select class="compact-select" data-inline-status="${task.id}">${["todo","in_progress","done"].map((s) => `<option value="${s}" ${task.status === s ? "selected" : ""}>${label(s)}</option>`).join("")}</select>` : ""}
      <button class="mini-btn" data-task="${task.id}">Details</button>
      ${canAdmin() ? `<button class="mini-btn" data-edit-task="${task.id}">Edit Task</button><button class="mini-btn danger-mini" data-delete-task="${task.id}">Delete</button>` : ""}
    </div>
  </div>`).join("")}</div>`;
}

function renderDashboard() {
  const first = state.user.full_name.split(" ")[0];
  const tasks = canAdmin() ? state.tasks : state.tasks.filter((t) => t.assigned_to === state.user.email);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status === "in_progress").length;
  const overdue = tasks.filter(isOverdue).length;
  const recent = [...tasks].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  const quickActions = canAdmin() ? `<div class="toolbar"><button class="primary-btn" data-new-task>New Task</button><button class="secondary-btn" data-new-project>New Project</button><button class="secondary-btn" data-new-member>Add Team Member</button></div>` : "";
  $("#view").innerHTML = `${pageHead(`Welcome back, ${escapeHtml(first)}`, canAdmin() ? "Here's an overview of all team activity." : "Here's what's on your plate today.", quickActions)}
    <div class="grid stats">
      ${statCard("Total Tasks", total, "Across current scope", "indigo", "☑")}
      ${statCard("Completed", done, total ? `${Math.round(done / total * 100)}% done` : "0% done", "emerald", "✓")}
      ${statCard("In Progress", active, "Currently moving", "sky", "↻")}
      ${statCard("Overdue", overdue, overdue ? "Needs attention" : "All clear", "rose", "!")}
    </div>
    <div class="grid layout" style="margin-top:22px">
      <section><div class="page-head"><div><h2 style="font-size:22px">Recent Tasks</h2><p class="subtle">Latest work items</p></div><button class="secondary-btn" data-go="${canAdmin() ? "/tasks" : "/my-tasks"}">View all</button></div>
      <div class="grid cards-2">${recent.length ? recent.map((t,i) => taskCard(t, true, i)).join("") : empty("No tasks yet")}</div></section>
      <aside><div class="page-head"><div><h2 style="font-size:22px">Projects</h2><p class="subtle">Active spaces</p></div><button class="secondary-btn" data-go="/projects">View all</button></div>
      <div class="grid">${state.projects.slice(0,5).map((p,i) => projectCard(p, i)).join("") || empty("No projects yet")}</div></aside>
    </div>`;
}

function renderProjects() {
  const action = canAdmin() ? `<div class="toolbar"><button class="primary-btn" data-new-project>Add Project</button><button class="secondary-btn" data-new-task>New Task</button></div>` : "";
  $("#view").innerHTML = `${pageHead("Projects", `${state.projects.length} projects`, action)}
    <section class="action-panel">
      <div><strong>Project management</strong><p class="subtle">Create projects, edit project details, delete old projects, and open a project workspace.</p></div>
      ${canAdmin() ? `<button class="primary-btn" data-new-project>Add Project</button>` : ""}
    </section>
    <div class="section-title"><h3>Project Cards</h3><span>${state.projects.length} total</span></div>
    <div class="grid cards-3">${state.projects.length ? state.projects.map(projectCard).join("") : empty("No projects yet", canAdmin() ? `<button class="primary-btn" data-new-project>Create Project</button>` : "")}</div>
    <div class="section-title"><h3>Manage Projects</h3><span>Edit, delete, or open</span></div>
    ${projectManagementRows()}`;
}

function renderProjectDetail(id) {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return go("/projects");
  const active = state.filters.status || "all";
  const projectTasks = state.tasks.filter((t) => t.project_id === id);
  const visible = active === "all" ? projectTasks : projectTasks.filter((t) => t.status === active);
  const tabs = ["all", "todo", "in_progress", "done"].map((s) => `<button class="${active === s ? "active" : ""}" data-filter-status="${s}">${label(s)} (${s === "all" ? projectTasks.length : projectTasks.filter((t) => t.status === s).length})</button>`).join("");
  $("#view").innerHTML = `<button class="ghost-btn" data-go="/projects">← Back to Projects</button>
    <div class="page-head" style="margin-top:18px"><div><h2>${escapeHtml(project.name)} <span class="badge b-${project.color}">${label(project.status)}</span></h2><p class="subtle">${escapeHtml(project.description || "No description yet.")}</p></div>
    <div class="toolbar">${canAdmin() ? `<button class="secondary-btn" data-edit-project="${project.id}">Edit</button><button class="danger-btn" data-delete-project="${project.id}">Delete</button>` : ""}</div></div>
    <div class="toolbar"><div class="tabs">${tabs}</div>${canAdmin() ? `<button class="primary-btn" data-new-task="${project.id}">Add Task</button><button class="secondary-btn" data-new-member>Add Team Member</button>` : ""}</div>
    <div class="grid cards-3">${visible.length ? visible.map((t,i) => taskCard(t, false, i)).join("") : empty(`No ${active === "all" ? "" : label(active)} tasks`)}</div>`;
}

function taskFilters(tasks) {
  const q = (state.filters.q || "").toLowerCase();
  const status = state.filters.status || "all";
  const priority = state.filters.priority || "all";
  const project = state.filters.project || "all";
  const assignee = state.filters.assignee || "all";
  return tasks.filter((t) => (!q || t.title.toLowerCase().includes(q)) && (status === "all" || t.status === status) && (priority === "all" || t.priority === priority) && (project === "all" || t.project_id === project) && (assignee === "all" || t.assigned_to === assignee));
}

function renderAllTasks() {
  const tasks = taskFilters(state.tasks);
  const status = state.filters.status || "all";
  const overdue = state.tasks.filter(isOverdue).length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const action = canAdmin() ? `<div class="toolbar"><button class="primary-btn" data-new-task>Add Task</button><button class="secondary-btn" data-new-project>Add Project</button><button class="secondary-btn" data-new-member>Add Team Member</button></div>` : "";
  $("#view").innerHTML = `${pageHead("All Tasks", `${state.tasks.length} total tasks`, action)}
    <section class="action-panel">
      <div><strong>Task management</strong><p class="subtle">${done} completed, ${overdue} overdue. Add tasks, assign owners, update status, edit details, or delete tasks from here.</p></div>
      ${canAdmin() ? `<button class="primary-btn" data-new-task>Add Task</button>` : ""}
    </section>
    <div class="toolbar">
      <input class="search" placeholder="Search tasks..." value="${escapeHtml(state.filters.q || "")}" data-search>
      <div class="tabs">${["all","todo","in_progress","done"].map((s) => `<button class="${status === s ? "active" : ""}" data-filter-status="${s}">${s === "in_progress" ? "Active" : label(s)}</button>`).join("")}</div>
      <select data-priority><option value="all">All Priority</option>${["low","medium","high","urgent"].map((p) => `<option value="${p}" ${state.filters.priority === p ? "selected" : ""}>${label(p)}</option>`).join("")}</select>
      <select data-project-filter><option value="all">All Projects</option>${state.projects.map((p) => `<option value="${p.id}" ${state.filters.project === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>
      <select data-assignee-filter><option value="all">All Assignees</option>${state.users.map((u) => `<option value="${u.email}" ${state.filters.assignee === u.email ? "selected" : ""}>${escapeHtml(u.full_name)}</option>`).join("")}</select>
    </div>
    <div class="section-title"><h3>Task Cards</h3><span>${tasks.length} showing</span></div>
    <div class="grid cards-3">${tasks.length ? tasks.map((t,i) => taskCard(t, true, i)).join("") : empty("No tasks match your filters", canAdmin() ? `<button class="primary-btn" data-new-task>Add Task</button>` : "")}</div>
    <div class="section-title"><h3>Manage Tasks</h3><span>Inline status, edit, delete</span></div>
    ${taskManagementRows(tasks)}`;
}

function renderMyTasks() {
  const mine = state.tasks.filter((t) => t.assigned_to === state.user.email);
  const status = state.filters.status || "all";
  const visible = status === "all" ? mine : mine.filter((t) => t.status === status);
  $("#view").innerHTML = `${pageHead("My Tasks", `${mine.length} tasks assigned to you`)}
    <div class="toolbar"><div class="tabs">${["all","todo","in_progress","done"].map((s) => `<button class="${status === s ? "active" : ""}" data-filter-status="${s}">${label(s)} (${s === "all" ? mine.length : mine.filter((t) => t.status === s).length})</button>`).join("")}</div></div>
    <div class="grid cards-3">${visible.length ? visible.map((t,i) => taskCard(t, true, i)).join("") : empty(mine.length ? `No ${label(status)} tasks` : "No tasks assigned to you yet")}</div>`;
}

function renderTeam() {
  const cards = state.users.map((u) => {
    const tasks = state.tasks.filter((t) => t.assigned_to === u.email);
    const done = tasks.filter((t) => t.status === "done").length;
    const actions = canAdmin() ? `<div class="card-actions"><button class="mini-btn" data-edit-member="${u.id}">Edit</button><button class="mini-btn danger-mini" data-delete-member="${u.id}">Delete</button></div>` : "";
    return `<article class="card member-card">${actions}<div class="member-top"><div class="avatar">${initial(u.full_name)}</div><div><h3 style="margin:0">${escapeHtml(u.full_name)}</h3><span class="badge ${u.role === "admin" ? "b-admin" : "b-user"}">${label(u.role)}</span></div></div><div class="meta">Email: ${escapeHtml(u.email)}</div><div class="meta"><strong>${tasks.length}</strong> tasks - <strong>${done}</strong> completed</div></article>`;
  }).join("");
  const action = canAdmin() ? `<div class="toolbar"><button class="primary-btn" data-new-member>Add Team Member</button><button class="secondary-btn" data-invite>Invite Member</button></div>` : "";
  $("#view").innerHTML = `${pageHead("Team", `${state.users.length} members`, action)}<div class="grid cards-3">${cards}</div>`;
}

function renderRoute() {
  const route = state.route;
  if (route === "/") return renderDashboard();
  if (route === "/projects") return renderProjects();
  if (route.startsWith("/projects/")) return renderProjectDetail(route.split("/")[2]);
  if (route === "/tasks") return renderAllTasks();
  if (route === "/my-tasks") return renderMyTasks();
  if (route === "/team") return renderTeam();
  go("/");
}

function closeModal() { $("#modal").close(); $("#modal-body").innerHTML = ""; }
function modal(html) { $("#modal-body").innerHTML = html; $("#modal").showModal(); }

function projectForm(project = {}) {
  const colors = ["indigo","emerald","amber","rose","sky","violet"];
  modal(`<div class="modal-panel"><div class="modal-head"><h3>${project.id ? "Edit Project" : "New Project"}</h3><button class="icon-btn" data-close>×</button></div>
    <form id="project-form" class="form" data-id="${project.id || ""}">
      <label>Name<input name="name" value="${escapeHtml(project.name || "")}" required></label>
      <label>Description<textarea name="description">${escapeHtml(project.description || "")}</textarea></label>
      <label>Status<select name="status">${["active","completed","archived"].map((s) => `<option value="${s}" ${project.status === s ? "selected" : ""}>${label(s)}</option>`).join("")}</select></label>
      <label>Color<input type="hidden" name="color" value="${project.color || "indigo"}"><div class="swatches">${colors.map((c) => `<button type="button" class="swatch color-${c} ${(project.color || "indigo") === c ? "active" : ""}" data-swatch="${c}" title="${c}"></button>`).join("")}</div></label>
      <div class="actions"><button type="button" class="ghost-btn" data-close>Cancel</button><button class="primary-btn" type="submit">Save Project</button></div>
    </form></div>`);
}

function taskForm(task = {}, projectContext = "") {
  const selectedProject = projectContext || task.project_id || state.projects[0]?.id || "";
  modal(`<div class="modal-panel"><div class="modal-head"><h3>${task.id ? "Edit Task" : "New Task"}</h3><button class="icon-btn" data-close>×</button></div>
    <form id="task-form" class="form" data-id="${task.id || ""}">
      <div class="form-grid">
        <label class="wide">Title<input name="title" value="${escapeHtml(task.title || "")}" required></label>
        <label class="wide">Description<textarea name="description">${escapeHtml(task.description || "")}</textarea></label>
        <label>Status<select name="status">${["todo","in_progress","done"].map((s) => `<option value="${s}" ${task.status === s ? "selected" : ""}>${label(s)}</option>`).join("")}</select></label>
        <label>Priority<select name="priority">${["low","medium","high","urgent"].map((p) => `<option value="${p}" ${task.priority === p ? "selected" : ""}>${label(p)}</option>`).join("")}</select></label>
        <label>Due Date<input name="due_date" type="date" value="${task.due_date || ""}"></label>
        <label>Assign To<select name="assigned_to">${state.users.map((u) => `<option value="${u.email}" ${task.assigned_to === u.email ? "selected" : ""}>${escapeHtml(u.full_name)}</option>`).join("")}</select></label>
        <label class="wide ${projectContext ? "hidden" : ""}">Project<select name="project_id">${state.projects.map((p) => `<option value="${p.id}" ${selectedProject === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select></label>
      </div>
      <div class="actions"><button type="button" class="ghost-btn" data-close>Cancel</button><button class="primary-btn" type="submit">Save Task</button></div>
    </form></div>`);
}

function memberForm(member = {}) {
  modal(`<div class="modal-panel"><div class="modal-head"><h3>${member.id ? "Edit Team Member" : "Add Team Member"}</h3><button class="icon-btn" data-close>x</button></div>
    <form id="member-form" class="form" data-id="${member.id || ""}">
      <div class="form-grid">
        <label>Full Name<input name="full_name" value="${escapeHtml(member.full_name || "")}" required></label>
        <label>Email<input name="email" type="email" value="${escapeHtml(member.email || "")}" ${member.id ? "disabled" : "required"}></label>
        <label>Role<select name="role"><option value="user" ${member.role !== "admin" ? "selected" : ""}>Member</option><option value="admin" ${member.role === "admin" ? "selected" : ""}>Admin</option></select></label>
        <label class="${member.id ? "hidden" : ""}">Temporary Password<input name="password" value="welcome123" minlength="6"></label>
      </div>
      <div class="actions"><button type="button" class="ghost-btn" data-close>Cancel</button><button class="primary-btn" type="submit">${member.id ? "Save Member" : "Add Member"}</button></div>
    </form></div>`);
}

function taskDetail(task) {
  modal(`<div class="modal-panel"><div class="modal-head"><div><h3>${escapeHtml(task.title)}</h3><p class="subtle">${escapeHtml(task.project_name)}</p></div><button class="icon-btn" data-close>×</button></div>
    <p>${escapeHtml(task.description || "No description yet.")}</p>
    <div class="meta"><span class="badge b-${task.status === "in_progress" ? "progress" : task.status}">${label(task.status)}</span><span class="badge b-${task.priority}">⚑ ${label(task.priority)}</span><span>${isOverdue(task) ? "Overdue " : "📅 "}${fmt(task.due_date)}</span><span>👤 ${escapeHtml(task.assigned_to_name)}</span></div>
    ${canStatus(task) ? `<label style="margin-top:18px">Status<select data-status-task="${task.id}">${["todo","in_progress","done"].map((s) => `<option value="${s}" ${task.status === s ? "selected" : ""}>${label(s)}</option>`).join("")}</select></label>` : ""}
    <div class="actions">${canAdmin() ? `<button class="secondary-btn" data-edit-task="${task.id}">Edit</button><button class="danger-btn" data-delete-task="${task.id}">Delete</button>` : ""}<button class="ghost-btn" data-close>Close</button></div></div>`);
}

async function refresh() {
  const data = await api("/api/bootstrap");
  Object.assign(state, data);
  renderNav();
  renderRoute();
}

function closeMobile() {
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("show");
}

function closeAccountMenu() {
  $("#account-dropdown").classList.add("hidden");
}

function toggleAccountMenu() {
  $("#account-dropdown").classList.toggle("hidden");
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/";
}

function profileForm() {
  closeAccountMenu();
  modal(`<div class="modal-panel"><div class="modal-head"><h3>Edit Profile</h3><button class="icon-btn" data-close>x</button></div>
    <form id="profile-form" class="form">
      <label>Full Name<input name="full_name" value="${escapeHtml(state.user.full_name)}" required></label>
      <label>Email<input value="${escapeHtml(state.user.email)}" disabled></label>
      <p class="subtle">Your email is used for task assignments, so only your display name can be changed here.</p>
      <div class="actions"><button type="button" class="ghost-btn" data-close>Cancel</button><button class="primary-btn" type="submit">Save Profile</button></div>
    </form></div>`);
}

document.addEventListener("click", async (e) => {
  const a = e.target.closest("a[href]");
  if (a && a.href.startsWith(location.origin)) { e.preventDefault(); go(new URL(a.href).pathname); }
  const goBtn = e.target.closest("[data-go]"); if (goBtn) go(goBtn.dataset.go);
  const starter = e.target.closest("[data-starter-login]"); if (starter) setStarterLogin(starter.dataset.starterLogin);
  if (e.target.closest("[data-new-project]")) projectForm();
  const editProject = e.target.closest("[data-edit-project]"); if (editProject) projectForm(state.projects.find((p) => p.id === editProject.dataset.editProject));
  const deleteProject = e.target.closest("[data-delete-project]");
  if (deleteProject && confirm("Delete this project and all its tasks?")) { await api(`/api/projects/${deleteProject.dataset.deleteProject}`, { method: "DELETE" }); toast("Project deleted"); closeModal(); await refresh(); go("/projects"); }
  const newTask = e.target.closest("[data-new-task]"); if (newTask) taskForm({}, newTask.dataset.newTask || "");
  const editTask = e.target.closest("[data-edit-task]"); if (editTask) taskForm(state.tasks.find((t) => t.id === editTask.dataset.editTask));
  const deleteTask = e.target.closest("[data-delete-task]");
  if (deleteTask && confirm("Delete this task?")) { await api(`/api/tasks/${deleteTask.dataset.deleteTask}`, { method: "DELETE" }); toast("Task deleted"); closeModal(); await refresh(); }
  const newMember = e.target.closest("[data-new-member]"); if (newMember) memberForm();
  const editMember = e.target.closest("[data-edit-member]"); if (editMember) memberForm(state.users.find((u) => u.id === editMember.dataset.editMember));
  const deleteMember = e.target.closest("[data-delete-member]");
  if (deleteMember && confirm("Delete this team member? They must have no assigned tasks.")) { await api(`/api/users/${deleteMember.dataset.deleteMember}`, { method: "DELETE" }); toast("Team member deleted"); await refresh(); }
  if (e.target.closest("[data-edit-profile]")) profileForm();
  if (e.target.closest("[data-logout]")) await logout();
  if (e.target.closest(".card-actions")) return;
  const project = e.target.closest("[data-project]"); if (project) go(`/projects/${project.dataset.project}`);
  const task = e.target.closest("[data-task]"); if (task) taskDetail(state.tasks.find((t) => t.id === task.dataset.task));
  if (e.target.closest("[data-close]")) closeModal();
  const status = e.target.closest("[data-filter-status]"); if (status) { state.filters.status = status.dataset.filterStatus; renderRoute(); }
  const invite = e.target.closest("[data-invite]");
  if (invite) modal(`<div class="modal-panel"><div class="modal-head"><h3>Invite Member</h3><button class="icon-btn" data-close>×</button></div><form id="invite-form" class="form"><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option value="user">Member</option><option value="admin">Admin</option></select></label><div class="actions"><button type="button" class="ghost-btn" data-close>Cancel</button><button class="primary-btn">Send Invite</button></div></form></div>`);
  const swatch = e.target.closest("[data-swatch]");
  if (swatch) { $("#project-form [name=color]").value = swatch.dataset.swatch; document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active")); swatch.classList.add("active"); }
  if (!e.target.closest(".account-menu")) closeAccountMenu();
});

document.addEventListener("change", async (e) => {
  if (e.target.matches("[data-priority]")) { state.filters.priority = e.target.value; renderRoute(); }
  if (e.target.matches("[data-project-filter]")) { state.filters.project = e.target.value; renderRoute(); }
  if (e.target.matches("[data-assignee-filter]")) { state.filters.assignee = e.target.value; renderRoute(); }
  if (e.target.matches("[data-inline-status]")) {
    await api(`/api/tasks/${e.target.dataset.inlineStatus}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) });
    toast("Task status updated");
    await refresh();
  }
  if (e.target.matches("[data-status-task]")) {
    await api(`/api/tasks/${e.target.dataset.statusTask}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) });
    toast("Task status updated");
    closeModal();
    await refresh();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.matches("[data-search]")) { state.filters.q = e.target.value; renderRoute(); }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === "login-form") {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
      toast("Welcome back");
      return bootstrap();
    }
    if (form.id === "signup-form") {
      await api("/api/auth/signup", { method: "POST", body: JSON.stringify(data) });
      toast(data.role === "admin" ? "Admin account created" : "Member account created");
      return bootstrap();
    }
    if (form.id === "project-form") {
      const id = form.dataset.id;
      await api(id ? `/api/projects/${id}` : "/api/projects", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
      toast(id ? "Project updated" : "Project created");
      closeModal();
      return refresh();
    }
    if (form.id === "task-form") {
      const id = form.dataset.id;
      await api(id ? `/api/tasks/${id}` : "/api/tasks", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
      toast(id ? "Task updated" : "Task created");
      closeModal();
      return refresh();
    }
    if (form.id === "member-form") {
      const id = form.dataset.id;
      await api(id ? `/api/users/${id}` : "/api/users", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
      toast(id ? "Team member updated" : "Team member added");
      closeModal();
      return refresh();
    }
    if (form.id === "profile-form") {
      const res = await api("/api/profile", { method: "PUT", body: JSON.stringify(data) });
      state.user = res.user;
      toast("Profile updated");
      closeModal();
      return refresh();
    }
    if (form.id === "invite-form") {
      const res = await api("/api/team/invite", { method: "POST", body: JSON.stringify(data) });
      toast(res.message || "Invite sent");
      closeModal();
      return refresh();
    }
  } catch (err) { toast(err.message); }
});

$("#login-tab").onclick = () => { $("#login-tab").classList.add("active"); $("#signup-tab").classList.remove("active"); $("#login-form").classList.remove("hidden"); $("#signup-form").classList.add("hidden"); };
$("#signup-tab").onclick = () => { $("#signup-tab").classList.add("active"); $("#login-tab").classList.remove("active"); $("#signup-form").classList.remove("hidden"); $("#login-form").classList.add("hidden"); };
$("#menu").onclick = () => { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); };
$("#theme-toggle").onclick = toggleTheme;
$("#account-button").onclick = toggleAccountMenu;
$("#scrim").onclick = closeMobile;
window.onpopstate = () => { state.route = location.pathname; state.filters = {}; renderNav(); renderRoute(); };
syncThemeToggle();
bootstrap().catch((err) => { showAuth(); syncThemeToggle(); toast(err.message); });
