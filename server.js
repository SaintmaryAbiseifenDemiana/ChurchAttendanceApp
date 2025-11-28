// server.js - الكود النهائي الكامل للنظام (بما في ذلك تسجيل الحضور الفردي والتقارير)

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt'); 
const path = require('path'); 
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx'); // سنستخدمها أيضاً للقراءة من CSV
const fs = require('fs'); // مكتبة أساسية في Node لقراءة الملفات

// تهيئة Multer لحفظ الملفات المؤقتة في مجلد "uploads/"
const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = 3000;
function normalizeArabicUsername(input) {
        if (!input) return '';
        return input
            .trim() // إزالة المسافات من البداية والنهاية
            .replace(/\s+/g, '') // إزالة كل المسافات الداخلية
            .replace(/[أإآا]/g, 'ا') // توحيد الألف
            .replace(/[ى]/g, 'ي') // توحيد الياء
            .replace(/[ةه]/g, 'ه') // توحيد التاء المربوطة مع الهاء
            .replace(/[ؤئء]/g, 'ء'); // توحيد الهمزات
    }
function normalizeArabicFamilyName(input) {
    if (!input) return '';
    return input
        .trim()
        .replace(/\s+/g, ' ') // نخلي المسافات واحدة بس
        .replace(/[أإآا]/g, 'ا')
        .replace(/[يى]/g, 'ي')
        .replace(/[ة]/g, 'ه'); // لو عايزة توحيد التاء المربوطة
}

// 1. الاتصال بقاعدة بيانات SQLite وإنشاء الجداول
const db = new sqlite3.Database('./church.db', (err) => {
    if (err) {
        console.error('خطأ في الاتصال بقاعدة بيانات SQLite:', err.message);
    } else {
        console.log('تم الاتصال بقاعدة بيانات SQLite بنجاح.');
        setupDatabaseTables(); // إنشاء الجداول وتوليد الهاش
    }
});

