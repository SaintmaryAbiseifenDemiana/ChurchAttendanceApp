document.addEventListener('DOMContentLoaded', () => {
    // تحميل قائمة الأسر للقائمة المنسدلة
    loadFamiliesDropdown(); 
    
    // ربط زر التصفية بوظيفة تحميل التقرير
    document.getElementById('filter-btn').addEventListener('click', loadReport);
});

// ------------------------------------------
// 1. دالة لتحميل الأسر وعرضها في قائمة التصفية
// ------------------------------------------
async function loadFamiliesDropdown() {
    try {
        const response = await fetch('/api/families');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('report_family');
            select.innerHTML = '<option value="">-- كل الأسر --</option>';
            
            data.families.forEach(family => {
                const option = document.createElement('option');
                option.value = family.family_id;
                option.textContent = family.family_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('فشل تحميل قائمة الأسر للتقرير:', error);
    }
}

// ------------------------------------------
// 2. جلب وعرض تقرير الحضور الشهري (مع التصفية)
// ------------------------------------------
async function loadReport() {
    const monthFilter = document.getElementById('report_month').value;
    const familyFilter = document.getElementById('report_family').value;
    
    const loadingStatus = document.getElementById('loading-status');
    const errorMessage = document.getElementById('error-message');
    const thead = document.getElementById('reportTableHead');
    const tbody = document.getElementById('reportTableBody');

    thead.innerHTML = '';
    tbody.innerHTML = '';
    errorMessage.style.display = 'none';
    loadingStatus.textContent = 'جاري تحميل التقرير...';
    loadingStatus.style.display = 'block';

    if (!monthFilter) {
        errorMessage.textContent = '❌ لازم تختاري الشهر';
        errorMessage.style.display = 'block';
        loadingStatus.style.display = 'none';
        return;
    }

    // بناء رابط API مع معايير التصفية
    let apiUrl = `/api/reports/attendance?month=${monthFilter}`;
    if (familyFilter) {
        apiUrl += `&family_id=${familyFilter}`;
    }

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        loadingStatus.style.display = 'none';

        if (data.success) {
            if (data.report.length === 0) {
                loadingStatus.textContent = 'لا توجد سجلات خدام مطابقة لمعايير التصفية.';
                loadingStatus.style.display = 'block';
                return;
            }
            
            // استخراج كل الجمع (تواريخ فريدة)
            const fridays = Array.from(new Set(data.report.map(r => r.session_date))).sort();

            // بناء رؤوس الجدول
            buildTableHeader(thead, fridays);

            // عرض بيانات الخدام
            renderReportTable(data.report, fridays);

            // ✅ عرض جدول عدد حضور المخدومين
            if (data.summary) {
                renderServantsCountTable(data.summary);
            }

        } else {
            errorMessage.textContent = data.message;
            errorMessage.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading report:', error);
        loadingStatus.style.display = 'none';
        errorMessage.textContent = 'فشل في الاتصال بالخادم لجلب التقرير.';
        errorMessage.style.display = 'block';
    }
}


// ------------------------------------------
// 3. بناء رؤوس الجدول ديناميكيًا
// ------------------------------------------
function buildTableHeader(thead, fridays) {
    const tr1 = document.createElement('tr');
    tr1.innerHTML = `<th rowspan="2">م</th><th rowspan="2">الخادم</th><th rowspan="2">الأسرة</th>`;
    fridays.forEach(date => {
        const th = document.createElement('th');
        th.textContent = `جمعة ${date}`;
        th.colSpan = 3;
        tr1.appendChild(th);
    });

    const tr2 = document.createElement('tr');
    fridays.forEach(() => {
        tr2.innerHTML += `<th>الحالة</th><th>سبب الغياب</th><th>اعتذر؟</th>`;
    });

    thead.append(tr1, tr2);
}

// ------------------------------------------
// 4. عرض بيانات التقرير في الجدول
// ------------------------------------------
function renderReportTable(report, fridays) {
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    // نحول البيانات لبنية محورية: لكل خادم مجموعة تواريخ
    const pivot = {};
    report.forEach(r => {
        if (!pivot[r.user_id]) {
            pivot[r.user_id] = { username: r.username, family_name: r.family_name, dates: {} };
        }
        pivot[r.user_id].dates[r.session_date] = {
            status: r.status,
            absence_reason: r.absence_reason,
            apologized: r.apologized
        };
    });

    const users = Object.values(pivot);
    users.forEach((u, idx) => {
        const tr = tbody.insertRow();
        tr.insertCell().textContent = idx + 1;
        tr.insertCell().textContent = u.username;
        tr.insertCell().textContent = u.family_name;

        fridays.forEach(date => {
            const rec = u.dates[date];
            const statusCell = tr.insertCell();
            const reasonCell = tr.insertCell();
            const apologizedCell = tr.insertCell();

            if (!rec) {
                statusCell.textContent = '—'; statusCell.className = 'no-data';
                reasonCell.textContent = '—'; reasonCell.className = 'no-data';
                apologizedCell.textContent = '—'; apologizedCell.className = 'no-data';
            } else {
                if (rec.status === 'Present' || rec.status === 1) {
                    statusCell.textContent = 'حاضر'; statusCell.className = 'present';
                    reasonCell.textContent = '—';
                    apologizedCell.textContent = rec.apologized ? 'نعم' : 'لا';
                } else {
                    statusCell.textContent = 'غائب'; statusCell.className = rec.apologized ? 'apologized' : 'absent';
                    reasonCell.textContent = rec.absence_reason || '—';
                    apologizedCell.textContent = rec.apologized ? 'نعم' : 'لا';
                }
            }
        });
    });
}
// ------------------------------------------
// 5. عرض جدول عدد حضور المخدومين لكل جمعة
// ------------------------------------------
function renderServantsCountTable(summary) {
    const container = document.getElementById('servantsCountContainer');
    container.innerHTML = '';

    if (!summary || summary.length === 0) {
        container.innerHTML = '<p style="color:blue;">لا يوجد بيانات عدد المخدومين لهذا الشهر.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'report-table';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    thead.innerHTML = `<tr><th>الجمعة</th><th>عدد حضور المخدومين</th></tr>`;

    summary.forEach(row => {
        const tr = tbody.insertRow();
        tr.insertCell().textContent = row.session_date;
        tr.insertCell().textContent = row.attendees_count;
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
}
