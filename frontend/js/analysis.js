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
