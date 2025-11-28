document.addEventListener('DOMContentLoaded', () => {
  loadFamilies(); // تحميل الأسر في القائمة
  document.getElementById('loadReportBtn').addEventListener('click', loadMonthlyReport);
  document.getElementById('calcQuarterBtn').addEventListener('click', calculateQuarterReports);

  // زرار تصدير شهري Excel
  document.getElementById('exportMonthlyExcel').addEventListener('click', () => {
    const table = document.querySelector('.report-table');
    const wb = XLSX.utils.table_to_book(table, { sheet: "Monthly Report" });
    XLSX.writeFile(wb, "monthly_report.xlsx");
  });

  // زرار PDF شهري
  document.getElementById('exportMonthlyPDF').addEventListener('click', () => {
    exportTableToPdf('تقرير النسبة الشهرية للخدام', 'monthly_report.pdf');
  });

  
});
function fixArabic(text) {
  return text.split(' ').reverse().join(' ').replace(/ +/g, ' ');
}





// دالة عامة للتصدير PDF
function exportTableToPdf(title, fileName) {
  const headers = [...document.querySelectorAll('.report-table thead th')]
    .map(th => ({
      text: fixArabic(th.textContent.trim()),
      rtl: true,
      direction: 'rtl',
      alignment: 'right'
    }))
    .reverse();

  const rows = [...document.querySelectorAll('.report-table tbody tr')].map(tr =>
    [...tr.cells].map(td => ({
      text: fixArabic(td.textContent.trim()),
      rtl: true,
      direction: 'rtl',
      alignment: 'right'
    })).reverse()
  );

  const docDefinition = {
    content: [
      {
        text: fixArabic(title),
        style: 'header',
        alignment: 'right',
        rtl: true,
        direction: 'rtl'
      },
      {
        table: {
          headerRows: 1,
          widths: Array(headers.length).fill('*'),
          body: [headers, ...rows]
        },
        layout: 'lightHorizontalLines'
      }
    ],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 11,
      alignment: 'right',
      direction: 'rtl'
    },
    styles: {
      header: {
        fontSize: 16,
        bold: true,
        margin: [0, 0, 0, 10],
        rtl: true,
        direction: 'rtl'
      }
    },
    pageMargins: [30, 30, 30, 30]
  };

  pdfMake.createPdf(docDefinition).download(fileName);
}





// تحميل الأسر
async function loadFamilies() {
  try {
    const response = await fetch('/api/families');
    const data = await response.json();
    const select = document.getElementById('family_select');

    if (data.success) {
      select.innerHTML = '<option value="">-- كل الأسر --</option>';
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
// تحميل تقرير شهر واحد (نسب مئوية)
// ==========================
async function loadMonthlyReport() {
  const month = document.getElementById('month_select').value;
  const familyId = document.getElementById('family_select').value;
  const tableBody = document.getElementById('reportTableBody');
  const resultMessage = document.getElementById('resultMessage');

  if (!month) {
    resultMessage.textContent = '❌ يرجى اختيار شهر أولاً';
    resultMessage.style.color = 'red';
    return;
  }

  tableBody.innerHTML = '';
  resultMessage.textContent = 'جاري تحميل التقرير...';
  resultMessage.style.color = 'blue';

  try {
    // ✅ لو فيه عنصر year_select نقرأه، لو مش موجود نستخدم السنة الحالية
    const yearElement = document.getElementById('year_select');
    const year = yearElement ? yearElement.value : new Date().getFullYear();

    // بناء رابط API
    let apiUrl = `/api/monthly-reports?month=${month}&year=${year}`;
    if (familyId) {
      apiUrl += `&family_id=${familyId}`;
    }

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      if (data.report && data.report.length > 0) {
        tableBody.innerHTML = '';
        data.report.forEach((record, index) => {
          const row = tableBody.insertRow();
          row.insertCell().textContent = index + 1;
          row.insertCell().textContent = record.username;
          row.insertCell().textContent = record.meeting_pct;
          row.insertCell().textContent = record.lesson_pct;
          row.insertCell().textContent = record.communion_pct;
          row.insertCell().textContent = record.confession_pct;
          row.insertCell().textContent = record.visits_pct;
        });
        resultMessage.textContent = '✅ تم تحميل التقرير الشهري';
        resultMessage.style.color = 'green';
      } else {
        resultMessage.textContent = '❌ لا توجد بيانات لهذا الشهر';
        resultMessage.style.color = 'red';
      }
    } else {
      resultMessage.textContent = '❌ فشل تحميل التقرير: ' + (data.message || 'خطأ غير معروف');
      resultMessage.style.color = 'red';
    }
  } catch (err) {
    console.error('خطأ في تحميل التقرير:', err);
    resultMessage.textContent = '❌ خطأ في الاتصال بالخادم';
    resultMessage.style.color = 'red';
  }
}



// ==========================
// تحميل تقرير ربع سنوي (Q1–Q4)
// ==========================
async function calculateQuarterReports() {
  const familyId = document.getElementById('family_select').value;
  const quarter = document.getElementById('quarter_select').value; // ✅ نقرأ قيمة الربع
  const tableBody = document.getElementById('reportTableBody');
  const resultMessage = document.getElementById('resultMessage');

  tableBody.innerHTML = '';
  resultMessage.textContent = 'جاري حساب النسبة السنوية...';
  resultMessage.style.color = 'blue';

  if (!quarter) {
    resultMessage.textContent = '❌ يرجى اختيار ربع سنوي أولاً';
    resultMessage.style.color = 'red';
    return;
  }

  // بناء رابط API مع الربع
  let apiUrl = `/api/monthly-reports/quarter?quarter=${quarter}`;
  if (familyId) {
    apiUrl += `&family_id=${familyId}`;
  }

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.report.length > 0) {
      data.report.forEach((record, index) => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = index + 1;
        row.insertCell().textContent = record.username;
        row.insertCell().textContent = record.meeting_pct;
        row.insertCell().textContent = record.lesson_pct;
        row.insertCell().textContent = record.communion_pct;
        row.insertCell().textContent = record.confession_pct;
        row.insertCell().textContent = record.visits_pct;
      });

      resultMessage.textContent = '✅ تم حساب التقرير السنوي';
      resultMessage.style.color = 'green';
    } else {
      resultMessage.textContent = '❌ لا توجد بيانات لهذا الربع.';
      resultMessage.style.color = 'red';
    }
  } catch (err) {
    console.error('خطأ في الحساب:', err);
    resultMessage.textContent = '❌ خطأ في الاتصال بالخادم';
    resultMessage.style.color = 'red';
  }
}
