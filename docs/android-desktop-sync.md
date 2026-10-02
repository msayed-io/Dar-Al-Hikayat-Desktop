# Android → Desktop Sync Policy

## الهدف

يقرأ مستودع Desktop آخر commit من مستودع Android ويحلل التغييرات المشتركة، لكن لا يكتب في مستودع Android ولا ينسخ كود المنصة تلقائيًا إلى Desktop.

## لماذا لا نستخدم مزامنة كاملة عمياء؟

المشروعان ليسا نسختين متطابقتين. Desktop يستخدم Tauri v2 وWindows APIs، بينما Android يستخدم Capacitor/Java/Kotlin ومكونات Android الأصلية. نسخ الملفات التالية مباشرة قد يعيد كود Android إلى Desktop أو يحذف وظائف Windows:

- `App.tsx` و`contexts/AppContext.tsx`
- `lib/prayer-alarms.ts` و`lib/gps-location.ts`
- `lib/storage-service.ts`
- `lib/app-updater.ts` و`lib/gemini-direct-client.ts`
- `components/SettingsPage.tsx` و`components/UpdateDialog.tsx`
- `index.html` و`package.json` و`vite.config.ts`
- كل ما تحت `src-tauri/`

## طريقة التشغيل

1. افتح GitHub Actions في مستودع `Dar-Al-Hikayat-Desktop`.
2. شغّل Workflow: **Review Android changes for Desktop**.
3. أدخل branch أو tag أو commit من Android، مثل `main` أو `dd11122`.
4. اترك `create_pr=false` للمراجعة فقط. التقرير يحدد الملفات الحساسة التي تحتاج port يدوي.
5. استخدم `create_pr=true` فقط عندما توجد تغييرات في allowlist المشتركة؛ سيُنشأ PR داخل Desktop فقط.

المصدر Android يتم checkout له في مجلد مؤقت للقراءة، ولا توجد في Workflow أي خطوة `push` أو `commit` إلى مستودع Android.

## النتيجة الحالية

عند فحص Android `dd11122` مقابل Desktop `46d1502`:

- لم يتم تعديل Android.
- لا توجد تغييرات آمنة في allowlist تحتاج نسخًا آليًا.
- توجد تغييرات في ملفات Desktop الحساسة، ولذلك تم تصنيفها للمراجعة والـport اليدوي بدل النسخ العميان.
- التغييرات المشتركة مثل التصميم العام يتم نقلها فقط إذا اجتازت فحص عدم وجود imports أو markers خاصة بـAndroid/Capacitor/Tauri.
