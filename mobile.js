"use strict";

// Uses the existing ledger, persistence, and sync functions; no separate data copy.
const phoneLayout = window.matchMedia("(max-width:700px)");
let mobileView = "ledger";
let settling = null;
let settlingDue = 0;

function mobileNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderMobile() {
  const sortSelect = $("#mobileSort");
  sortSelect.querySelector("[data-current-sort]")?.remove();
  if (sort.dir === -1 && ["date", "amount", "due"].includes(sort.k)) sortSelect.value = sort.k;
  else {
    const labels = {date:"项目日期", amount:"项目金额", due:"待收金额", name:"项目名称", source:"项目来源", deposit:"定金", balance:"尾款", settled:"结账状态"};
    const option = mobileNode("option", "", (labels[sort.k] || "当前排序") + (sort.dir === 1 ? " · 升序" : " · 降序"));
    option.value = "current";
    option.dataset.currentSort = "true";
    option.disabled = true;
    sortSelect.appendChild(option);
    sortSelect.value = "current";
  }
  const base = filtered(true);
  const pending = base.filter(it => !it.settled).length;
  $("#mobileAllCount").textContent = base.length;
  $("#mobileDueCount").textContent = pending;
  $("#mobileDoneCount").textContent = base.length - pending;
  document.querySelectorAll("[data-status]").forEach(button => {
    button.setAttribute("aria-pressed", button.dataset.status === filt.st ? "true" : "false");
  });
  const active = [filt.range !== "all", !!filt.src, !!filt.st].filter(Boolean).length;
  $("#filterToggle").textContent = "筛选" + (active ? " · " + active : "");
  const rows = sorted(filtered());
  $("#mobileListTitle").textContent = filt.st === "0" ? "待收款项目" : filt.st === "1" ? "已结清项目" : "全部项目";
  $("#mobileListCount").textContent = rows.length + " 个";
  const list = $("#mobileList");
  const fragment = document.createDocumentFragment();
  if (!rows.length) {
    const empty = mobileNode("div", "mobile-empty", live().length ? "没有符合条件的项目" : "记下你的第一个项目");
    empty.appendChild(mobileNode("p", "", live().length ? "试试其他筛选条件，或清空搜索。" : "点底部「新增项目」，开始记录收入。"));
    fragment.appendChild(empty);
  }
  rows.forEach(it => {
    const article = mobileNode("article", "mobile-project" + (it.settled ? "" : " is-due"));
    article.dataset.id = it.id;
    const open = mobileNode("button", "project-open");
    open.type = "button";
    open.setAttribute("aria-label", "编辑项目：" + it.name);
    open.onclick = () => openEdit(it.id);
    const description = mobileNode("span", "project-description");
    description.appendChild(mobileNode("span", "project-name", it.name));
    description.appendChild(mobileNode("span", "project-meta", [it.source || "未分类", it.date || "未填日期"].join(" · ")));
    const amount = mobileNode("span", "project-amount");
    amount.appendChild(mobileNode("strong", "", "¥" + money(it.settled ? received(it) : due(it))));
    amount.appendChild(mobileNode("small", "", it.settled ? "已结清" : "待收尾款"));
    open.append(description, amount);
    article.appendChild(open);
    if (it.note) article.appendChild(mobileNode("p", "project-note", it.note));
    if (!it.settled) {
      const actions = mobileNode("div", "project-actions");
      actions.appendChild(mobileNode("span", "project-status", "已收 ¥" + money(received(it)) + " / 总额 ¥" + money(it.amount)));
      const collect = mobileNode("button", "", "收尾款");
      collect.type = "button";
      collect.setAttribute("aria-label", "确认收取「" + it.name + "」尾款 ¥" + money(due(it)));
      collect.onclick = () => openSettle(it.id);
      actions.appendChild(collect);
      article.appendChild(actions);
    }
    fragment.appendChild(article);
  });
  list.replaceChildren(fragment);
}