// 2. دالة لإنشاء الجداول وإدخال البيانات الأساسية (Seeding)
async function setupDatabaseTables() {
    db.serialize(() => {
        // جدول المستخدمين (الخدام والأمناء)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role_group TEXT NOT NULL,
            family_id INTEGER 
        );`);
        
        // جدول الأسر
        db.run(`CREATE TABLE IF NOT EXISTS families (
            family_id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_name TEXT UNIQUE NOT NULL
        );`);

        // 🚨🚨 الجدول الجديد: تسجيل الحضور الفردي مع التفاصيل 🚨🚨
        db.run(`CREATE TABLE IF NOT EXISTS servant_attendance (
            attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,            -- معرف الخادم الذي تم تسجيله
            session_date TEXT NOT NULL,          -- تاريخ الجلسة (yyyy-mm-dd)
            status TEXT NOT NULL,                -- 'Present' أو 'Absent'
            absence_reason TEXT,                 -- سبب الغياب
            apologized INTEGER NOT NULL DEFAULT 0, -- اعتذر (1) أو لا (0)
            recorded_by_user_id INTEGER NOT NULL,
            UNIQUE(user_id, session_date) 
        );`
        );
        // 🚨 الجدول الجديد 1: قائمة المخدومين (الطلاب/الأطفال)
        db.run(`CREATE TABLE IF NOT EXISTS serviced (
            serviced_id INTEGER PRIMARY KEY AUTOINCREMENT,
            serviced_name TEXT NOT NULL,
            family_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,  -- اسم الفصل (مثل: أولى إعدادي)
            UNIQUE(serviced_name, family_id, class_name),
            FOREIGN KEY (family_id) REFERENCES families(family_id)
        );`);
        db.run(`CREATE TABLE IF NOT EXISTS family_attendance_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL,
            session_date TEXT NOT NULL,
            attendees_count INTEGER NOT NULL,
            recorded_by_user_id INTEGER NOT NULL,
            UNIQUE(family_id, session_date)
        );`);
        // 🚨 الجدول الجديد 2: ربط الخادم بالمخدوم المسؤول عنه
        db.run(`CREATE TABLE IF NOT EXISTS servant_serviced_link (
            link_id INTEGER PRIMARY KEY AUTOINCREMENT,
            servant_user_id INTEGER NOT NULL, -- معرّف الخادم (من جدول users)
            serviced_id INTEGER NOT NULL,     -- معرّف المخدوم (من جدول serviced)
            UNIQUE(servant_user_id, serviced_id),
            FOREIGN KEY (servant_user_id) REFERENCES users(user_id),
            FOREIGN KEY (serviced_id) REFERENCES serviced(serviced_id)
        );`);

        // 🚨 الجدول الجديد 3: تسجيل الحضور للمخدومين
        // (جدول جديد ومختلف عن servant_attendance الذي يسجل حضور الخدام)
        db.run(`CREATE TABLE IF NOT EXISTS serviced_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serviced_id INTEGER NOT NULL,
            session_date TEXT NOT NULL,
            status TEXT NOT NULL, -- Present, Absent, etc.
            recorded_by_user_id INTEGER NOT NULL,
            UNIQUE(serviced_id, session_date),
            FOREIGN KEY (serviced_id) REFERENCES serviced(serviced_id),
            FOREIGN KEY (recorded_by_user_id) REFERENCES users(user_id)
        );`);
        // جدول الغياب الشهري للخدام
        db.run(`
        CREATE TABLE IF NOT EXISTS monthly_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            family_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            meeting INTEGER DEFAULT 0,        
            lesson INTEGER DEFAULT 0,         
            communion INTEGER DEFAULT 0,      
            confession INTEGER DEFAULT 0,     
            total_serviced INTEGER DEFAULT 0, 
            visited_serviced INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(user_id),
            FOREIGN KEY(family_id) REFERENCES families(family_id),
            UNIQUE(user_id, family_id, date)   -- ✅ القيد الجديد
        );

        `);




        // توليد المستخدم الأساسي
        const username = 'test_admin';
        const passwordToHash = '123'; 

        bcrypt.hash(passwordToHash, 10, (err, hashedPassword) => {
            if (err) {
                console.error("خطأ في توليد التشفير:", err);
                return;
            }

            db.run(`INSERT OR REPLACE INTO users (user_id, username, password_hash, role_group, family_id) 
                VALUES ((SELECT user_id FROM users WHERE username = ?), ?, ?, ?, NULL)`, 
                [username, username, hashedPassword, 'Admin'], 
                (err) => {
                    if (err) console.error("خطأ في إدخال المستخدم:", err.message);
                    else console.log(`✅ تم التأكد من وجود/تحديث المستخدم: ${username}`);
                });
        });
    });
}

// 3. إعداد الـ Middleware
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 

// 4. مسار تسجيل الدخول
app.post('/login', async (req, res) => {
    let { username, password } = req.body;
    const normalizedInput = normalizeArabicUsername(username);

    try {
        const sql = `
            SELECT u.user_id, u.username, u.password_hash, u.role_group, u.family_id, f.family_name
            FROM users u
            LEFT JOIN families f ON u.family_id = f.family_id
        `;

        db.all(sql, [], async (err, users) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
            }

            const user = users.find(u => normalizeArabicUsername(u.username) === normalizedInput);
            if (!user) {
                return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                res.json({ 
                    success: true,
                    message: 'تم تسجيل الدخول بنجاح.',
                    user_id: user.user_id,
                    role: user.role_group,
                    family_id: user.family_id,
                    family_name: user.family_name, // ✅ مهم للخادم
                    username: user.username
                });
            } else {
                res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي في الخادم.' });
    }
});






// ======================================================
// مسارات API لإدارة الأسر (Families)
// (نفس الكود السابق)
// ======================================================

app.post('/api/families', (req, res) => {
    const { family_name } = req.body;
    if (!family_name) return res.status(400).json({ success: false, message: 'اسم الأسرة مطلوب.' });
    const sql = 'INSERT INTO families (family_name) VALUES (?)';
    db.run(sql, [family_name], function(err) {
        if (err) {
            if (err.errno === 19) return res.status(409).json({ success: false, message: 'هذه الأسرة موجودة بالفعل.' });
            return res.status(500).json({ success: false, message: 'فشل إضافة الأسرة.' });
        }
        res.status(201).json({ success: true, message: 'تم إضافة الأسرة بنجاح.', family_id: this.lastID });
    });
});

app.get('/api/families', (req, res) => {
    const sql = 'SELECT family_id, family_name FROM families ORDER BY family_name ASC';
    db.all(sql, [], (err, rows) => {
        if (err){
            console.error('Error fetching families:', err.message);
            return res.status(500).json({ success: false, message: 'فشل قراءة بيانات الأسر.' });}
        res.json({ success: true, families: rows });
    });
});

app.put('/api/families/:id', (req, res) => {
    const id = req.params.id;
    const { family_name } = req.body;
    if (!family_name) return res.status(400).json({ success: false, message: 'الاسم الجديد للأسرة مطلوب.' });
    const sql = 'UPDATE families SET family_name = ? WHERE family_id = ?';
    db.run(sql, [family_name, id], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'فشل تعديل الأسرة.' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'لم يتم العثور على الأسرة للتعديل.' });
        res.json({ success: true, message: 'تم تعديل اسم الأسرة بنجاح.' });
    });
});

app.delete('/api/families/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM families WHERE family_id = ?';
    db.run(sql, id, function(err) {
        if (err) return res.status(500).json({ success: false, message: 'فشل حذف الأسرة.' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'لم يتم العثور على الأسرة للحذف.' });
        res.json({ success: true, message: 'تم حذف الأسرة بنجاح.' });
    });
});

// ======================================================
// مسارات API لإدارة المستخدمين (Users/Servants)
// (نفس الكود السابق)
// ======================================================

app.post('/api/users', async (req, res) => {
    let { username, password, role_group, family_id } = req.body;
    username = normalizeArabicUsername(username);
    if (!username || !password || !role_group) return res.status(400).json({ success: false, message: 'اسم المستخدم، كلمة المرور، والصلاحية مطلوبة.' });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, password_hash, role_group, family_id) VALUES (?, ?, ?, ?)';
        const params = [username, hashedPassword, role_group, family_id || null];
        db.run(sql, params, function(err) {
            if (err) {
                if (err.errno === 19) return res.status(409).json({ success: false, message: 'اسم المستخدم موجود بالفعل.' });
                return res.status(500).json({ success: false, message: 'فشل إضافة المستخدم.' });
            }
            res.status(201).json({ success: true, message: 'تم إضافة المستخدم بنجاح.', user_id: this.lastID });
        });
    } catch (hashError) {
        res.status(500).json({ success: false, message: 'فشل توليد كلمة المرور المشفرة.' });
    }
});

app.get('/api/users', (req, res) => {
  const { family_id } = req.query;
  let sql = `
    SELECT 
      u.user_id, 
      u.username, 
      u.role_group, 
      u.family_id, 
      f.family_name, 
      COUNT(link.serviced_id) AS serviced_count
    FROM users u
    LEFT JOIN families f ON u.family_id = f.family_id
    LEFT JOIN servant_serviced_link link ON u.user_id = link.servant_user_id
  `;
  let params = [];

  if (family_id) {
    sql += ' WHERE u.family_id = ?';
    params.push(family_id);
  }

  sql += ' GROUP BY u.user_id';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: 'خطأ في جلب الخدام' });
    }
    res.json({ success: true, users: rows });
  });
});



app.delete('/api/users/:id', (req, res) => {
    const id = req.params.id;
    if (id == 1) return res.status(403).json({ success: false, message: 'لا يمكن حذف المستخدم الأساسي للنظام.' });
    const sql = 'DELETE FROM users WHERE user_id = ?';
    db.run(sql, id, function(err) {
        if (err) return res.status(500).json({ success: false, message: 'فشل حذف المستخدم.' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'لم يتم العثور على المستخدم للحذف.' });
        res.json({ success: true, message: 'تم حذف المستخدم بنجاح.' });
    });
});
// ✅ مسح مجموعة مستخدمين دفعة واحدة
app.post('/api/users/bulk-delete', (req, res) => {
    const { user_ids } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return res.json({ success: false, message: '❌ لا يوجد خدام محددين للحذف.' });
    }

    // منع حذف المستخدم الأساسي (id = 1)
    const filteredIds = user_ids.filter(id => id != 1);

    if (filteredIds.length === 0) {
        return res.json({ success: false, message: '❌ لا يمكن حذف المستخدم الأساسي للنظام.' });
    }

    const placeholders = filteredIds.map(() => '?').join(',');
    const sql = `DELETE FROM users WHERE user_id IN (${placeholders})`;

    db.run(sql, filteredIds, function(err) {
        if (err) {
            console.error('خطأ في مسح الخدام:', err.message);
            return res.json({ success: false, message: 'فشل في مسح الخدام.' });
        }
        res.json({ success: true, message: `✅ تم مسح ${this.changes} خادم.` });
    });
});

// ======================================================
// 🚨🚨 مسارات API لتسجيل الحضور والغياب (المعدلة) 🚨🚨
// ======================================================

// 1. جلب الخدام التابعين لأسرة معينة (GET /api/attendance/servants/:family_id)
app.get('/api/attendance/servants/:family_id', (req, res) => {
    const family_id = req.params.family_id;
    // نجلب جميع المستخدمين الذين صلاحيتهم خادم أو أمين ومسؤولين عن هذه الأسرة.
    // نستبعد المستخدمين ذوي صلاحية "Admin"
    const sql = `
        SELECT user_id, username, role_group
        FROM users 
        WHERE family_id = ? AND role_group != 'Admin' 
        ORDER BY username ASC
    `;
    db.all(sql, [family_id], (err, rows) => {
        if (err) {
            console.error('خطأ في جلب الخدام:', err.message);
            return res.status(500).json({ success: false, message: 'فشل في جلب قائمة الخدام.' });
        }
        res.json({ success: true, servants: rows });
    });
});

// 2. تسجيل الحضور والغياب دفعة واحدة (Bulk POST)
// ... (في ملف server.js)

// ... (في ملف server.js)

// 2. تسجيل الحضور والغياب دفعة واحدة (Bulk POST)
app.post('/api/attendance', (req, res) => {
    const { date, records, recorded_by_user_id, family_id, attendees_count } = req.body;

    if (!date || !records || !recorded_by_user_id || !family_id || attendees_count == null) {
        return res.status(400).json({ 
            success: false, 
            message: 'التاريخ، الأسرة، عدد المخدومين، سجلات الحضور، ومعرف المسجل مطلوبة.' 
        });
    }
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, message: 'سجلات الحضور غير صالحة أو فارغة.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        // ✅ حفظ سجلات الخدام مع family_id
        const insertStmt = db.prepare(
            `INSERT OR REPLACE INTO servant_attendance 
            (user_id, family_id, session_date, status, absence_reason, apologized, recorded_by_user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        let successCount = 0;
        let errorOccurred = false;

        records.forEach(record => {
            if (errorOccurred) return; 
            
            const userId = record.user_id;
            const apologized = record.apologized; 
            const status = record.status;
            const reason = record.reason; 

            insertStmt.run(userId, family_id, date, status, reason, apologized, recorded_by_user_id, function(err) {
                if (err) {
                    console.error('SQLITE CRITICAL ERROR:', err.message);
                    errorOccurred = true;
                } else {
                    successCount++;
                }
            });
        });

        insertStmt.finalize();

        // ✅ حفظ العدد الكلي للمخدومين
        const summaryStmt = db.prepare(
            `INSERT OR REPLACE INTO family_attendance_summary 
            (family_id, session_date, attendees_count, recorded_by_user_id) 
            VALUES (?, ?, ?, ?)`
        );

        summaryStmt.run(family_id, date, attendees_count, recorded_by_user_id, function(err) {
            if (err) {
                console.error('خطأ في حفظ عدد المخدومين:', err.message);
                errorOccurred = true;
            }
        });

        summaryStmt.finalize();

        if (errorOccurred) {
            db.run('ROLLBACK;', () => {
                res.status(500).json({ success: false, message: 'فشل حفظ السجلات بسبب خطأ في قاعدة البيانات.' });
            });
        } else {
            db.run('COMMIT;', (err) => {
                if (err) {
                    console.error('COMMIT ERROR:', err.message);
                    return res.status(500).json({ success: false, message: 'فشل في إنهاء عملية حفظ السجلات.' });
                }
                res.json({ 
                    success: true, 
                    message: `تم تسجيل حضور/غياب ${successCount} خادم + عدد المخدومين (${attendees_count}) بتاريخ ${date} بنجاح.` 
                });
            });
        }
    });
});


