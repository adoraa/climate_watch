const { createClient } = supabase;
const sb = createClient(
  "https://cjvxvkgjamkjwisnptos.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdnh2a2dqYW1randpc25wdG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODgzMjgsImV4cCI6MjA5MDA2NDMyOH0.uewTIh6S0Bsd2NhqYt2JMDKhqlvq7uoZ3dPLuDPWVOM",
);

const FN_URL = "https://cjvxvkgjamkjwisnptos.supabase.co/functions/v1/admin-manage";

let adminSession = null;
let orgs = [];
let currentEntryOrgId = null;
const orgMap = {};

// BOOT
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const ok = await verifyAdmin(session.user.id);
    if (ok) { adminSession = session; showApp(session); }
    else { await sb.auth.signOut(); showView("login"); }
  } else {
    showView("login");
  }
  document.getElementById("loading-overlay").classList.add("hidden");
}

async function verifyAdmin(userId) {
  const { data } = await sb.from("organizations").select("is_admin").eq("id", userId).single();
  return data?.is_admin === true;
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
}

function showApp(session) {
  showView("app");
  document.getElementById("nav-user").textContent = session.user.email;
  loadOrgs();
}

// AUTH
async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-pass").value;
  const err   = document.getElementById("login-error");
  const btn   = document.getElementById("login-btn");
  const txt   = document.getElementById("login-btn-text");
  err.style.display = "none";
  btn.disabled = true; txt.textContent = "Signing in…";

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showLoginErr(); return; }

  const ok = await verifyAdmin(data.user.id);
  if (!ok) { await sb.auth.signOut(); showLoginErr(); return; }

  adminSession = data.session;
  btn.disabled = false; txt.textContent = "Sign in";
  showApp(data.session);

  function showLoginErr() {
    err.style.display = "block";
    btn.disabled = false; txt.textContent = "Sign in";
  }
}

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("view-login").classList.contains("active")) doLogin();
});

async function doLogout() {
  await sb.auth.signOut();
  adminSession = null;
  showView("login");
}

// EDGE FUNCTION CALLER
async function callFn(action, payload = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    console.error("No active session found. Redirecting to login.");
    showView("login");
    return { error: "Not logged in" };
  }
  console.log("Token being sent:", session?.access_token);
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey" : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdnh2a2dqYW1randpc25wdG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODgzMjgsImV4cCI6MjA5MDA2NDMyOH0.uewTIh6S0Bsd2NhqYt2JMDKhqlvq7uoZ3dPLuDPWVOM",
    },
    body: JSON.stringify({ action, payload })
  });
  return res.json();
}

// LOAD ORGS
async function loadOrgs() {
  document.getElementById("org-table-body").innerHTML =
    `<tr class="empty-row"><td colspan="7">Loading…</td></tr>`;
  const result = await callFn("list_orgs");
  orgs = result.orgs || [];
  renderOrgs();
}

