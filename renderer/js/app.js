/**
 * TaskYar - Main Application Controller
 * Handles views rendering, user interactions, alarms, drawer operations, and backup.
 */

function init() {
    applySavedTheme();

    updateHeaderDate();

    initDatePickers();
    setPickerISO('newTaskDate', getLocalISODate());

    const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
    const backupEmailInput = document.getElementById('backupEmailInput');
    if (savedEmail && backupEmailInput) {
        backupEmailInput.value = savedEmail;
    }

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    renderApp();
    setInterval(() => {
        checkAlarms();
        handleDayRollover();
    }, 5000);

    initBackupSettings();
    setupMenuListeners();
    setupKeyboardShortcuts();
}

function updateHeaderDate() {
    const el = document.getElementById('persianDate');
    if (el) {
        el.innerText = new Intl.DateTimeFormat('fa-IR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }).format(new Date());
    }
}

/** When the clock passes midnight, refresh "My Day", the header date and the boards. */
function handleDayRollover() {
    const today = getLocalISODate();
    if (today === lastKnownDateISO) return;
    lastKnownDateISO = today;
    updateHeaderDate();
    if (currentView === 'myday') setPickerISO('newTaskDate', today);
    renderApp();
}

// Alarm Monitoring & Handling
function checkAlarms() {
    if (activeAlarmTaskId) return;
    const now = new Date();
    const todayISO = getLocalISODate(now);
    const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    for (const t of tasks) {
        if (!t.completed && t.alarmEnabled && !t.alarmTriggered && t.dueTime) {
            const targetDate = t.dueDate || todayISO;
            if (targetDate === todayISO && t.dueTime === currentHHMM) {
                triggerAlarm(t);
                break;
            }
        }
    }
}

function triggerAlarm(task) {
    activeAlarmTaskId = task.id;
    task.alarmTriggered = true;
    saveTasks();

    const titleEl = document.getElementById('alarmTaskTitle');
    const timeEl = document.getElementById('alarmTaskTime');
    const modalEl = document.getElementById('alarmModal');

    if (titleEl) titleEl.innerText = task.title;
    if (timeEl) timeEl.innerText = `ساعت تنظیم شده: ${task.dueTime} (${formatPersianShortDate(task.dueDate)})`;
    if (modalEl) modalEl.classList.add('show');

    playAlarmBeep();
    alarmInterval = setInterval(playAlarmBeep, 2000);

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("یادآور تسک‌یار", { body: task.title });
    }
}

function dismissAlarm() {
    clearInterval(alarmInterval);
    activeAlarmTaskId = null;
    const modalEl = document.getElementById('alarmModal');
    if (modalEl) modalEl.classList.remove('show');
    renderApp();
}

function snoozeAlarm() {
    clearInterval(alarmInterval);
    const t = tasks.find(x => x.id === activeAlarmTaskId);
    if (t) {
        const snoozeTime = new Date(Date.now() + 5 * 60000);
        t.dueDate = getLocalISODate(snoozeTime);
        t.dueTime = String(snoozeTime.getHours()).padStart(2, '0') + ':' + String(snoozeTime.getMinutes()).padStart(2, '0');
        t.alarmTriggered = false;
        saveTasks();
    }
    activeAlarmTaskId = null;
    const modalEl = document.getElementById('alarmModal');
    if (modalEl) modalEl.classList.remove('show');
    renderApp();
}

function toggleNewTaskAlarm() {
    newTaskAlarmState = !newTaskAlarmState;
    const btn = document.getElementById('newTaskAlarmBtn');
    if (btn) btn.classList.toggle('active', newTaskAlarmState);
    const timeInput = document.getElementById('newTaskTime');
    if (newTaskAlarmState && timeInput && !timeInput.value) {
        const nextHour = new Date(Date.now() + 3600000);
        timeInput.value = String(nextHour.getHours()).padStart(2, '0') + ':00';
    }
}

// ===========================================================
// Navigation & View Rendering
// ===========================================================
const BOARD_VIEWS = ['weekboard', 'monthboard'];

function getSearchQuery() {
    const searchInput = document.getElementById('searchInput');
    return searchInput ? searchInput.value.trim().toLowerCase() : '';
}

function matchesQuery(task, q) {
    return !q || task.title.toLowerCase().includes(q);
}

function sortByTime(list) {
    return [...list].sort((a, b) => {
        if (!a.dueTime && !b.dueTime) return 0;
        if (!a.dueTime) return 1;
        if (!b.dueTime) return -1;
        return a.dueTime.localeCompare(b.dueTime);
    });
}

/** Sidebar click: entering the month board always starts from the current month. */
function switchView(view, element) {
    if (view === 'monthboard') resetMonthBoardToToday();
    activateView(view, element);
}

