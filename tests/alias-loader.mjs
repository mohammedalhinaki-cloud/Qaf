/**
 * خطّاف تحميل ESM بسيط يترجم مسارات الاستيراد `@/...` إلى ملفات `src/....ts`،
 * تمامًا كما يفعل مُحلّل المسارات في tsconfig.json أثناء البناء بـ Next.js.
 * يلزم فقط لتشغيل اختبارات Node (`node --experimental-strip-types --test`)
 * التي تستورد وحدات تستعمل اسم المستعار `@/` في استيراد قيمي (لا نوعي).
 *
 * يُسجَّل الخطّاف فعليًا عبر `module.register` (الطريقة الحديثة)، لا عبر
 * تصدير `resolve`/`load` مباشرة من ملف `--import` (لا يُفعَّل تلقائيًا).
 */
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