function renderOrgs() {
  document.getElementById("org-count").textContent = `${orgs.length} organization${orgs.length !== 1 ? "s" : ""}`;
  const tbody = document.getElementById("org-table-body");
  if (!orgs.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No organizations yet.</td></tr>`;
    return;
  }
  orgs.forEach(o => orgMap[o.id] = o);

  tbody.innerHTML = orgs.map(o => `
    <tr>
      <td style="font-weight:500">${o.name}</td>
      <td class="mono">${o.username}</td>
      <td>${o.region || "—"}</td>
      <td class="mono">${o.station_id || "—"}</td>
      <td>${o.weather_entries?.[0]?.count ?? 0}</td>
      <td class="mono">${formatDate(o.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" onclick="viewEntries('${o.id}','${escHtml(o.name)}')">Entries</button>
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" onclick="openEditModal('${o.id}')">Edit</button>
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" onclick="openResetModal('${o.id}','${escHtml(o.name)}')">Password</button>
          <button class="btn btn-danger" style="padding:5px 10px;font-size:12px" onclick="openDeleteOrgModal('${o.id}','${escHtml(o.name)}')">Delete</button>
        </div>
      </td>
    </tr>`).join("");
}

// VIEW ENTRIES
async function viewEntries(orgId, orgName) {
  currentEntryOrgId = orgId;
  document.getElementById("entries-org-name").textContent = orgName;
  document.getElementById("section-orgs").style.display = "none";
  document.getElementById("section-entries").classList.add("open");
  document.getElementById("entries-table-body").innerHTML =
    `<tr class="empty-row"><td colspan="5">Loading…</td></tr>`;

  const result = await callFn("list_entries", { org_id: orgId });
  const entries = result.entries || [];
  document.getElementById("entries-count").textContent =
    `${entries.length} record${entries.length !== 1 ? "s" : ""}`;

  if (!entries.length) {
    document.getElementById("entries-table-body").innerHTML =
      `<tr class="empty-row"><td colspan="5">No entries for this organization.</td></tr>`;
    return;
  }

  document.getElementById("entries-table-body").innerHTML = entries.map(e => {
    const risk = getRisk(e.date, e.rain_mm);
    return `<tr>
      <td class="mono">${formatDate(e.date)}</td>
      <td>${parseFloat(e.temp_c).toFixed(1)} °C</td>
      <td>${parseFloat(e.rain_mm).toFixed(2)} mm</td>
      <td><span class="risk-badge ${risk.level}"><span class="risk-dot"></span>${cap(risk.level)}</span></td>
    </tr>`;
  }).join("");
}
    //   <td><button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteEntry('${e.id}', this)">Delete</button></td>

function closeEntries() {
  document.getElementById("section-entries").classList.remove("open");
  document.getElementById("section-orgs").style.display = "";
  currentEntryOrgId = null;
}

async function deleteEntry(id, btn) {
  if (!confirm("Delete this entry?")) return;
  btn.disabled = true; btn.textContent = "…";
  const result = await callFn("delete_entry", { id });
  if (result.error) { toast(result.error, "error"); btn.disabled = false; btn.textContent = "Delete"; return; }
  btn.closest("tr").remove();
  toast("Entry deleted.");
}

// CREATE
function openCreateModal() {
  ["c-name","c-username","c-email","c-password","c-region","c-station","c-coords"]
    .forEach(id => document.getElementById(id).value = "");
  document.getElementById("create-error").style.display = "none";
  openModal("modal-create");
}

async function createOrg() {
  const payload = {
    name:        document.getElementById("c-name").value.trim(),
    username:    document.getElementById("c-username").value.trim(),
    email:       document.getElementById("c-email").value.trim(),
    password:    document.getElementById("c-password").value,
    region:      document.getElementById("c-region").value.trim(),
    station_id:  document.getElementById("c-station").value.trim(),
    coordinates: document.getElementById("c-coords").value.trim(),
  };
  const errEl = document.getElementById("create-error");
  if (!payload.name || !payload.email || !payload.password || !payload.username) {
    errEl.textContent = "Name, username, email and password are required.";
    errEl.style.display = "block"; return;
  }
  setLoading("create-btn", "create-btn-text", "Creating…");
  const result = await callFn("create_org", payload);
  setLoading("create-btn", "create-btn-text", "Create", false);
  if (result.error) { errEl.textContent = result.error; errEl.style.display = "block"; return; }
  closeModal("modal-create");
  toast("Organization created successfully.");
  loadOrgs();
}

// EDIT
function openEditModal(id) {
  const org = orgMap[id];
  if (!org) return;
  document.getElementById("e-id").value      = org.id;
  document.getElementById("e-name").value    = org.name;
  document.getElementById("e-username").value = org.username;
  document.getElementById("e-region").value  = org.region || "";
  document.getElementById("e-station").value = org.station_id || "";
  document.getElementById("e-coords").value  = org.coordinates || "";
  document.getElementById("edit-error").style.display = "none";
  openModal("modal-edit");
}

async function saveEdit() {
  const payload = {
    id:          document.getElementById("e-id").value,
    name:        document.getElementById("e-name").value.trim(),
    username:    document.getElementById("e-username").value.trim(),
    region:      document.getElementById("e-region").value.trim(),
    station_id:  document.getElementById("e-station").value.trim(),
    coordinates: document.getElementById("e-coords").value.trim(),
  };
  const errEl = document.getElementById("edit-error");
  setLoading("edit-btn", "edit-btn-text", "Saving…");
  const result = await callFn("update_org", payload);
  setLoading("edit-btn", "edit-btn-text", "Save", false);
  if (result.error) { errEl.textContent = result.error; errEl.style.display = "block"; return; }
  closeModal("modal-edit");
  toast("Organization updated.");
  loadOrgs();
}

// RESET PASSWORD
function openResetModal(id, name) {
  document.getElementById("r-id").value = id;
  document.getElementById("r-password").value = "";
  document.getElementById("reset-subtitle").textContent = `Set a new password for ${name}.`;
  document.getElementById("reset-error").style.display = "none";
  openModal("modal-reset");
}

async function resetPassword() {
  const id       = document.getElementById("r-id").value;
  const password = document.getElementById("r-password").value;
  const errEl    = document.getElementById("reset-error");
  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.style.display = "block"; return;
  }
  setLoading("reset-btn", "reset-btn-text", "Resetting…");
  const result = await callFn("reset_password", { id, new_password: password });
  setLoading("reset-btn", "reset-btn-text", "Reset", false);
  if (result.error) { errEl.textContent = result.error; errEl.style.display = "block"; return; }
  closeModal("modal-reset");
  toast("Password reset successfully.");
}

// DELETE ORG
function openDeleteOrgModal(id, name) {
  document.getElementById("d-org-id").value = id;
  document.getElementById("delete-org-subtitle").textContent =
    `You are about to delete "${name}" and all associated data.`;
  openModal("modal-delete-org");
}

async function deleteOrg() {
  const id = document.getElementById("d-org-id").value;
  setLoading("delete-org-btn", "delete-org-btn-text", "Deleting…");
  const result = await callFn("delete_org", { id });
  setLoading("delete-org-btn", "delete-org-btn-text", "Delete", false);
  if (result.error) { toast(result.error, "error"); return; }
  closeModal("modal-delete-org");
  toast("Organization deleted.");
  loadOrgs();
}

// RISK LOGIC
function getRisk(dateStr, rain) {
  const m = new Date(dateStr + "T00:00:00").getMonth() + 1;
  const noRain = parseFloat(rain) === 0;
  if ([10,11,12,1,2,3].includes(m) && noRain) return { level: "high" };
  if ([4,6,7].includes(m) && noRain)           return { level: "medium" };
  if ([8,9].includes(m) && noRain)             return { level: "low" };
  return { level: "medium" };
}

// UTILS
function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function setLoading(btnId, txtId, label, disabled = true) {
  document.getElementById(btnId).disabled = disabled;
  document.getElementById(txtId).textContent = label;
}

function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = type;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

function formatDate(str) {
  if (!str) return "—";
  return new Date(str.includes("T") ? str : str + "T00:00:00")
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escHtml(s) { return s.replace(/'/g, "\\'"); }
function escJson(o) { return "'" + JSON.stringify(o).replace(/'/g, "\\'") + "'"; }

// Close modals on backdrop click
document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) backdrop.classList.remove("open");
  });
});

boot();