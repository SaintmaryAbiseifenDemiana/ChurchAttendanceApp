// serviced-attendance.js

// الكود الخاص بصفحة تسجيل حضور المخدومين (serviced-attendance-form.html)
let servantId = null;
let currentServicedData = []; // لتخزين قائمة المخدومين الحالية مع بياناتهم

document.addEventListener('DOMContentLoaded', () => {
    // 1. التحقق من صلاحية المستخدم
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        alert('الرجاء تسجيل الدخول أولاً.');
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userStr);
    if (user.role !== 'Khadem') {
        alert('ليس لديك صلاحية للوصول لهذه الصفحة.');
        window.location.href = 'dashboard.html';
        return;
    }

    // حفظ ID الخادم لتسجيله كمسجل للحضور
    servantId = user.user_id;

    // 2. تعيين التاريخ الافتراضي لليوم
    const dateInput = document.getElementById('sessionDate');
    dateInput.valueAsDate = new Date();

    // 3. تحميل القوائم المنسدلة
    loadFamiliesDropdown();
    loadClassesDropdown();

    // 4. ربط الأحداث بـ loadServicedList
    const controls = document.querySelectorAll('#sessionDate, #familySelect, #classSelect');
    controls.forEach(control => {
        control.addEventListener('change', loadServicedList);
    });

    // 5. ربط نموذج الحضور بوظيفة الإرسال
    document.getElementById('attendanceForm').addEventListener('submit', submitAttendance);

    // رسالة إرشادية أولية
    document.getElementById('servicedListTableBody').innerHTML = '<tr><td colspan="5" class="info">الرجاء اختيار التاريخ والأسرة والفصل لعرض القائمة.</td></tr>';
});

