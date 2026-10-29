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

## آخر تحديث: شاشة «ورقة ورقة» (لازم SQL)
1. شغّل `supabase/pricing_setup.sql` مرة تانية بـ SQL Editor (بيخلي رقم إذن التسليم اختياري).
2. انسخ: `src/PricingRegister.jsx` و `src/PricingPage.jsx` و `src/pricing.css` و `src/lib/pricing.js`.
3. `git add .` ثم `git commit -m "Paper by paper entry"` ثم `git push`.

طريقة الشغل: «+ ورقة جديدة» ← اسم العميل ← رقم الإذن (أو فاضي) ← رقم الفاتورة ← صوّر ← حفظ. الشاشة بتفضى للورقة الجاية والصور بترفع بالخلفية.

## تحديث: تنبيهات التكرار (بدون SQL)
- انسخ: `src/PricingRegister.jsx` و `src/PricingPage.jsx` و `src/pricing.css`.
- رقم إذن موجود قبل: مربع أصفر (أو أحمر إذا بنفس الفاتورة) مع مكانه.
- فاتورة مأرشفة: مربع أحمر.
- بالعرض: إذن مكرر بنفس الفاتورة عليه تنبيه أحمر وزر «حذف الصورة» على كل صورة.

## تحديث: تعديل كامل للصورة (بدون SQL)
- انسخ: `src/PricingRegister.jsx` و `src/PricingPage.jsx` و `src/pricing.css` و `src/lib/pricing.js`.
- افتح الصورة ← «تعديل» ← غيّر الحساب أو رقم الفاتورة أو رقم الإذن ← «حفظ التعديل».
- إذا الحساب أو الفاتورة جديدة بينحفظوا تلقائيًا والصورة بتنتقل إلهم.
