const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const sessions = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return hashPassword(password, salt).split(":")[1] === hash;
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedDb() {
  const adminPass = hashPassword("admin123");
  const memberPass = hashPassword("member123");
  const users = [
    { id: id("usr"), full_name: "Aarav Sharma", email: "admin@taskflow.test", role: "admin", password_hash: adminPass },
    { id: id("usr"), full_name: "Maya Patel", email: "maya@taskflow.test", role: "user", password_hash: memberPass },
    { id: id("usr"), full_name: "Rohan Mehta", email: "rohan@taskflow.test", role: "user", password_hash: memberPass }
  ];
  const projects = [
    { id: id("prj"), name: "Website Redesign", description: "Refresh the marketing pages, polish product flows, and prepare responsive layouts.", status: "active", color: "indigo", created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
    { id: id("prj"), name: "Mobile App Launch", description: "Coordinate QA, release readiness, launch assets, and post-launch bug triage.", status: "active", color: "emerald", created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: id("prj"), name: "Analytics Cleanup", description: "Audit dashboards, remove stale reports, and document metrics ownership.", status: "completed", color: "sky", created_at: new Date(Date.now() - 86400000 * 9).toISOString() }
  ];
  const tasks = [
    { id: id("tsk"), title: "Build dashboard cards", description: "Create responsive KPI cards for total, completed, active, and overdue tasks.", status: "done", priority: "high", due_date: todayPlus(-2), assigned_to: "maya@taskflow.test", assigned_to_name: "Maya Patel", project_id: projects[0].id, project_name: projects[0].name, created_at: new Date(Date.now() - 86400000 * 4).toISOString() },
    { id: id("tsk"), title: "Design project grid", description: "Make project cards scannable with color icons, status badges, and task counts.", status: "in_progress", priority: "medium", due_date: todayPlus(2), assigned_to: "rohan@taskflow.test", assigned_to_name: "Rohan Mehta", project_id: projects[0].id, project_name: projects[0].name, created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: id("tsk"), title: "QA signup flow", description: "Verify validations, error messages, and password hashing behavior.", status: "todo", priority: "urgent", due_date: todayPlus(-1), assigned_to: "maya@taskflow.test", assigned_to_name: "Maya Patel", project_id: projects[1].id, project_name: projects[1].name, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: id("tsk"), title: "Prepare release checklist", description: "Collect store metadata, screenshots, rollback steps, and release owner contacts.", status: "in_progress", priority: "high", due_date: todayPlus(5), assigned_to: "admin@taskflow.test", assigned_to_name: "Aarav Sharma", project_id: projects[1].id, project_name: projects[1].name, created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: id("tsk"), title: "Archive unused charts", description: "Move deprecated dashboards into the archive and update owners.", status: "done", priority: "low", due_date: todayPlus(1), assigned_to: "rohan@taskflow.test", assigned_to_name: "Rohan Mehta", project_id: projects[2].id, project_name: projects[2].name, created_at: new Date(Date.now() - 86400000 * 6).toISOString() }
  ];
  return {
    users,
    projects,
    tasks,
    project_members: projects.flatMap((p) => users.map((u, index) => ({
      id: id("mem"),
      project_id: p.id,
      user_email: u.email,
      user_name: u.full_name,
      role: index === 0 ? "owner" : "member"
    }))),
    invites: []
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seedDb(), null, 2));
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function getUser(req) {
  const sid = parseCookies(req).sid;
  const email = sid && sessions.get(sid);
  if (!email) return null;
  const db = readDb();
  const user = db.users.find((u) => u.email === email);
  return user ? publicUser(user) : null;
}

function publicUser(user) {
  return { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
}

function body(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => data += chunk);
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function requireAuth(req, res) {
  const user = getUser(req);
  if (!user) json(res, 401, { error: "Authentication required" });
  return user;
}

function requireAdmin(user, res) {
  if (user.role !== "admin") {
    json(res, 403, { error: "Admin access required" });
    return false;
  }
  return true;
}

function syncTaskProject(task, db) {
  const project = db.projects.find((p) => p.id === task.project_id);
  if (project) task.project_name = project.name;
  const assignee = db.users.find((u) => u.email === task.assigned_to);
  if (assignee) task.assigned_to_name = assignee.full_name;
}

function validateProject(input) {
  const status = ["active", "completed", "archived"].includes(input.status) ? input.status : "active";
  const color = ["indigo", "emerald", "amber", "rose", "sky", "violet"].includes(input.color) ? input.color : "indigo";
  if (!String(input.name || "").trim()) return { error: "Project name is required" };
  return { name: input.name.trim(), description: String(input.description || "").trim(), status, color };
}

function validateTask(input, db) {
  const status = ["todo", "in_progress", "done"].includes(input.status) ? input.status : "todo";
  const priority = ["low", "medium", "high", "urgent"].includes(input.priority) ? input.priority : "medium";
  if (!String(input.title || "").trim()) return { error: "Task title is required" };
  if (!db.projects.some((p) => p.id === input.project_id)) return { error: "Valid project is required" };
  if (!db.users.some((u) => u.email === input.assigned_to)) return { error: "Valid assignee is required" };
  return {
    title: input.title.trim(),
    description: String(input.description || "").trim(),
    status,
    priority,
    due_date: input.due_date || "",
    assigned_to: input.assigned_to,
    project_id: input.project_id
  };
}

async function handleApi(req, res, pathname) {
  const method = req.method;
  const user = getUser(req);
  const db = readDb();

  if (pathname === "/api/auth/me") return json(res, 200, { user });
  if (pathname === "/api/auth/signup" && method === "POST") {
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    if (!String(input.full_name || "").trim() || !email || !String(input.password || "").trim()) return json(res, 400, { error: "Name, email, and password are required" });
    if (db.users.some((u) => u.email === email)) return json(res, 409, { error: "Email already exists" });
    const role = input.role === "admin" ? "admin" : "user";
    const newUser = { id: id("usr"), full_name: input.full_name.trim(), email, role, password_hash: hashPassword(input.password) };
    db.users.push(newUser);
    writeDb(db);
    const sid = id("sid");
    sessions.set(sid, email);
    res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Lax`);
    return json(res, 201, { user: publicUser(newUser) });
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const found = db.users.find((u) => u.email === email);
    if (!found || !verifyPassword(String(input.password || ""), found.password_hash)) return json(res, 401, { error: "Invalid email or password" });
    const sid = id("sid");
    sessions.set(sid, email);
    res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Lax`);
    return json(res, 200, { user: publicUser(found) });
  }
  if (pathname === "/api/auth/logout" && method === "POST") {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return json(res, 200, { ok: true });
  }

  const authed = requireAuth(req, res);
  if (!authed) return;

  if (pathname === "/api/bootstrap") {
    return json(res, 200, {
      user: authed,
      users: db.users.map(publicUser),
      projects: db.projects,
      tasks: db.tasks,
      project_members: db.project_members,
      invites: authed.role === "admin" ? db.invites : []
    });
  }

  if (pathname === "/api/profile" && method === "PUT") {
    const input = await body(req);
    const fullName = String(input.full_name || "").trim();
    if (!fullName) return json(res, 400, { error: "Name is required" });
    const current = db.users.find((u) => u.email === authed.email);
    if (!current) return json(res, 404, { error: "User not found" });
    current.full_name = fullName;
    db.tasks.filter((t) => t.assigned_to === current.email).forEach((t) => t.assigned_to_name = fullName);
    db.project_members.filter((m) => m.user_email === current.email).forEach((m) => m.user_name = fullName);
    writeDb(db);
    return json(res, 200, { user: publicUser(current) });
  }

  if (pathname === "/api/users" && method === "GET") return json(res, 200, db.users.map(publicUser));
  if (pathname === "/api/users" && method === "POST") {
    if (!requireAdmin(authed, res)) return;
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const fullName = String(input.full_name || "").trim();
    const role = input.role === "admin" ? "admin" : "user";
    const password = String(input.password || "welcome123");
    if (!fullName || !email.includes("@")) return json(res, 400, { error: "Name and valid email are required" });
    if (db.users.some((u) => u.email === email)) return json(res, 409, { error: "Email already exists" });
    const newUser = { id: id("usr"), full_name: fullName, email, role, password_hash: hashPassword(password) };
    db.users.push(newUser);
    db.projects.forEach((project) => {
      db.project_members.push({ id: id("mem"), project_id: project.id, user_email: email, user_name: fullName, role: "member" });
    });
    writeDb(db);
    return json(res, 201, publicUser(newUser));
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch) {
    if (!requireAdmin(authed, res)) return;
    const target = db.users.find((u) => u.id === userMatch[1]);
    if (!target) return json(res, 404, { error: "Team member not found" });
    if (method === "PUT") {
      const input = await body(req);
      const fullName = String(input.full_name || "").trim();
      const role = input.role === "admin" ? "admin" : "user";
      if (!fullName) return json(res, 400, { error: "Name is required" });
      const adminCount = db.users.filter((u) => u.role === "admin").length;
      if (target.role === "admin" && role !== "admin" && adminCount === 1) return json(res, 400, { error: "At least one admin is required" });
      target.full_name = fullName;
      target.role = role;
      db.tasks.filter((t) => t.assigned_to === target.email).forEach((t) => t.assigned_to_name = fullName);
      db.project_members.filter((m) => m.user_email === target.email).forEach((m) => m.user_name = fullName);
      writeDb(db);
      return json(res, 200, publicUser(target));
    }
    if (method === "DELETE") {
      if (target.email === authed.email) return json(res, 400, { error: "You cannot delete your own account" });
      const adminCount = db.users.filter((u) => u.role === "admin").length;
      if (target.role === "admin" && adminCount === 1) return json(res, 400, { error: "At least one admin is required" });
      const assignedCount = db.tasks.filter((t) => t.assigned_to === target.email).length;
      if (assignedCount) return json(res, 400, { error: "Reassign or delete this member's tasks first" });
      db.users = db.users.filter((u) => u.id !== target.id);
      db.project_members = db.project_members.filter((m) => m.user_email !== target.email);
      writeDb(db);
      return json(res, 200, { ok: true });
    }
  }

  if (pathname === "/api/team/invite" && method === "POST") {
    if (!requireAdmin(authed, res)) return;
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const role = input.role === "admin" ? "admin" : "user";
    if (!email.includes("@")) return json(res, 400, { error: "Valid email is required" });
    if (!db.users.some((u) => u.email === email)) db.users.push({ id: id("usr"), full_name: email.split("@")[0], email, role, password_hash: hashPassword("welcome123") });
    const invite = { id: id("inv"), email, role, sent_by: authed.email, created_at: new Date().toISOString() };
    db.invites.push(invite);
    writeDb(db);
    return json(res, 201, { invite, message: "Invite sent. Temporary password: welcome123" });
  }

  if (pathname === "/api/projects" && method === "GET") return json(res, 200, db.projects);
  if (pathname === "/api/projects" && method === "POST") {
    if (!requireAdmin(authed, res)) return;
    const valid = validateProject(await body(req));
    if (valid.error) return json(res, 400, valid);
    const project = { id: id("prj"), ...valid, created_at: new Date().toISOString() };
    db.projects.push(project);
    db.project_members.push(...db.users.map((u, index) => ({ id: id("mem"), project_id: project.id, user_email: u.email, user_name: u.full_name, role: index === 0 ? "owner" : "member" })));
    writeDb(db);
    return json(res, 201, project);
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const project = db.projects.find((p) => p.id === projectMatch[1]);
    if (!project) return json(res, 404, { error: "Project not found" });
    if (method === "GET") return json(res, 200, project);
    if (!requireAdmin(authed, res)) return;
    if (method === "PUT") {
      const valid = validateProject(await body(req));
      if (valid.error) return json(res, 400, valid);
      Object.assign(project, valid);
      db.tasks.filter((t) => t.project_id === project.id).forEach((t) => t.project_name = project.name);
      writeDb(db);
      return json(res, 200, project);
    }
    if (method === "DELETE") {
      db.projects = db.projects.filter((p) => p.id !== project.id);
      db.tasks = db.tasks.filter((t) => t.project_id !== project.id);
      db.project_members = db.project_members.filter((m) => m.project_id !== project.id);
      writeDb(db);
      return json(res, 200, { ok: true });
    }
  }

  if (pathname === "/api/tasks" && method === "GET") return json(res, 200, db.tasks);
  if (pathname === "/api/tasks" && method === "POST") {
    if (!requireAdmin(authed, res)) return;
    const valid = validateTask(await body(req), db);
    if (valid.error) return json(res, 400, valid);
    const task = { id: id("tsk"), ...valid, assigned_to_name: "", project_name: "", created_at: new Date().toISOString() };
    syncTaskProject(task, db);
    db.tasks.push(task);
    writeDb(db);
    return json(res, 201, task);
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch) {
    const task = db.tasks.find((t) => t.id === taskMatch[1]);
    if (!task) return json(res, 404, { error: "Task not found" });
    if (method === "GET") return json(res, 200, task);
    if (method === "PATCH") {
      const input = await body(req);
      const canStatus = authed.role === "admin" || task.assigned_to === authed.email;
      if (!canStatus) return json(res, 403, { error: "You can only update your own assigned tasks" });
      if (["todo", "in_progress", "done"].includes(input.status)) task.status = input.status;
      writeDb(db);
      return json(res, 200, task);
    }
    if (!requireAdmin(authed, res)) return;
    if (method === "PUT") {
      const valid = validateTask(await body(req), db);
      if (valid.error) return json(res, 400, valid);
      Object.assign(task, valid);
      syncTaskProject(task, db);
      writeDb(db);
      return json(res, 200, task);
    }
    if (method === "DELETE") {
      db.tasks = db.tasks.filter((t) => t.id !== task.id);
      writeDb(db);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(PUBLIC_DIR, "index.html");
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

ensureDb();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Task Manager running at http://localhost:${PORT}`);
  console.log("Starter admin: admin@taskflow.test / admin123");
  console.log("Starter member: maya@taskflow.test / member123");
});
