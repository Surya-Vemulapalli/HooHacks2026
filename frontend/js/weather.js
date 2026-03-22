async function loadWeather() {
  const container = $("weather-container");
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading forecast...</div>';

  const fetchWeatherData = async (lat, lon) => {
    try {
      let url = `${API_BASE}/weather/forecast`;
      if (lat && lon) {
        url += `?lat=${lat}&lon=${lon}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.error) {
        container.innerHTML = `<div class="placeholder">Error: ${data.error}</div>`;
        return;
      }

      window.currentWeatherData = data;
      renderWeather(data);
    } catch (err) {
      console.error("Failed to load weather:", err);
      container.innerHTML = `<div class="placeholder">Failed to connect to weather service.</div>`;
    }
  };

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchWeatherData(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.warn("Geolocation denied or error, using default location.");
        fetchWeatherData(null, null);
      },
      { timeout: 5000 }
    );
  } else {
    fetchWeatherData(null, null);
  }
}

function processForecast(list) {
  // Group by day
  const days = {};
  list.forEach(item => {
    const date = new Date(item.dt * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    if (!days[date]) {
      days[date] = { 
        temps: [], 
        rain: 0, 
        icon: item.weather[0].icon, 
        desc: item.weather[0].description,
        wind: []
      };
    }
    days[date].temps.push(item.main.temp);
    days[date].wind.push(item.wind.speed);
    if (item.rain && item.rain['3h']) {
      days[date].rain += item.rain['3h'];
    }
  });

  // Calculate aggregates
  return Object.keys(days).slice(0, 5).map(date => {
    const d = days[date];
    const maxTemp = Math.max(...d.temps);
    const minTemp = Math.min(...d.temps);
    return {
      date,
      maxTemp: maxTemp.toFixed(1),
      minTemp: minTemp.toFixed(1),
      rain: d.rain.toFixed(1),
      icon: d.icon,
      desc: d.desc,
      wind: Math.max(...d.wind).toFixed(1)
    };
  });
}

window.currentTempUnit = window.currentTempUnit || 'C';
window.setTempUnit = function(unit) {
  window.currentTempUnit = unit;
  if (window.currentWeatherData) {
    renderWeather(window.currentWeatherData);
  }
};

function formatTemp(tempC) {
  const t = parseFloat(tempC);
  if (window.currentTempUnit === 'F') {
    return ((t * 9/5) + 32).toFixed(1) + '°F';
  } else if (window.currentTempUnit === 'K') {
    return (t + 273.15).toFixed(1) + 'K';
  }
  return t.toFixed(1) + '°C';
}

function renderWeather(data) {
  const forecastDays = processForecast(data.list);
  const container = $("weather-container");
  const city = data.city.name;

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem;">
      <div>
        <h3 style="margin-bottom:0.5rem; font-size:1.5rem;">${city} Forecast</h3>
        <span class="subtitle">Next 5 days</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
        <div class="unit-toggle" style="display:flex; gap:0.25rem;">
          <button class="unit-btn ${window.currentTempUnit === 'C' ? 'active' : ''}" onclick="window.setTempUnit('C')">°C</button>
          <button class="unit-btn ${window.currentTempUnit === 'F' ? 'active' : ''}" onclick="window.setTempUnit('F')">°F</button>
          <button class="unit-btn ${window.currentTempUnit === 'K' ? 'active' : ''}" onclick="window.setTempUnit('K')">K</button>
        </div>
        <button class="modern-grad-btn" id="analyze-weather-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
          </svg>
          Analyze Weather Details
        </button>
      </div>
    </div>
    
    <div class="chart-card" style="margin-bottom: 2rem; position: relative; z-index: 1;">
      <h3>Local Precipitation Map (Live)</h3>
      <div id="precipitation-map" style="height: 350px; width: 100%; border-radius: 8px; z-index: 1;"></div>
    </div>

    <div class="weather-grid">
  `;

  forecastDays.forEach(day => {
    html += `
      <div class="weather-card">
        <div class="w-date">${day.date}</div>
        <img src="https://openweathermap.org/img/wn/${day.icon}@2x.png" alt="${day.desc}" />
        <div class="w-desc" style="text-transform: capitalize;">${day.desc}</div>
        <div class="w-temps">
          <span style="font-weight:bold; color:var(--text-1);">${formatTemp(day.maxTemp)}</span> 
          <span style="color:var(--text-3);">/ ${formatTemp(day.minTemp)}</span>
        </div>
        <div class="w-metrics">
          <span>💧 ${day.rain} mm</span>
          <span>💨 ${day.wind} m/s</span>
        </div>
      </div>
    `;
  });

  html += `</div>
    <div id="weather-ai-panel" class="weather-ai-panel" hidden>
        <h4><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;vertical-align:bottom;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>AI Precipitation & Risk Analysis</h4>
        <div id="weather-ai-content"><span class="spinner" style="margin-top:1rem;"></span>Analyzing risk factors...</div>
    </div>
  `;

  container.innerHTML = html;
  
  $("analyze-weather-btn").addEventListener("click", () => fetchWeatherAnalysis(forecastDays));
  renderPrecipitationMap(data);
}

let weatherMapInstance = null;

function renderPrecipitationMap(data) {
  const mapContainer = document.getElementById('precipitation-map');
  if (!mapContainer) return;
  
  if (window.weatherMapInstance) {
      window.weatherMapInstance.remove();
  }
  
  const lat = parseFloat(data.query_lat) || 38.0293;
  const lon = parseFloat(data.query_lon) || -78.4767;
  const apiKey = data.owm_api_key;

  window.weatherMapInstance = L.map('precipitation-map').setView([lat, lon], 10);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
  }).addTo(window.weatherMapInstance);

  // 1) OpenWeatherMap Precipitation Layers
  if (apiKey) {
      // Create separate layers for user control
      const precipitationLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
          maxZoom: 18,
          opacity: 0.7,
      });
      
      const cloudsLayer = L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
          maxZoom: 18,
          opacity: 0.8,
      });

      // US NEXRAD Live Radar Fallback
      const radarLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi", {
          layers: 'nexrad-n0r-900913',
          format: 'image/png',
          transparent: true,
          opacity: 0.6
      });

      // Default layers to add immediately
      precipitationLayer.addTo(window.weatherMapInstance);
      cloudsLayer.addTo(window.weatherMapInstance);
      radarLayer.addTo(window.weatherMapInstance);

      // Add a layer control so the user can literally toggle the cloudiness / rain / radar overlays on the map itself
      const overlays = {
          "Cloudiness": cloudsLayer,
          "Precip Forecast": precipitationLayer,
          "Live Radar": radarLayer
      };
      
      L.control.layers(null, overlays, { collapsed: false }).addTo(window.weatherMapInstance);
  } else {
      L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi", {
          layers: 'nexrad-n0r-900913',
          format: 'image/png',
          transparent: true,
          opacity: 0.6
      }).addTo(window.weatherMapInstance);
  }

  L.marker([lat, lon]).addTo(window.weatherMapInstance)
      .bindPopup('<b>Current Focus Area</b><br>Weather localized here.')
      .openPopup();
}

