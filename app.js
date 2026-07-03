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
    el.innerHTML = '<span class="chip"><span class="chip-dot"></span>日出前后无显著降雨</span>';
    return;
  }
  list.forEach((item) => {
    const span = document.createElement('span');
    span.className = 'chip alert-chip ' + (item.level === 'high' ? 'danger' : 'warn');
    span.innerHTML = '<span class="chip-dot"></span>' + item.label;
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
  hours.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'hour-card' + (idx === Math.floor(hours.length / 2) ? ' sunrise-hour' : '');
    card.innerHTML = `
      <div class="hour-time">${fmtHour(item.time)}</div>
      <div class="hour-icon">${weatherCodeInfo(item.code, item.isDay)}</div>
      <div class="hour-temp">${item.temp ?? '--'}°</div>
      <div class="hour-detail">💧${item.pop ?? '--'}%</div>
      <div class="hour-detail">☁️${item.cloud ?? '--'}%</div>
      <div class="hour-detail">${item.rad == null ? '--' : item.rad + ' W/m²'}</div>
      <div class="hour-label">${idx === Math.floor(hours.length / 2) ? '重点' : ''}</div>
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

function renderDailySolarCards(solcastDays, dailyMeta) {
  const el = $('#solar-daily');
  if (!el) return;
  el.innerHTML = '';
  dailyMeta.forEach((item, idx) => {
    const solar = solcastDays[idx];
    const card = document.createElement('div');
    card.className = 'solar-card';
    card.innerHTML = `
      <div class="day-header">${fmtDate(item.time)} 光伏参考</div>
      <div class="day-temp">${solar ? solar.pvEstimate?.toFixed(1) + ' kWh' : '待 Solcast'}</div>
      <div class="day-meta">参考峰值 ${solar?.pvPeakRadiance ? Math.round(solar.pvPeakRadiance) + ' W/m²' : '待 Solcast'}</div>
      <div class="day-sun"><span>🌅 ${fmtHour(item.sunrise)}</span><span>🌇 ${fmtHour(item.sunset)}</span></div>
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

async function fetchSolcast() {
  const apiKey = getSolcastKey();
  if (!apiKey) {
    $('#solar-source').textContent = '未输入 API Key';
    $('#solar-refresh-status').textContent = '请点击右上角设置 Solcast API Key';
    return null;
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz });
  const tomorrowObj = new Date(new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz }));
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrow = tomorrowObj.toLocaleDateString('en-CA', { timeZone: STATE.tz });
  const params = new URLSearchParams({
    format: 'json',
    api_key: apiKey,
    latitude: STATE.lat,
    longitude: STATE.lon,
    capacity: 10,
    azimuth: 0,
    tilt: 0,
    installation_type: 'ground',
    loss_factor: 14,
    hours: 24,
    forecast_days: 2,
    energy: 'kwh',
  });
  const res = await fetch('https://api.solcast.com.au/rooftop_sites/forecasts?' + params.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('Solcast API error', res.status, text.slice(0, 200));
    const errText = 'API ' + res.status;
    $('#solar-source').textContent = '光伏数据异常';
    $('#solar-refresh-status').textContent = errText;
    return { error: errText };
  }
  const payload = await res.json().catch(() => ({}));
  const grouped = groupSolcastForecasts(payload);
  const todayEstimate = grouped[today]?.kwh;
  const tomorrowEstimate = grouped[tomorrow]?.kwh;
  const todayRadiance = grouped[today]?.radianceMax ?? null;
  const tomorrowRadiance = grouped[tomorrow]?.radianceMax ?? null;
  $('#solar-source').textContent = 'Solcast 参考';
  $('#solar-refresh-status').textContent = '已刷新';
  return {
    today: {
      pv_estimate: todayEstimate,
      pv_peak: todayRadiance ? '峰值 ' + Math.round(todayRadiance) + ' W/m²' : '今日峰值',
    },
    tomorrow: {
      pv_estimate: tomorrowEstimate,
      pv_peak: tomorrowRadiance ? '峰值 ' + Math.round(tomorrowRadiance) + ' W/m²' : '明日峰值',
    },
    daily: Object.keys(grouped).slice(0, 3).map((dateStr) => ({
      time: dateStr + 'T00:00:00Z',
      pvEstimate: grouped[dateStr]?.kwh,
      pvPeakRadiance: grouped[dateStr]?.radianceMax,
    })),
  };
}

function getSolcastKey() {
  try { return localStorage.getItem('solcast_api_key') || ''; } catch { return ''; }
}
function setSolcastKey(key) {
  try { localStorage.setItem('solcast_api_key', key); } catch {}
}
function removeSolcastKey() {
  try { localStorage.removeItem('solcast_api_key'); } catch {}
}