// ======================================================
// 🚨🚨 مسار تقرير المشرف (معدل لعرض الجمعتين السابقتين) 🚨🚨
// ======================================================

// دالة مساعدة لجلب التواريخ السابقة
function getPreviousFridays(num, endDate = new Date()) {
    const dates = [];
    let current = new Date(endDate);
    
    // الجمعة = 5 في JS (الأحد 0)
    while (dates.length < num) {
        // إذا كان اليوم الحالي ليس جمعة، ارجع للوراء حتى تصل للجمعة
        while (current.getDay() !== 5) { 
            current.setDate(current.getDate() - 1);
        }
        
        // الآن current هي الجمعة
        const dateStr = current.toISOString().split('T')[0];
        // تأكد من عدم إضافة نفس التاريخ مرتين في حال كان endDate جمعة
        if (dates.length === 0 || dates[dates.length - 1] !== dateStr) {
            dates.push(dateStr);
        }
        
        // ارجع للوراء أسبوع لتجد الجمعة التي قبلها
        current.setDate(current.getDate() - 7);
    }
    return dates.slice(0, num); // نضمن فقط العدد المطلوب
}


app.get('/api/reports/attendance', (req, res) => {
  const { month, family_id } = req.query;

  if (!month) {
    return res.status(400).json({ success: false, message: 'لازم تختاري الشهر.' });
  }

  const monthStr = String(month).padStart(2, '0');

  // ✅ تقرير الخدام
  let sqlServants = `
    SELECT 
      u.user_id,
      u.username,
      f.family_name,
      a.session_date,
      a.status,
      a.absence_reason,
      a.apologized
    FROM users u
    LEFT JOIN families f ON u.family_id = f.family_id
    LEFT JOIN servant_attendance a ON u.user_id = a.user_id
    WHERE u.role_group != 'Admin'
      AND a.session_date IS NOT NULL
      AND strftime('%m', a.session_date) = ?
  `;
  const paramsServants = [monthStr];

  if (family_id) {
    sqlServants += ' AND u.family_id = ?';
    paramsServants.push(family_id);
  }

  sqlServants += ' ORDER BY f.family_name, u.username, a.session_date';

  // ✅ عدد حضور المخدومين
  let sqlSummary = `
    SELECT 
      family_id,
      session_date,
      attendees_count
    FROM family_attendance_summary
    WHERE strftime('%m', session_date) = ?
  `;
  const paramsSummary = [monthStr];

  if (family_id) {
    sqlSummary += ' AND family_id = ?';
    paramsSummary.push(family_id);
  }

  sqlSummary += ' ORDER BY session_date';

  // ✅ تنفيذ الاستعلامين
  db.all(sqlServants, paramsServants, (err, servantRows) => {
    if (err) {
      console.error('خطأ في جلب تقرير الحضور:', err.message);
      return res.status(500).json({ success: false, message: 'فشل في جلب تقرير الحضور.' });
    }

    db.all(sqlSummary, paramsSummary, (err2, summaryRows) => {
      if (err2) {
        console.error('خطأ في جلب عدد المخدومين:', err2.message);
        return res.status(500).json({ success: false, message: 'فشل في جلب عدد المخدومين.' });
      }

      res.json({ 
        success: true, 
        report: servantRows,
        summary: summaryRows 
      });
    });
  });
});


