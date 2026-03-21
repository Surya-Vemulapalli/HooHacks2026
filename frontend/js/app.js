const API_BASE = "http://localhost:5000/api";

let tempChart, lightChart, deformityChart;

// ── Utilities ──────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function fmtNum(v, dec = 1) {
  return v == null ? "—" : Number(v).toFixed(dec);
}

function statusClass(status) {
  return `status-${status || "unknown"}`;
}

// Animate a number counting up to its target value
function countUp(el, target, dec = 1, duration = 600) {
  if (target == null || isNaN(target)) { el.textContent = "—"; return; }
  const start = parseFloat(el.textContent) || 0;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = (start + (target - start) * eased).toFixed(dec);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Show skeleton shimmer on all stat value elements
function showSkeletons() {
  ["stat-temp","stat-light","stat-def","stat-count"].forEach(id => {
    const el = $(id);
    el.textContent = "\u00a0\u00a0\u00a0\u00a0"; // non-breaking spaces for width
    el.classList.add("skeleton");
  });
}

function clearSkeletons() {
  ["stat-temp","stat-light","stat-def","stat-count"].forEach(id => {
    $(id).classList.remove("skeleton");
  });
}

function setLastUpdated() {
  const el = $("last-updated");
  if (!el) return;
  const now = new Date();
  el.textContent = `Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
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

  showSkeletons();

  const [readingsRes, summaryRes] = await Promise.all([
    fetch(`${API_BASE}/analytics/readings/${plantId}?limit=100`),
    fetch(`${API_BASE}/analytics/summary/${plantId}?hours=24`),
  ]);

  const { readings } = await readingsRes.json();
  const { summary }  = await summaryRes.json();

  clearSkeletons();
  updateStats(summary);
  renderCharts(readings.reverse()); // oldest first for charts
  setLastUpdated();
}

function updateStats(s) {
  countUp($("stat-temp"),  s.avg_temp,      1);
  countUp($("stat-light"), s.avg_light,     0, 500);
  countUp($("stat-def"),   s.avg_deformity, 2);
  countUp($("stat-count"), s.reading_count, 0, 400);
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
        backgroundColor: color + "18",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(27,67,50,.92)",
          titleFont: { size: 11 },
          bodyFont: { size: 12, weight: "600" },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 }, color: "#6b7c6b" },
          grid: { color: "rgba(0,0,0,.04)" },
        },
        y: {
          beginAtZero: false,
          ticks: { font: { size: 10 }, color: "#6b7c6b" },
          grid: { color: "rgba(0,0,0,.04)" },
        },
      },
      interaction: { mode: "index", intersect: false },
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

  const temps       = readings.map(r => r.temperature);
  const lights      = readings.map(r => r.light_level);
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

  const btn     = $("analyze-btn");
  const content = $("gemini-content");

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Analyzing…`;

  // Fade out existing content
  content.classList.add("fading");
  await new Promise(r => setTimeout(r, 200));

  try {
    const res = await fetch(`${API_BASE}/recommendations/${plantId}`);
    const { analysis } = await res.json();
    renderAnalysis(analysis);
  } catch (e) {
    content.innerHTML =
      `<p class="placeholder">Failed to fetch analysis. Check backend connection.</p>`;
  } finally {
    content.classList.remove("fading");
    btn.disabled = false;
    btn.textContent = "Run AI Analysis";
  }
}

function renderAnalysis(a) {
  const score  = a.health_score != null ? a.health_score : "—";
  const cls    = statusClass(a.status);
  const recs   = (a.recommendations || [])
    .map(r => `<li>${r}</li>`).join("") || "<li>No recommendations.</li>";
  const alerts = (a.alerts || [])
    .map(al => `<li>${al}</li>`).join("");

  $("gemini-content").innerHTML = `
    <div class="health-score ${cls}">${score}<span style="font-size:1rem;font-weight:400;opacity:.6"> / 100</span></div>
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

setInterval(loadDashboard, 30_000);
