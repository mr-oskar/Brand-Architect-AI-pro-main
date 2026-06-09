# 🤖 AGENTS.md — تعليمات للوكلاء البرمجيين

> هذا الملف يوجّه أي وكيل ذكاء اصطناعي (Replit Agent, Claude, Cursor, Aider, Copilot Workspace, …) يعمل على هذا المشروع. اقرأه **قبل** أي تعديل.

---

## 1) قواعد الذهب (Golden Rules)

1. **اقرأ `replit.md` و `DOCUMENTATION.md` أولاً.** هما المرجع المعتمد.
2. **لا تكسر `pnpm-workspace.yaml`.** المشروع monorepo — كل تبعية تُضاف عبر `pnpm --filter <package> add ...`.
3. **لا تعدّل الملفات المحظورة:**
   - `.replit`
   - `.replit_integration_files/**`
   - `node_modules/**`, `pnpm-lock.yaml` (إلا عبر `pnpm install`)
4. **لا تكتب أي مفتاح/توكن في الكود مطلقاً** — كل الأسرار عبر `process.env`.
5. **لا تستخدم `localhost`** في كود التطبيق — استخدم URLs نسبية.
6. **حافظ على RTL/LTR.** الواجهة تدعم العربية والإنجليزية معاً.
7. **رسائل خطأ المستخدم بالإنجليزية فقط** (تفضيل صاحب المنتج). استخدم `notifyError`/`notifySuccess` من `artifacts/brand-os/src/lib/apiError.ts`.

---

## 2) تشغيل المشروع للتحقق

```bash
# Backend (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (port 5173)
pnpm --filter @workspace/brand-os run dev

# Type check (إلزامي قبل أي PR)
pnpm run typecheck

# Build production
pnpm run build
```

في بيئة Replit:
- استخدم `restart_workflow` بدلاً من القتل اليدوي.
- لا تشغّل أكثر من API workflow واحد على نفس المنفذ.

---

## 3) أين تكتب ماذا (Where to Put What)

| النوع | الموقع |
|---|---|
| Endpoint جديد | `artifacts/api-server/src/routes/<resource>.ts` |
| Middleware | `artifacts/api-server/src/middlewares/` |
| منطق أعمال backend | `artifacts/api-server/src/lib/` |
| جدول DB جديد | `lib/db/src/schema/<name>.ts` + export في `index.ts` |
| Zod schema مشترك | `lib/api-zod/src/` |
| React Query hook | `lib/api-client-react/src/` |
| صفحة جديدة | `artifacts/brand-os/src/pages/<Page>.tsx` + Route في `App.tsx` |
| مكون UI قابل لإعادة الاستخدام | `artifacts/brand-os/src/components/ui/` (shadcn) |
| Helper أمامي | `artifacts/brand-os/src/lib/` |

---

## 4) معايير الكود

### TypeScript
- `strict: true` مفعّل — لا تستخدم `any` بدون سبب موثَّق.
- استخدم `import type` للأنواع فقط.
- ESM only — كل الـ imports `.js` extension في النسخة المبنية.

### React
- React 19. استخدم `use()` hook للـ Suspense عند الحاجة.
- TanStack Query لكل I/O — لا تستخدم `useEffect` لجلب البيانات.
- مفتاح الكويري ثابت ومنطقي: `["brands", brandId, "campaigns"]`.

### Express
- كل route handler يُلَفّ بـ `asyncHandler(...)`.
- Validation عبر `validateBody` / `validateParams` / `validateQuery`.
- لا تكتب `try/catch` يدوي — استخدم middleware الأخطاء العام.

### Tailwind v4
- الكلاسات الذرية فقط. لا CSS مخصص إلا للضرورة.
- استخدم `cn()` من `lib/utils.ts` لدمج الكلاسات.

---

## 5) سير العمل المثالي لإضافة ميزة

> مثال: "أضف ميزة 'حذف منشور بشكل مجمّع'"

1. **خطّط:**
   - Endpoint: `POST /api/posts/bulk-delete` (body: `{ ids: string[] }`).
   - DB: لا تغيير في الـ schema.
   - UI: زر في `CampaignWorkspace` + dialog تأكيد.

2. **Backend:**
   ```ts
   // artifacts/api-server/src/routes/posts.ts
   router.post(
     "/posts/bulk-delete",
     requireAuth,
     validateBody(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) })),
     asyncHandler(async (req, res) => {
       const { ids } = req.body;
       const result = await db.delete(postsTable)
         .where(inArray(postsTable.id, ids))
         .returning({ id: postsTable.id });
       res.json({ deleted: result.length });
     }),
   );
   ```

