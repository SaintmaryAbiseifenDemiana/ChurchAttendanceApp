const API_BASE = '/api';
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    alert('يجب تسجيل الدخول أولاً.');
    window.location.href = 'login.html';
    return;
  }
  currentUser = JSON.parse(userStr);

  // عرض اسم الأسرة
  document.getElementById('userFamilyName').textContent = currentUser.family_name || '⚠️ غير محدد';

  // تحميل الفصول
  loadClasses(currentUser.family_id);

  // ربط الأحداث
  document.getElementById('monthSelect').addEventListener('change', handleMonthChange);
  document.getElementById('fridaySelect').addEventListener('change', checkLoadButtonStatus);
  document.getElementById('classSelect').addEventListener('change', checkLoadButtonStatus);
  document.getElementById('loadServicedBtn').addEventListener('click', loadServicedList);
  document.getElementById('submitAttendanceBtn').addEventListener('click', submitAttendance);

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('user'); // امسح بيانات المستخدم
      window.location.href = 'login.html'; // رجّع لصفحة تسجيل الدخول
    });
  }
});

async function loadClasses(familyId) {
  const classSelect = document.getElementById('classSelect');
  classSelect.innerHTML = '<option value="">اختر الفصل...</option>';
  try {
    const response = await fetch(`${API_BASE}/serviced/classes/${familyId}`);
    const data = await response.json();
    if (data.success && data.classes.length > 0) {
      data.classes.forEach(className => {
        classSelect.add(new Option(className, className));
      });
      classSelect.disabled = false;
      document.getElementById('monthSelect').disabled = false;
    } else {
      alert('لم يتم العثور على فصول لهذه الأسرة.');
    }
  } catch (error) {
    console.error('Error loading classes:', error);
    alert('فشل تحميل الفصول.');
  }
}

function getFridaysForMonth(month) {
  const year = ['10','11','12'].includes(month) ? 2025 : 2026;
  const fridays = [];
  const start = new Date(`${year}-${month}-01`);
  for (let d = new Date(start); d.getMonth() === start.getMonth(); d.setDate(d.getDate()+1)) {
    if (d.getDay() === 5) fridays.push(d.toISOString().split('T')[0]);
  }
  return fridays;
}

function handleMonthChange() {
  const month = document.getElementById('monthSelect').value;
  const fridaySelect = document.getElementById('fridaySelect');
  fridaySelect.innerHTML = '<option value="">اختر الجمعة...</option>';
  if (!month) return;
  getFridaysForMonth(month).forEach(dateStr => {
    fridaySelect.add(new Option(dateStr, dateStr));
  });
  fridaySelect.disabled = false;
  checkLoadButtonStatus();
}

function checkLoadButtonStatus() {
  const className = document.getElementById('classSelect').value;
  const month = document.getElementById('monthSelect').value;
  const friday = document.getElementById('fridaySelect').value;
  document.getElementById('loadServicedBtn').disabled = !(className && month && friday);
}

async function loadServicedList() {
  const familyId = currentUser.family_id;
  const className = document.getElementById('classSelect').value;
  const date = document.getElementById('fridaySelect').value;

  if (!familyId || !className || !date) {
    alert('الرجاء اختيار الأسرة والفصل والشهر والجمعة.');
    return;
  }

  // ✅ Reset للفورم قبل التحميل
  document.getElementById('servicedTableBody').innerHTML = '';
  document.getElementById('message').textContent = '';
  document.getElementById('servicedListCard').style.display = 'none';
  document.getElementById('submitAttendanceBtn').disabled = true;

  try {
    const url = `${API_BASE}/serviced/list/${familyId}/${encodeURIComponent(className)}?date=${date}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success && data.serviced.length > 0) {
      // ✅ عرض القائمة مع الحالات القديمة لو موجودة
      renderServicedTable(data.serviced);
      document.getElementById('selectedClassDisplay').textContent = className;
      document.getElementById('servicedListCard').style.display = 'block';
      document.getElementById('submitAttendanceBtn').disabled = false;
    } else {
      alert('لم يتم العثور على مخدومين.');
    }
  } catch (error) {
    console.error('Error loading serviced list:', error);
    alert('فشل جلب المخدومين.');
  }
}
function renderServicedTable(servicedList) {
  const tbody = document.getElementById('servicedTableBody');
  tbody.innerHTML = ''; // reset

  servicedList.forEach(serviced => {
    const tr = document.createElement('tr');
    tr.dataset.servicedId = serviced.serviced_id;

    const presentChecked = serviced.attendance_status === 'Present' ? 'checked' : '';
    const absentChecked = serviced.attendance_status === 'Absent' ? 'checked' : '';

    tr.innerHTML = `
      <td>${serviced.serviced_name}</td>
      <td class="text-center">
        <label class="m-1">
          <input type="radio" name="status_${serviced.serviced_id}" value="Present" ${presentChecked}> حاضر
        </label>
        <label class="m-1">
          <input type="radio" name="status_${serviced.serviced_id}" value="Absent" ${absentChecked}> غائب
        </label>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

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
    const status = statusInput ? statusInput.value : 'Absent'; // اللي مش متحدد = غائب
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
      // إعادة تحميل القائمة علشان تظهر الحالات القديمة لو رجع لنفس الجمعة
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
