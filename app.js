const STATE = {
  lat: 29.715,
  lon: 120.242,
  tz: 'Asia/Shanghai',
  displayDays: 3,
  pullStartY: null,
  refreshing: false,
};

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function weatherCodeInfo(code, isDay = true) {
  const map = {
    0: isDay ? '☀️ 晴' : '🌙 晴',
    1: '🌤 大部晴',
    2: '⛅ 多云',
    3: '☁️ 阴',
    45: '🌫 雾',
    48: '🌫 雾凇',
    51: '🌦 小毛毛雨',
    53: '🌦 毛毛雨',
    55: '🌧 毛毛雨',
    56: '🌧 冻毛毛雨',
    57: '🌧 强冻毛毛雨',
    61: '🌧 小雨',
    63: '🌧 中雨',
    65: '🌧 大雨',
    66: '🌧 冻雨',
    67: '🌧 强冻雨',
    71: '🌨 小雪',
    73: '🌨 中雪',
    75: '🌨 大雪',
    77: '🌨 雪粒',
    80: '🌦 小阵雨',
    81: '🌧 阵雨',
    82: '⛈ 强阵雨',
    85: '🌨 小阵雪',
    86: '🌨 大阵雪',
    95: '⛈ 雷暴',
    96: '⛈ 雷暴+小冰雹',
    99: '⛈ 雷暴+大冰雹',
  };
  return map[code] || `🌡 ${code}`;
}

function fmtHour(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { timeZone: STATE.tz, hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { timeZone: STATE.tz, month: 'short', day: 'numeric', weekday: 'short' });
}

function pvEstimate(ghi, tempC) {
  const systemCapacityKw = 10;
  const baseEfficiency = 0.18;
  const tempCoeff = -0.004;
  const performanceRatio = 0.76;
  const cellTemp = tempC == null ? 25 : Math.min(45, Math.max(-5, tempC + 8));
  const eta = baseEfficiency * (1 + tempCoeff * (cellTemp - 25));
  const safeEta = Math.max(0.02, eta);
  const kwh = (ghi / 1000) * systemCapacityKw * safeEta * performanceRatio;
  return {
    kwh: Math.round(kwh * 10) / 10,
    ghi,
    cellTemp: Math.round(cellTemp * 10) / 10,
    eta: Math.round(safeEta * 1000) / 10,
  };
}

function rainChips(items) {
  const el = $('#rain-' + items.id);
  if (!el) return;
  el.innerHTML = '';
  const list = items.data || [];
  if (!list.length) {
    el.innerHTML = '<span class="chip">降雨概率低</span>';
    return;
  }
  list.forEach((item) => {
    const span = document.createElement('span');
    span.className = 'chip' + (item.level === 'high' ? ' danger' : item.level === 'mid' ? ' warn' : '');
    span.textContent = item.label;
    el.appendChild(span);
  });
}

function sunriseSummary(items) {
  const id = items.id;
  const data = items.data;
  document.getElementById('sunrise-' + id).textContent = fmtHour(data.sunrise);
  document.getElementById('weather-' + id).textContent = weatherCodeInfo(data.code, true);
  document.getElementById('pop-' + id).textContent = data.pop == null ? '--' : data.pop + '%';
  document.getElementById('cloud-' + id).textContent = data.cloud == null ? '--' : data.cloud + '%';
  rainChips({ id, data: data.rainItems });
}

function buildHourly(hours) {
  const el = $('#hourly-list');
  el.innerHTML = '';
  hours.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'hour-card';
    card.innerHTML = `
      <div class="hour-time">${fmtHour(item.time)}</div>
      <div class="hour-icon">${weatherCodeInfo(item.code, item.isDay)}</div>
      <div class="hour-temp">${item.temp ?? '--'}°</div>
      <div class="hour-detail">💧${item.pop ?? '--'}%</div>
      <div class="hour-detail">☁️${item.cloud ?? '--'}%</div>
      <div class="hour-detail">${item.rad == null ? '--' : item.rad + ' W/m²'}</div>
    `;
    el.appendChild(card);
  });
}

