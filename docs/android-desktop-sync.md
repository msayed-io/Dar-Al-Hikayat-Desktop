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

كان أول فحص على Android `dd11122` قديمًا. بعد تحديث clone القراءة إلى `origin/main` ظهر الإصدار الحقيقي `53999ab`، وفيه سلسلة تحديثات كبيرة للكتابة اليدوية:

- Portal مستقل للوحة الكتابة اليدوية.
- إصلاح إنشاء وحجم Canvas عند الفتح.
- التقاط كامل لمسار Pointer/Touch حتى أثناء الحركة السريعة.
- ممحاة جزئية تقطع الجزء الملامس فقط بدل حذف الخط كاملًا.
- تحسينات redraw و`requestAnimationFrame`.
- خلفيات وشريط أدوات مستقلان لوضع الكتابة.
- اختبارات للممحاة وحجم Canvas.

تم نقل هذه الملفات النقية إلى Desktop فقط، مع إبقاء Remote Keyboard وTauri وتخزين Windows خارج النسخ العميان. تم التحقق من البناء والاختبارات بعد النقل.

لم يتم تعديل Android. أما الملفات التي تجمع بين منطق المحرر ومنصة Android فتظل مصنفة للمراجعة والـport اليدوي.