function activateView(view, element) {
    currentView = view;
    JalaliPicker.close();

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navKey = view === 'daydetail' ? 'monthboard' : view;
    const navTarget = element || document.querySelector(`.nav-item[data-view="${navKey}"]`);
    if (navTarget) navTarget.classList.add('active');

    document.body.classList.toggle('board-view', BOARD_VIEWS.includes(view));
    updateViewTitle();

    const periodSelect = document.getElementById('newTaskPeriod');
    if (['daily', 'weekly', 'monthly'].includes(view) && periodSelect) {
        periodSelect.value = view;
    }

    // Keep the date of the "add task" bar in sync with the visible list
    if (view === 'myday') setPickerISO('newTaskDate', getLocalISODate());
    if (view === 'daydetail' && selectedDateISO) setPickerISO('newTaskDate', selectedDateISO);

    renderApp();
}

function updateViewTitle() {
    const el = document.getElementById('viewTitle');
    if (!el) return;
    if (currentView === 'daydetail' && selectedDateISO) {
        el.innerText = `تسک‌های ${formatJalaliLong(selectedDateISO, true)}`;
    } else {
        el.innerText = viewTitles[currentView] || 'تسک‌یار';
    }
}

function renderApp() {
    const listContainer = document.getElementById('tasksContainer');
    const weekBoard = document.getElementById('weekBoardContainer');
    const monthBoard = document.getElementById('monthBoardContainer');
    const progressWrapper = document.getElementById('progressWrapper');
    if (!listContainer || !weekBoard || !monthBoard || !progressWrapper) return;

    const isWeek = currentView === 'weekboard';
    const isMonth = currentView === 'monthboard';

    listContainer.style.display = (isWeek || isMonth) ? 'none' : 'flex';
    progressWrapper.style.display = (isWeek || isMonth) ? 'none' : 'block';
    weekBoard.classList.toggle('active', isWeek);
    monthBoard.classList.toggle('active', isMonth);

    if (isWeek) renderWeekBoard();
    else if (isMonth) renderMonthBoard();
    else renderTasks();

    updateBadges();
}

// ---------- 7-day week board (all 7 days fit on screen, no scrolling) ----------
function renderWeekBoard() {
    const board = document.getElementById('weekBoardContainer');
    const q = getSearchQuery();
    board.innerHTML = '';

    getCurrentPersianWeekDays().forEach(day => {
        const dayTasks = sortByTime(tasks.filter(t => t.dueDate === day.iso && matchesQuery(t, q)));

        const col = document.createElement('div');
        col.className = `day-column-card ${day.isToday ? 'is-today' : ''}`;
        col.innerHTML = renderDayColumnHTML(day.dayName, day.dateLabel, day.iso, dayTasks, day.isToday);
        board.appendChild(col);

        renderDayTasks(col.querySelector('.day-col-tasks'), dayTasks);
    });
}

function renderDayColumnHTML(dayTitle, daySub, iso, dayTasks, isToday) {
    return `
        <div class="day-col-header">
            <div>
                <div class="day-col-title">${escapeHTML(dayTitle)}</div>
                <div class="day-col-sub">${escapeHTML(daySub)}</div>
            </div>
            ${isToday ? '<span class="today-badge">امروز</span>' : `<span class="badge">${dayTasks.length}</span>`}
        </div>
        <div class="day-col-tasks"></div>
        <div class="day-col-footer">
            <input type="text" placeholder="+ کار جدید" title="افزودن کار در ${escapeHTML(dayTitle)}"
                   onkeypress="if(event.key==='Enter') quickAddForDay('${iso}', this)">
        </div>
    `;
}

function renderDayTasks(container, dayTasks) {
    container.innerHTML = '';
    if (dayTasks.length === 0) {
        container.innerHTML = '<div class="day-empty">بدون برنامه</div>';
        return;
    }
    dayTasks.forEach(t => {
        const item = document.createElement('div');
        item.className = `day-mini-task ${t.completed ? 'completed' : ''}`;
        item.onclick = (e) => {
            if (e.target.type === 'checkbox') return;
            openDrawer(t.id);
        };
        item.innerHTML = `
            <div class="mini-top">
                <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleComplete(${t.id})">
                <span class="mini-title">${escapeHTML(t.title)}</span>
            </div>
            <div class="mini-meta">
                <span>${t.dueTime ? '⏰ ' + t.dueTime : ''}</span>
                ${t.alarmEnabled ? '<span class="mini-alarm" title="آلارم فعال">🔔</span>' : ''}
            </div>
        `;
        container.appendChild(item);
    });
}

// ---------- 30-day month board (Persian month calendar) ----------
function resetMonthBoardToToday() {
    const j = isoToJalali(getLocalISODate());
    monthBoardState = { jy: j.jy, jm: j.jm };
}

