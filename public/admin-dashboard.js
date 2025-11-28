// ✅ التحقق من تسجيل الدخول
const user = JSON.parse(localStorage.getItem('user') || '{}');
if (!user.role || user.role.trim().toLowerCase() !== 'admin') {
    window.location.href = '/login.html';
}

// ✅ زرار تسجيل الخروج
document.getElementById('logout-btn').addEventListener('click', function () {
    localStorage.removeItem('user'); // مسح بيانات الدخول
    window.location.href = '/login.html'; // رجوع للوجين
});

// ✅ التحكم في زر الرجوع (Back)
window.addEventListener('popstate', function () {
    // أي رجوع من صفحات داخلية → يرجع للوجين
    if (window.location.pathname !== '/login.html') {
        window.location.href = '/login.html';
    } else {
        // لو هو بالفعل في صفحة اللوجين ورجع خطوة → يقفل التبويب
        window.close();
    }
});
