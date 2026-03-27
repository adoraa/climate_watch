//SUPABASE INIT
const { createClient } = supabase;
const sb = createClient(
    "https://cjvxvkgjamkjwisnptos.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdnh2a2dqYW1randpc25wdG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODgzMjgsImV4cCI6MjA5MDA2NDMyOH0.uewTIh6S0Bsd2NhqYt2JMDKhqlvq7uoZ3dPLuDPWVOM",
);

let currentOrg = null;
let allEntries = [];
let currentPage = 1;
const PAGE_SIZE = 5;

//BOOT: check for existing session
async function boot() {
    const {
        data: { session },
    } = await sb.auth.getSession();
    if (session) {
        await loadOrgAndShow(session.user);
    } else {
        showView("login");
    }
    hideOverlay();
}

function hideOverlay() {
    document.getElementById("loading-overlay").classList.add("hidden");
}

function showView(name) {
    document
        .querySelectorAll(".view")
        .forEach((v) => v.classList.remove("active"));
    document.getElementById("view-" + name).classList.add("active");
}

//AUTH
async function doLogin() {
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-pass").value;
    const err = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");
    const txt = document.getElementById("login-btn-text");
    err.style.display = "none";
    btn.disabled = true;
    txt.textContent = "Signing in…";

    const { data, error } = await sb.auth.signInWithPassword({
        email,
        password: pass,
    });
    if (error) {
        err.style.display = "block";
        btn.disabled = false;
        txt.textContent = "Sign in";
        return;
    }
    await loadOrgAndShow(data.user);
}

document.addEventListener("keydown", (e) => {
    if (
        e.key === "Enter" &&
        document.getElementById("view-login").classList.contains("active")
    )
        doLogin();
});

async function doLogout() {
    await sb.auth.signOut();
    currentOrg = null;
    allEntries = [];
    document.getElementById("login-email").value = "";
    document.getElementById("login-pass").value = "";
    showView("login");
}

//LOAD ORG DATA
async function loadOrgAndShow(user) {
    if (!user) {
        const {
            data: { user: freshUser },
        } = await sb.auth.getUser();
        user = freshUser;
    }

    //fetch org profile
    const { data: org, error: orgErr } = await sb
        .from("organizations")
        .select("*")
        .eq("id", user.id)
        .single();

    if (orgErr || !org) {
        await sb.auth.signOut();
        showView("login");
        document.getElementById("login-error").textContent =
            "No organization profile found for this account.";
        document.getElementById("login-error").style.display = "block";
        return;
    }

    currentOrg = org;

    //fetch all weather entries for this org
    const { data: entries } = await sb
        .from("weather_entries")
        .select("*")
        .eq("org_id", user.id)
        .order("date", { ascending: false });

    allEntries = entries || [];
    currentPage = 1;

    showView("app");
    renderAll();

    //reset login button
    const btn = document.getElementById("login-btn");
    const txt = document.getElementById("login-btn-text");
    if (btn) {
        btn.disabled = false;
        txt.textContent = "Sign in";
    }
}

//RISK LOGIC
function getRisk(dateStr, rain) {
    const m = new Date(dateStr + "T00:00:00").getMonth() + 1;
    const noRain = parseFloat(rain) === 0;
    if ([10, 11, 12, 1, 2, 3].includes(m) && noRain)
        return {
            level: "high",
            reason: `Peak fire season`,
        };
    if ([4, 6, 7].includes(m) && noRain)
        return {
            level: "medium",
            reason: `Moderate fire risk`,
        };
    if ([8, 9].includes(m) && noRain)
        return {
            level: "low",
            reason: `Low fire risk`,
        };
    return {
        level: "medium",
        reason:
            rain > 0
                ? `${rain}mm rainfall recorded. Risk reduced`
                : "Insufficient data",
    };
}

function monthName(m) {
    return [
        "",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ][m];
}
function riskLabel(l) {
    return { high: "High", medium: "Medium", low: "Low" }[l];
}

//RENDER
function renderAll() {
    const o = currentOrg;
    document.getElementById("nav-orgname").textContent = o.name;
    renderDashboard();
    renderProfile();
}

function renderDashboard() {
    const o = currentOrg;
    document.getElementById("dash-title").textContent = o.name;
    document.getElementById("dash-subtitle").textContent =
        `Station ${o.station_id || "—"} · ${o.region || "—"}`;

    const data = allEntries;
    const latest = data[0];
    const latestRisk = latest ? getRisk(latest.date, latest.rain_mm) : null;
    const avgTemp = data.length
        ? (
            data.reduce((s, d) => s + parseFloat(d.temp_c), 0) / data.length
        ).toFixed(1)
        : "—";
    const highCount = data.filter(
        (d) => getRisk(d.date, d.rain_mm).level === "high",
    ).length;

    if (latestRisk) renderDial(latestRisk);
    renderTable(data);
}

