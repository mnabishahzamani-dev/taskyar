function getLocalISODate(dateObj = new Date()) {
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().split('T')[0];
}

function formatPersianShortDate(isoDateStr) {
    if (!isoDateStr) return '';
    try {
        const [y, m, d] = isoDateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(dt);
    } catch (e) {
        return isoDateStr;
    }
}

function formatPersianDateTime(dateObj = new Date()) {
    try {
        return new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(dateObj);
    } catch (e) {
        return String(dateObj);
    }
}

/**
 * Persian (Jalali) calendar conversion utilities.
 * The app stores dates as Gregorian ISO strings (YYYY-MM-DD) internally,
 * but displays them in the Persian calendar and offers a Persian date picker.
 * Algorithm: jalaali-js (verified against Intl "fa-IR" for 1990-2060).
 */
const JALALI_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function _div(a, b) { return ~~(a / b); }
function _mod(a, b) { return a - ~~(a / b) * b; }

function _jalCal(jy, withoutLeap) {
    const bl = JALALI_BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = JALALI_BREAKS[0];
    let jump = 0;
    let jm, n, i;
    if (jy < jp || jy >= JALALI_BREAKS[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
    for (i = 1; i < bl; i += 1) {
        jm = JALALI_BREAKS[i];
        jump = jm - jp;
        if (jy < jm) break;
        leapJ = leapJ + _div(jump, 33) * 8 + _div(_mod(jump, 33), 4);
        jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4);
    if (_mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (withoutLeap) return { gy: gy, march: march };
    if (jump - n < 6) n = n - jump + _div(jump + 4, 33) * 33;
    let leap = _mod(_mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
}

function _g2d(gy, gm, gd) {
    let d = _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) +
        _div(153 * _mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
}

function _d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = _div(_mod(j, 1461), 4) * 5 + 308;
    const gd = _div(_mod(i, 153), 5) + 1;
    const gm = _mod(_div(i, 153), 12) + 1;
    const gy = _div(j, 1461) - 100100 + _div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
}

function _j2d(jy, jm, jd) {
    const r = _jalCal(jy, true);
    return _g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1;
}

function _d2j(jdn) {
    const gy = _d2g(jdn).gy;
    let jy = gy - 621;
    const r = _jalCal(jy, false);
    const jdn1f = _g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
        if (k <= 185) {
            return { jy: jy, jm: 1 + _div(k, 31), jd: _mod(k, 31) + 1 };
        }
        k -= 186;
    } else {
        jy -= 1;
        k += 179;
        if (r.leap === 1) k += 1;
    }
    return { jy: jy, jm: 7 + _div(k, 30), jd: _mod(k, 30) + 1 };
}

/** Gregorian -> Jalali. Returns { jy, jm, jd }. */
function gregorianToJalali(gy, gm, gd) {
    return _d2j(_g2d(gy, gm, gd));
}

/** Jalali -> Gregorian. Returns { gy, gm, gd }. */
function jalaliToGregorian(jy, jm, jd) {
    return _d2g(_j2d(jy, jm, jd));
}

function isLeapJalali(jy) {
    return _jalCal(jy, false).leap === 0;
}

function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalali(jy) ? 30 : 29;
}

/**
 * Parse an ISO Gregorian date string (YYYY-MM-DD) into a local Date object.
 */
function parseISODate(isoStr) {
    if (!isoStr) return null;
    const parts = isoStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Format a Jalali date as Persian digits, e.g. "۱۴۰۳/۰۵/۱۲"
 */
function formatJalaliDate(jy, jm, jd) {
    const toFa = (n) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    return `${toFa(jy)}/${toFa(String(jm).padStart(2, '0'))}/${toFa(String(jd).padStart(2, '0'))}`;
}

/**
 * Convert an ISO date string into a Jalali date object.
 */
function isoToJalali(isoStr) {
    const d = parseISODate(isoStr);
    if (!d) return null;
    const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { jy: j.jy, jm: j.jm, jd: j.jd };
}

/**
 * Convert a Jalali date into an ISO Gregorian date string (YYYY-MM-DD).
 */
function jalaliToISO(jy, jm, jd) {
    const g = jalaliToGregorian(jy, jm, jd);
    const pad = (n) => String(n).padStart(2, '0');
    return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

const PERSIAN_MONTH_NAMES = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const PERSIAN_WEEKDAY_NAMES = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

function toPersianDigits(value) {
    return String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

function escapeHTML(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Index of weekday in the Persian week (0 = Saturday ... 6 = Friday). */
function persianWeekdayIndex(dateObj) {
    return (dateObj.getDay() + 1) % 7;
}

/** e.g. "شنبه ۲ آبان ۱۴۰۵" (weekday optional). */
function formatJalaliLong(isoStr, withWeekday = false) {
    const d = parseISODate(isoStr);
    if (!d) return '';
    const j = isoToJalali(isoStr);
    const text = `${toPersianDigits(j.jd)} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${toPersianDigits(j.jy)}`;
    return withWeekday ? `${PERSIAN_WEEKDAY_NAMES[persianWeekdayIndex(d)]} ${text}` : text;
}

/** Add days to an ISO date string and return a new ISO date string. */
function addDaysISO(isoStr, delta) {
    const d = parseISODate(isoStr);
    d.setDate(d.getDate() + delta);
    return getLocalISODate(d);
}

function getCurrentPersianWeekDays() {
    const now = new Date();
    const todayISO = getLocalISODate(now);
    const dayIndexFromSaturday = (now.getDay() + 1) % 7;
    const saturday = new Date(now);
    saturday.setDate(now.getDate() - dayIndexFromSaturday);

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(saturday);
        d.setDate(saturday.getDate() + i);
        const iso = getLocalISODate(d);
        const dayName = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(d);
        const dateLabel = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(d);
        days.push({ iso, dayName, dateLabel, isToday: iso === todayISO });
    }
    return days;
}