async function fetchWeatherAnalysis(forecastDays) {
  const panel = $("weather-ai-panel");
  const content = $("weather-ai-content");
  
  panel.hidden = false;
  content.innerHTML = '<span class="spinner" style="vertical-align:middle;margin-right:8px;"></span>Analyzing weather impact on current plant cohort...';
  $("analyze-weather-btn").disabled = true;

  try {
    const res = await fetch(`${API_BASE}/recommendations/weather`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forecast: forecastDays })
    });
    
    if(!res.ok) throw new Error("Analysis failed");
    
    const data = await res.json();
    
    // Strip any residual markdown just in case the AI ignores instructions
    const cleanAnalysis = (data.analysis || "").replace(/[*#`_]/g, '');
    const cleanRisks = (data.risks || []).map(r => r.replace(/[*#`_]/g, ''));
    
    content.innerHTML = `
      <div style="margin-top:0.5rem;">
        <p style="line-height:1.6; margin-bottom:1rem;">${cleanAnalysis}</p>
        ${cleanRisks.length > 0 ? `
          <strong>Identified Risks:</strong>
          <ul class="rec-list" style="margin-top:0.5rem">
            ${cleanRisks.map(r => `<li>${r}</li>`).join("")}
          </ul>
        ` : '<strong>No severe risks identified.</strong>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = '<span style="color:var(--red);">Failed to generate AI weather analysis. Ensure backend supports /recommendations/weather POST.</span>';
  } finally {
    $("analyze-weather-btn").disabled = false;
  }
}