function shiftMonthBoard(delta) {
    let { jy, jm } = monthBoardState;
    jm += delta;
    while (jm > 12) { jm -= 12; jy++; }
    while (jm < 1) { jm += 12; jy--; }
    monthBoardState = { jy, jm };
    renderApp();
}

function goMonthBoardToday() {
    resetMonthBoardToToday();
    renderApp();
}

function getMonthTaskCount(jy, jm) {
    const from = jalaliToISO(jy, jm, 1);
    const to = jalaliToISO(jy, jm, jalaliMonthLength(jy, jm));
    return tasks.filter(t => t.dueDate && t.dueDate >= from && t.dueDate <= to).length;
}

function renderMonthBoard() {
    const board = document.getElementById('monthBoardContainer');
    if (!monthBoardState.jy) resetMonthBoardToToday();
    const { jy, jm } = monthBoardState;
    const q = getSearchQuery();
    const todayISO = getLocalISODate();

    const len = jalaliMonthLength(jy, jm);
    const firstG = jalaliToGregorian(jy, jm, 1);
    const offset = persianWeekdayIndex(new Date(firstG.gy, firstG.gm - 1, firstG.gd));
    const rows = Math.ceil((offset + len) / 7);

    // Group tasks by date once
    const byDate = {};
    tasks.forEach(t => {
        if (!t.dueDate || !matchesQuery(t, q)) return;
        (byDate[t.dueDate] = byDate[t.dueDate] || []).push(t);
    });

    const weekdayHeads = PERSIAN_WEEKDAY_NAMES.map((n, i) =>
        `<div class="month-weekday ${i === 6 ? 'friday' : ''}">${n}</div>`
    ).join('');

    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<div class="month-cell empty"></div>';

    for (let d = 1; d <= len; d++) {
        const iso = jalaliToISO(jy, jm, d);
        const dayTasks = sortByTime(byDate[iso] || []);
        const col = (offset + d - 1) % 7;
        const maxChips = 2;
        const chips = dayTasks.slice(0, maxChips).map(t =>
            `<div class="month-chip ${t.completed ? 'done' : ''}">${escapeHTML(t.title)}</div>`
        ).join('');
        const more = dayTasks.length > maxChips
            ? `<div class="month-more">+${toPersianDigits(dayTasks.length - maxChips)} مورد دیگر</div>` : '';
        const cls = ['month-cell', iso === todayISO ? 'is-today' : '', col === 6 ? 'friday' : '',
            dayTasks.length ? 'has-tasks' : ''].join(' ');

        cells += `
            <div class="${cls}" onclick="openDayDetail('${iso}')"
                 title="${escapeHTML(formatJalaliLong(iso, true))} — ${toPersianDigits(dayTasks.length)} کار">
                <div class="month-cell-head">
                    <span class="month-day-num">${toPersianDigits(d)}</span>
                    ${dayTasks.length ? `<span class="month-count">${toPersianDigits(dayTasks.length)}</span>` : ''}
                </div>
                <div class="month-cell-tasks">${chips}${more}</div>
            </div>`;
    }

    board.innerHTML = `
        <div class="month-toolbar">
            <button type="button" class="month-nav-btn" onclick="shiftMonthBoard(-1)" title="ماه قبل">›</button>
            <div class="month-title">
                ${PERSIAN_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}
                <small>(${toPersianDigits(len)} روز — ${toPersianDigits(getMonthTaskCount(jy, jm))} کار)</small>
            </div>
            <button type="button" class="month-nav-btn" onclick="shiftMonthBoard(1)" title="ماه بعد">‹</button>
            <button type="button" class="btn-add" onclick="goMonthBoardToday()">امروز</button>
        </div>
        <div class="month-grid" style="--rows:${rows}">
            ${weekdayHeads}${cells}
        </div>
    `;
}

// ---------- Day detail page (opened by clicking a day on the month board) ----------
function openDayDetail(iso) {
    selectedDateISO = iso;
    const j = isoToJalali(iso);
    monthBoardState = { jy: j.jy, jm: j.jm };
    activateView('daydetail');
}

function shiftDayDetail(delta) {
    if (!selectedDateISO) return;
    openDayDetail(addDaysISO(selectedDateISO, delta));
}

function backToMonthBoard() {
    activateView('monthboard');
}

function createDayDetailBar() {
    const bar = document.createElement('div');
    bar.className = 'day-detail-bar';
    bar.innerHTML = `
        <button type="button" class="btn-back" onclick="backToMonthBoard()">→ بازگشت به برد ماه</button>
        <div class="day-detail-nav">
            <button type="button" class="month-nav-btn" onclick="shiftDayDetail(-1)" title="روز قبل">›</button>
            <span class="day-detail-date">${escapeHTML(formatJalaliLong(selectedDateISO, true))}</span>
            <button type="button" class="month-nav-btn" onclick="shiftDayDetail(1)" title="روز بعد">‹</button>
        </div>
    `;
    return bar;
}

