const form = document.querySelector("#budget-form");
const dateInput = document.querySelector("#date");
const todayLabel = document.querySelector("#today-label");
const summary = document.querySelector("#summary");
const calendar = document.querySelector("#calendar");
const monthTitle = document.querySelector("#month-title");
const dailyNote = document.querySelector("#daily-note");
const quickExpenseForm = document.querySelector("#quick-expense-form");
const quickAmount = document.querySelector("#quick-amount");
const quickMemo = document.querySelector("#quick-memo");
const quickCategory = document.querySelector("#quick-category");
const todayExpenses = document.querySelector("#today-expenses");
const expenseDialog = document.querySelector("#expense-dialog");
const expenseForm = document.querySelector("#expense-form");
const expenseAmount = document.querySelector("#expense-amount");
const expenseMemo = document.querySelector("#expense-memo");
const expenseCategory = document.querySelector("#expense-category");
const dailyExpenseList = document.querySelector("#daily-expense-list");
const dialogTitle = document.querySelector("#dialog-title");
const incomeList = document.querySelector("#income-list");
const addIncomeButton = document.querySelector("#add-income");
const fixedList = document.querySelector("#fixed-list");
const addFixedButton = document.querySelector("#add-fixed");

const formatter = new Intl.NumberFormat("ko-KR");
const expenseStorageKey = "budget-calendar-expense-records-v1";
const incomeStorageKey = "budget-calendar-income-v1";
const fixedStorageKey = "budget-calendar-fixed-v2";
let selectedExpenseDate = "";

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const defaultIncomeItems = [
  { id: makeId(), name: "1차 급여", day: 10, amount: 1250000 },
  { id: makeId(), name: "2차 급여", day: 25, amount: 1250000 },
];

const defaultFixedItems = [
  { id: makeId(), name: "관리비", day: 28, amount: 180000 },
  { id: makeId(), name: "통신비", day: 12, amount: 90000 },
  { id: makeId(), name: "구독/보험", day: 20, amount: 150000 },
];

function loadExpenseRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(expenseStorageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveExpenseRecords(records) {
  localStorage.setItem(expenseStorageKey, JSON.stringify(records));
}

function loadIncomeItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(incomeStorageKey) || "null");
    return Array.isArray(saved) ? saved : defaultIncomeItems;
  } catch {
    return defaultIncomeItems;
  }
}

function saveIncomeItems(items) {
  localStorage.setItem(incomeStorageKey, JSON.stringify(items));
}

function loadFixedItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(fixedStorageKey) || "null");
    return Array.isArray(saved) ? saved : defaultFixedItems;
  } catch {
    return defaultFixedItems;
  }
}

function saveFixedItems(items) {
  localStorage.setItem(fixedStorageKey, JSON.stringify(items));
}

function parseMoney(value) {
  return Number(String(value || "").replaceAll(",", "").replace(/[^\d]/g, "") || 0);
}

function formatMoney(value) {
  const number = parseMoney(value);
  return number ? formatter.format(number) : "";
}

function toNumber(id) {
  return parseMoney(document.querySelector(`#${id}`).value);
}

