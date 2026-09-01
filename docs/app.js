const CATEGORY_EMOJI = {
  entree: "🍽️",
  grain: "🌾",
  condiment: "🧂",
  vegetable: "🥕",
  fruit: "🍎",
  beverage: "🥛",
  snack: "🍎",
};

const TABS = {
  uhills: { label: "U Hills", file: "data/uhills.json", school: "ES University Hills" },
  prek: { label: "Pre-K", file: "data/prek.json", school: "Caring Steps" },
};

const MEAL_META = {
  breakfast: { emoji: "🥞", label: "Breakfast" },
  lunch: { emoji: "🍽️", label: "Lunch" },
  snack: { emoji: "🍎", label: "Snack" },
};

function emptyChoiceSelection() {
  return { pathIndex: null, fruitVeg: new Set(), milk: null, condiments: new Set() };
}

function emptyFlatSelection() {
  return { checked: new Set() };
}

const state = {
  activeTab: "uhills",
  tabs: {
    uhills: { menu: null, dates: [], dayIndex: 0, selection: emptyChoiceSelection() },
    prek: { menu: null, dates: [], dayIndex: 0, selection: emptyFlatSelection() },
  },
};

const $ = (sel) => document.querySelector(sel);
const main = $("#main");
const dayLabel = $("#dayLabel");
const schoolLabel = $("#schoolLabel");
const prevBtn = $("#prevDay");
const nextBtn = $("#nextDay");
const refreshBtn = $("#refreshBtn");
const tabBar = $("#tabBar");

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

async function loadTab(key) {
  const cfg = TABS[key];
  const res = await fetch(`${cfg.file}?t=${Date.now()}`);
  const menu = await res.json();
  const dates = Object.keys(menu.days).sort();
  const todayIso = new Date().toISOString().slice(0, 10);
  let idx = dates.findIndex((d) => d >= todayIso);
  if (idx === -1) idx = dates.length - 1;
  if (idx < 0) idx = 0;
  const t = state.tabs[key];
  t.menu = menu;
  t.dates = dates;
  t.dayIndex = idx;
  t.selection = key === "uhills" ? emptyChoiceSelection() : emptyFlatSelection();
}

async function loadAll() {
  await Promise.all(Object.keys(TABS).map(loadTab));
  render();
}

function goToDay(delta) {
  const t = state.tabs[state.activeTab];
  const next = t.dayIndex + delta;
  if (next < 0 || next >= t.dates.length) return;
  t.dayIndex = next;
  t.selection = state.activeTab === "uhills" ? emptyChoiceSelection() : emptyFlatSelection();
  render();
}

function switchTab(key) {
  if (key === state.activeTab || !TABS[key]) return;
  state.activeTab = key;
  render();
}

function render() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });

  const key = state.activeTab;
  const t = state.tabs[key];
  schoolLabel.textContent = TABS[key].school;

  const hasDays = t.dates.length > 0;
  prevBtn.disabled = !hasDays || t.dayIndex <= 0;
  nextBtn.disabled = !hasDays || t.dayIndex >= t.dates.length - 1;

  if (!hasDays) {
    dayLabel.textContent = "No menus yet";
    main.innerHTML = `<div class="empty-state"><div class="big">📭</div>No menus have been scraped yet.<br/>Try hitting Refresh &amp; Publish.</div>`;
    return;
  }

  const iso = t.dates[t.dayIndex];
  dayLabel.textContent = formatDate(iso);
  const day = t.menu.days[iso];

  if (key === "uhills") {
    renderUhillsDay(day, t);
  } else {
    renderPrekDay(day, t);
  }
}

// ---- U Hills (pick-your-lunch) ----

function renderUhillsDay(day, t) {
  const sel = t.selection;
  main.innerHTML = `
    ${renderStep1(day, sel)}
    ${renderIncluded(day)}
    ${renderMultiStep("3", "🥕 Fruit & Veggie Bar", "Pick as many as you'd like.", day.fruit_veg_bar, "fruitVeg", sel)}
    ${renderMilkStep(day, sel)}
    ${renderMultiStep("5", "🧂 Condiments", "Grab whatever you need.", day.condiments, "condiments", sel)}
    ${renderTray(day, sel)}
  `;
  attachUhillsHandlers(t);
}

