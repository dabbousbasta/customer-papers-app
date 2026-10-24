# تركيب صفحة مراجعة أذونات التسليم للتسعير

## 1) Supabase (مرة وحدة)
1. افتح مشروعك على Supabase ← SQL Editor ← New query.
2. الصق محتوى الملف `supabase/pricing_setup.sql` واضغط Run.
3. إذا شغّلته قبل، شغّله مرة ثانية؛ آمن ومنزيد عليه صلاحية حذف فاتورة أو حساب فاضي.
4. هذا الملف يضيف جداول جديدة وحاوية صور جديدة اسمها `pricing-images` فقط، وما بيلمس جداول وصور الأوراق القديمة.

## 2) الملفات
انسخ الملفات لمجلد المشروع `customer-papers-app` بنفس الأماكن:

| الملف | نوعه |
|---|---|
| `src/App.jsx` | استبدال (تعديل الروابط فقط) |
| `src/PricingPage.jsx` | جديد |
| `src/PricingRegister.jsx` | جديد (تسجيل الحسابات والفواتير) |
| `src/pricing.css` | جديد |
| `src/lib/pricing.js` | جديد |
| `src/lib/searchText.js` | جديد |
| `src/lib/supabase.js` | استبدال (إعادة محاولة تلقائية لخطأ JWT issued at future) |
| `supabase/pricing_setup.sql` | جديد (للحفظ) |

## 3) التجربة والنشر (PowerShell)
```powershell
cd customer-papers-app
npm run dev
```
جرّب على الكمبيوتر، وبعدين:
```powershell
git add .
git commit -m "Add delivery notes pricing review home page"
git push
```
GitHub بينشر الموقع تلقائيًا بعد دقيقتين تقريبًا.

## العناوين
- الصفحة الرئيسية الجديدة: `#/`
- صفحات الأوراق القديمة: `#/papers` (زر «الأوراق» بزاوية الشاشة)

## آخر تحديث: صور مع التسجيل
- بشاشة «+ حساب وفواتير» صار في قسم «صور أذونات التسليم (اختياري)».
- اكتب الحساب ورقم الفاتورة ورقم الإذن، صوّر أو اختار صور، واضغط «حفظ» مرة وحدة.
- إذا كتبت أكتر من فاتورة، اختار «للفاتورة» قبل الصور.
- لحساب موجود: اضغط على فاتورة من «الفواتير المسجلة» لتضيف إلها صور.
- الملفات المتغيرة: `src/PricingRegister.jsx` و `src/PricingPage.jsx` و `src/pricing.css`. ما في SQL جديد.