3. **Schema/Types مشتركة:**
   - أضف الـ Zod schema في `lib/api-zod`.
   - شغّل `pnpm --filter @workspace/api-spec run codegen` إذا تغيّر الـ OpenAPI.

4. **Hook الواجهة:**
   ```ts
   // lib/api-client-react/src/posts.ts
   export const useBulkDeletePosts = () => useMutation({
     mutationFn: (ids: string[]) => api.posts.bulkDelete({ ids }),
     onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
   });
   ```

5. **UI:**
   - `notifySuccess("Posts deleted")` على النجاح.
   - `notifyError(err, "Failed to delete posts")` على الفشل.

6. **Type check:**
   ```bash
   pnpm run typecheck
   ```

7. **Commit:**
   ```
   feat(posts): add bulk delete endpoint and UI action
   ```

---

## 6) أولويات التطوير المستقبلية (مرتبة)

استخدم هذه القائمة لاقتراح المهمة التالية للمستخدم. كل بند موصوف بقيمته للمستخدم وحجم الجهد التقريبي.

### 🟢 أولوية عالية (تحسينات سريعة بأثر كبير)

#### 1. **Streaming AI Responses**
- **القيمة:** المستخدم يرى النص يُكتب لحظياً بدلاً من انتظار 30 ثانية.
- **التطبيق:**
  - Backend: استبدل `chat.completions.create` بـ `stream: true` و `res.write` كل chunk عبر Server-Sent Events (SSE).
  - Frontend: استبدل `fetch` بـ `EventSource` أو `ReadableStream`.
- **الجهد:** متوسط (يومان).
- **الملفات:** `artifacts/api-server/src/lib/ai.ts`, `routes/brands.ts`, الواجهات المعنية.

#### 2. **Skeleton Loaders بدلاً من Spinners**
- **القيمة:** تحسين perceived performance بشكل كبير.
- **التطبيق:** أنشئ مكون `<Skeleton />` (موجود في shadcn) وضعه في كل الصفحات أثناء التحميل.
- **الجهد:** صغير (ساعات).

#### 3. **Toast Stacking + Auto-dismiss ذكي**
- **القيمة:** أخطاء متعددة لا تختفي قبل أن يقرأها المستخدم.
- **التطبيق:** عدّل Toaster ليُكدِّس الإشعارات ويُخفي الناجح بسرعة (3s) ويُبقي الأخطاء أطول (8s).
- **الجهد:** صغير.

#### 4. **Optimistic Updates في Mutations**
- **القيمة:** الواجهة تستجيب فوراً بدون انتظار الخادم.
- **التطبيق:** في كل `useMutation`، أضف `onMutate` يحدّث الكاش، و`onError` يتراجع.
- **الجهد:** متوسط.

#### 5. **حفظ تلقائي (Auto-save) في Brand Wizard و Design Studio**
- **القيمة:** المستخدم لا يفقد عمله أبداً.
- **التطبيق:** `useDebouncedEffect` يستدعي PATCH كل 2 ثانية بعد آخر تغيير.
- **الجهد:** متوسط.

### 🟡 أولوية متوسطة (ميزات احترافية)

#### 6. **i18n كامل (عربي/إنجليزي)**
- استخدم `react-i18next` أو حل خفيف مخصص.
- أنشئ `locales/ar.json` و `en.json`.
- زر تبديل اللغة في الـ Topbar مع حفظ التفضيل.

#### 7. **Drag & Drop في Content Calendar**
- استخدم `@dnd-kit/core` (خفيف وحديث).
- اسحب منشوراً من يوم إلى آخر → يحدّث `scheduledAt`.

#### 8. **Brand Voice Tester (Chat Simulator)**
- صفحة جديدة تحاكي محادثة مع مساعد يتحدث بنبرة العلامة.
- يساعد المستخدم على التحقق من جودة النبرة المُولَّدة.

#### 9. **Advanced Analytics Dashboard**
- رسوم بيانية (recharts) لـ:
  - عدد المنشورات/أسبوع.
  - أكثر المنصات استخداماً.
  - استهلاك AI زمنياً.
  - أكثر الحملات نجاحاً.

#### 10. **Templates Marketplace**
- مكتبة قوالب مصنّفة حسب الصناعة.
- زر "Use this template" يُنشئ تصميماً بناءً عليها.

### 🔵 أولوية استراتيجية (قيمة طويلة المدى)

#### 11. **OAuth حقيقي للمنصات الاجتماعية**
- استبدل الربط اليدوي بتدفق OAuth 2.0 رسمي لكل منصة.
- استخدم Replit Integrations إن توفّرت.

#### 12. **Webhook Engine**
- أرسل أحداث للويب هوكس المسجلة في `webhooks` table.
- أحداث: `post.published`, `campaign.completed`, `usage.limit.reached`.