function won(value) {
  return `${formatter.format(Math.round(value))}원`;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKey(date) {
  return isoDate(date).slice(0, 7);
}

function dateForDay(date, day) {
  return isoDate(new Date(date.getFullYear(), date.getMonth(), day));
}

function isWeekendDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function sumRecordsForDate(dateKey) {
  return loadExpenseRecords()
    .filter((record) => record.date === dateKey)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
}

function recordsForDate(dateKey) {
  return loadExpenseRecords()
    .filter((record) => record.date === dateKey)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function expenseForMonth(date) {
  const prefix = monthKey(date);
  return loadExpenseRecords()
    .filter((record) => record.date.startsWith(prefix))
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
}

function expenseUntilDay(date, deadlineDay) {
  const prefix = monthKey(date);
  const today = date.getDate();
  return loadExpenseRecords()
    .filter((record) => {
      if (!record.date.startsWith(prefix)) return false;
      const day = Number(record.date.slice(8, 10));
      return day >= today && day <= deadlineDay;
    })
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
}

function enteredDaysFromToday(date) {
  const prefix = monthKey(date);
  const today = date.getDate();
  const days = new Set(
    loadExpenseRecords()
      .filter((record) => record.date.startsWith(prefix))
      .map((record) => Number(record.date.slice(8, 10)))
      .filter((day) => day >= today),
  );
  return days.size;
}

function remainingIncomeFromToday(date) {
  const today = date.getDate();
  return loadIncomeItems()
    .filter((item) => Number(item.day || 1) >= today)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function incomeUntilDay(date, deadlineDay) {
  const today = date.getDate();
  return loadIncomeItems()
    .filter((item) => {
      const day = Number(item.day || 1);
      return day >= today && day <= deadlineDay;
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function fixedTotalFromToday(date) {
  const today = date.getDate();
  return loadFixedItems()
    .filter((item) => Number(item.day || 1) >= today)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function fixedTotalUntilDay(date, deadlineDay) {
  const today = date.getDate();
  return loadFixedItems()
    .filter((item) => {
      const day = Number(item.day || 1);
      return day >= today && day <= deadlineDay;
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function weightForDate(date, weekendMultiplier) {
  return isWeekendDate(date) ? weekendMultiplier : 1;
}

function remainingWeight(date, weekendMultiplier, endDay = daysInMonth(date)) {
  const prefix = monthKey(date);
  const recordedDays = new Set(
    loadExpenseRecords()
      .filter((record) => record.date.startsWith(prefix))
      .map((record) => Number(record.date.slice(8, 10))),
  );
  let weight = 0;

  for (let day = date.getDate(); day <= endDay; day += 1) {
    if (recordedDays.has(day)) continue;
    const current = new Date(date.getFullYear(), date.getMonth(), day);
    weight += weightForDate(current, weekendMultiplier);
  }

  return Math.max(weight, 1);
}

function getPlan() {
  const date = new Date(`${dateInput.value}T00:00:00`);
  const currentBalance = toNumber("current-balance");
  const futureIncome = remainingIncomeFromToday(date);
  const savingGoal = toNumber("saving-goal");
  const savingDeadline = Math.min(
    daysInMonth(date),
    Math.max(date.getDate(), Number(document.querySelector("#saving-deadline").value || daysInMonth(date))),
  );
  const weekendMultiplier = Number(document.querySelector("#weekend-multiplier").value || 1);
  const fixedTotal = fixedTotalFromToday(date);
  const budget = currentBalance + futureIncome - fixedTotal - savingGoal;
  const spent = expenseForMonth(date);
  const remainingBudget = budget - spent;
  const deadlineIncome = incomeUntilDay(date, savingDeadline);
  const deadlineFixed = fixedTotalUntilDay(date, savingDeadline);
  const deadlineSpent = expenseUntilDay(date, savingDeadline);
  const savingWindowBudget = currentBalance + deadlineIncome - deadlineFixed - savingGoal - deadlineSpent;
  const savingWindowUnit = savingWindowBudget / remainingWeight(date, weekendMultiplier, savingDeadline);
  const unitAllowance = remainingBudget / remainingWeight(date, weekendMultiplier);
  const todayKey = isoDate(date);
  const todaySpent = sumRecordsForDate(todayKey);
  const todayAllowance = unitAllowance * weightForDate(date, weekendMultiplier);

  return {
    date,
    todayKey,
    currentBalance,
    futureIncome,
    budget,
    savingGoal,
    savingDeadline,
    fixedTotal,
    spent,
    todaySpent,
    todayAllowance,
    todayRemaining: todayAllowance - todaySpent,
    remainingBudget,
    remainingDays: Math.max(daysInMonth(date) - date.getDate() + 1 - enteredDaysFromToday(date), 1),
    weekendMultiplier,
    unitAllowance,
    weekdayAllowance: unitAllowance,
    weekendAllowance: unitAllowance * weekendMultiplier,
    savingWeekdayAllowance: savingWindowUnit,
    savingWeekendAllowance: savingWindowUnit * weekendMultiplier,
  };
}

function renderSummary(plan) {
  const dailyClass = plan.savingWeekdayAllowance < 0 ? "bad" : plan.savingWeekdayAllowance < 15000 ? "warn" : "good";
  const budgetClass = plan.budget < 0 ? "bad" : "good";
  const todayClass = plan.todayRemaining < 0 ? "bad" : "good";

  summary.innerHTML = `
    <article class="metric ${todayClass}">
      <span>오늘 남은 돈</span>
      <strong>${won(plan.todayRemaining)}</strong>
    </article>
    <article class="metric">
      <span>오늘 쓴 돈</span>
      <strong>${won(plan.todaySpent)}</strong>
    </article>
    <article class="metric ${budgetClass}">
      <span>남은 생활비 한도</span>
      <strong>${won(plan.budget)}</strong>
    </article>
    <article class="metric">
      <span>앞으로 들어올 돈</span>
      <strong>${won(plan.futureIncome)}</strong>
    </article>
    <article class="metric">
      <span>남은 고정 지출</span>
      <strong>${won(plan.fixedTotal)}</strong>
    </article>
    <article class="metric ${dailyClass}">
      <span>${plan.savingDeadline}일까지 평일</span>
      <strong>${won(plan.savingWeekdayAllowance)}</strong>
    </article>
    <article class="metric ${dailyClass}">
      <span>${plan.savingDeadline}일까지 주말</span>
      <strong>${won(plan.savingWeekendAllowance)}</strong>
    </article>
    <article class="metric">
      <span>${plan.savingDeadline}일까지 저축</span>
      <strong>${won(plan.savingGoal)}</strong>
    </article>
  `;
}

function renderIncomeItems() {
  const items = loadIncomeItems();
  incomeList.innerHTML = items
    .map((item) => `
      <div class="money-item" data-id="${item.id}">
        <input class="income-name" type="text" value="${escapeAttr(item.name)}" aria-label="수입명" />
        <input class="income-day" type="number" min="1" max="31" step="1" value="${item.day}" aria-label="입금일" />
        <input class="income-amount money-input" type="text" inputmode="numeric" value="${formatter.format(Number(item.amount || 0))}" aria-label="수입 금액" />
        <button type="button" class="icon-button" data-remove-income="${item.id}" aria-label="삭제">×</button>
      </div>
    `)
    .join("");
}

function renderFixedItems() {
  const items = loadFixedItems();
  fixedList.innerHTML = items
    .map((item) => `
      <div class="money-item" data-id="${item.id}">
        <input class="fixed-name" type="text" value="${escapeAttr(item.name)}" aria-label="고정 지출명" />
        <input class="fixed-day" type="number" min="1" max="31" step="1" value="${item.day || 1}" aria-label="지출일" />
        <input class="fixed-amount money-input" type="text" inputmode="numeric" value="${formatter.format(Number(item.amount || 0))}" aria-label="고정 지출 금액" />
        <button type="button" class="icon-button" data-remove="${item.id}" aria-label="삭제">×</button>
      </div>
    `)
    .join("");
}

function renderTodayExpenses(plan) {
  const records = recordsForDate(plan.todayKey);
  todayExpenses.innerHTML = records.length
    ? records.slice(0, 5).map((record) => expenseRow(record)).join("")
    : `<p class="empty-line">오늘 기록한 지출이 없습니다.</p>`;
}

function expenseRow(record) {
  return `
    <div class="expense-row">
      <div>
        <strong>${escapeText(record.memo || record.category || "지출")}</strong>
        <span>${escapeText(record.category || "기타")} · ${new Date(record.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <b>${won(record.amount)}</b>
      <button type="button" class="mini-delete" data-delete-expense="${record.id}">삭제</button>
    </div>
  `;
}

function renderDailyExpenseList(dateKey) {
  const records = recordsForDate(dateKey);
  const total = sumRecordsForDate(dateKey);
  dailyExpenseList.innerHTML = `
    <div class="daily-total">
      <span>합계</span>
      <strong>${won(total)}</strong>
    </div>
    ${records.length ? records.map((record) => expenseRow(record)).join("") : `<p class="empty-line">이 날짜의 지출 기록이 없습니다.</p>`}
  `;
}

function renderCalendar(plan) {
  const year = plan.date.getFullYear();
  const month = plan.date.getMonth();
  const totalDays = daysInMonth(plan.date);
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const today = plan.date.getDate();
  const overBudget = plan.unitAllowance < 0;

  monthTitle.textContent = plan.date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });
  dailyNote.textContent = overBudget
    ? `${plan.savingDeadline}일까지 ${won(Math.abs(plan.savingWeekdayAllowance))}씩 초과 상태`
    : `${plan.savingDeadline}일까지 평일 ${won(plan.savingWeekdayAllowance)} · 주말 ${won(plan.savingWeekendAllowance)}`;

  const cells = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push(`<div class="day empty"></div>`);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const key = dateForDay(plan.date, day);
    const records = recordsForDate(key);
    const expense = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const hasExpense = expense > 0;
    const isPast = day < today;
    const isToday = day === today;
    const currentDate = new Date(year, month, day);
    const inSavingWindow = day <= plan.savingDeadline;
    const dayAllowance = inSavingWindow
      ? (isWeekendDate(currentDate) ? plan.savingWeekendAllowance : plan.savingWeekdayAllowance)
      : plan.unitAllowance * weightForDate(currentDate, plan.weekendMultiplier);
    const klass = ["day", isPast ? "past" : "", isToday ? "today" : "", hasExpense ? "filled" : "", overBudget && !isPast && !hasExpense ? "over" : ""]
      .filter(Boolean)
      .join(" ");
    const caption = hasExpense
      ? `${records.length}건 기록`
      : isPast
        ? "눌러서 기록 추가"
        : inSavingWindow
          ? (isWeekendDate(currentDate) ? "저축 전 주말 예산" : "저축 전 평일 예산")
          : (isWeekendDate(currentDate) ? "주말 예산" : "평일 예산");
    const shownAmount = hasExpense ? won(expense) : isPast ? "-" : won(dayAllowance);

    cells.push(`
      <button class="${klass}" type="button" data-date="${key}">
        <div class="date-num">
          <span>${day}</span>
          ${isToday ? `<span class="badge">오늘</span>` : ""}
        </div>
        <div class="amount">${shownAmount}</div>
        <div class="caption">${caption}</div>
      </button>
    `);
  }

  calendar.innerHTML = cells.join("");
}

function addExpense(dateKey, amount, memo, category) {
  if (!amount) return;
  const records = loadExpenseRecords();
  records.push({
    id: makeId(),
    date: dateKey,
    amount,
    memo: memo.trim(),
    category,
    createdAt: new Date().toISOString(),
  });
  saveExpenseRecords(records);
}

function deleteExpense(id) {
  saveExpenseRecords(loadExpenseRecords().filter((record) => record.id !== id));
}

function openExpenseDialog(dateKey) {
  selectedExpenseDate = dateKey;
  const date = new Date(`${dateKey}T00:00:00`);
  dialogTitle.textContent = date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  expenseAmount.value = "";
  expenseMemo.value = "";
  renderDailyExpenseList(dateKey);
  expenseDialog.showModal();
  expenseAmount.focus();
}

function render() {
  const plan = getPlan();
  renderIncomeItems();
  renderFixedItems();
  renderSummary(plan);
  renderTodayExpenses(plan);
  renderCalendar(plan);
}

dateInput.value = isoDate(new Date());
todayLabel.textContent = new Date().toLocaleDateString("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

form.addEventListener("input", render);

document.addEventListener("input", (event) => {
  if (!event.target.classList?.contains("money-input")) return;
  event.target.value = formatMoney(event.target.value);
});

quickExpenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addExpense(dateInput.value, parseMoney(quickAmount.value), quickMemo.value, quickCategory.value);
  quickAmount.value = "";
  quickMemo.value = "";
  render();
});

incomeList.addEventListener("input", (event) => {
  const row = event.target.closest(".money-item");
  if (!row) return;
  const items = loadIncomeItems();
  const item = items.find((entry) => entry.id === row.dataset.id);
  if (!item) return;
  item.name = row.querySelector(".income-name").value;
  item.day = Math.min(31, Math.max(1, Number(row.querySelector(".income-day").value || 1)));
  item.amount = parseMoney(row.querySelector(".income-amount").value);
  saveIncomeItems(items);
  renderSummary(getPlan());
  renderCalendar(getPlan());
});

incomeList.addEventListener("click", (event) => {
  const removeId = event.target.dataset.removeIncome;
  if (!removeId) return;
  saveIncomeItems(loadIncomeItems().filter((item) => item.id !== removeId));
  render();
});

addIncomeButton.addEventListener("click", () => {
  const items = loadIncomeItems();
  items.push({ id: makeId(), name: "새 수입", day: 25, amount: 0 });
  saveIncomeItems(items);
  render();
});

fixedList.addEventListener("input", (event) => {
  const row = event.target.closest(".money-item");
  if (!row) return;
  const items = loadFixedItems();
  const item = items.find((entry) => entry.id === row.dataset.id);
  if (!item) return;
  item.name = row.querySelector(".fixed-name").value;
  item.day = Math.min(31, Math.max(1, Number(row.querySelector(".fixed-day").value || 1)));
  item.amount = parseMoney(row.querySelector(".fixed-amount").value);
  saveFixedItems(items);
  renderSummary(getPlan());
  renderCalendar(getPlan());
});

fixedList.addEventListener("click", (event) => {
  const removeId = event.target.dataset.remove;
  if (!removeId) return;
  saveFixedItems(loadFixedItems().filter((item) => item.id !== removeId));
  render();
});

addFixedButton.addEventListener("click", () => {
  const items = loadFixedItems();
  items.push({ id: makeId(), name: "새 고정 지출", day: 25, amount: 0 });
  saveFixedItems(items);
  render();
});

calendar.addEventListener("click", (event) => {
  const day = event.target.closest("[data-date]");
  if (!day) return;
  openExpenseDialog(day.dataset.date);
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addExpense(selectedExpenseDate, parseMoney(expenseAmount.value), expenseMemo.value, expenseCategory.value);
  expenseAmount.value = "";
  expenseMemo.value = "";
  renderDailyExpenseList(selectedExpenseDate);
  render();
});

document.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.deleteExpense;
  if (!deleteId) return;
  deleteExpense(deleteId);
  if (selectedExpenseDate) renderDailyExpenseList(selectedExpenseDate);
  render();
});

document.querySelector("[data-close]").addEventListener("click", () => {
  expenseDialog.close();
});

render();
