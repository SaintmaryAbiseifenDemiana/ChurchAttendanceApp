document.addEventListener('DOMContentLoaded', () => {
    // تحميل الأسر عند تحميل الصفحة
    loadFamilies();

    // ربط نموذج الإضافة بحدث الإرسال
    document.getElementById('addFamilyForm').addEventListener('submit', addFamily);
});

// متغير عالمي لتخزين الأسر
let familiesData = [];

// ------------------------------------------
// قراءة وعرض الأسر (Read)
// ------------------------------------------
async function loadFamilies() {
    try {
        const response = await fetch('/api/families');
        const data = await response.json();

        const tableBody = document.getElementById('familiesTableBody');
        tableBody.innerHTML = ''; // مسح المحتوى القديم

        if (data.success && data.families.length > 0) {
            familiesData = data.families; // تحديث البيانات
            data.families.forEach((family, index) => {
                const row = tableBody.insertRow();
                row.insertCell().textContent = index + 1;
                
                const nameCell = row.insertCell();
                nameCell.textContent = family.family_name;
                nameCell.id = `name-${family.family_id}`; // لتحديث الاسم مباشرة
                
                const actionsCell = row.insertCell();
                actionsCell.innerHTML = `
                    <button onclick="editFamily(${family.family_id}, '${family.family_name}')">تعديل</button>
                    <button onclick="deleteFamily(${family.family_id})" style="background-color: #dc3545;">حذف</button>
                `;
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="3">لا توجد أسر مسجلة بعد.</td></tr>';
        }

    } catch (error) {
        console.error('Error loading families:', error);
        alert('فشل في تحميل الأسر.');
    }
}

// ------------------------------------------
// إضافة أسرة (Create)
// ------------------------------------------
async function addFamily(e) {
    e.preventDefault();
    const familyNameInput = document.getElementById('new_family_name');
    const family_name = familyNameInput.value.trim();
    const messageElement = document.getElementById('addMessage');

    if (!family_name) return;

    try {
        const response = await fetch('/api/families', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ family_name })
        });
        const data = await response.json();

        if (data.success) {
            messageElement.textContent = data.message;
            messageElement.style.color = 'green';
            familyNameInput.value = ''; // مسح الإدخال
            loadFamilies(); // إعادة تحميل الجدول
        } else {
            messageElement.textContent = data.message;
            messageElement.style.color = 'red';
        }
    } catch (error) {
        messageElement.textContent = 'خطأ في الاتصال بالخادم.';
        messageElement.style.color = 'red';
    }
}

// ------------------------------------------
// حذف أسرة (Delete)
// ------------------------------------------
async function deleteFamily(family_id) {
    if (!confirm('هل أنت متأكد من حذف هذه الأسرة؟')) return;

    try {
        const response = await fetch(`/api/families/${family_id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            alert(data.message);
            loadFamilies(); // إعادة تحميل الجدول
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('خطأ في الاتصال بالخادم لحذف الأسرة.');
    }
}

// ------------------------------------------
// تعديل أسرة (Update)
// ------------------------------------------
function editFamily(family_id, currentName) {
    const newName = prompt(`أدخل الاسم الجديد للأسرة (الاسم الحالي: ${currentName}):`, currentName);
    
    if (newName && newName.trim() !== currentName) {
        updateFamilyName(family_id, newName.trim());
    }
}

async function updateFamilyName(family_id, new_family_name) {
    try {
        const response = await fetch(`/api/families/${family_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ family_name: new_family_name })
        });
        const data = await response.json();

        if (data.success) {
            alert(data.message);
            // تحديث الخلية مباشرة بدلاً من إعادة تحميل الجدول بالكامل
            document.getElementById(`name-${family_id}`).textContent = new_family_name;
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('خطأ في الاتصال بالخادم لتعديل الأسرة.');
    }
}