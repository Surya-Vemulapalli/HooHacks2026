const API_BASE = "/api";

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

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = $("loginForm");
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

setInterval(() => {
    if ($("dashboard-section").style.display === 'block') {
        loadDashboard();
    }
}, 30_000);

// ── Chat Widget ────────────────────────────────────────────────────────────

const chatWidget      = document.getElementById("chat-widget");
const chatPanel       = document.getElementById("chat-panel");
const chatToggleBtn   = document.getElementById("chat-toggle");
const chatMessages    = document.getElementById("chat-messages");
const chatInput       = document.getElementById("chat-input");
const chatSendBtn     = document.getElementById("chat-send");
const chatClearBtn    = document.getElementById("chat-clear");
const chatMinimizeBtn = document.getElementById("chat-minimize");
const chatBadge       = document.getElementById("chat-badge");
const chatSuggestions = document.getElementById("chat-suggestions");

let chatHistory  = [];   // [{role, content}]
let chatOpen     = false;
let chatMinimized = false;

// Toggle open/close
chatToggleBtn.addEventListener("click", () => {
  chatOpen = !chatOpen;
  chatWidget.classList.toggle("open", chatOpen);
  chatPanel.hidden = !chatOpen;
  if (chatOpen) {
    chatBadge.hidden = true;
    // Restore if was minimized
    chatPanel.classList.remove("minimized");
    chatWidget.classList.remove("minimized");
    chatMinimized = false;
    chatInput.focus();
    scrollToBottom();
  }
});

// Drag to reposition
(function () {
  const header = chatWidget.querySelector(".chat-header");
  let dragging = false, startX, startY, startLeft, startTop;

  header.addEventListener("mousedown", (e) => {
    // Don't drag when clicking buttons inside the header
    if (e.target.closest("button")) return;

    dragging = true;
    const rect = chatWidget.getBoundingClientRect();

    // Switch from bottom/right to top/left so we can move freely
    chatWidget.style.left   = rect.left + "px";
    chatWidget.style.top    = rect.top  + "px";
    chatWidget.style.right  = "auto";
    chatWidget.style.bottom = "auto";

    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = rect.left;
    startTop  = rect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const newLeft = Math.max(0, Math.min(window.innerWidth  - chatWidget.offsetWidth,  startLeft + dx));
    const newTop  = Math.max(0, Math.min(window.innerHeight - chatWidget.offsetHeight, startTop  + dy));

    chatWidget.style.left = newLeft + "px";
    chatWidget.style.top  = newTop  + "px";
  });

  document.addEventListener("mouseup", () => { dragging = false; });
})();

// Minimize / maximize
function setMinimized(state) {
  chatMinimized = state;
  chatPanel.classList.toggle("minimized", chatMinimized);
  chatWidget.classList.toggle("minimized", chatMinimized);
  if (!chatMinimized) {
    chatInput.focus();
    scrollToBottom();
  }
}

chatMinimizeBtn.addEventListener("click", () => setMinimized(!chatMinimized));

// Clicking the header while minimized restores the panel
chatWidget.querySelector(".chat-header").addEventListener("click", (e) => {
  if (chatMinimized && !e.target.closest("button")) setMinimized(false);
});

// Clear conversation
chatClearBtn.addEventListener("click", () => {
  chatHistory = [];
  chatMessages.innerHTML = `
    <div class="chat-msg bot">
      <span class="msg-bubble">
        Conversation cleared. Ask me anything about plant health, diseases, or sustainability!
      </span>
    </div>`;
  chatSuggestions.innerHTML = `
    <button class="chip">Why are my leaves yellowing?</button>
    <button class="chip">Sustainable pest control tips</button>
    <button class="chip">Ideal temperature for growth</button>
    <button class="chip">Signs of root rot</button>`;
  chatSuggestions.hidden = false;
});

// Suggestion chips
chatSuggestions.addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  chatInput.value = chip.textContent;
  chatSuggestions.hidden = true;
  sendMessage();
});

// Send on Enter (Shift+Enter = newline)
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
chatSendBtn.addEventListener("click", sendMessage);

// Auto-grow textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatBotText(text) {
  // Escape HTML, then convert **bold** to <b>bold</b>
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "$1");  // strip single asterisks (italics)
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  const bubble = document.createElement("span");
  bubble.className = "msg-bubble";
  if (role === "bot") {
    bubble.innerHTML = formatBotText(text);
  } else {
    bubble.textContent = text;
  }
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  scrollToBottom();
  return div;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "chat-msg bot";
  div.id = "typing-indicator";
  div.innerHTML = `
    <span class="msg-bubble typing-dots">
      <span></span><span></span><span></span>
    </span>`;
  chatMessages.appendChild(div);
  scrollToBottom();
}

function removeTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

// Build plant context from current dashboard state
function buildPlantContext() {
  const plantId = $("plant-select")?.value;
  if (!plantId) return null;

  // Pull values from stat cards if populated
  const avgTemp  = parseFloat($("stat-temp")?.textContent);
  const avgLight = parseFloat($("stat-light")?.textContent);
  const avgDef   = parseFloat($("stat-def")?.textContent);

  const summary = {};
  if (!isNaN(avgTemp))  summary.avg_temp      = avgTemp;
  if (!isNaN(avgLight)) summary.avg_light     = avgLight;
  if (!isNaN(avgDef))   summary.avg_deformity = avgDef;

  return { plant_id: plantId, summary };
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatSuggestions.hidden = true;
  chatInput.value = "";
  chatInput.style.height = "auto";
  chatSendBtn.disabled = true;

  appendMessage("user", text);
  showTyping();

  // Show badge if panel is closed
  if (!chatOpen) {
    chatBadge.hidden = false;
  }

  try {
    const body = {
      message:       text,
      history:       chatHistory,
      plant_context: buildPlantContext(),
    };

    const res = await fetch(`${API_BASE}/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      appendMessage("bot", `Sorry, something went wrong: ${data.error}`);
    } else {
      appendMessage("bot", data.reply);
      chatHistory = data.history;
      if (data.suggestions && data.suggestions.length) {
        chatSuggestions.innerHTML = data.suggestions
          .map(s => `<button class="chip">${s}</button>`)
          .join("");
        chatSuggestions.hidden = false;
      }
    }
  } catch (e) {
    removeTyping();
    appendMessage("bot", "Could not reach the server. Please check your connection.");
  } finally {
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const username = $("username").value;
    const password = $("password").value;
    const errorMsg = $("login-error");

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // 1. Hide Login, Show Dashboard
            $("login-section").style.display = 'none';
            $("dashboard-section").style.display = 'block';
            
            // 2. Show the Chat Widget (it was hidden by default)
            $("chat-widget").style.display = 'block';

            // 3. Start the data engine
            loadPlants(); 
            // This calls your existing loadPlants() which then calls loadDashboard()
        } else {
            errorMsg.textContent = data.error || "Invalid login";
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error("Login Error:", err);
        errorMsg.textContent = "Server connection failed.";
        errorMsg.style.display = 'block';
    }
}