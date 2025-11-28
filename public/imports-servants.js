document.getElementById('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('servantFile');
    const statusElement = document.getElementById('importStatus');
    const file = fileInput.files[0];

    if (!file) {
        statusElement.textContent = 'الرجاء اختيار ملف.';
        statusElement.style.color = 'red';
        return;
    }

    statusElement.textContent = 'جاري رفع ومعالجة الملف... قد يستغرق الأمر بعض الوقت.';
    statusElement.style.color = 'blue';
    document.getElementById('importButton').disabled = true;

    // استخدام FormData لرفع الملف
    const formData = new FormData();
    formData.append('servantFile', file);

    try {
        const response = await fetch('/api/admin/import-servants', {
            method: 'POST',
            body: formData 
        });

        const data = await response.json();

        if (response.ok && data.success) {
            statusElement.textContent = `✅ نجاح! تم إضافة ${data.importedCount} خادم جديد بنجاح.`;
            statusElement.style.color = 'green';
        } else {
            const errorMsg = data.message || 'فشل غير معروف في الخادم.';
            statusElement.textContent = `❌ فشل الاستيراد: ${errorMsg}`;
            statusElement.style.color = 'red';
        }
    } catch (error) {
        console.error('Error during import:', error);
        statusElement.textContent = '❌ خطأ في الاتصال بالخادم. تحقق من Console.';
        statusElement.style.color = 'red';
    } finally {
        document.getElementById('importButton').disabled = false;
    }
});
