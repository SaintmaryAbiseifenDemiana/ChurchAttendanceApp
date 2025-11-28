window.addEventListener('popstate', function () {
    if (window.location.pathname !== '/login.html') {
        window.location.href = '/login.html';
    } else {
        window.close();
    }
});