// ----------------------------------------------------
// 5. API الاستيراد من ملف CSV/Excel (للإدارة فقط)
// ----------------------------------------------------
// ----------------------------------------------------
// 5. API الاستيراد من ملف CSV/Excel (المصحح)
// ----------------------------------------------------
app.post('/api/admin/import-servants', upload.single('servantFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يتم تحميل أي ملف.' });
    }

    const filePath = req.file.path;
    const records = [];

    const processRecords = () => {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn(`Could not delete temp file: ${e.message}`); }

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'الملف فارغ أو لا يحتوي على بيانات صالحة.' });
        }

        const requiredFields = ['username', 'password', 'family_name'];
        console.log('All imported records before filtering:', records);

        const validRecords = records.filter(r => requiredFields.every(field => r[field]));

        if (validRecords.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم العثور على أي سجلات بخانات username و password و family_name كاملة.' });
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            let importedCount = 0;
            let errorOccurred = false;

            validRecords.forEach(record => {
                if (errorOccurred) return;

                const { username, password, role_group, family_name } = record;
                const finalRole = (role_group || 'Khadem').trim();
                const normalizedFamilyName = normalizeArabicFamilyName(family_name);

                // نخزن الاسم كما هو بالمسافات الطبيعية
                const storedUsername = username.trim();

                bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
                    if (hashErr) {
                        console.error('Bcrypt hash error:', hashErr.message);
                        errorOccurred = true;
                        return;
                    }

                    db.run("INSERT OR IGNORE INTO families (family_name) VALUES (?)", [normalizedFamilyName], function(err) {
                        if (err) {
                            console.error('Family insertion error:', err.message);
                            errorOccurred = true;
                            return;
                        }

                        db.get("SELECT family_id FROM families WHERE family_name = ?", [normalizedFamilyName], (err, row) => {
                            if (err || !row) {
                                console.error('Family lookup error:', err ? err.message : 'Not found');
                                errorOccurred = true;
                                return;
                            }

                            const family_id = row.family_id;

                            console.log('About to insert user:', {
                                username: storedUsername,
                                password_hash: hashedPassword,
                                role_group: finalRole,
                                family_id: family_id
                            });

                            db.run(`
                                INSERT OR IGNORE INTO users (username, password_hash, role_group, family_id)
                                VALUES (?, ?, ?, ?)
                            `, [storedUsername, hashedPassword, finalRole, family_id], function(err) {
                                if (err) {
                                    console.error('User insertion error:', err.message);
                                    errorOccurred = true;
                                } else {
                                    if (this.changes > 0) {
                                        importedCount++;
                                    }
                                }
                            });
                        });
                    });
                });
            });

            setTimeout(() => {
                if (errorOccurred) {
                    db.run('ROLLBACK;', () => {
                        res.status(500).json({ success: false, message: 'فشل في استيراد بعض السجلات. تم التراجع عن المعاملة (ROLLBACK).' });
                    });
                } else {
                    db.run('COMMIT;', (err) => {
                        if (err) {
                            console.error('COMMIT ERROR:', err.message);
                            return res.status(500).json({ success: false, message: 'فشل في إنهاء عملية الاستيراد.' });
                        }
                        res.json({
                            success: true,
                            message: `تم استيراد ${importedCount} خادم جديد بنجاح.`,
                            importedCount: importedCount
                        });
                    });
                }
            }, 5000);
        });
    };

    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const cleanedData = data.map(row => {
            const newRow = {};
            for (const key in row) {
                newRow[key.trim().toLowerCase()] = row[key];
            }
            return newRow;
        });

        records.push(...cleanedData);
        processRecords();

    } catch (e) {
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.error('File reading error:', e.message);
        return res.status(500).json({ success: false, message: 'خطأ في قراءة الملف: تأكد من أن الملف ليس مفتوحاً وأن صيغة CSV/Excel سليمة.' });
    }
});



// ... (باقي كود تشغيل الخادم app.listen(PORT, ...))
// ======================================================
// 🚨🚨 مسارات API لتسجيل حضور المخدومين (Serviced Attendance) 🚨🚨
// ======================================================

// 1. جلب أسماء الفصول الفريدة التابعة لأسرة معينة
// (GET /api/serviced/classes/:familyId)
app.get('/api/serviced/classes/:familyId', (req, res) => {
    const familyId = req.params.familyId;
    const sql = `
        SELECT DISTINCT class_name 
        FROM serviced 
        WHERE family_id = ? 
        ORDER BY class_name
    `;
    db.all(sql, [familyId], (err, rows) => {
        if (err) {
            console.error('SQL Error fetching classes:', err.message);
            return res.status(500).json({ success: false, message: 'فشل جلب قائمة الفصول.' });
        }
        res.json({ success: true, classes: rows.map(row => row.class_name) });
    });
});


// 2. جلب المخدومين التابعين لخادم معين وفصل معين
// (GET /api/serviced/list/:servantId/:familyId/:className?date=YYYY-MM-DD)
// جلب كل المخدومين في أسرة وفصل معين (بغض النظر عن الخادم)