#### 13. **PWA + Offline Mode**
- `vite-plugin-pwa`.
- يعمل التطبيق بدون إنترنت ويُزامن لاحقاً.

#### 14. **AI Insights Engine**
- تحليل أداء المنشورات السابقة (engagement, reach).
- توصيات مخصصة: "نشر مساءً يحقق نتائج أفضل بـ 30%".

#### 15. **Multi-tenant Workspaces**
- المستخدم يدير عدة فرق/شركات بحساب واحد.
- نظام أدوار (Owner/Editor/Viewer) لكل workspace.

#### 16. **CDN للأصول**
- ادمج CloudFlare R2 أو AWS S3 + CloudFront.
- تسريع تحميل الصور عالمياً.

#### 17. **Subscription Billing عبر Stripe**
- اقرأ skill: `.local/skills/stripe`.
- اربط `subscriptions` table بـ Stripe Subscriptions.

#### 18. **Mobile App عبر Expo**
- اقرأ skill: `.local/skills/expo`.
- إعادة استخدام `lib/api-client-react` كما هو.

---

## 7) معايير تجربة المستخدم (UX Standards)

كل ميزة جديدة يجب أن تحقق:

### ⏱️ Loading States
- ❌ لا تترك الشاشة فارغة أبداً.
- ✅ Skeleton أو Spinner في أول 200ms.
- ✅ Progress feedback إذا تجاوزت العملية 3 ثوانٍ ("Generating image 2 of 5...").

### ⚠️ Error States
- ❌ لا ترمي خطأً عاماً ("Something went wrong").
- ✅ ارمِ خطأً قابلاً للتصرف ("OpenAI rate limit reached. Try again in 1 minute.").
- ✅ زر "Retry" واضح.
- ✅ link لـ docs/support إذا كان الخطأ معقداً.

### 🔄 Empty States
- ❌ لا تعرض جدولاً فارغاً.
- ✅ رسالة + توضيح + CTA: "No campaigns yet. [Create your first campaign]".

### ✅ Success Feedback
- ✅ Toast واضح: "Brand created successfully".
- ✅ تنقل تلقائي للصفحة التالية المنطقية.
- ❌ لا تجعل المستخدم يتساءل "هل نجحت؟".

### 🎯 Affordances
- كل زر له `cursor: pointer` و hover state واضح.
- العمليات المدمرة (Delete) تتطلب تأكيداً (Dialog).
- العمليات الطويلة تعطي تحذيراً قبل البدء.

### ♿ Accessibility
- كل صورة لها `alt`.
- كل زر له `aria-label` إن لم يكن نصه واضحاً.
- التباين اللوني WCAG AA على الأقل.
- التنقل بـ Tab يعمل في كل الصفحات.

### 📱 Responsive
- كل صفحة تعمل من 320px إلى 4K.
- اختبر على mobile قبل اعتبار الميزة مكتملة.

### ⚡ Performance Budget
- LCP < 2.5s.
- CLS < 0.1.
- Bundle size لا يزيد >10% بدون مبرر.

---

## 8) قبل اعتبار أي مهمة مكتملة (Done Checklist)

- [ ] `pnpm run typecheck` يمر.
- [ ] الميزة مختبرة يدوياً في الواجهة.
- [ ] حالات Loading + Error + Empty مغطاة.
- [ ] الإشعارات (Toast) موجودة بالإنجليزية.
- [ ] لا توجد console.log/console.error دخيلة.
- [ ] لا توجد أسرار في الكود.
- [ ] `replit.md` محدّث إذا تغيّرت البنية.
- [ ] رسالة Commit واضحة بصيغة Conventional Commits.

---

## 9) Conventional Commits

```
feat(brands): add bulk delete endpoint
fix(designs): logo not appearing on new pages
refactor(api): extract ai provider selection logic
docs(deployment): add Render setup instructions
chore(deps): bump drizzle-orm to 0.46
perf(frontend): lazy-load admin tabs
```

---

## 10) موارد مرجعية

- **Drizzle ORM:** https://orm.drizzle.team
- **TanStack Query:** https://tanstack.com/query
- **TailwindCSS v4:** https://tailwindcss.com/docs/v4
- **shadcn/ui:** https://ui.shadcn.com
- **Fabric.js v7:** http://fabricjs.com
- **wouter:** https://github.com/molefrog/wouter
- **Clerk Express:** https://clerk.com/docs/quickstarts/express

---

> **التزم بهذا الملف وستحافظ على جودة المشروع ومرونته.**  
> أي وكيل يخالف هذه التعليمات يُحدث ضرراً تقنياً (technical debt) ويُربك المستخدم.