function buildDaily(days) {
  const el = $('#daily-list');
  el.innerHTML = '';
  days.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <div class="day-header">${fmtDate(item.time)}</div>
      <div class="day-temp">${item.tempMin ?? '--'}° / ${item.tempMax ?? '--'}°</div>
      <div class="day-meta">降雨 ${item.precipSum ?? '--'} mm</div>
      <div class="day-meta">最大概率 ${item.popMax ?? '--'}%</div>
      <div class="day-meta">☁️ ${item.cloudMean ?? '--'}%</div>
      <div class="day-meta">🌅 ${fmtHour(item.sunrise)} · 🌇 ${fmtHour(item.sunset)}</div>
    `;
    el.appendChild(card);
  });
}

async function fetchOpenMeteo() {
  const params = new URLSearchParams({
    latitude: STATE.lat,
    longitude: STATE.lon,
    timezone: STATE.tz,
    forecast_days: STATE.displayDays,
    hourly: [
      'temperature_2m','relative_humidity_2m','apparent_temperature',
      'precipitation_probability','precipitation','cloud_cover','shortwave_radiation','weather_code'
    ].join(','),
    daily: [
      'temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max',
      'wind_speed_10m_max','cloud_cover_mean','sunrise','sunset'
    ].join(','),
    wind_speed_unit: 'kmh',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/ecmwf?${params.toString()}`);
  if (!res.ok) throw new Error('Open-Meteo 请求失败：' + res.status);
  return res.json();
}

function dayWindowFor(dateStr) {
  const start = new Date(`${dateStr}T00:00:00${timezoneOffsetSuffix()}`);
  const end = new Date(`${dateStr}T23:59:59${timezoneOffsetSuffix()}`);
  return { start, end };
}

function timezoneOffsetSuffix() {
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n) / 60)).padStart(2, '0') + ':' + String(Math.abs(n) % 60).padStart(2, '0');
  return `${sign}${pad(offset)}`;
}

function closestDailyIndex(dailies, targetDate) {
  let best = -1;
  let bestDist = Infinity;
  dailies.time.forEach((t, idx) => {
    const dist = Math.abs(new Date(t) - new Date(targetDate));
    if (dist < bestDist) { bestDist = dist; best = idx; }
  });
  return best;
}

function chooseNearestHours(hours, centerIso, radiusHours = 2) {
  if (!hours || !hours.time || !hours.time.length) return [];
  const center = new Date(centerIso).getTime();
  const out = [];
  hours.time.forEach((t, idx) => {
    const diffH = (new Date(t).getTime() - center) / 3600000;
    if (Math.abs(diffH) <= radiusHours + 0.5) out.push({ t, idx, diffH });
  });
  out.sort((a, b) => Math.abs(a.diffH) - Math.abs(b.diffH));
  const seen = new Set();
  const selected = [];
  for (const row of out) {
    if (seen.has(row.idx)) continue;
    seen.add(row.idx);
    selected.push(row);
  }
  selected.sort((a, b) => a.t.localeCompare(b.t));
  return selected.map(({ t, idx }) => {
    const item = { time: t };
    for (const key of Object.keys(hours)) item[key] = hours[key][idx];
    return item;
  });
}

function buildRainItems(items) {
  const out = [];
  for (const item of items) {
    const pop = item.pop || 0;
    if (pop >= 60) out.push({ label: `${fmtHour(item.time)} 降雨${pop}%`, level: 'high' });
    else if (pop >= 30) out.push({ label: `${fmtHour(item.time)} 降雨${pop}%`, level: 'mid' });
  }
  return out;
}

function summarizeSunriseBlock(hours, dateStr) {
  const sunriseIso = closestSunriseIso(hours, dateStr);
  const focused = chooseNearestHours(hours, sunriseIso, 3);
  const sun = focused.find((row) => Math.abs(new Date(row.time) - new Date(sunriseIso)) < 3600000) || focused[0];
  const codes = focused.map((row) => row.weather_code).filter((v) => v != null);
  const pops = focused.map((row) => row.precipitation_probability).filter((v) => v != null);
  const clouds = focused.map((row) => row.cloud_cover).filter((v) => v != null);
  const max = (arr) => arr.length ? Math.max(...arr) : null;
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const radMax = Math.max(...focused.map((row) => row.shortwave_radiation || 0));
  return {
    sunrise: sunriseIso,
    code: codes.length ? codes[Math.floor(codes.length / 2)] : null,
    pop: max(pops),
    cloud: avg(clouds),
    rainItems: buildRainItems(focused),
    rad: Math.round(radMax),
    temp: sun && sun.temperature_2m != null ? Math.round(sun.temperature_2m) : null,
  };
}

function closestSunriseIso(hours, dateStr) {
  const tokens = hours.time.map((t) => {
    const d = new Date(t);
    return {
      time: t,
      day: d.toLocaleDateString('en-CA', { timeZone: STATE.tz }),
      hour: +d.toLocaleTimeString('en-GB', { timeZone: STATE.tz, hour: '2-digit', hour12: false }),
    };
  });
  const sameDay = tokens.filter((t) => t.day === dateStr);
  if (!sameDay.length) return hours.time[0];
  const targetHour = 5;
  const best = sameDay.reduce((prev, curr) => {
    const prevScore = Math.abs(prev.hour - targetHour);
    const currScore = Math.abs(curr.hour - targetHour);
    return currScore < prevScore ? curr : prev;
  });
  return best.time;
}

