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

async function loadDashboard() {
  const plantId = $("plant-select").value;
  if (!plantId) return;

  showSkeletons();

  const [readingsRes, summaryRes] = await Promise.all([
    fetch(`/api/analytics/readings/${plantId}?limit=100`),
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
