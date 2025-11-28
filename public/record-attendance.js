document.addEventListener('DOMContentLoaded', () => {
    loadFamiliesForDropdown();

    // بناء الجمع عند اختيار الشهر
    document.getElementById('month_select').addEventListener('change', () => {
        loadFridaysForMonth();
        document.getElementById('servantList').innerHTML = '';
        document.getElementById('loading-message').textContent = '';
        const attInput = document.getElementById('attendees_count');
        if (attInput) attInput.value = '';
    });

    // تحميل الخدام عند اختيار جمعة
    document.getElementById('friday_select').addEventListener('change', () => {
        document.getElementById('servantList').innerHTML = '';
        document.getElementById('loading-message').textContent = '';
        const attInput = document.getElementById('attendees_count');
        if (attInput) attInput.value = '';
        loadServants();
    });

    // تحميل الخدام عند اختيار أسرة
    document.getElementById('family_select').addEventListener('change', () => {
        document.getElementById('servantList').innerHTML = '';
        document.getElementById('loading-message').textContent = '';
        const attInput = document.getElementById('attendees_count');
        if (attInput) attInput.value = '';
        loadServants();
    });
});

// =========================
// أدوات التاريخ
// =========================
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    return `${y}-${m}-${d}`;
}

// =========================
// 1) تحميل الأسر
// =========================
async function loadFamiliesForDropdown() {
    try {
        const response = await fetch('/api/families');
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('family_select'); 
            select.innerHTML = '<option value="">-- اختار الأسرة --</option>'; 
            data.families.forEach(family => {
                const option = document.createElement('option');
                option.value = family.family_id;
                option.textContent = family.family_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الأسر:', error);
    }
}

// =========================
// 2) توليد جمع الشهر
// =========================
function loadFridaysForMonth() {
    const monthValue = document.getElementById('month_select').value;
    const fridaySelect = document.getElementById('friday_select');
    fridaySelect.innerHTML = '<option value="">-- اختار جمعة --</option>';

    if (!monthValue) return;

    const monthIndex = parseInt(monthValue, 10) - 1;
    const now = new Date();
    let year = now.getFullYear();

    // ✅ لو الشهر المختار أقل من الشهر الحالي → السنة القادمة
    if (monthIndex < now.getMonth()) {
        year = year + 1;
    }

    let date = new Date(year, monthIndex, 1);

    while (date.getDay() !== 5) {
        date.setDate(date.getDate() + 1);
    }

    while (date.getMonth() === monthIndex) {
        const option = document.createElement('option');
        const localStr = formatDateLocal(date);
        option.value = localStr;
        option.textContent = localStr;
        fridaySelect.appendChild(option);
        date.setDate(date.getDate() + 7);
    }
}


// =========================
// 3) تحميل الخدام + السجلات القديمة
// =========================
async function loadServants() {
    const familyId = document.getElementById('family_select').value;
    const date = document.getElementById('friday_select').value;
    const form = document.getElementById('attendanceForm');
    const servantList = document.getElementById('servantList');
    const message = document.getElementById('loading-message');

    servantList.innerHTML = '';
    form.style.display = 'none';
    message.style.color = 'blue';
    message.textContent = 'جاري تحميل الخدام...';
    message.style.display = 'block';

    if (!familyId || !date) {
        message.textContent = '❌ لازم تختاري الشهر والجمعة والأسرة لبدء التسجيل';
        return;
    }

    try {
        // 1) تحميل الخدام
        const response = await fetch(`/api/attendance/servants/${familyId}`);
        const data = await response.json();

        if (data.success && data.servants.length > 0) {
            renderServants(data.servants);
            message.style.display = 'none';
            form.style.display = 'block';

            form.removeEventListener('submit', recordAttendance);
            form.addEventListener('submit', recordAttendance);

            // 2) تحميل السجلات القديمة لو موجودة
            const oldRes = await fetch(`/api/attendance?date=${date}&family_id=${familyId}`);
            const oldData = await oldRes.json();

            if (oldData.success && Array.isArray(oldData.records)) {
                oldData.records.forEach(r => {
                    if (r.status === 'Present') document.getElementById(`att-${r.user_id}-present`).checked = true;
                    if (r.status === 'Absent') document.getElementById(`att-${r.user_id}-absent`).checked = true;
                    const reasonInput = document.getElementById(`reason-${r.user_id}`);
                    if (reasonInput) reasonInput.value = r.absence_reason || '';
                    const apolInput = document.getElementById(`apol-${r.user_id}`);
                    if (apolInput) apolInput.checked = r.apologized === 1;
                });

                // ✅ لو فيه عدد مخدومين محفوظ
                const attInput = document.getElementById('attendees_count');
                if (attInput && oldData.summary && oldData.summary.attendees_count) {
                    attInput.value = oldData.summary.attendees_count;
                }
            }
        } else {
            message.textContent = '❌ لا يوجد خدام لهذه الأسرة.';
        }
    } catch (error) {
        console.error('Error loading servants or records:', error);
        message.textContent = '❌ خطأ في الاتصال بالخادم.';
        message.style.color = 'red';
    }
}

// =========================
// 4) بناء واجهة الخدام
// =========================
function renderServants(servants) {
    const list = document.getElementById('servantList');
    list.innerHTML = '';

    servants.forEach(s => {
        const row = document.createElement('div');
        row.className = 'servant-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.marginBottom = '8px';

        const name = document.createElement('span');
        name.textContent = s.username;

        const present = document.createElement('input');
        present.type = 'radio';
        present.name = `att-${s.user_id}`;
        present.value = 'Present';
        present.id = `att-${s.user_id}-present`;

        const presentLbl = document.createElement('label');
        presentLbl.htmlFor = present.id;
        presentLbl.textContent = 'حاضر';

        const absent = document.createElement('input');
        absent.type = 'radio';
        absent.name = `att-${s.user_id}`;
        absent.value = 'Absent';
        absent.id = `att-${s.user_id}-absent`;

        const absentLbl = document.createElement('label');
        absentLbl.htmlFor = absent.id;
        absentLbl.textContent = 'غائب';

        const reason = document.createElement('input');
        reason.type = 'text';
        reason.placeholder = 'سبب الغياب (اختياري)';
        reason.id = `reason-${s.user_id}`;
        reason.style.flex = '1';

        const apologized = document.createElement('input');
        apologized.type = 'checkbox';
        apologized.id = `apol-${s.user_id}`;
        const apologizedLbl = document.createElement('label');
        apologizedLbl.htmlFor = apologized.id;
        apologizedLbl.textContent = 'اعتذر؟';

        row.append(name, present, presentLbl, absent, absentLbl, reason, apologized, apologizedLbl);
        list.appendChild(row);
    });
}

// =========================
// 5) تسجيل الحضور
// =========================
async function recordAttendance(e) {
    e.preventDefault();

    const date = document.getElementById('friday_select').value;
    const familyId = document.getElementById('family_select').value;
    const resultMsg = document.getElementById('result-message');
    const recorded_by_user_id = JSON.parse(localStorage.getItem('user'))?.user_id;

    const attendeesCountInput = document.getElementById('attendees_count');
    const attendees_count = attendeesCountInput ? parseInt(attendeesCountInput.value) : null;

    if (!date || !familyId) {
        resultMsg.style.color = 'red';
        resultMsg.textContent = '❌ لازم تختاري الشهر والجمعة والأسرة قبل التسجيل';
        return;
    }
    if (!recorded_by_user_id) {
        resultMsg.style.color = 'red';
        resultMsg.textContent = '❌ لازم تكوني مسجلة دخول كأمين';
        return;
    }
        if (!attendees_count || isNaN(attendees_count)) {
        resultMsg.style.color = 'red';
        resultMsg.textContent = '❌ لازم تدخلي عدد حضور المخدومين';
        return;
    }

    const records = collectRecords();
    if (records.length === 0) {
        resultMsg.style.color = 'red';
        resultMsg.textContent = '❌ لم يتم اختيار حالات حضور/غياب';
        return;
    }

    try {
        const res = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date,
                recorded_by_user_id,
                family_id: familyId,
                records,
                attendees_count
            })
        });
        const data = await res.json();
        resultMsg.style.color = data.success ? 'green' : 'red';
        resultMsg.textContent = data.message || (data.success ? '✅ تم التسجيل بنجاح' : '❌ فشل التسجيل');
    } catch (err) {
        console.error(err);
        resultMsg.style.color = 'red';
        resultMsg.textContent = '❌ خطأ في الاتصال بالسيرفر أثناء التسجيل';
    }
}

// =========================
// 6) جمع السجلات من عناصر الإدخال
// =========================
function collectRecords() {
    const rows = document.querySelectorAll('.servant-row');
    const date = document.getElementById('friday_select')?.value;
    const out = [];

    rows.forEach(row => {
        const radioPresent = row.querySelector('input[value="Present"]');
        const radioAbsent = row.querySelector('input[value="Absent"]');
        const reasonInput = row.querySelector('input[id^="reason-"]');
        const apologizedInput = row.querySelector('input[id^="apol-"]');

        const userIdMatch = (radioPresent?.id.match(/^att-(\d+)-/) || radioAbsent?.id.match(/^att-(\d+)-/));
        const user_id = userIdMatch ? Number(userIdMatch[1]) : null;
        if (!user_id) return;

        let status = null;
        if (radioPresent?.checked) status = 'Present';
        if (radioAbsent?.checked) status = 'Absent';

        if (!status) return;

        const reason = reasonInput?.value?.trim() || null;
        const apologized = apologizedInput?.checked ? 1 : 0;

        out.push({
            user_id,
            family_id: document.getElementById('family_select').value,
            session_date: date,
            status,
            absence_reason: reason,
            apologized
        });
    });

    return out;
}
س