app.get('/api/serviced/list/:familyId/:className', (req, res) => {
    const { familyId, className } = req.params;
    const date = req.query.date;

    if (!date) {
        return res.status(400).json({ success: false, message: 'تاريخ الجلسة مطلوب.' });
    }

    const sql = `
        SELECT s.serviced_id, s.serviced_name,
               (SELECT status FROM serviced_attendance sa 
                WHERE sa.serviced_id = s.serviced_id AND sa.session_date = ? 
                ORDER BY sa.id DESC LIMIT 1) AS attendance_status
        FROM serviced s
        WHERE s.family_id = ? AND s.class_name = ?
        ORDER BY s.serviced_name
    `;

    db.all(sql, [date, familyId, className], (err, rows) => {
        if (err) {
            console.error('SQL Error fetching serviced list:', err.message);
            return res.status(500).json({ success: false, message: 'فشل جلب قائمة المخدومين.' });
        }
        res.json({ success: true, serviced: rows });
    });
});


// 3. مسار حفظ/تحديث حضور المخدومين دفعة واحدة
// (POST /api/serviced/attendance)
app.post('/api/serviced/attendance', (req, res) => {
    const { date, records, recorded_by_user_id } = req.body;
    if (!date || !records || !recorded_by_user_id) {
        return res.status(400).json({ success: false, message: 'التاريخ، سجلات الحضور، ومعرف المسجل مطلوبة.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');
        let successCount = 0;
        let errorOccurred = false;

        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO serviced_attendance 
            (serviced_id, session_date, status, recorded_by_user_id) 
            VALUES (?, ?, ?, ?)
        `);

        records.forEach(record => {
            if (errorOccurred) return;
            const { serviced_id, status } = record;
            insertStmt.run(serviced_id, date, status, recorded_by_user_id, function(err) {
                if (err) {
                    console.error('Serviced Attendance SQLITE ERROR:', err.message);
                    errorOccurred = true;
                } else {
                    successCount++;
                }
            });
        });

        insertStmt.finalize();

        if (errorOccurred) {
            db.run('ROLLBACK;', () => {
                res.status(500).json({ success: false, message: 'فشل حفظ سجلات الحضور.' });
            });
        } else {
            db.run('COMMIT;', (err) => {
                if (err) {
                    console.error('COMMIT ERROR:', err.message);
                    return res.status(500).json({ success: false, message: 'فشل إنهاء عملية الحفظ.' });
                }
                res.json({ success: true, message: `✅ تم تسجيل حضور ${successCount} مخدوم بتاريخ ${date} بنجاح.` });
            });
        }
    });
});

// GET /api/admin/monthly-serviced/:month/:familyId
// GET /api/admin/monthly-serviced/:month/:familyId
app.get('/api/admin/monthly-serviced/:month/:familyId', (req, res) => {
    const { month, familyId } = req.params;

    const sql = `
        SELECT s.serviced_id, s.serviced_name, u.username AS servant_name,
               s.class_name, f.family_name,
               sa.session_date, sa.status
        FROM serviced s
        JOIN families f ON s.family_id = f.family_id
        JOIN servant_serviced_link ssl ON s.serviced_id = ssl.serviced_id
        JOIN users u ON ssl.servant_user_id = u.user_id
        LEFT JOIN serviced_attendance sa 
            ON sa.serviced_id = s.serviced_id 
            AND strftime('%m', sa.session_date) = ?
        WHERE s.family_id = ?
        ORDER BY u.username, s.serviced_name, sa.session_date
    `;

    db.all(sql, [month.padStart(2,'0'), familyId], (err, rows) => {
        if (err) {
            console.error('SQL Error fetching monthly serviced:', err.message);
            return res.status(500).json({ success: false, message: 'فشل جلب النسبة الشهرية.' });
        }

        // ✅ فلترة: استبعاد أي فصل اسمه زي الأسرة بعد التطبيع
        const filteredRows = rows.filter(r => {
            if (!r.class_name || !r.family_name) return true;
            return normalizeArabicFamilyName(r.class_name).toLowerCase() !== normalizeArabicFamilyName(r.family_name).toLowerCase();
        });

        console.log("بعد الفلترة:", filteredRows.map(r => ({
            serviced_id: r.serviced_id,
            serviced_name: r.serviced_name,
            class_name: r.class_name,
            family_name: r.family_name
        })));

        const grouped = {};
        filteredRows.forEach(r => {
            if (!grouped[r.serviced_id]) {
                grouped[r.serviced_id] = {
                    serviced_name: r.serviced_name,
                    servant_name: r.servant_name,
                    class_name: r.class_name,
                    sessions: []
                };
            }
            if (r.session_date) {
                grouped[r.serviced_id].sessions.push({
                    date: r.session_date,
                    status: r.status
                });
            }
        });

        res.json({ success: true, serviced: Object.values(grouped) });
    });
});



// ======================================================
// 🚨🚨 مسار API لاستيراد المخدومين وربطهم بالخدام 🚨🚨
// ======================================================
// ======================================================
// 🚨🚨 مسار API لاستيراد المخدومين وربطهم بالخدام (المصحح النهائي) 🚨🚨
// ======================================================
app.post('/api/admin/import-serviced', upload.single('servicedFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يتم تحميل أي ملف.' });
    }

    const filePath = req.file.path;
    const records = [];

    const processServicedRecords = () => {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn(`Could not delete temp file: ${e.message}`); }

        const requiredFields = ['serviced_name', 'family_name', 'class_name', 'servant_username'];
        const validRecords = records.filter(r => requiredFields.every(field => r[field] && r[field].toString().trim() !== ''));

        if (validRecords.length === 0) {
            return res.status(400).json({ success: false, message: 'لم يتم العثور على سجلات كاملة. تأكد من وجود serviced_name, family_name, class_name, و servant_username.' });
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            let importedCount = 0;
            let linkCount = 0;
            let errorOccurred = false;

            function processNextRecord(index) {
                if (index >= validRecords.length || errorOccurred) {
                    if (errorOccurred) {
                        db.run('ROLLBACK;', () => {
                            console.error('Import ABORTED due to error in record:', validRecords[index-1]);
                            res.status(500).json({ success: false, message: 'فشل في استيراد بعض السجلات. يرجى مراجعة سجلات الخادم.' });
                        });
                    } else {
                        db.run('COMMIT;', (err) => {
                            if (err) {
                                console.error('COMMIT ERROR:', err.message);
                                return res.status(500).json({ success: false, message: 'فشل في إنهاء عملية الاستيراد.' });
                            }
                            res.json({
                                success: true,
                                message: `✅ تم استيراد ${importedCount} مخدوم جديد وربط ${linkCount} مرة بنجاح.`
                            });
                        });
                    }
                    return;
                }

                const record = validRecords[index];
                // ✅ تحويل كل القيم لنصوص آمنة
                const servicedNameSafe = (record.serviced_name || '').toString().trim();
                const familyNameSafe   = (record.family_name   || '').toString().trim();
                const classNameSafe    = (record.class_name    || '').toString().trim();
                const servantNameSafe  = (record.servant_username || '').toString().trim();

                // ✅ تطبيع الأسماء قبل الاستخدام
                const normalizedFamilyName = normalizeArabicFamilyName(familyNameSafe);
                const normalizedServantUsername = normalizeArabicUsername(servantNameSafe);

                db.get("SELECT family_id FROM families WHERE family_name = ?", [normalizedFamilyName], (err, familyRow) => {
                    if (err) {
                        console.error(`Family lookup error for ${normalizedFamilyName}: ${err.message}`);
                        errorOccurred = true;
                        return processNextRecord(index + 1);
                    }

                    let f_id = familyRow ? familyRow.family_id : null;

                    const afterFamilyLookup = (final_f_id) => {
                        // ✅ تعديل البحث عن الخادم: نجيب كل المستخدمين ونطبّعهم وقت المقارنة
                        db.all("SELECT user_id, username FROM users", [], (err, users) => {
                            if (err) {
                                console.error(`Servant lookup error for ${normalizedServantUsername}: ${err.message}`);
                                errorOccurred = true;
                                return processNextRecord(index + 1);
                            }

                            const servantRow = users.find(u => normalizeArabicUsername(u.username) === normalizedServantUsername);

                            if (!servantRow) {
                                console.warn(`Servant not found for username: ${normalizedServantUsername}. Skipping record.`);
                                return processNextRecord(index + 1);
                            }

                            const servant_user_id = servantRow.user_id;

                            db.run(`
                                INSERT OR IGNORE INTO serviced (serviced_name, family_id, class_name)
                                VALUES (?, ?, ?)
                            `, [servicedNameSafe, final_f_id, classNameSafe], function(err) {
                                if (err) {
                                    console.error('Serviced insertion error:', err.message);
                                    errorOccurred = true;
                                    return processNextRecord(index + 1);
                                }

                                if (this.changes > 0) {
                                    importedCount++;
                                }

                                const get_serviced_id_sql = `
                                    SELECT serviced_id FROM serviced 
                                    WHERE serviced_name = ? AND family_id = ? AND class_name = ?
                                `;

                                db.get(get_serviced_id_sql, [servicedNameSafe, final_f_id, classNameSafe], (err, servicedRow) => {
                                    if (err || !servicedRow) {
                                        console.error('Serviced ID lookup error:', err ? err.message : 'Record not found after insert.');
                                        errorOccurred = true;
                                        return processNextRecord(index + 1);
                                    }

                                    const serviced_id = servicedRow.serviced_id;

                                    db.run(`
                                        INSERT OR IGNORE INTO servant_serviced_link (servant_user_id, serviced_id)
                                        VALUES (?, ?)
                                    `, [servant_user_id, serviced_id], function(err) {
                                        if (err) {
                                            console.error('Link insertion error:', err.message);
                                            errorOccurred = true;
                                            return processNextRecord(index + 1);
                                        }
                                        if (this.changes > 0) {
                                            linkCount++;
                                        }
                                        processNextRecord(index + 1);
                                    });
                                });
                            });
                        });
                    };

                    if (!f_id) {
                        db.run("INSERT INTO families (family_name) VALUES (?)", [normalizedFamilyName], function(err) {
                            if (err) {
                                console.error('Family insertion error:', err.message);
                                errorOccurred = true;
                                return processNextRecord(index + 1);
                            }
                            f_id = this.lastID;
                            afterFamilyLookup(f_id);
                        });
                    } else {
                        afterFamilyLookup(f_id);
                    }
                });
            }

            processNextRecord(0);
        });
    };

    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const cleanedData = data.map(row => {
            const newRow = {};
            for (const key in row) {
                newRow[key.toString().trim().toLowerCase()] = row[key];
            }
            return newRow;
        });

        records.push(...cleanedData);
        processServicedRecords();

    } catch (e) {
        try { fs.unlinkSync(filePath); } catch (e) {}
        console.error('File reading error:', e.message);
        return res.status(500).json({ success: false, message: 'خطأ في قراءة الملف: تأكد من أن الملف ليس مفتوحاً وصيغته سليمة.' });
    }
});



// server.js - إضافة مسار جديد لتقرير الأداء الشهري

// دالة مساعدة لحساب عدد المخدومين لكل خادم
async function getServicedCountForServant(user_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(DISTINCT s.serviced_id) AS count
       FROM serviced s
       JOIN servant_serviced_link l ON s.serviced_id = l.serviced_id
       WHERE l.servant_user_id = ?`,
      [user_id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.count : 0);
      }
    );
  });
}


