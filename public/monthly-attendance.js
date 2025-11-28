document.addEventListener('DOMContentLoaded', () => {
  loadFamilies();

  document.getElementById('month_select').addEventListener('change', () => {
    resetForm();
    loadFridaysForMonth();
  });

  document.getElementById('friday_select').addEventListener('change', () => {
    resetForm();
    loadServants();
  });

  document.getElementById('family_select').addEventListener('change', () => {
    resetForm();
    loadServants();
  });

  document.getElementById('monthlyAttendanceForm').addEventListener('submit', saveMonthlyAttendance);
});

// ==========================
// دالة لإعادة ضبط الفورم
// ==========================
function resetForm() {
  const tableBody = document.getElementById('servantsTableBody');
  if (tableBody) tableBody.innerHTML = '';

  const form = document.getElementById('monthlyAttendanceForm');
  if (form) form.reset();

  const resultMessage = document.getElementById('resultMessage');
  if (resultMessage) {
    resultMessage.textContent = '';
    resultMessage.style.color = '';
  }

  currentServants = [];
}

// ==========================
// تحميل الأسر
// ==========================
async function loadFamilies() {
  try {
    const response = await fetch('/api/families');
    const data = await response.json();
    const select = document.getElementById('family_select');

    if (data.success) {
      select.innerHTML = '<option value="">-- اختار الأسرة --</option>';
      data.families.forEach(family => {
        const option = document.createElement('option');
        option.value = family.family_id;
        option.textContent = family.family_name;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error('خطأ في تحميل الأسر:', err);
  }
}

// ==========================
// توليد جمع الشهر المختار
// ==========================
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}`;
}

function loadFridaysForMonth() {
  const monthValue = document.getElementById('month_select').value;
  const fridaySelect = document.getElementById('friday_select');
  fridaySelect.innerHTML = '<option value="">-- اختار جمعة --</option>';

  if (!monthValue) return;

  const monthIndex = parseInt(monthValue, 10) - 1;

  // ✅ تحديد السنة أوتوماتيك حسب الشهر
  let year;
  if (['10','11','12'].includes(monthValue)) {
    year = 2025; // أكتوبر–ديسمبر
  } else {
    year = 2026; // باقي الشهور
  }

  let date = new Date(year, monthIndex, 1);

  // أول جمعة في الشهر
  while (date.getDay() !== 5) {
    date.setDate(date.getDate() + 1);
  }

  // توليد كل الجمع في الشهر
  while (date.getMonth() === monthIndex) {
    const option = document.createElement('option');
    const localStr = formatDateLocal(date); // YYYY-MM-DD
    option.value = localStr;
    option.textContent = localStr;
    fridaySelect.appendChild(option);
    date.setDate(date.getDate() + 7);
  }
}



// ==========================
// تحميل الخدام للأسرة المختارة
// ==========================
let currentServants = [];

async function loadServants() {
  const familyId = document.getElementById('family_select').value;
  const fridayDate = document.getElementById('friday_select').value;
  const tableBody = document.getElementById('servantsTableBody');
  tableBody.innerHTML = '';
  currentServants = [];

  if (!familyId || !fridayDate) return;

  try {
    // 1) تحميل الخدام
    const response = await fetch(`/api/users?family_id=${familyId}`);
    const data = await response.json();

    if (data.success && data.users.length > 0) {
      currentServants = data.users;
      data.users.forEach((user, index) => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = index + 1;
        row.insertCell().textContent = user.username;

        row.insertCell().innerHTML = `<input type="checkbox" id="meeting-${user.user_id}">`;
        row.insertCell().innerHTML = `<input type="checkbox" id="lesson-${user.user_id}">`;
        row.insertCell().innerHTML = `<input type="checkbox" id="communion-${user.user_id}">`;
        row.insertCell().innerHTML = `<input type="checkbox" id="confession-${user.user_id}">`;

        row.insertCell().innerHTML = `<input type="number" id="total-${user.user_id}" min="0" value="${user.serviced_count}" readonly>`;
        row.insertCell().innerHTML = `<input type="number" id="visited-${user.user_id}" min="0" value="0">`;
      });

      // 2) تحميل السجل الشهري القديم لو موجود
      const oldRes = await fetch(`/api/monthly-attendance?date=${fridayDate}&family_id=${familyId}`);
      const oldData = await oldRes.json();

      if (oldData.success && Array.isArray(oldData.records)) {
        oldData.records.forEach(r => {
          document.getElementById(`meeting-${r.user_id}`).checked = !!r.meeting;
          document.getElementById(`lesson-${r.user_id}`).checked = !!r.lesson;
          document.getElementById(`communion-${r.user_id}`).checked = !!r.communion;
          document.getElementById(`confession-${r.user_id}`).checked = !!r.confession;
          document.getElementById(`visited-${r.user_id}`).value = r.visited_serviced || 0;
        });
      }
    }
  } catch (err) {
    console.error('خطأ في تحميل الخدام أو السجل الشهري السابق:', err);
  }
}


// ==========================
// حفظ السجل الشهري
// ==========================
async function saveMonthlyAttendance(e) {
  e.preventDefault();
  const date = document.getElementById('friday_select').value.trim();
  const familyId = document.getElementById('family_select').value;
  const resultMessage = document.getElementById('resultMessage');

  if (!date || !familyId) {
    resultMessage.textContent = '❌ لازم تختار الشهر والجمعة والأسرة قبل الحفظ';
    resultMessage.style.color = 'red';
    return;
  }

  if (currentServants.length === 0) {
    resultMessage.textContent = '❌ لا يوجد خدام لهذه الأسرة';
    resultMessage.style.color = 'red';
    return;
  }

  const records = currentServants.map(s => ({
    user_id: s.user_id,
    meeting: document.getElementById(`meeting-${s.user_id}`).checked,
    lesson: document.getElementById(`lesson-${s.user_id}`).checked,
    communion: document.getElementById(`communion-${s.user_id}`).checked,
    confession: document.getElementById(`confession-${s.user_id}`).checked,
    total_serviced: parseInt(document.getElementById(`total-${s.user_id}`).value) || 0,
    visited_serviced: parseInt(document.getElementById(`visited-${s.user_id}`).value) || 0
  }));

  try {
    const response = await fetch('/api/monthly-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, family_id: familyId, records })
    });
    const data = await response.json();

    if (data.success) {
      resultMessage.textContent = '✅ تم حفظ السجل الشهري بنجاح';
      resultMessage.style.color = 'green';
    } else {
      resultMessage.textContent = '❌ فشل الحفظ: ' + data.message;
      resultMessage.style.color = 'red';
    }
  } catch (err) {
    console.error('خطأ في الاتصال بالخادم:', err);
    resultMessage.textContent = '❌ خطأ في الاتصال بالخادم';
    resultMessage.style.color = 'red';
  }
}