function buildChart(dataset) {
  const ctx = $('#sunrise-chart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: dataset.map((item) => fmtHour(item.time)),
      datasets: [
        { label: '短波辐射 W/m²', data: dataset.map((item) => item.shortwave_radiation), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.12)', fill: true, tension: 0.35, yAxisID: 'y' },
        { label: '云量 %', data: dataset.map((item) => item.cloud_cover), borderColor: '#2a6fe0', backgroundColor: 'rgba(42,111,224,0.10)', fill: true, tension: 0.35, yAxisID: 'y1' },
        { label: '降雨概率 %', data: dataset.map((item) => item.precipitation_probability), borderColor: '#16a34a', borderDash: [6, 4], tension: 0.35, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkipPadding: 14, color: '#4f6677' }, grid: { display: false } },
        y: { position: 'left', title: { display: true, text: 'W/m²', color: '#b45309' }, grid: { color: '#e8eef4' }, ticks: { color: '#8c6a1d' } },
        y1: { position: 'right', min: 0, max: 100, title: { display: true, text: '%', color: '#1f4fb6' }, grid: { display: false }, ticks: { color: '#1f4fb6' } },
      },
      plugins: {
        legend: { labels: { color: '#061420', boxWidth: 12, padding: 14 } },
        tooltip: { backgroundColor: '#042231', titleColor: '#eafff5', bodyColor: '#eafff5', padding: 10, cornerRadius: 12, displayColors: true },
      },
    },
  });
}

async function load() {
  $('#weather-updated').textContent = '更新中...';
  try {
    const data = await fetchOpenMeteo();
    const hourly = data.hourly || {};
    const daily = data.daily || {};
    const today = new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz });
    const tomorrowObj = new Date(new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz }));
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrow = tomorrowObj.toLocaleDateString('en-CA', { timeZone: STATE.tz });
    const todayIdx = closestDailyIndex(daily, today);
    const tomorrowIdx = closestDailyIndex(daily, tomorrow);

    const todaySummary = summarizeSunriseBlock(hourly, today);
    const tomorrowSummary = summarizeSunriseBlock(hourly, tomorrow);

    sunriseSummary({ id: 'today', data: todaySummary });
    sunriseSummary({ id: 'tomorrow', data: tomorrowSummary });

    const pv = pvEstimate(todaySummary.rad || 0, todaySummary.temp || 25);
    $('#pv-kwh').textContent = pv.kwh.toFixed(1) + ' kWh';
    $('#pv-ghi').textContent = pv.ghi + ' W/m²';
    $('#pv-temp').textContent = pv.cellTemp + '°C';
    $('#pv-peak').textContent = todaySummary.rad ? fmtHour(todaySummary.sunrise).slice(0, 5) + ' 前后' : '--';

    buildChart(chooseNearestHours(hourly, todaySummary.sunrise, 5));
    buildHourly(chooseNearestHours(hourly, new Date().toISOString(), 24));
    buildDaily((daily.time || []).slice(0, STATE.displayDays).map((time, idx) => ({
      time,
      tempMin: daily.temperature_2m_min?.[idx],
      tempMax: daily.temperature_2m_max?.[idx],
      precipSum: daily.precipitation_sum?.[idx],
      popMax: daily.precipitation_probability_max?.[idx],
      cloudMean: daily.cloud_cover_mean?.[idx],
      sunrise: daily.sunrise?.[idx],
      sunset: daily.sunset?.[idx],
    })));

    $('#weather-updated').textContent = '更新于 ' + fmtHour(new Date().toISOString());
    toast('已刷新');
  } catch (err) {
    console.error(err);
    $('#weather-updated').textContent = '刷新失败，请下拉重试';
    toast('刷新失败');
  }
}

function initPullToRefresh() {
  let startY = 0;
  const app = $('#app');
  const preventDefault = (e) => {
    if (app.scrollTop === 0) e.preventDefault();
  };
  document.addEventListener('touchstart', (e) => {
    if (app.scrollTop === 0) startY = e.touches[0].clientY;
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (app.scrollTop === 0) preventDefault(e);
  }, { passive: false });
  document.addEventListener('touchend', (e) => {
    if (STATE.refreshing) return;
    if (app.scrollTop <= 4 && (e.changedTouches[0].clientY - startY) > 90) {
      STATE.refreshing = true;
      toast('正在刷新');
      load().finally(() => (STATE.refreshing = false));
    }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.addEventListener('DOMContentLoaded', () => {
  load();
  initPullToRefresh();
});
