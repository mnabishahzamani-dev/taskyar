const STORAGE_KEY_TASKS = 'persian_todo_tasks';
const STORAGE_KEY_EMAIL = 'persian_todo_backup_email';
const STORAGE_KEY_BACKUP_SETTINGS = 'taskyar_backup_settings';
const STORAGE_KEY_THEME = 'taskyar_theme';
let currentTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'default';


const initialTasks = [
    {
        id: 1,
        title: 'بررسی ایمیل‌ها و پیام‌های کاری صبحگاهی',
        period: 'daily',
        dueDate: getLocalISODate(),
        dueTime: '09:30',
        alarmEnabled: true,
        alarmTriggered: false,
        completed: false,
        important: true,
        myDay: true,
        notes: 'پاسخ به مشتریان اولویت‌دار',
        subtasks: [
            { text: 'بررسی پنل کاربری', done: true },
            { text: 'ارسال پیش‌فاکتورها', done: false }
        ],
        createdAt: 'امروز'
    },
    {
        id: 2,
        title: 'طراحی رابط کاربری پروژه جدید',
        period: 'weekly',
        dueDate: getLocalISODate(),
        dueTime: '14:00',
        alarmEnabled: false,
        alarmTriggered: false,
        completed: false,
        important: true,
        myDay: true,
        notes: 'رعایت اصول مینیمالیسم و گوشه‌های گرد',
        subtasks: [],
        createdAt: 'امروز'
    }
];

let tasks = [];
try {
    const raw = localStorage.getItem(STORAGE_KEY_TASKS);
    tasks = raw ? JSON.parse(raw) : initialTasks;
} catch (e) {
    tasks = initialTasks;
}

const defaultBackupSettings = {
    enabled: true,
    folderPath: '',
    intervalMinutes: 30,
    lastBackupTimestamp: null,
    lastBackupDate: '',
    lastBackupFileName: ''
};

let backupSettings = { ...defaultBackupSettings };
try {
    const rawBackup = localStorage.getItem(STORAGE_KEY_BACKUP_SETTINGS);
    if (rawBackup) {
        backupSettings = { ...defaultBackupSettings, ...JSON.parse(rawBackup) };
    }
} catch (e) {
    backupSettings = { ...defaultBackupSettings };
}

let currentView = 'myday';
let selectedTaskId = null;
let newTaskAlarmState = false;
let activeAlarmTaskId = null;
let alarmInterval = null;
let selectedDateISO = null;
// Jalali month currently shown on the 30-day month board
let monthBoardState = { jy: 0, jm: 0 };
// Used to detect the midnight rollover (so "My Day" refreshes by itself)
let lastKnownDateISO = getLocalISODate();

const viewTitles = {
    myday: 'روز من',
    weekboard: 'برد ۷ روز هفته جاری',
    monthboard: 'برد ۳۰ روزه ماه',
    daydetail: 'تسک‌های روز',
    important: 'مهم و ستاره‌دار',
    daily: 'کارهای روزانه',
    weekly: 'برنامه‌های هفتگی',
    monthly: 'اهداف ماهیانه',
    all: 'همه وظایف'
};

const periodLabels = {
    daily: { text: 'روزانه', cls: 'period-daily' },
    weekly: { text: 'هفتگی', cls: 'period-weekly' },
    monthly: { text: 'ماهیانه', cls: 'period-monthly' }
};

function saveTasks() {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    if (typeof updateBadges === 'function') {
        updateBadges();
    }
}

function saveBackupSettings() {
    localStorage.setItem(STORAGE_KEY_BACKUP_SETTINGS, JSON.stringify(backupSettings));
}

