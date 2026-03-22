let tempChart, lightChart, deformityChart;

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