function renderDial(risk) {
  const colors = { high: "#e74c3c", medium: "#f1c40f", low: "#27ae60" };
  const angles = { high: -150, medium: -90, low: -30 };

  const cx = 100, cy = 100, r = 62;
  const deg = angles[risk.level];
  const rad = (deg * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  document.getElementById("dial-needle").setAttribute("x2", nx.toFixed(1));
  document.getElementById("dial-needle").setAttribute("y2", ny.toFixed(1));

  const label = document.getElementById("dial-label");
  label.textContent = { high: "High", medium: "Medium", low: "Low" }[risk.level];
  label.style.color = colors[risk.level];
}

function renderTable(data) {
    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageData = data.slice(start, start + PAGE_SIZE);

    document.getElementById("table-count").textContent =
        `${total} record${total !== 1 ? "s" : ""}`;

    if (total === 0) {
        document.getElementById("table-body").innerHTML =
            `<tr><td colspan="4"><div class="empty-state"><p>No entries yet.</p></div></td></tr>`;
        document.getElementById("page-info").textContent = "";
        document.getElementById("page-btns").innerHTML = "";
        return;
    }

    document.getElementById("table-body").innerHTML = pageData
        .map((d) => {
            const risk = getRisk(d.date, d.rain_mm);
            return `<tr>
        <td>${formatDate(d.date)}</td>
        <td>${parseFloat(d.temp_c).toFixed(1)} °C</td>
        <td>${parseFloat(d.rain_mm).toFixed(2)} mm</td>
        <td><span class="badge ${risk.level}"><span class="badge-dot"></span>${riskLabel(risk.level)}</span></td>
      </tr>`;
        })
        .join("");

    document.getElementById("page-info").textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}`;

    const cont = document.getElementById("page-btns");
    cont.innerHTML = "";

    const prev = document.createElement("button");
    prev.className = "page-btn";
    prev.textContent = "←";
    prev.disabled = currentPage === 1;
    prev.onclick = () => {
        currentPage--;
        renderTable(allEntries);
    };
    cont.appendChild(prev);

    for (let i = 1; i <= totalPages; i++) {
        const b = document.createElement("button");
        b.className = "page-btn" + (i === currentPage ? " active" : "");
        b.textContent = i;
        b.onclick = ((pg) => () => {
            currentPage = pg;
            renderTable(allEntries);
        })(i);
        cont.appendChild(b);
    }

    const next = document.createElement("button");
    next.className = "page-btn";
    next.textContent = "→";
    next.disabled = currentPage === totalPages;
    next.onclick = () => {
        currentPage++;
        renderTable(allEntries);
    };
    cont.appendChild(next);
}

function renderProfile() {
    const o = currentOrg;
    const initials = o.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    document.getElementById("profile-avatar").textContent = initials;
    document.getElementById("profile-username").textContent = o.username;
    document.getElementById("profile-region").textContent = o.region || "—";
}

//FORM
function updatePreview() {
    const date = document.getElementById("form-date").value;
    const rain = document.getElementById("form-rain").value;
    const preview = document.getElementById("form-preview");
    if (!date || rain === "") {
        preview.classList.remove("visible");
        return;
    }
    const risk = getRisk(date, parseFloat(rain));
    preview.classList.add("visible");
    const rr = document.getElementById("preview-risk");
    rr.textContent = riskLabel(risk.level);
    rr.className = "form-preview-risk " + risk.level;
    document.getElementById("preview-pill").innerHTML =
        `<div class="risk-pill ${risk.level}"></div>${riskLabel(risk.level)}</div>`;
    document.getElementById("preview-reason").textContent = risk.reason;
}

async function submitEntry() {
    const date = document.getElementById("form-date").value;
    const temp = parseFloat(document.getElementById("form-temp").value);
    const rain = parseFloat(document.getElementById("form-rain").value);
    const successEl = document.getElementById("form-success");
    const errorEl = document.getElementById("form-error");
    const btn = document.getElementById("submit-btn");
    const btnTxt = document.getElementById("submit-btn-text");

    successEl.style.display = "none";
    errorEl.style.display = "none";
    if (!date || isNaN(temp) || isNaN(rain)) return;

    btn.disabled = true;
    btnTxt.textContent = "Saving…";

    const {
        data: { user },
    } = await sb.auth.getUser();
    const { error } = await sb.from("weather_entries").insert({
        org_id: user.id,
        date,
        temp_c: temp,
        rain_mm: rain,
    });

    btn.disabled = false;
    btnTxt.textContent = "Save entry";

    if (error) {
        errorEl.style.display = "block";
        return;
    }

    //refresh entries from DB
    const { data: entries } = await sb
        .from("weather_entries")
        .select("*")
        .eq("org_id", user.id)
        .order("date", { ascending: false });

    allEntries = entries || [];
    currentPage = 1;

    document.getElementById("form-date").value = "";
    document.getElementById("form-temp").value = "";
    document.getElementById("form-rain").value = "";
    document.getElementById("form-preview").classList.remove("visible");
    successEl.style.display = "block";
    setTimeout(() => {
        successEl.style.display = "none";
    }, 3000);

    renderDashboard();
}

//UTILS
function showPanel(id, btn) {
    document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.remove("active"));
    document
        .querySelectorAll(".nav-tab")
        .forEach((t) => t.classList.remove("active"));
    document.getElementById("panel-" + id).classList.add("active");
    btn.classList.add("active");
}

function formatDate(str) {
    const d = new Date(str + "T00:00:00");
    return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

//START
boot();
