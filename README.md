# دار الحكايات — Dar Al-Hikayat Desktop

نسخة سطح مكتب أصلية مبنية على React 19 + TypeScript + Vite 6 داخل Tauri v2، مع إزالة طبقة الهاتف بالكامل.

## التشغيل

```bash
npm install
npm run dev
npx tauri dev
```

## الفحص والبناء

```bash
npx tsc --noEmit
npm run build
npx tauri build
```

يحتفظ التطبيق بميزات المكتبة والمحرر والثيمات الثلاثة ومحرك `dar_notes` ومواقيت الصلاة والتصدير إلى PDF وWord. الموقع الجغرافي يستخدم Web Geolocation، والتصدير يستخدم تنزيل المتصفح داخل WebView.

## الأمان

توجد صلاحيات Tauri الضيقة في `src-tauri/capabilities/default.json`. لا يُمنح التطبيق وصولًا عامًا إلى نظام الملفات؛ تنزيلات PDF وDOCX تتم عبر آلية تنزيل الويب المعتادة.
