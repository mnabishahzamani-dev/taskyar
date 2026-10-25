/**
 * TaskYar - Persian (Jalali) Date Picker
 *
 * Usage in HTML:
 *   <input type="text" id="myDate" class="input-pill date-picker-input" readonly>
 *
 * The selected date is stored as a Gregorian ISO string (YYYY-MM-DD) in
 * `input.dataset.iso`, while the visible value is shown in the Persian
 * calendar. A native `change` event is dispatched when the user picks a date,
 * so inline handlers such as onchange="..." keep working.
 *
 * Helpers:  getPickerISO(id)  /  setPickerISO(id, iso)
 */
const JalaliPicker = (function () {
    const WEEK_HEADERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    const WEEK_TITLES = PERSIAN_WEEKDAY_NAMES;

    let popupEl = null;
    let anchorEl = null;
    let view = { jy: 1400, jm: 1 };
    let selectedISO = '';

    function isOpen() {
        return Boolean(popupEl && popupEl.classList.contains('show'));
    }

    function build() {
        popupEl = document.createElement('div');
        popupEl.className = 'jdp-popup';
        popupEl.id = 'jalaliPicker';
        popupEl.addEventListener('click', onPopupClick);
        document.body.appendChild(popupEl);

        // Close when clicking anywhere outside the popup / its anchor
        document.addEventListener('mousedown', (e) => {
            if (!isOpen()) return;
            if (popupEl.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
            close();
        });
        window.addEventListener('resize', close);
    }

    function render() {
        const { jy, jm } = view;
        const len = jalaliMonthLength(jy, jm);
        const first = jalaliToGregorian(jy, jm, 1);
        const offset = persianWeekdayIndex(new Date(first.gy, first.gm - 1, first.gd));
        const todayISO = getLocalISODate();

        let cells = '';
        for (let i = 0; i < offset; i++) cells += '<span class="jdp-empty"></span>';
        for (let d = 1; d <= len; d++) {
            const iso = jalaliToISO(jy, jm, d);
            const col = (offset + d - 1) % 7;
            const cls = [
                'jdp-day',
                col === 6 ? 'friday' : '',
                iso === todayISO ? 'today' : '',
                iso === selectedISO ? 'selected' : ''
            ].join(' ');
            cells += `<button type="button" class="${cls}" data-act="pick" data-iso="${iso}">${toPersianDigits(d)}</button>`;
        }

        const heads = WEEK_HEADERS.map((h, i) =>
            `<span class="jdp-wd ${i === 6 ? 'friday' : ''}" title="${WEEK_TITLES[i]}">${h}</span>`
        ).join('');

        popupEl.innerHTML = `
            <div class="jdp-head">
                <button type="button" class="jdp-nav" data-act="prev-year" title="سال قبل">»</button>
                <button type="button" class="jdp-nav" data-act="prev-month" title="ماه قبل">›</button>
                <div class="jdp-title">${PERSIAN_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}</div>
                <button type="button" class="jdp-nav" data-act="next-month" title="ماه بعد">‹</button>
                <button type="button" class="jdp-nav" data-act="next-year" title="سال بعد">«</button>
            </div>
            <div class="jdp-grid">${heads}${cells}</div>
            <div class="jdp-foot">
                <button type="button" class="jdp-link" data-act="today">امروز</button>
                <button type="button" class="jdp-link muted" data-act="close">بستن</button>
            </div>
        `;
        if (isOpen()) position();
    }

    function position() {
        if (!popupEl || !anchorEl) return;
        popupEl.style.visibility = 'hidden';
        popupEl.style.left = '0px';
        popupEl.style.top = '0px';

        const rect = anchorEl.getBoundingClientRect();
        const w = popupEl.offsetWidth;
        const h = popupEl.offsetHeight;
        const margin = 8;

        let left = rect.left + rect.width / 2 - w / 2;
        left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));

        // Prefer opening upward (the add-task bar is at the bottom of the window)
        let top = rect.top - h - 6;
        if (top < margin) {
            top = Math.min(rect.bottom + 6, window.innerHeight - h - margin);
        }

        popupEl.style.left = left + 'px';
        popupEl.style.top = Math.max(margin, top) + 'px';
        popupEl.style.visibility = 'visible';
    }

    function shiftMonth(delta) {
        let { jy, jm } = view;
        jm += delta;
        while (jm > 12) { jm -= 12; jy++; }
        while (jm < 1) { jm += 12; jy--; }
        view = { jy, jm };
        render();
    }

    function onPopupClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        switch (btn.dataset.act) {
            case 'prev-month': shiftMonth(-1); break;
            case 'next-month': shiftMonth(1); break;
            case 'prev-year': shiftMonth(-12); break;
            case 'next-year': shiftMonth(12); break;
            case 'today': select(getLocalISODate()); break;
            case 'close': close(); break;
            case 'pick': select(btn.dataset.iso); break;
        }
    }

    function select(iso) {
        const target = anchorEl;
        close();
        if (!target) return;
        applyValue(target, iso);
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function open(anchor) {
        if (!popupEl) build();
        anchorEl = anchor;
        selectedISO = anchor.dataset.iso || '';
        const j = isoToJalali(selectedISO || getLocalISODate());
        view = { jy: j.jy, jm: j.jm };
        popupEl.classList.add('show');
        render();
    }

    function close() {
        if (popupEl) popupEl.classList.remove('show');
        anchorEl = null;
    }

    function applyValue(el, iso) {
        el.dataset.iso = iso || '';
        if (iso) {
            const j = isoToJalali(iso);
            el.value = j ? formatJalaliDate(j.jy, j.jm, j.jd) : '';
        } else {
            el.value = '';
        }
    }

    function bind(el) {
        el.setAttribute('readonly', 'readonly');
        el.addEventListener('click', () => {
            if (isOpen() && anchorEl === el) close();
            else open(el);
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open(el);
            }
        });
    }

    return { open, close, isOpen, bind, applyValue };
})();

function initDatePickers() {
    document.querySelectorAll('.date-picker-input').forEach(el => JalaliPicker.bind(el));
}

function getPickerISO(id) {
    const el = document.getElementById(id);
    return el ? (el.dataset.iso || '') : '';
}

function setPickerISO(id, iso) {
    const el = document.getElementById(id);
    if (el) JalaliPicker.applyValue(el, iso);
}