function quickAddForDay(isoDate, inputEl) {
    const title = inputEl.value.trim();
    if (!title) return;
    tasks.unshift({
        id: Date.now(),
        title,
        period: 'daily',
        dueDate: isoDate,
        dueTime: '',
        alarmEnabled: false,
        alarmTriggered: false,
        completed: false,
        important: false,
        myDay: isoDate === getLocalISODate(),
        notes: '',
        subtasks: [],
        createdAt: new Intl.DateTimeFormat('fa-IR').format(new Date())
    });
    inputEl.value = '';
    saveTasks();
    renderApp();
}

function getFilteredTasks() {
    const searchInput = document.getElementById('searchInput');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const todayISO = getLocalISODate();
    return tasks.filter(t => {
        if (q && !t.title.toLowerCase().includes(q)) return false;
        // "My Day" shows ONLY the tasks that belong to today
        if (currentView === 'myday') return t.dueDate === todayISO;
        // Day-detail page: only the tasks of the clicked day
        if (currentView === 'daydetail') return t.dueDate === selectedDateISO;
        if (currentView === 'important') return t.important;
        if (currentView === 'daily') return t.period === 'daily';
        if (currentView === 'weekly') return t.period === 'weekly';
        if (currentView === 'monthly') return t.period === 'monthly';
        return true;
    });
}

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    const filtered = getFilteredTasks();
    container.innerHTML = '';
    if (currentView === 'daydetail') container.appendChild(createDayDetailBar());

    const activeTasks = filtered.filter(t => !t.completed);
    const completedTasks = filtered.filter(t => t.completed);

    const total = filtered.length;
    const compCount = completedTasks.length;
    const percent = total === 0 ? 0 : Math.round((compCount / total) * 100);

    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressText) progressText.innerText = `${percent}% (${compCount} از ${total} انجام شده)`;

    if (filtered.length === 0) {
        container.insertAdjacentHTML('beforeend', `
            <div class="empty-state">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                <p style="font-weight:600; font-size:15px;">هیچ کاری در این لیست وجود ندارد</p>
                <p style="font-size:12px; margin-top:4px;">از کادر پایین یک برنامه جدید به همراه تاریخ و ساعت اضافه کنید</p>
            </div>`);
        return;
    }

    activeTasks.forEach(t => container.appendChild(createTaskCard(t)));

    if (completedTasks.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'section-divider';
        divider.innerHTML = `<span>انجام شده‌ها (${completedTasks.length})</span>`;
        container.appendChild(divider);
        completedTasks.forEach(t => container.appendChild(createTaskCard(t)));
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.completed ? 'completed' : ''} ${task.id === selectedTaskId ? 'selected' : ''}`;
    card.onclick = (e) => {
        if (e.target.closest('.custom-checkbox') || e.target.closest('.star-btn')) return;
        openDrawer(task.id);
    };

    const pInfo = periodLabels[task.period] || periodLabels.daily;
    const subDone = (task.subtasks || []).filter(s => s.done).length;
    const subTotal = (task.subtasks || []).length;

    card.innerHTML = `
        <div class="task-right">
            <div class="custom-checkbox" onclick="toggleComplete(${task.id})">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <div class="task-info">
                <div class="task-title">${escapeHTML(task.title)}</div>
                <div class="task-meta">
                    <span class="period-tag ${pInfo.cls}">${pInfo.text}</span>
                    ${task.dueDate ? `<span class="meta-chip">📅 ${formatPersianShortDate(task.dueDate)}</span>` : ''}
                    ${task.dueTime ? `<span class="meta-chip ${task.alarmEnabled ? 'alarm-active' : ''}">${task.alarmEnabled ? '🔔' : '🕒'} ${task.dueTime}</span>` : ''}
                    ${subTotal > 0 ? `<span>• مراحل: ${subDone}/${subTotal}</span>` : ''}
                    ${task.notes ? `<span>• یادداشت</span>` : ''}
                </div>
            </div>
        </div>
        <button class="star-btn ${task.important ? 'important' : ''}" onclick="toggleImportant(${task.id})">
            <svg width="20" height="20" fill="${task.important ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
        </button>
    `;
    return card;
}

// Task CRUD
function addTask() {
    const input = document.getElementById('newTaskInput');
    const period = document.getElementById('newTaskPeriod').value;
    const dueDate = getPickerISO('newTaskDate') || getLocalISODate();
    const dueTime = document.getElementById('newTaskTime').value;
    const title = input.value.trim();
    if (!title) return;

    const newTask = {
        id: Date.now(),
        title,
        period,
        dueDate,
        dueTime,
        alarmEnabled: newTaskAlarmState && Boolean(dueTime),
        alarmTriggered: false,
        completed: false,
        important: currentView === 'important',
        myDay: dueDate === getLocalISODate(),
        notes: '',
        subtasks: [],
        createdAt: new Intl.DateTimeFormat('fa-IR').format(new Date())
    };

    tasks.unshift(newTask);

    // Let the user know when the new task belongs to a day that is not on screen
    if (currentView === 'myday' && dueDate !== getLocalISODate()) {
        showToast(`کار برای ${formatJalaliLong(dueDate, true)} ثبت شد و در «روز من» نمایش داده نمی‌شود.`, 'info');
    } else if (currentView === 'daydetail' && dueDate !== selectedDateISO) {
        showToast(`کار برای ${formatJalaliLong(dueDate, true)} ثبت شد.`, 'info');
    }
    input.value = '';
    document.getElementById('newTaskTime').value = '';
    newTaskAlarmState = false;
    const alarmBtn = document.getElementById('newTaskAlarmBtn');
    if (alarmBtn) alarmBtn.classList.remove('active');

    saveTasks();
    renderApp();
}

function toggleComplete(id) {
    const t = tasks.find(x => x.id === id);
    if (t) {
        t.completed = !t.completed;
        if (t.completed) playCompleteSound();
        saveTasks();
        renderApp();
    }
}

function toggleImportant(id) {
    const t = tasks.find(x => x.id === id);
    if (t) {
        t.important = !t.important;
        saveTasks();
        renderApp();
    }
}

function updateBadges() {
    const active = tasks.filter(t => !t.completed);
    const todayISO = getLocalISODate();

    const setBadge = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    const weekDays = getCurrentPersianWeekDays().map(d => d.iso);
    const todayJ = isoToJalali(todayISO);
    const monthFrom = jalaliToISO(todayJ.jy, todayJ.jm, 1);
    const monthTo = jalaliToISO(todayJ.jy, todayJ.jm, jalaliMonthLength(todayJ.jy, todayJ.jm));

    setBadge('badge-myday', active.filter(t => t.dueDate === todayISO).length);
    setBadge('badge-weekboard', active.filter(t => weekDays.includes(t.dueDate)).length);
    setBadge('badge-monthboard', active.filter(t => t.dueDate && t.dueDate >= monthFrom && t.dueDate <= monthTo).length);
    setBadge('badge-important', active.filter(t => t.important).length);
    setBadge('badge-daily', active.filter(t => t.period === 'daily').length);
    setBadge('badge-weekly', active.filter(t => t.period === 'weekly').length);
    setBadge('badge-monthly', active.filter(t => t.period === 'monthly').length);
    setBadge('badge-all', active.length);
}

// Detail Drawer Management
function openDrawer(id) {
    selectedTaskId = id;
    const t = tasks.find(x => x.id === id);
    if (!t) return;

    const drawer = document.getElementById('detailDrawer');
    if (drawer) drawer.classList.add('open');

    document.getElementById('drawerTitle').value = t.title;
    document.getElementById('drawerPeriod').value = t.period;
    setPickerISO('drawerDate', t.dueDate || '');
    document.getElementById('drawerTime').value = t.dueTime || '';
    document.getElementById('drawerNotes').value = t.notes || '';
    document.getElementById('drawerCreatedDate').innerText = `ایجاد شده در: ${t.createdAt}`;

    updateDrawerAlarmButtonUI(t.alarmEnabled);
    renderSubtasks();
    renderApp();
}

function updateDrawerAlarmButtonUI(isEnabled) {
    const btn = document.getElementById('drawerAlarmBtn');
    const txt = document.getElementById('drawerAlarmText');
    if (btn) btn.classList.toggle('active', Boolean(isEnabled));
    if (txt) txt.innerText = isEnabled ? 'فعال است' : 'غیرفعال';
}

function updateSelectedTaskSchedule() {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (!t) return;
    t.dueDate = getPickerISO('drawerDate');
    t.dueTime = document.getElementById('drawerTime').value;
    t.alarmTriggered = false;
    saveTasks();
    renderApp();
}

function toggleDrawerAlarm() {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (!t) return;
    t.alarmEnabled = !t.alarmEnabled;
    t.alarmTriggered = false;
    if (t.alarmEnabled && !t.dueTime) {
        t.dueTime = '09:00';
        document.getElementById('drawerTime').value = '09:00';
    }
    updateDrawerAlarmButtonUI(t.alarmEnabled);
    saveTasks();
    renderApp();
}

function closeDrawer() {
    selectedTaskId = null;
    const drawer = document.getElementById('detailDrawer');
    if (drawer) drawer.classList.remove('open');
    renderApp();
}

function renderSubtasks() {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (!t) return;
    const list = document.getElementById('subtasksList');
    if (!list) return;
    list.innerHTML = '';
    (t.subtasks || []).forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'subtask-item';
        div.innerHTML = `
            <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleSubtask(${idx})">
            <span style="flex:1; ${s.done ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${escapeHTML(s.text)}</span>
            <button style="background:none; border:none; color:#94A3B8; cursor:pointer;" onclick="removeSubtask(${idx})">✕</button>
        `;
        list.appendChild(div);
    });
}

function addSubtask() {
    const input = document.getElementById('newSubtaskInput');
    const text = input ? input.value.trim() : '';
    if (!text || !selectedTaskId) return;
    const t = tasks.find(x => x.id === selectedTaskId);
    t.subtasks = t.subtasks || [];
    t.subtasks.push({ text, done: false });
    input.value = '';
    saveTasks();
    renderSubtasks();
    renderApp();
}

function toggleSubtask(idx) {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (t && t.subtasks && t.subtasks[idx]) {
        t.subtasks[idx].done = !t.subtasks[idx].done;
        saveTasks();
        renderSubtasks();
        renderApp();
    }
}

function removeSubtask(idx) {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (t && t.subtasks) {
        t.subtasks.splice(idx, 1);
        saveTasks();
        renderSubtasks();
        renderApp();
    }
}

function updateSelectedTaskTitle(val) {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (t && val.trim()) {
        t.title = val.trim();
        saveTasks();
        renderApp();
    }
}

function updateSelectedTaskPeriod(val) {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (t) {
        t.period = val;
        saveTasks();
        renderApp();
    }
}

function updateSelectedTaskNotes(val) {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (t) {
        t.notes = val;
        saveTasks();
        renderApp();
    }
}

function deleteSelectedTask() {
    tasks = tasks.filter(x => x.id !== selectedTaskId);
    closeDrawer();
    saveTasks();
    renderApp();
}

// Theme Switcher & Persistence
function setTheme(theme, dot) {
    currentTheme = theme || 'default';
    try {
        localStorage.setItem(STORAGE_KEY_THEME, currentTheme);
    } catch (e) {}

    if (currentTheme === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', currentTheme);
    }

    document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
    const targetDot = dot || document.querySelector(`.theme-dot[onclick*="'${currentTheme}'"]`);
    if (targetDot) targetDot.classList.add('active');
}

function applySavedTheme() {
    setTheme(currentTheme);
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg width="18" height="18" fill="none" stroke="#10B981" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
    } else if (type === 'error') {
        iconSvg = '<svg width="18" height="18" fill="none" stroke="#EF4444" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
    } else {
        iconSvg = '<svg width="18" height="18" fill="none" stroke="var(--primary)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 350);
    }, 3800);
}

// Backup & Storage Management
let autoBackupTimer = null;

async function initBackupSettings() {
    if (window.electronAPI && window.electronAPI.getDefaultFolder) {
        if (!backupSettings.folderPath) {
            try {
                const defaultFolder = await window.electronAPI.getDefaultFolder();
                if (defaultFolder) {
                    backupSettings.folderPath = defaultFolder;
                    saveBackupSettings();
                }
            } catch (err) {}
        }
    }
    initAutoBackup();
}

function initAutoBackup() {
    if (autoBackupTimer) {
        clearInterval(autoBackupTimer);
        autoBackupTimer = null;
    }
    if (!backupSettings.enabled) return;

    const intervalMs = Math.max(5, Number(backupSettings.intervalMinutes) || 30) * 60 * 1000;
    autoBackupTimer = setInterval(async () => {
        await executeBackup(true);
    }, intervalMs);
}

async function executeBackup(isAuto = false) {
    const data = JSON.stringify(tasks, null, 2);
    if (window.electronAPI && window.electronAPI.saveBackupFile) {
        try {
            const res = await window.electronAPI.saveBackupFile({
                folderPath: backupSettings.folderPath,
                data,
                isAuto
            });
            if (res && res.success) {
                backupSettings.lastBackupTimestamp = res.timestamp || Date.now();
                backupSettings.lastBackupDate = formatPersianDateTime(new Date(backupSettings.lastBackupTimestamp));
                backupSettings.lastBackupFileName = res.fileName || '';
                saveBackupSettings();
                updateBackupModalUI();
                if (!isAuto) {
                    showToast(`نسخه پشتیبان با موفقیت ذخیره شد (${res.fileName})`, 'success');
                }
                return true;
            } else {
                if (!isAuto) {
                    showToast('خطا در ذخیره نسخه پشتیبان: ' + (res ? res.error : 'نامشخص'), 'error');
                }
                return false;
            }
        } catch (err) {
            if (!isAuto) showToast('خطا در ارتباط با فایل سیستم: ' + err.message, 'error');
            return false;
        }
    } else {
        if (!isAuto) {
            exportData();
            showToast('فایل پشتیبان در پوشه دانلودها ذخیره شد.', 'success');
        }
        return true;
    }
}

async function handleExportBackup() {
    if (window.electronAPI && window.electronAPI.exportFileDialog) {
        try {
            const res = await window.electronAPI.exportFileDialog(tasks);
            if (res && res.success) {
                showToast('فایل پشتیبان با موفقیت ذخیره شد.', 'success');
            }
        } catch (err) {
            exportData();
        }
    } else {
        exportData();
    }
}

async function handleImportBackup() {
    if (window.electronAPI && window.electronAPI.importFileDialog) {
        try {
            const res = await window.electronAPI.importFileDialog();
            if (res && res.success && res.content) {
                applyImportedData(res.content);
            }
        } catch (err) {
            showToast('خطا در بارگذاری فایل: ' + err.message, 'error');
        }
    } else {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = (e) => importData(e);
        fileInput.click();
    }
}

function applyImportedData(rawContent) {
    try {
        const imported = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
        if (Array.isArray(imported)) {
            if (confirm(`آیا از جایگزینی لیست کارها با داده‌های فایل پشتیبان (${imported.length} کار) اطمینان دارید؟`)) {
                tasks = imported;
                saveTasks();
                renderApp();
                showToast(`اطلاعات با موفقیت بازیابی شد (${tasks.length} کار).`, 'success');
            }
        } else {
            showToast('فرمت فایل پشتیبان معتبر نیست.', 'error');
        }
    } catch (err) {
        showToast('فایل پشتیبان معتبر نیست یا آسیب دیده است.', 'error');
    }
}

async function chooseBackupFolder() {
    if (window.electronAPI && window.electronAPI.selectFolder) {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            backupSettings.folderPath = folder;
            const display = document.getElementById('backupFolderPathDisplay');
            if (display) display.innerText = folder;
        }
    } else {
        showToast('انتخاب پوشه در نسخه دسکتاپ فعال است.', 'info');
    }
}

async function openBackupFolder() {
    if (window.electronAPI && window.electronAPI.openFolder) {
        const success = await window.electronAPI.openFolder(backupSettings.folderPath);
        if (!success) {
            showToast('امکان باز کردن پوشه فایل‌های پشتیبان وجود ندارد.', 'error');
        }
    } else {
        showToast('این قابلیت در نسخه دسکتاپ فعال است.', 'info');
    }
}

function openBackupSettingsModal() {
    const modal = document.getElementById('backupSettingsModal');
    if (!modal) return;
    updateBackupModalUI();
    modal.classList.add('show');
}

function closeBackupSettingsModal() {
    const modal = document.getElementById('backupSettingsModal');
    if (modal) modal.classList.remove('show');
}

function updateBackupModalUI() {
    const enabledInput = document.getElementById('backupAutoEnabledInput');
    const intervalInput = document.getElementById('backupIntervalInput');
    const pathDisplay = document.getElementById('backupFolderPathDisplay');
    const statusText = document.getElementById('lastBackupStatusText');

    if (enabledInput) enabledInput.checked = Boolean(backupSettings.enabled);
    if (intervalInput) intervalInput.value = String(backupSettings.intervalMinutes || 30);
    if (pathDisplay) pathDisplay.innerText = backupSettings.folderPath || 'مسیر پیش‌فرض اسناد ویندوز (TaskYar_Backups)';
    if (statusText) {
        if (backupSettings.lastBackupDate) {
            statusText.innerText = `${backupSettings.lastBackupDate} (${backupSettings.lastBackupFileName || ''})`;
        } else {
            statusText.innerText = 'هنوز نسخه پشتیبانی ثبت نشده است.';
        }
    }
}

function saveBackupSettingsFromModal() {
    const enabledInput = document.getElementById('backupAutoEnabledInput');
    const intervalInput = document.getElementById('backupIntervalInput');

    if (enabledInput) backupSettings.enabled = enabledInput.checked;
    if (intervalInput) backupSettings.intervalMinutes = Number(intervalInput.value) || 30;

    saveBackupSettings();
    initAutoBackup();
    closeBackupSettingsModal();
    showToast('تنظیمات پشتیبان‌گیری با موفقیت ذخیره شد.', 'success');
}

async function triggerManualBackupNow() {
    await executeBackup(false);
}

// Shortcuts & About Modals
function openShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.classList.add('show');
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.classList.remove('show');
}

function openAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.classList.add('show');
}

function closeAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.classList.remove('show');
}

// Menu IPC Listeners Setup
function setupMenuListeners() {
    if (!window.electronAPI || !window.electronAPI.onMenuAction) return;

    window.electronAPI.onMenuAction('menu:new-task', () => {
        const input = document.getElementById('newTaskInput');
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    window.electronAPI.onMenuAction('menu:focus-search', () => {
        const input = document.getElementById('searchInput');
        if (input) {
            input.focus();
            input.select();
        }
    });

    window.electronAPI.onMenuAction('menu:delete-task', () => {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
        if (selectedTaskId && confirm('این کار حذف شود؟')) {
            deleteSelectedTask();
        }
    });

    window.electronAPI.onMenuAction('menu:open-backup-settings', () => {
        openBackupSettingsModal();
    });

    window.electronAPI.onMenuAction('menu:trigger-backup', async () => {
        await executeBackup(false);
    });

    window.electronAPI.onMenuAction('menu:export-backup', async () => {
        await handleExportBackup();
    });

    window.electronAPI.onMenuAction('menu:import-backup', async () => {
        await handleImportBackup();
    });

    window.electronAPI.onMenuAction('menu:open-backup-folder', async () => {
        await openBackupFolder();
    });

    window.electronAPI.onMenuAction('menu:email-backup', () => {
        openEmailModal();
    });

    window.electronAPI.onMenuAction('menu:switch-view', (view) => {
        const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
        switchView(view, navItem);
    });

    window.electronAPI.onMenuAction('menu:set-theme', (theme) => {
        setTheme(theme);
    });

    window.electronAPI.onMenuAction('menu:open-shortcuts', () => {
        openShortcutsModal();
    });

    window.electronAPI.onMenuAction('menu:open-about', () => {
        openAboutModal();
    });
}

// In-App Keyboard Shortcuts
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

        if (e.key === 'F1') {
            e.preventDefault();
            openShortcutsModal();
            return;
        }

        if (e.key === 'Escape') {
            closeBackupSettingsModal();
            closeShortcutsModal();
            closeAboutModal();
            closeEmailModal();
            // First Escape only closes an open date picker
            if (JalaliPicker.isOpen()) {
                JalaliPicker.close();
                return;
            }
            closeDrawer();
            return;
        }

        // Delete key removes the selected task (never while typing in a field)
        if (e.key === 'Delete' && !isInput && selectedTaskId) {
            e.preventDefault();
            if (confirm('این کار حذف شود؟')) deleteSelectedTask();
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if (e.key.toLowerCase() === 'b') {
                e.preventDefault();
                if (e.shiftKey) {
                    executeBackup(false);
                } else {
                    openBackupSettingsModal();
                }
                return;
            }
            if (!isInput && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                const input = document.getElementById('newTaskInput');
                if (input) {
                    input.focus();
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }
            if (!isInput && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                const search = document.getElementById('searchInput');
                if (search) {
                    search.focus();
                    search.select();
                }
                return;
            }
        }

        if (e.altKey) {
            const viewMap = {
                '1': 'myday',
                '2': 'weekboard',
                '3': 'monthboard',
                '4': 'important',
                '5': 'daily',
                '6': 'weekly',
                '7': 'monthly',
                '8': 'all'
            };
            if (viewMap[e.key]) {
                e.preventDefault();
                const view = viewMap[e.key];
                const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
                switchView(view, navItem);
            }
        }
    });
}

// Browser Fallback Backup & Import/Export
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `taskyar_backup_${getLocalISODate()}.json`;
    a.click();
}

function openEmailModal() {
    const modal = document.getElementById('emailModal');
    if (modal) modal.classList.add('show');
}

function closeEmailModal() {
    const modal = document.getElementById('emailModal');
    if (modal) modal.classList.remove('show');
}

function sendEmailBackup() {
    const emailInput = document.getElementById('backupEmailInput');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
        alert('لطفاً آدرس ایمیل را وارد کنید.');
        return;
    }
    localStorage.setItem(STORAGE_KEY_EMAIL, email);

    // Download JSON backup locally as well
    exportData();

    const persianToday = new Intl.DateTimeFormat('fa-IR').format(new Date());
    const summaryLines = tasks.map((t, idx) =>
        `${idx + 1}. [${t.completed ? '✔' : ' '}] ${t.title} (${t.dueDate || 'بدون تاریخ'} ${t.dueTime || ''})`
    ).join('\n');

    const fullBackupText = `پشتیبان کارهای تسک‌یار (${persianToday}):\n\n${summaryLines}\n\n--- JSON DATA ---\n${JSON.stringify(tasks)}`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(fullBackupText).catch(() => {});
    }

    const subject = encodeURIComponent(`پشتیبان تسک‌یار - ${persianToday}`);
    const body = encodeURIComponent(`خلاصه وظایف ثبت شده در تسک‌یار (${persianToday}):\n\n${summaryLines}\n\n(نکته: فایل JSON کامل نیز در سیستم شما دانلود شد و متن کامل در کلیپ‌بورد کپی شده است).`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;

    closeEmailModal();
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        applyImportedData(evt.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', init);
