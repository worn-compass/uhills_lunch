const CATEGORY_EMOJI = {
  entree: "🍽️",
  grain: "🌾",
  condiment: "🧂",
  vegetable: "🥕",
  fruit: "🍎",
  beverage: "🥛",
};

const state = {
  menu: null,
  dates: [],
  dayIndex: 0,
  selection: emptySelection(),
};

function emptySelection() {
  return { pathIndex: null, fruitVeg: new Set(), milk: null, condiments: new Set() };
}

const $ = (sel) => document.querySelector(sel);
const main = $("#main");
const dayLabel = $("#dayLabel");
const prevBtn = $("#prevDay");
const nextBtn = $("#nextDay");
const refreshBtn = $("#refreshBtn");

function imgSrc(path) {
  return path ? `data/images/${path.split("/").pop()}` : null;
}

function thumb(item, size = "thumb") {
  const src = imgSrc(item.image);
  if (src) {
    return `<img class="${size}" src="${src}" alt="${escapeHtml(item.name)}" loading="lazy" />`;
  }
  const emoji = CATEGORY_EMOJI[item.category] || "🍴";
  return `<div class="${size} placeholder">${emoji}</div>`;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

async function loadMenu() {
  const res = await fetch(`data/menu.json?t=${Date.now()}`);
  state.menu = await res.json();
  state.dates = Object.keys(state.menu.days).sort();
  const todayIso = new Date().toISOString().slice(0, 10);
  let idx = state.dates.findIndex((d) => d >= todayIso);
  if (idx === -1) idx = state.dates.length - 1;
  if (idx < 0) idx = 0;
  state.dayIndex = idx;
  state.selection = emptySelection();
  render();
}

function goToDay(delta) {
  const next = state.dayIndex + delta;
  if (next < 0 || next >= state.dates.length) return;
  state.dayIndex = next;
  state.selection = emptySelection();
  render();
}

function render() {
  const hasDays = state.dates.length > 0;
  prevBtn.disabled = !hasDays || state.dayIndex <= 0;
  nextBtn.disabled = !hasDays || state.dayIndex >= state.dates.length - 1;

  if (!hasDays) {
    dayLabel.textContent = "No menus yet";
    main.innerHTML = `<div class="empty-state"><div class="big">📭</div>No lunch menus have been scraped yet.<br/>Try hitting Refresh Menu.</div>`;
    return;
  }

  const iso = state.dates[state.dayIndex];
  const day = state.menu.days[iso];
  dayLabel.textContent = formatDate(iso);

  main.innerHTML = `
    ${renderStep1(day)}
    ${renderIncluded(day)}
    ${renderMultiStep("3", "🥕 Fruit & Veggie Bar", "Pick as many as you'd like.", day.fruit_veg_bar, "fruitVeg")}
    ${renderMilkStep(day)}
    ${renderMultiStep("5", "🧂 Condiments", "Grab whatever you need.", day.condiments, "condiments")}
    ${renderTray(day)}
  `;

  attachHandlers(day);
}

function renderStep1(day) {
  const cards = day.meal_paths.map((path, i) => {
    const selected = state.selection.pathIndex === i ? "selected" : "";
    const thumbs = path.items.slice(0, 4).map((it) => thumb(it)).join("");
    const names = path.items.map((it) => it.name).join(", ");
    return `
      <div class="path-card ${selected}" data-path-index="${i}">
        <div class="path-label">${escapeHtml(path.section)} <span class="check">✔</span></div>
        <div class="thumb-row">${thumbs}</div>
        <div class="food-name-list">${escapeHtml(names)}</div>
      </div>`;
  }).join("");

  return `
    <section class="step">
      <h2><span class="badge">1</span> Pick Your Lunch</h2>
      <p class="hint">Choose one option.</p>
      <div class="path-grid">${cards}</div>
    </section>`;
}

function renderIncluded(day) {
  if (!day.sides_for_all.length) return "";
  const pills = day.sides_for_all.map((it) => `
    <div class="included-pill">${thumb(it, "thumb")}<span class="name">${escapeHtml(it.name)}</span></div>
  `).join("");
  return `
    <section class="step">
      <h2><span class="badge">2</span> You'll Also Get</h2>
      <p class="hint">Comes with every meal, no need to pick.</p>
      <div class="included-row">${pills}</div>
    </section>`;
}

function renderMultiStep(num, title, hint, items, key) {
  if (!items || !items.length) return "";
  const cards = items.map((it) => {
    const selected = state.selection[key].has(it.id) ? "selected" : "";
    return `
      <div class="item-card ${selected}" data-multi="${key}" data-id="${it.id}">
        ${thumb(it, "thumb")}
        <div class="food-name">${escapeHtml(it.name)} <span class="check">✔</span></div>
      </div>`;
  }).join("");
  return `
    <section class="step">
      <h2><span class="badge">${num}</span> ${title}</h2>
      <p class="hint">${hint}</p>
      <div class="item-grid">${cards}</div>
    </section>`;
}

function renderMilkStep(day) {
  if (!day.milks.length) return "";
  const cards = day.milks.map((it) => {
    const selected = state.selection.milk === it.id ? "selected" : "";
    return `
      <div class="item-card ${selected}" data-milk="${it.id}">
        ${thumb(it, "thumb")}
        <div class="food-name">${escapeHtml(it.name)} <span class="check">✔</span></div>
      </div>`;
  }).join("");
  return `
    <section class="step">
      <h2><span class="badge">4</span> 🥛 Pick Your Milk</h2>
      <p class="hint">Choose one.</p>
      <div class="item-grid">${cards}</div>
    </section>`;
}

function findItem(day, id) {
  for (const path of day.meal_paths) {
    const hit = path.items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return [...day.fruit_veg_bar, ...day.milks, ...day.condiments, ...day.sides_for_all]
    .find((i) => i.id === id);
}

function renderTray(day) {
  const sel = state.selection;
  const rows = [];

  if (sel.pathIndex !== null) {
    const path = day.meal_paths[sel.pathIndex];
    path.items.forEach((it) => rows.push({ cat: path.section, name: it.name }));
  }
  day.sides_for_all.forEach((it) => rows.push({ cat: "Included", name: it.name }));
  sel.fruitVeg.forEach((id) => {
    const it = findItem(day, id);
    if (it) rows.push({ cat: "Fruit/Veg", name: it.name });
  });
  if (sel.milk !== null) {
    const it = findItem(day, sel.milk);
    if (it) rows.push({ cat: "Milk", name: it.name });
  }
  sel.condiments.forEach((id) => {
    const it = findItem(day, id);
    if (it) rows.push({ cat: "Condiment", name: it.name });
  });

  const body = rows.length
    ? `<ul class="tray-list">${rows.map((r) => `<li><span class="tray-cat">${escapeHtml(r.cat)}</span>${escapeHtml(r.name)}</li>`).join("")}</ul>`
    : `<div class="tray-empty">Pick your lunch above to build your plan!</div>`;

  return `
    <div class="tray">
      <h2>🧺 My Lunch Plan</h2>
      ${body}
      <button class="start-over" id="startOverBtn">↺ Start Over</button>
    </div>`;
}

function attachHandlers(day) {
  main.querySelectorAll("[data-path-index]").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.pathIndex);
      state.selection.pathIndex = state.selection.pathIndex === i ? null : i;
      render();
    });
  });

  main.querySelectorAll("[data-multi]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.multi;
      const id = Number(el.dataset.id);
      const set = state.selection[key];
      set.has(id) ? set.delete(id) : set.add(id);
      render();
    });
  });

  main.querySelectorAll("[data-milk]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.milk);
      state.selection.milk = state.selection.milk === id ? null : id;
      render();
    });
  });

  const startOver = $("#startOverBtn");
  if (startOver) {
    startOver.addEventListener("click", () => {
      state.selection = emptySelection();
      render();
    });
  }
}

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

async function refresh() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "🔄 Refreshing…";
  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      await loadMenu();
      showToast("Menu updated! 🎉");
    } else {
      showToast("Refresh failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    showToast("Couldn't reach the local server.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 Refresh Menu";
  }
}

prevBtn.addEventListener("click", () => goToDay(-1));
nextBtn.addEventListener("click", () => goToDay(1));
refreshBtn.addEventListener("click", refresh);

loadMenu().catch((e) => {
  main.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>Couldn't load the menu.<br/>${escapeHtml(e.message)}</div>`;
});