// ------------------------------------------
// 1. تحميل قائمة الأسر (Families)
// ------------------------------------------
async function loadFamiliesDropdown() {
    try {
        const select = document.getElementById('familySelect');
        select.innerHTML = '<option value="">-- جاري التحميل --</option>';

        const response = await fetch('/api/families');
        const data = await response.json();

        select.innerHTML = '<option value="">-- اختار الأسرة --</option>';
        if (data.success && data.families.length > 0) {
            data.families.forEach(family => {
                const option = document.createElement('option');
                option.value = family.family_id;
                option.textContent = family.family_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('فشل تحميل الأسر:', error);
        document.getElementById('familySelect').innerHTML = '<option value="">❌ فشل التحميل</option>';
    }
}

// ------------------------------------------
// 2. تحميل قائمة الفصول (Classes)
// ------------------------------------------
async function loadClassesDropdown() {
    try {
        const select = document.getElementById('classSelect');
        select.innerHTML = '<option value="">-- جاري التحميل --</option>';

        // 🚨 نفترض وجود مسار API باسم /api/classes
        const response = await fetch('/api/classes');
        const data = await response.json();

        select.innerHTML = '<option value="">-- اختار الفصل --</option>';
        if (data.success && data.classes.length > 0) {
            data.classes.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls.class_id;
                option.textContent = cls.class_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('فشل تحميل الفصول:', error);
        document.getElementById('classSelect').innerHTML = '<option value="">❌ فشل التحميل</option>';
    }
}

// ------------------------------------------
// 3. تحميل قائمة المخدومين وعرض الحضور السابق
// ------------------------------------------
async function loadServicedList() {
    const familyId = currentUser.family_id;
    const className = document.getElementById('classSelect').value;
    const date = document.getElementById('fridaySelect').value;

    if (!familyId || !className || !date) {
        alert('الرجاء اختيار الأسرة والفصل والشهر والجمعة.');
        return;
    }

    try {
        const url = `${API_BASE}/serviced/list/${familyId}/${encodeURIComponent(className)}?date=${date}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            renderServicedTable(data.serviced); // ✅ عرض القائمة مع الحالات القديمة
            document.getElementById('servicedListCard').style.display = 'block';
            document.getElementById('submitAttendanceBtn').disabled = false;
        } else {
            alert('لم يتم العثور على مخدومين.');
            document.getElementById('servicedListCard').style.display = 'none';
            document.getElementById('servicedTableBody').innerHTML = '';
            document.getElementById('submitAttendanceBtn').disabled = true;
        }
    } catch (error) {
        console.error('Error loading serviced list:', error);
        alert('فشل جلب المخدومين.');
    }
}





// ------------------------------------------
// 4. عرض القائمة ديناميكياً في الجدول
// ------------------------------------------
function renderServicedList(serviced, tableBody) {
    tableBody.innerHTML = '';

    serviced.forEach((servicedPerson, index) => {
        const attendance = servicedPerson.attendance || {};
        const isPresent = attendance.status === 'Present';
        const isAbsent = attendance.status === 'Absent';
        const isApologized = attendance.apologized == 1;

        const row = tableBody.insertRow();
        row.dataset.servicedId = servicedPerson.serviced_id;

        // 1. رقم
        row.insertCell().textContent = index + 1;

        // 2. اسم المخدوم
        row.insertCell().textContent = servicedPerson.serviced_name;

        // 3. حالة الحضور
        const statusCell = row.insertCell();
        statusCell.className = 'status-cell';
        statusCell.innerHTML = `
            <input type="radio" id="status-${servicedPerson.serviced_id}-present" name="status-${servicedPerson.serviced_id}" value="Present" ${isPresent ? 'checked' : ''} onchange="toggleReason(${servicedPerson.serviced_id})">
            <label for="status-${servicedPerson.serviced_id}-present">حاضر</label>

            <input type="radio" id="status-${servicedPerson.serviced_id}-absent" name="status-${servicedPerson.serviced_id}" value="Absent" ${isAbsent ? 'checked' : ''} onchange="toggleReason(${servicedPerson.serviced_id})">
            <label for="status-${servicedPerson.serviced_id}-absent">غائب</label>
        `;

        // 4. سبب الغياب
        const reasonCell = row.insertCell();
        reasonCell.className = 'reason-cell';
        reasonCell.innerHTML = `
            <input type="text" id="reason-${servicedPerson.serviced_id}" placeholder="سبب الغياب" class="form-control" value="${attendance.reason || ''}">
        `;

        // 5. اعتذار؟
        const apologyCell = row.insertCell();
        apologyCell.className = 'apology-cell';
        apologyCell.innerHTML = `
            <input type="checkbox" id="apologized-${servicedPerson.serviced_id}" ${isApologized ? 'checked' : ''}>
            <label for="apologized-${servicedPerson.serviced_id}">اعتذر</label>
        `;

        // تحديث الحقول بناءً على الحالة
        toggleReason(servicedPerson.serviced_id);
    });
}

// ------------------------------------------
// تفعيل/تعطيل حقول السبب والاعتذار
// ------------------------------------------
function toggleReason(servicedId) {
    const presentRadio = document.getElementById(`status-${servicedId}-present`);
    const isPresent = presentRadio.checked;

    const reasonInput = document.getElementById(`reason-${servicedId}`);
    const apologyCheckbox =
    document.getElementById(`apologized-${servicedId}`);

    if (isPresent) {
        reasonInput.disabled = true;
        reasonInput.value = '';
        apologyCheckbox.disabled = true;
        apologyCheckbox.checked = false;
    } else {
        reasonInput.disabled = false;
        apologyCheckbox.disabled = false;
    }
}

// ------------------------------------------
// 5. إرسال بيانات الحضور
// ------------------------------------------
async function submitAttendance() {
    const date = document.getElementById('fridaySelect').value;
    const servantId = currentUser.user_id;
    const tbody = document.getElementById('servicedTableBody');
    const messageDiv = document.getElementById('message');
    const submitBtn = document.getElementById('submitAttendanceBtn');
    
    const recordsToSubmit = [];

    tbody.querySelectorAll('tr').forEach(tr => {
        const servicedId = tr.dataset.servicedId;
        const statusInput = tr.querySelector(`input[name="status_${servicedId}"]:checked`);
        const status = statusInput ? statusInput.value : 'Absent'; // ✅ اللي مش متحدد = غائب
        recordsToSubmit.push({
            serviced_id: parseInt(servicedId),
            status
        });
    });

    try {
        messageDiv.className = 'alert alert-info';
        messageDiv.textContent = 'جاري الحفظ...';
        submitBtn.disabled = true;

        const response = await fetch(`${API_BASE}/serviced/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                date: date, 
                records: recordsToSubmit, 
                recorded_by_user_id: servantId 
            })
        });

        const data = await response.json();

        if (data.success) {
            messageDiv.className = 'alert alert-success';
            messageDiv.textContent = data.message;
            // ✅ بعد النجاح نعيد تحميل القائمة علشان تظهر الحالات القديمة لو رجع لنفس الجمعة
            loadServicedList(); 
        } else {
            messageDiv.className = 'alert alert-danger';
            messageDiv.textContent = data.message || 'فشل غير معروف في الحفظ.';
        }
    } catch (error) {
        messageDiv.className = 'alert alert-danger';
        messageDiv.textContent = 'حدث خطأ في الاتصال بالخادم.';
        console.error('Submit error:', error);
    } finally {
        submitBtn.disabled = false;
    }
}
