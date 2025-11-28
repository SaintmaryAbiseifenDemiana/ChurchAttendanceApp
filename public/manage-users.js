document.addEventListener('DOMContentLoaded', () => {
    // تحميل الأسر لملء قائمة الاختيار
    loadFamiliesForDropdown();
    // تحميل المستخدمين لعرض الجدول
    loadUsers();
    
    document.getElementById('addUserForm').addEventListener('submit', addUser);

    // ✅ زر مسح المحددين
    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedUsers);

    // ✅ زر تحديد الكل
    document.getElementById('selectAll').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.user-checkbox');
        checkboxes.forEach(cb => cb.checked = this.checked);
    });
});

// ------------------------------------------
// مساعدة: جلب الأسر لملء قائمة الاختيار
// ------------------------------------------
async function loadFamiliesForDropdown() {
    try {
        const response = await fetch('/api/families');
        const data = await response.json();
        const select = document.getElementById('family_id');

        // مسح العناصر القديمة مع الاحتفاظ بخيار 'لا يوجد/مشرف'
        select.innerHTML = '<option value="">لا يوجد/مشرف</option>'; 

        if (data.success && data.families.length > 0) {
            data.families.forEach(family => {
                const option = document.createElement('option');
                option.value = family.family_id;
                option.textContent = family.family_name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('فشل تحميل الأسر للقائمة المنسدلة:', error);
    }
}

// ------------------------------------------
// إضافة مستخدم (Create)
// ------------------------------------------
async function addUser(e) {
    e.preventDefault();
    const username = document.getElementById('new_username').value.trim();
    const password = document.getElementById('new_password').value;
    const role_group = document.getElementById('role_group').value;
    const family_id = document.getElementById('family_id').value || null;

    const messageElement = document.getElementById('userAddMessage');

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role_group, family_id })
        });
        const data = await response.json();

        if (data.success) {
            messageElement.textContent = data.message;
            messageElement.style.color = 'green';
            document.getElementById('addUserForm').reset(); 
            loadUsers(); // إعادة تحميل الجدول
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
// قراءة وعرض المستخدمين (Read)
// ------------------------------------------
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        const tableBody = document.getElementById('usersTableBody');
        tableBody.innerHTML = ''; 

        if (data.success && data.users.length > 0) {
            data.users.forEach((user, index) => {
                const row = tableBody.insertRow();

                // ✅ Checkbox لكل مستخدم
                const cbCell = row.insertCell();
                if (user.user_id != 1) { // منع حذف المستخدم الأساسي
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = user.user_id;
                    cb.className = 'user-checkbox';
                    cbCell.appendChild(cb);
                } else {
                    cbCell.textContent = '—';
                }

                row.insertCell().textContent = index + 1;
                row.insertCell().textContent = user.username;
                row.insertCell().textContent = user.role_group;
                row.insertCell().textContent = user.family_name || 'غير مسؤول عن أسرة';
                
                const actionsCell = row.insertCell();
                if (user.user_id != 1) {
                    actionsCell.innerHTML = `<button onclick="deleteUser(${user.user_id})" style="background-color: #dc3545;">حذف</button>`;
                } else {
                    actionsCell.textContent = 'أساسي';
                }
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="6">لا توجد مستخدمين مسجلين بعد.</td></tr>';
        }

    } catch (error) {
        console.error('خطأ في تحميل المستخدمين:', error);
        alert('فشل في تحميل بيانات المستخدمين.');
    }
}

// ------------------------------------------
// حذف مستخدم واحد (Delete)
// ------------------------------------------
async function deleteUser(user_id) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;

    try {
        const response = await fetch(`/api/users/${user_id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            alert(data.message);
            loadUsers(); // إعادة تحميل الجدول
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('خطأ في الاتصال بالخادم لحذف المستخدم.');
    }
}

// ------------------------------------------
// ✅ حذف مجموعة مستخدمين (Bulk Delete)
// ------------------------------------------
async function deleteSelectedUsers() {
    const selectedIds = Array.from(document.querySelectorAll('.user-checkbox:checked'))
                             .map(cb => cb.value);

    if (selectedIds.length === 0) {
        alert('❌ لازم تختاري خادم واحد على الأقل');
        return;
    }

    if (!confirm(`هل متأكدة إنك عايزة تمسحي ${selectedIds.length} خادم؟`)) return;

    try {
        const response = await fetch('/api/users/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_ids: selectedIds })
        });
        const data = await response.json();
        if (data.success) {
            alert('✅ تم مسح الخدام المحددين');
            loadUsers();
        } else {
            alert('❌ فشل في المسح: ' + data.message);
        }
    } catch (err) {
        console.error('خطأ في المسح:', err);
        alert('❌ حصل خطأ أثناء المسح');
    }
}
