# نتائج البحث وخطة تنفيذ Dar-Al-Hikayat Desktop

تاريخ التنفيذ: 2026-09-30

## نتائج البحث الرسمي

- أحدث إصدار ظاهر في صفحة إصدارات Tauri الرسمية هو `tauri` و`tauri-cli` و`@tauri-apps/api` بإصدار `2.12.0` بتاريخ 2026-09-26. صفحة الإصدارات: https://v2.tauri.app/release/
- متطلبات Windows الرسمية هي Microsoft C++ Build Tools مع خيار Desktop development with C++، وMicrosoft Edge WebView2، وRust. WebView2 موجود عادةً على Windows 10 1803 وما بعده، ويشمل Windows 11. متطلب VBScript يخص حزم MSI تحديدًا. المصدر: https://v2.tauri.app/start/prerequisites/
- تكامل Vite الرسمي يعتمد `frontendDist: "../dist"`، و`devUrl: "http://localhost:5173"`، وhooks لتشغيل `npm run dev` و`npm run build`. يجب تثبيت منفذ Vite وتجاهل `src-tauri` في watcher. المصدر: https://v2.tauri.app/start/frontend/vite/
- Tauri v2 يربط الواجهة بـ Rust عبر commands مسجلة في `invoke_handler` واستدعاء `invoke` من `@tauri-apps/api/core`. المصدر: https://v2.tauri.app/develop/calling-rust/
- الصلاحيات تُمنح عبر capability files داخل `src-tauri/capabilities`، والحدود مرتبطة بتسمية النافذة لا بعنوانها. يجب عدم توسيع الصلاحيات بلا حاجة. المصدر: https://v2.tauri.app/security/capabilities/
- إضافة fs تمنع الأوامر الخطرة والنطاقات افتراضيًا. إذن fs وحده لا يكفي؛ يلزم scope صريح للمسارات، وdeny يتغلب على allow. المصدر: https://v2.tauri.app/plugin/file-system/
- إعدادات `tauri.conf.json` تتضمن `app.windows` للعرض والحجم وقابلية تغيير الحجم، و`build` لمجلد dist وخادم التطوير. المصدر: https://v2.tauri.app/reference/config/
- أداة الإنشاء الرسمية تدعم إضافة Tauri إلى مشروع frontend موجود عبر `npx tauri init`، كما تدعم React وTypeScript. المصدر: https://v2.tauri.app/start/create-project/

## قرار التنفيذ

1. استنساخ `https://github.com/msayed-io/Dar-Al-Hikayat` مرة واحدة فقط إلى مسار عمل معزول للقراءة والاستخراج.
2. فحص package/lockfile والبنية والمراجع Android/Capacitor والميزات الخاصة بالتطبيق.
3. إنشاء مستودع GitHub خاص مستقل باسم `Dar-Al-Hikayat-Desktop` إن لم يكن موجودًا، ثم إنشاء نسخة عمل مستقلة منه.
4. نسخ كود الويب فقط، حذف Android وCapacitor ومراجع Java/Android، ثم تثبيت Tauri v2 بإصدارات محددة متوافقة مع أحدث إصدار موثق.
5. إعداد `src-tauri/tauri.conf.json` وcapabilities ضيقة للملفات، وإضافة Rust entrypoint دون منح shell أو صلاحيات واسعة غير مطلوبة.
6. تشغيل `npm install`/الفحص، `npx tsc --noEmit`، `npm run build`، ثم محاولة `npx tauri build` إن توفرت toolchain Rust المحلية. سيُذكر بوضوح إن تعذر Windows-native build داخل Linux.
7. التحقق النهائي من عدم وجود `android/` أو `capacitor.config.json` أو تبعيات Capacitor أو ملفات Android/Java، ثم رفع النسخة فقط إلى المستودع الجديد الخاص.

## قيود مهمة

- لن يُنفذ أي push أو تعديل على المستودع الأصلي.
- لا يمكن إنتاج Windows `.exe` فعليًا من بيئة Linux إلا عبر Windows/CI مناسب؛ يمكن التحقق من إعداد المشروع والبناء المحلي المتاح، مع توثيق أي قيد.
- شرط بادئات الهاتف `012` سيُراجع في الخدمات/النصوص إن وُجدت أرقام اتصال أو بادئات فعلية؛ لن تُخترع أرقام غير موجودة.