function groupSolcastForecasts(payload) {
  const out = {};
  const period = (payload?.forecasts || []);
  period.forEach((item) => {
    const dateStr = item.period_end?.slice(0, 10);
    if (!dateStr) return;
    if (!out[dateStr]) out[dateStr] = { kwh: 0, radianceMax: item.ghi ?? item.gti ?? null };
    if (item.pv_estimate != null) out[dateStr].kwh += item.pv_estimate / 1000;
    const rad = item.ghi ?? item.gti ?? item.dni ?? 0;
    if (rad && (out[dateStr].radianceMax == null || rad > out[dateStr].radianceMax)) out[dateStr].radianceMax = rad;
  });
  return out;
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
    id: dateStr === new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz }) ? 'today' : 'tomorrow',
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
  const chartEl = $('#sunrise-chart');
  if (!chartEl) return;
  if (chartEl._chart) chartEl._chart.destroy();
  const ctx = chartEl.getContext('2d');
  chartEl._chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dataset.map((item) => fmtHour(item.time)),
      datasets: [
        { label: '短波辐射 W/m²', data: dataset.map((item) => item.shortwave_radiation), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.18)', fill: true, tension: 0.35, yAxisID: 'y', order: 1 },
        { label: '云量 %', data: dataset.map((item) => item.cloud_cover), borderColor: '#2a6fe0', backgroundColor: 'rgba(42,111,224,0.12)', fill: true, tension: 0.35, yAxisID: 'y1', order: 2 },
        { label: '降雨概率 %', data: dataset.map((item) => item.precipitation_probability), borderColor: '#16a34a', borderDash: [6, 4], tension: 0.35, yAxisID: 'y1', order: 3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkipPadding: 12, color: '#4f6677', font: { size: 11, weight: '600' } }, grid: { display: false } },
        y: { position: 'left', title: { display: true, text: 'W/m²', color: '#8c6a1d', font: { size: 11, weight: '600' } }, grid: { color: '#e8eef4' }, ticks: { color: '#8c6a1d', font: { size: 11 } } },
        y1: { position: 'right', min: 0, max: 100, title: { display: true, text: '%', color: '#1f4fb6', font: { size: 11, weight: '600' } }, grid: { display: false }, ticks: { color: '#1f4fb6', font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#022231', titleColor: '#eafff5', bodyColor: '#eafff5', padding: 10, cornerRadius: 14, displayColors: true, usePointStyle: true, boxPadding: 4 },
      },
    },
    plugins: [{
      id: 'sunriseMarker',
      afterDatasetsDraw(chart) {
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        if (!meta.data.length) return;
        const sorted = meta.data.map((pt, idx) => ({ idx, value: dataset.data[idx] ?? -1, x: pt.x, y: pt.y })).filter((pt) => pt.value >= 0);
        if (!sorted.length) return;
        sorted.sort((a, b) => b.value - a.value);
        const top = sorted[0];
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = '#022231';
        ctx.beginPath();
        ctx.arc(top.x, top.y + 4, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('峰值', top.x, top.y + 4);
        ctx.restore();
      }
    }],
  });
}

async function load() {
  if (STATE.refreshing) {
    $('#weather-updated').textContent = '更新中...';
  } else {
    $('#weather-updated').textContent = '正在加载...';
  }
  $('#solar-refresh-status').textContent = '更新中...';
  try {
    const [openMeteoData, solcastData] = await Promise.all([
      fetchOpenMeteo().catch((error) => { console.error('Open-Meteo fetch failed', error); throw error; }),
      fetchSolcast().catch((error) => { console.error('Solcast fetch failed', error); return null; }),
    ]);
    const data = openMeteoData;
    const hourly = data.hourly || {};
    const daily = data.daily || {};
    const today = new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz });
    const tomorrowObj = new Date(new Date().toLocaleDateString('en-CA', { timeZone: STATE.tz }));
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrow = tomorrowObj.toLocaleDateString('en-CA', { timeZone: STATE.tz });
    const todaySummary = summarizeSunriseBlock(hourly, today);
    const tomorrowSummary = summarizeSunriseBlock(hourly, tomorrow);

    sunriseSummary({ id: 'today', data: todaySummary });
    sunriseSummary({ id: 'tomorrow', data: tomorrowSummary });

    const solcastToday = solcastData?.today || null;
    const solcastTomorrow = solcastData?.tomorrow || null;
    renderSolarHero(todaySummary, solcastToday);
    renderSunriseAlerts(todaySummary, 'today');
    renderSunriseAlerts(tomorrowSummary, 'tomorrow');

    buildChart(chooseNearestHours(hourly, todaySummary.sunrise, 5));
    const nowIso = new Date().toISOString();
    buildHourly(chooseNearestHours(hourly, nowIso, 24));
    const displayDailyDays = (daily.time || []).slice(0, STATE.displayDays).map((time, idx) => ({
      time,
      tempMin: daily.temperature_2m_min?.[idx],
      tempMax: daily.temperature_2m_max?.[idx],
      precipSum: daily.precipitation_sum?.[idx],
      popMax: daily.precipitation_probability_max?.[idx],
      cloudMean: daily.cloud_cover_mean?.[idx],
      sunrise: daily.sunrise?.[idx],
      sunset: daily.sunset?.[idx],
    }));
    buildDaily(displayDailyDays);
    renderDailySolarCards(solcastData?.daily || [], displayDailyDays);
    if (solcastData?.error) $('#solar-refresh-status').textContent = '光伏数据：' + solcastData.error;
    $('#weather-updated').textContent = '更新于 ' + fmtHour(nowIso);
    toast('已刷新');
  } catch (err) {
    console.error(err);
    $('#weather-updated').textContent = '刷新失败，请下拉重试';
    $('#solar-refresh-status').textContent = '刷新失败';
    toast('刷新失败');
  }
}