const renderDesktopLedger = renderAll;
renderAll = function () {
  renderDesktopLedger();
  renderMobile();
};

function setMobileView(view) {
  mobileView = view;
  document.body.dataset.mobileView = view;
  $("#mobileLedger").toggleAttribute("aria-current", view === "ledger");
  $("#mobileStats").toggleAttribute("aria-current", view === "stats");
  if (view === "ledger") $("#mobileLedger").setAttribute("aria-current", "page");
  else $("#mobileStats").setAttribute("aria-current", "page");
  window.scrollTo({ top: 0, behavior: "instant" });
  renderAll();
}

function openSettle(id) {
  const it = items.find(item => item.id === id && !item.deleted);
  if (!it || it.settled) return;
  settling = id;
  settlingDue = due(it);
  $("#settleName").textContent = it.name;
  $("#settleAmount").textContent = "¥" + money(settlingDue);
  $("#settleDate").value = todayLocal();
  $("#settleErr").hidden = true;
  $("#settleDlg").showModal();
}

$("#settleForm").onsubmit = event => {
  event.preventDefault();
  const it = items.find(item => item.id === settling && !item.deleted);
  if (!it || it.settled) {
    $("#settleDlg").close();
    toast("项目状态已更新，请重新核对");
    return;
  }
  if (due(it) !== settlingDue) {
    settlingDue = due(it);
    $("#settleAmount").textContent = "¥" + money(settlingDue);
    $("#settleErr").textContent = "项目金额刚刚发生变化，请核对后再次确认。";
    $("#settleErr").hidden = false;
    return;
  }
  it.settled = true;
  it.settledDate = $("#settleDate").value;
  it.updatedAt = nowISO();
  saveLocal();
  renderAll();
  queueSync();
  $("#settleDlg").close();
  toast("已收尾款 ¥" + money(settlingDue));
};
$("#settleCancel").onclick = () => $("#settleDlg").close();

$("#mobileLedger").onclick = () => setMobileView("ledger");
$("#mobileStats").onclick = () => setMobileView("stats");
$("#mobileAdd").onclick = () => openEdit(null);
$("#filterToggle").onclick = () => {
  const expanded = $("#filters").classList.toggle("is-expanded");
  $("#filterToggle").setAttribute("aria-expanded", expanded ? "true" : "false");
};
document.querySelectorAll("[data-status]").forEach(button => {
  button.onclick = () => {
    filt.st = button.dataset.status;
    $("#stSel").value = filt.st;
    renderAll();
  };
});
$("#mobileSort").onchange = event => {
  sort = { k: event.target.value, dir: -1 };
  renderAll();
};
$("#mobileMore").onclick = () => {
  const theme = document.documentElement.getAttribute("data-theme");
  $("#mobileThemeLabel").textContent = theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统";
  $("#mobileMoreDlg").showModal();
};
$("#mobileMoreClose").onclick = () => $("#mobileMoreDlg").close();
document.querySelectorAll("[data-more]").forEach(button => {
  button.onclick = () => {
    if (button.dataset.more === "theme") {
      $("#themeBtn").click();
      const theme = document.documentElement.getAttribute("data-theme");
      $("#mobileThemeLabel").textContent = theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统";
      return;
    }
    $("#mobileMoreDlg").close();
    if (button.dataset.more === "sync") openSync();
    else $("#ioBtn").click();
  };
});
$("#mobileVersion").textContent = "项目收入账本 · v" + APP_VERSION;

// Keep the sheet and its save button inside Safari's visible area with the keyboard open.
function updateVisualHeight() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty("--visual-height", (viewport ? viewport.height : window.innerHeight) + "px");
}
window.visualViewport?.addEventListener("resize", updateVisualHeight);
window.addEventListener("resize", updateVisualHeight);
phoneLayout.addEventListener("change", () => {
  $("#projectDetails").open = !phoneLayout.matches;
  renderAll();
});
updateVisualHeight();
renderMobile();
