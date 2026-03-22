const API_BASE = "/api";

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