// دالة مساعدة لحساب عدد الجلسات المتوقع (12 جمعة في 3 أشهر)
function getExpectedSessionsCount() {
    // 🚨 ملاحظة: يجب تعديل هذه القيمة بناءً على الفترة الفعلية
    // (سنفترض 12 جمعة كمتوسط لتبسيط الحساب لـ 3 أشهر)
    return 12; 
}


// ------------------------------------------------------------------
// API لتقرير أداء الخدام (3 أشهر)
// ------------------------------------------------------------------
app.get('/api/reports/servant-performance', async (req, res) => {
    const familyId = req.query.family_id; 
    
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString().split('T')[0]; // تاريخ البداية
    
    const maxSessions = getExpectedSessionsCount(); 

    // 1. جلب الخدام المراد عمل تقرير لهم
    let userSql = `SELECT u.user_id, u.username, f.family_name 
                   FROM users u
                   LEFT JOIN families f ON u.family_id = f.family_id
                   WHERE u.role_group = 'Khadem' OR u.role_group = 'AmeenSekra'`; // يمكن تضمين الأمناء كخدام إذا كانوا يخدمون
    let userParams = [];
    if (familyId) {
        userSql += ' AND u.family_id = ?';
        userParams.push(familyId);
    }
    
    // 2. البدء في جلب البيانات
    db.all(userSql, userParams, async (err, servants) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات.' });
        }

        const report = [];
        
        // 3. التكرار على كل خادم وحساب النسب
        for (const servant of servants) {
            
            // جلب البيانات المجمعة من جدول الحضور والأداء
            const attendanceSql = `
                SELECT 
                    COUNT(status) AS total_sessions,
                    SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
                    SUM(lesson_prepared) AS lesson_prepared_count,
                    SUM(communion) AS communion_count,
                    SUM(confession) AS confession_count,
                    SUM(visits_count) AS total_visits
                FROM servant_attendance 
                WHERE user_id = ? AND session_date >= ?
            `;

            const data = await new Promise((resolve, reject) => {
                db.get(attendanceSql, [servant.user_id, startDate], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
            
            const denominator = maxSessions > 0 ? maxSessions : 1; 
            
            // 4.1. حساب نسب الحضور والأداء الأخرى
            const present_pct = ((data.present_count || 0) / denominator) * 100;
            const lesson_pct = ((data.lesson_prepared_count || 0) / denominator) * 100;
            const communion_pct = ((data.communion_count || 0) / denominator) * 100;
            const confession_pct = ((data.confession_count || 0) / denominator) * 100;

            // 4.2. حساب نسبة الإفتقاد (الأكثر تعقيداً)
            const servicedCount = await getServicedCountForServant(servant.user_id);
            let visits_pct = 0;
            if (servicedCount > 0 && maxSessions > 0) {
                // (مجموع عدد المخدومين اللي نزل لهم خلال 3 شهور ÷ (عدد مخدوميه × عدد جمع الـ 3 شهور )) × 100
                visits_pct = ((data.total_visits || 0) / (servicedCount * maxSessions)) * 100;
            }
            
            report.push({
                username: servant.username,
                family_name: servant.family_name || 'غير مسؤول',
                // النسب المئوية مع التقريب
                present_pct: present_pct.toFixed(1), 
                lesson_pct: lesson_pct.toFixed(1),
                communion_pct: communion_pct.toFixed(1),
                confession_pct: confession_pct.toFixed(1),
                visits_pct: visits_pct.toFixed(1),
            });
        }

        res.json({ success: true, report: report });
    });
});
// ==========================
// 1. تسجيل الغياب الشهري للخدام
// ==========================
// دالة لحساب عدد الجمع في شهر معين
function getFridaysCount(year, month) {
  let count = 0;
  const date = new Date(year, month - 1, 1); // الشهر يبدأ من 0 في JS
  while (date.getMonth() === month - 1) {
    if (date.getDay() === 5) { // الجمعة = 5
      count++;
    }
    date.setDate(date.getDate() + 1);
  }
  return count;
}

// ✅ حفظ السجل الشهري مع UPSERT
app.post('/api/monthly-attendance', async (req, res) => {
  const { date, family_id, records } = req.body;

  if (!date || !family_id || !Array.isArray(records)) {
    return res.json({ success: false, message: 'بيانات ناقصة: لازم تاريخ وأسرة وسجلات' });
  }

  try {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        INSERT INTO monthly_attendance 
        (user_id, family_id, date, meeting, lesson, communion, confession, total_serviced, visited_serviced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, family_id, date) DO UPDATE SET
            meeting = excluded.meeting,
            lesson = excluded.lesson,
            communion = excluded.communion,
            confession = excluded.confession,
            total_serviced = excluded.total_serviced,
            visited_serviced = excluded.visited_serviced
      `);

      let index = 0;

      function upsertNext() {
        if (index >= records.length) {
          stmt.finalize(err => {
            if (err) {
              console.error('Finalize error:', err);
              db.run('ROLLBACK');
              return res.json({ success: false, message: '❌ فشل الحفظ: خطأ أثناء حفظ السجلات' });
            }
            db.run('COMMIT');
            res.json({ success: true, message: '✅ تم الحفظ بنجاح' });
          });
          return;
        }

        const r = records[index++];
        stmt.run(
          r.user_id,
          family_id,
          date,
          r.meeting ? 1 : 0,
          r.lesson ? 1 : 0,
          r.communion ? 1 : 0,
          r.confession ? 1 : 0,
          r.total_serviced ?? 0,
          r.visited_serviced ?? 0,
          (err) => {
            if (err) {
              console.error('Upsert error:', err);
              db.run('ROLLBACK');
              return res.json({ success: false, message: '❌ قاعدة البيانات مشغولة، لم يتم الحفظ' });
            }
            upsertNext();
          }
        );
      }

      upsertNext();
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: '❌ خطأ في السيرفر أثناء الحفظ' });
  }
});

// ✅ تقرير شهري
// ✅ تقرير شهري مع سنة أوتوماتيك + serviced_count ثابت
// ✅ تقرير شهري مع حساب serviced_count من جدول serviced
app.get('/api/monthly-reports', async (req, res) => {
  try {
    const { month, family_id } = req.query;
    const monthStr = (month || '').padStart(2, '0');

    // تحديد السنة أوتوماتيك
    const yearStr = ['10','11','12'].includes(monthStr) ? '2025' : '2026';

    let sql = `
      SELECT 
        u.user_id,
        u.username,
        SUM(m.meeting) AS meeting_sum,
        SUM(m.lesson) AS lesson_sum,
        SUM(m.communion) AS communion_sum,
        SUM(m.confession) AS confession_sum,
        SUM(m.visited_serviced) AS visited_sum
      FROM monthly_attendance m
      JOIN users u ON u.user_id = m.user_id
      WHERE strftime('%m', m.date) = ?
        AND strftime('%Y', m.date) = ?
    `;
    let params = [monthStr, yearStr];

    if (family_id) {
      sql += ' AND m.family_id = ?';
      params.push(family_id);
    }

    sql += ' GROUP BY m.user_id';

    db.all(sql, params, async (err, rows) => {
      if (err) {
        console.error(err);
        return res.json({ success: false, message: 'خطأ في جلب التقرير' });
      }

      if (!rows || rows.length === 0) {
        return res.json({ success: true, report: [] });
      }

      const fridays = getFridaysCount(parseInt(yearStr), parseInt(monthStr));

      // ✅ هنا بنستخدم الدالة getServicedCountForServant لكل خادم
      const report = await Promise.all(rows.map(async r => {
        const servantTotal = await getServicedCountForServant(r.user_id);

        return {
          username: r.username,
          meeting_pct: fridays > 0 ? ((r.meeting_sum || 0) / fridays * 100).toFixed(1) + '%' : '0%',
          lesson_pct: fridays > 0 ? ((r.lesson_sum || 0) / fridays * 100).toFixed(1) + '%' : '0%',
          communion_pct: fridays > 0 ? ((r.communion_sum || 0) / fridays * 100).toFixed(1) + '%' : '0%',
          confession_pct: fridays > 0 ? ((r.confession_sum || 0) / fridays * 100).toFixed(1) + '%' : '0%',
          visits_pct: (servantTotal > 0 && fridays > 0)
            ? ((r.visited_sum || 0) / (servantTotal * fridays) * 100).toFixed(1) + '%'
            : '0%'
        };
      }));

      res.json({ success: true, report });
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'خطأ أثناء تحميل التقرير' });
  }
});







// ✅ تقرير ربع سنوي
app.get('/api/monthly-reports/quarter', (req, res) => {
  const { family_id, quarter } = req.query;

  let months = [];
  let year = null;

  if (quarter === 'Q1') { months = ['10','11','12']; year = 2025; }
  else if (quarter === 'Q2') { months = ['01','02','03']; year = 2026; }
  else if (quarter === 'Q3') { months = ['04','05','06']; year = 2026; }
  else if (quarter === 'Q4') { months = ['07','08','09']; year = 2026; }
  else {
    return res.json({ success: false, message: '❌ لازم تختاري ربع سنوي صحيح (Q1–Q4)' });
  }

  let sql = `
    SELECT 
      u.user_id,
      u.username,
      SUM(m.meeting) AS meeting_sum,
      SUM(m.lesson) AS lesson_sum,
      SUM(m.communion) AS communion_sum,
      SUM(m.confession) AS confession_sum,
      SUM(m.visited_serviced) AS visited_sum,
      SUM(m.total_serviced) AS total_sum
    FROM users u
    LEFT JOIN monthly_attendance m 
      ON u.user_id = m.user_id
      AND strftime('%m', m.date) IN (${months.map(() => '?').join(',')})
      AND strftime('%Y', m.date) = ?
  `;

  let params = [...months, year.toString()];
  if (family_id) {
    sql += ' WHERE u.family_id = ?';
    params.push(family_id);
  }

  sql += ' GROUP BY u.user_id';

  db.all(sql, params, async (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: 'خطأ في الحساب' });
    }

    let totalFridays = 0;
    months.forEach(m => {
      totalFridays += getFridaysCount(year, parseInt(m));
    });

    const report = await Promise.all(rows.map(async r => {
      const servantTotal = await getServicedCountForServant(r.user_id);

      return {
        username: r.username,
        meeting_pct: totalFridays > 0 ? ((r.meeting_sum || 0) / totalFridays * 100).toFixed(1) + '%' : '0%',
        lesson_pct: totalFridays > 0 ? ((r.lesson_sum || 0) / totalFridays * 100).toFixed(1) + '%' : '0%',
        communion_pct: totalFridays > 0 ? ((r.communion_sum || 0) / totalFridays * 100).toFixed(1) + '%' : '0%',
        confession_pct: totalFridays > 0 ? ((r.confession_sum || 0) / totalFridays * 100).toFixed(1) + '%' : '0%',
        visits_pct: (servantTotal > 0 && totalFridays > 0)
          ? ((r.visited_sum || 0) / (servantTotal * totalFridays) * 100).toFixed(1) + '%'
          : '0%'
      };
    }));

    res.json({ success: true, report });
  });
});






// ------------------------------------------
// دالة حساب النسبة الشهرية/الربع سنوية
// ------------------------------------------





app.get('/api/servants-with-serviced-count', (req, res) => {
  const sql = `
    SELECT 
      u.user_id,
      u.username,
      COUNT(link.serviced_id) AS serviced_count
    FROM users u
    LEFT JOIN servant_serviced_link link ON u.user_id = link.servant_user_id
    GROUP BY u.user_id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: 'خطأ في جلب عدد المخدومين' });
    }
    res.json({ success: true, users: rows });
  });
});
// استرجاع سجلات حضور/غياب قديمة
// استرجاع سجلات حضور/غياب قديمة
app.get('/api/attendance', (req, res) => {
  const { date, family_id } = req.query;
  if (!date || !family_id) {
    return res.json({ success: false, message: 'لازم تختاري تاريخ وأسرة' });
  }

  const sqlRecords = `
    SELECT user_id, family_id, session_date, status, absence_reason, apologized
    FROM servant_attendance
    WHERE session_date = ? AND family_id = ?
  `;

  const sqlSummary = `
    SELECT attendees_count, recorded_by_user_id
    FROM family_attendance_summary
    WHERE session_date = ? AND family_id = ?
    LIMIT 1
  `;

  db.serialize(() => {
    db.all(sqlRecords, [date, family_id], (err, rows) => {
      if (err) {
        console.error('خطأ في جلب سجلات الخدام:', err.message);
        return res.json({ success: false, message: 'خطأ في قاعدة البيانات' });
      }

      db.get(sqlSummary, [date, family_id], (sumErr, summaryRow) => {
        if (sumErr) {
          console.error('خطأ في جلب الملخص:', sumErr.message);
          return res.json({ success: false, message: 'خطأ في قاعدة البيانات' });
        }

        res.json({
          success: true,
          records: rows || [],
          summary: summaryRow || null
        });
      });
    });
  });
});


// GET monthly attendance records for a given date and family
app.get('/api/monthly-attendance', (req, res) => {
  const { date, family_id } = req.query;

  if (!date || !family_id) {
    return res.status(400).json({ success: false, message: 'لازم تبعتي date و family_id' });
  }

  const sql = `
    SELECT ma.user_id, u.username, ma.family_id, ma.date,
           ma.meeting, ma.lesson, ma.communion, ma.confession,
           ma.total_serviced, ma.visited_serviced
    FROM monthly_attendance ma
    JOIN users u ON u.user_id = ma.user_id
    WHERE ma.date = ? AND ma.family_id = ?
    ORDER BY u.username ASC
  `;

  db.all(sql, [date, family_id], (err, rows) => {
    if (err) {
      console.error('خطأ في جلب السجل الشهري:', err.message);
      return res.status(500).json({ success: false, message: 'فشل في جلب السجل الشهري.' });
    }
    res.json({ success: true, records: rows });
  });
});


// ----------------------------------------------------
// 3. توجيه المسار الرئيسي (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 4. تشغيل الخادم
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ: http://localhost:${PORT}`);
});