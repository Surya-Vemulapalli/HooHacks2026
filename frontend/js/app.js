const API_BASE = "http://localhost:5000/api";

// Chart instances (kept so we can destroy & redraw)
let tempChart, lightChart, deformityChart;

// ── Utilities ──────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function fmtNum(v, dec = 1) {
  return v == null ? "—" : Number(v).toFixed(dec);
}

function statusClass(status) {
  return `status-${status || "unknown"}`;
}

// ── Plant list ─────────────────────────────────────────────────────────────

async function loadPlants() {
  try {
    const res = await fetch(`${API_BASE}/sensor/plants`);
    const plants = await res.json();
    const sel = $("plant-select");
    sel.innerHTML = plants.length
      ? plants.map(p => `<option value="${p.plant_id}">${p.plant_id}</option>`).join("")
      : `<option value="">— no plants yet —</option>`;
    if (plants.length) loadDashboard();
  } catch (e) {
    console.error("Failed to load plants", e);
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────────

async function loadDashboard() {
  const plantId = $("plant-select").value;
  if (!plantId) return;

  const [readingsRes, summaryRes] = await Promise.all([
    fetch(`${API_BASE}/analytics/readings/${plantId}?limit=100`),
    fetch(`${API_BASE}/analytics/summary/${plantId}?hours=24`),
  ]);

  const { readings } = await readingsRes.json();
  const { summary }  = await summaryRes.json();

  updateStats(summary);
  renderCharts(readings.reverse()); // oldest first for charts
}

function updateStats(s) {
  $("stat-temp").textContent   = fmtNum(s.avg_temp);
  $("stat-light").textContent  = fmtNum(s.avg_light, 0);
  $("stat-def").textContent    = fmtNum(s.avg_deformity, 2);
  $("stat-count").textContent  = s.reading_count ?? "—";
}

// ── Charts ─────────────────────────────────────────────────────────────────

function mkChart(canvasId, label, color, data, labels) {
  const ctx = $(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color + "22",
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { beginAtZero: false },
      },
    },
  });
}

function renderCharts(readings) {
  if (!readings || readings.length === 0) {
    ["temp-chart","light-chart","deformity-chart"].forEach(id => {
      const ctx = $(id).getContext("2d");
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    });
    return;
  }

  const labels = readings.map(r => {
    const d = new Date(r.recorded_at);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
  });

  const temps      = readings.map(r => r.temperature);
  const lights     = readings.map(r => r.light_level);
  const deformities = readings.map(r => r.deformity_score);

  if (tempChart)      tempChart.destroy();
  if (lightChart)     lightChart.destroy();
  if (deformityChart) deformityChart.destroy();

  tempChart      = mkChart("temp-chart",      "Temperature (°C)",  "#2d6a4f", temps,       labels);
  lightChart     = mkChart("light-chart",     "Light Level (lux)", "#f4a261", lights,      labels);
  deformityChart = mkChart("deformity-chart", "Deformity Score",   "#e63946", deformities, labels);
}

// ── Gemini Analysis ────────────────────────────────────────────────────────

async function runAnalysis() {
  const plantId = $("plant-select").value;
  if (!plantId) return;

  const btn = $("analyze-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Analyzing…`;

  try {
    const res = await fetch(`${API_BASE}/recommendations/${plantId}`);
    const { analysis } = await res.json();
    renderAnalysis(analysis);
  } catch (e) {
    $("gemini-content").innerHTML =
      `<p class="placeholder">Failed to fetch analysis. Check backend connection.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Run AI Analysis";
  }
}

function renderAnalysis(a) {
  const score   = a.health_score != null ? a.health_score : "—";
  const cls     = statusClass(a.status);
  const recs    = (a.recommendations || [])
    .map(r => `<li>${r}</li>`).join("") || "<li>No recommendations.</li>";
  const alerts  = (a.alerts || [])
    .map(al => `<li>${al}</li>`).join("");

  $("gemini-content").innerHTML = `
    <div class="health-score ${cls}">${score}<span style="font-size:1rem;font-weight:400"> / 100</span></div>
    <p class="ai-summary">${a.summary || ""}</p>
    ${alerts ? `<h4>Alerts</h4><ul class="alert-list">${alerts}</ul>` : ""}
    <h4>Recommendations</h4>
    <ul class="rec-list">${recs}</ul>
  `;
}

// ── Init ───────────────────────────────────────────────────────────────────

$("plant-select").addEventListener("change", loadDashboard);
$("refresh-btn").addEventListener("click", loadDashboard);
$("analyze-btn").addEventListener("click", runAnalysis);

loadPlants();

// Auto-refresh every 30 seconds
setInterval(loadDashboard, 30_000);