function renderStep1(day, sel) {
  const cards = day.meal_paths.map((path, i) => {
    const selected = sel.pathIndex === i ? "selected" : "";
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

function renderMultiStep(num, title, hint, items, key, sel) {
  if (!items || !items.length) return "";
  const cards = items.map((it) => {
    const selected = sel[key].has(it.id) ? "selected" : "";
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

function renderMilkStep(day, sel) {
  if (!day.milks.length) return "";
  const cards = day.milks.map((it) => {
    const selected = sel.milk === it.id ? "selected" : "";
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

function renderTray(day, sel) {
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

function attachUhillsHandlers(t) {
  main.querySelectorAll("[data-path-index]").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.pathIndex);
      t.selection.pathIndex = t.selection.pathIndex === i ? null : i;
      render();
    });
  });

  main.querySelectorAll("[data-multi]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.multi;
      const id = Number(el.dataset.id);
      const set = t.selection[key];
      set.has(id) ? set.delete(id) : set.add(id);
      render();
    });
  });

  main.querySelectorAll("[data-milk]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.milk);
      t.selection.milk = t.selection.milk === id ? null : id;
      render();
    });
  });

  const startOver = $("#startOverBtn");
  if (startOver) {
    startOver.addEventListener("click", () => {
      t.selection = emptyChoiceSelection();
      render();
    });
  }
}

// ---- Pre-K (served, checklist) ----

function renderPrekDay(day, t) {
  const sections = Object.keys(MEAL_META)
    .map((key) => ({ key, ...MEAL_META[key], items: day[key] || [] }))
    .filter((s) => s.items.length);

  const stepsHtml = sections
    .map((s, i) => renderFlatStep(i + 1, s, t.selection))
    .join("");
  main.innerHTML = stepsHtml + renderPrekTray(sections, t.selection);
  attachPrekHandlers(t);
}

function renderFlatStep(num, section, sel) {
  const cards = section.items.map((it) => {
    const selected = sel.checked.has(it.id) ? "selected" : "";
    return `
      <div class="item-card ${selected}" data-flat-id="${it.id}">
        ${thumb(it, "thumb")}
        <div class="food-name">${escapeHtml(it.name)} <span class="check">✔</span></div>
      </div>`;
  }).join("");
  return `
    <section class="step">
      <h2><span class="badge">${num}</span> ${section.emoji} ${section.label}</h2>
      <p class="hint">This is what's being served — tap what you're excited about!</p>
      <div class="item-grid">${cards}</div>
    </section>`;
}

function renderPrekTray(sections, sel) {
  const rows = [];
  sections.forEach((s) => {
    s.items.forEach((it) => {
      if (sel.checked.has(it.id)) rows.push({ cat: s.label, name: it.name });
    });
  });
  const body = rows.length
    ? `<ul class="tray-list">${rows.map((r) => `<li><span class="tray-cat">${escapeHtml(r.cat)}</span>${escapeHtml(r.name)}</li>`).join("")}</ul>`
    : `<div class="tray-empty">Tap what you're excited to eat today!</div>`;
  return `
    <div class="tray">
      <h2>🎒 Today at Pre-K</h2>
      ${body}
      <button class="start-over" id="startOverBtn">↺ Start Over</button>
    </div>`;
}

function attachPrekHandlers(t) {
  main.querySelectorAll("[data-flat-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.flatId);
      const set = t.selection.checked;
      set.has(id) ? set.delete(id) : set.add(id);
      render();
    });
  });

  const startOver = $("#startOverBtn");
  if (startOver) {
    startOver.addEventListener("click", () => {
      t.selection = emptyFlatSelection();
      render();
    });
  }
}

// ---- shared chrome ----

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

async function refreshAndPublish() {
  refreshBtn.disabled = true;
  try {
    refreshBtn.textContent = "🔄 Refreshing…";
    const refreshRes = await fetch("/api/refresh", { method: "POST" });
    const refreshData = await refreshRes.json();
    if (!refreshData.ok) {
      showToast("Refresh failed: " + (refreshData.error || "unknown error"));
      return;
    }
    await loadAll();

    refreshBtn.textContent = "🌐 Publishing…";
    const publishRes = await fetch("/api/publish", { method: "POST" });
    const publishData = await publishRes.json();
    if (!publishData.ok) {
      showToast("Menu updated locally, but publish failed: " + (publishData.error || "unknown error"));
    } else if (publishData.published) {
      showToast("Menu updated & published! 🎉");
    } else {
      showToast("Menu is already up to date. 🎉");
    }
  } catch (e) {
    showToast("Couldn't reach the local server.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 Refresh & Publish";
  }
}

const IS_LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname);
if (!IS_LOCAL) {
  refreshBtn.style.display = "none";
} else {
  refreshBtn.addEventListener("click", refreshAndPublish);
}

prevBtn.addEventListener("click", () => goToDay(-1));
nextBtn.addEventListener("click", () => goToDay(1));
tabBar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (btn) switchTab(btn.dataset.tab);
});

loadAll().catch((e) => {
  main.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>Couldn't load the menu.<br/>${escapeHtml(e.message)}</div>`;
});