function renderSolarHero(summary, solcastToday) {
  const estimate = pvEstimate(summary.rad || 0, summary.temp || 25);
  const solcastKwh = solcastToday?.pv_estimate;
  const displayKwh = solcastKwh != null ? solcastKwh.toFixed(1) : estimate.kwh.toFixed(1);
  $('#pv-kwh').textContent = displayKwh + ' kWh';
  $('#pv-ghi').textContent = summary.rad ? summary.rad + ' W/m²' : '--';
  $('#pv-temp').textContent = summary.temp == null ? '--' : summary.temp + '°';
  $('#pv-peak').textContent = summary.rad ? fmtHour(summary.sunrise).slice(0, 5) + ' 前后' : '--';
  $('#solar-peak-estimate').textContent = solcastToday?.pv_peak || '今日峰值';
  $('#solar-peak-radiance').textContent = summary.rad ? '参考峰值 ' + summary.rad + ' W/m²' : '等待峰值辐照';
  if (solcastToday) {
    $('#solar-source').textContent = 'Solcast 参考';
  } else if (estimate.kwh) {
    $('#solar-source').textContent = 'Open-Meteo 估算';
  }
}

function renderSunriseAlerts(summary, dayKey) {
  const container = document.getElementById(dayKey === 'today' ? 'rain-today' : 'rain-tomorrow');
  if (!container) return;
  const weatherEl = document.getElementById(dayKey === 'today' ? 'weather-today' : 'weather-tomorrow');
  const labelEl = document.getElementById(dayKey === 'today' ? 'pop-label-today' : 'pop-label-tomorrow');
  weatherEl.textContent = weatherCodeInfo(summary.code, true);
  if (labelEl) labelEl.textContent = '降雨概率';
  const risk = summary.rainItems.filter((item) => item.level === 'high');
  const warn = summary.rainItems.filter((item) => item.level === 'mid');
  renderChipContainer(container, [...risk, ...warn]);
}

function renderChipContainer(container, items) {
  container.innerHTML = '';
  if (!items.length) {
    const span = document.createElement('span');
    span.className = 'chip';
    span.innerHTML = '<span class="chip-dot"></span>日出前后无显著降雨';
    container.appendChild(span);
    return;
  }
  items.forEach((item) => {
    const span = document.createElement('span');
    span.className = 'chip alert-chip ' + (item.level === 'high' ? 'danger' : 'warn');
    span.innerHTML = '<span class="chip-dot"></span>' + item.label;
    container.appendChild(span);
  });
}

function initPullToRefresh() {
  let startY = 0;
  const app = $('#app');
  const preventDefault = (e) => { if (app.scrollTop === 0) e.preventDefault(); };
  document.addEventListener('touchstart', (e) => { if (app.scrollTop === 0) startY = e.touches[0].clientY; }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (app.scrollTop === 0) preventDefault(e); }, { passive: false });
  document.addEventListener('touchend', (e) => {
    if (STATE.refreshing) return;
    if (app.scrollTop <= 4 && (e.changedTouches[0].clientY - startY) > 90) {
      STATE.refreshing = true;
      toast('正在刷新');
      load().finally(() => (STATE.refreshing = false));
    }
  });
}

function initApiKeyModal() {
  const modal = $('#api-key-modal');
  const backdrop = $('#key-modal-backdrop');
  const input = $('#solcast-key-input');
  const open = () => { input.value = getSolcastKey(); modal.setAttribute('aria-hidden', 'false'); input.focus(); };
  const close = () => modal.setAttribute('aria-hidden', 'true');
  $('#api-key-button').addEventListener('click', open);
  backdrop.addEventListener('click', close);
  $('#key-modal-cancel').addEventListener('click', close);
  $('#key-modal-save').addEventListener('click', () => { setSolcastKey(input.value.trim()); close(); toast('已保存 Solcast API Key'); });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.addEventListener('DOMContentLoaded', () => {
  load();
  initPullToRefresh();
  initApiKeyModal();
});
