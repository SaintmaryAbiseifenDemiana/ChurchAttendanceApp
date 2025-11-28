document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    
    let username = document.getElementById('username').value.trim();
    let password = document.getElementById('password').value;
    const messageElement = document.getElementById('message');
    
    messageElement.textContent = ''; 
    messageElement.className = ''; 

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log('Login response:', data); // ✅ نطبع كل الرد

        if (data.success) {
            messageElement.textContent = 'تم الدخول بنجاح! الصلاحية: ' + data.role;
            messageElement.className = 'success';
            
            // ✅ حفظ بيانات المستخدم مع الأسرة
            const user = {
                user_id: data.user_id,
                username: data.username,
                role: data.role,
                family_id: data.family_id,       // مهم للخادم
                family_name: data.family_name    // مهم للخادم
            };
            localStorage.setItem('user', JSON.stringify(user));
            
            // منطق التوجيه بناءً على الصلاحية
            const role = data.role ? data.role.trim().toLowerCase() : '';
            if (role === 'admin') {
                window.location.href = '/admin-dashboard.html'; 
            } else if (role === 'ameensekra' || role === 'amin') {
                window.location.href = '/ameen-dashboard.html'; 
            } else if (role === 'khadem') {
                // ✅ الخادم يروح للوحة الخادم الخاصة بيه
                window.location.href = '/dashboard.html'; 
            } else {
                messageElement.textContent = '❌ صلاحية غير معروفة: ' + data.role;
                messageElement.className = 'error';
            }
        } else {
            messageElement.textContent = data.message;
            messageElement.className = 'error';
        }
    } catch (error) {
        messageElement.textContent = 'خطأ في الاتصال بالخادم.';
        messageElement.className = 'error';
        console.error('Error:', error);
    }
});
