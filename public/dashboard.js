document.getElementById('logout-btn').addEventListener('click', function () {
    // يمسح بيانات المستخدم من التخزين المحلي
    localStorage.removeItem('user');

    // يرجع المستخدم لصفحة تسجيل الدخول
    window.location.href = '/login.html';
});
