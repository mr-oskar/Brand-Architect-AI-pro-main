# 📘 Brand Architect AI Pro — التوثيق الكامل

> منصة احترافية مدعومة بالذكاء الاصطناعي لبناء الهويات التجارية، توليد المحتوى، تصميم البوستات، إدارة الحملات التسويقية، والنشر التلقائي على وسائل التواصل الاجتماعي.

---

## 📑 الفهرس

1. [نظرة عامة](#1-نظرة-عامة)
2. [الميزات الرئيسية](#2-الميزات-الرئيسية)
3. [التقنيات المستخدمة (Tech Stack)](#3-التقنيات-المستخدمة-tech-stack)
4. [هيكلية المشروع](#4-هيكلية-المشروع)
5. [قاعدة البيانات (Schema)](#5-قاعدة-البيانات-schema)
6. [الواجهة الأمامية — صفحات وميزات](#6-الواجهة-الأمامية--صفحات-وميزات)
7. [الواجهة الخلفية — REST API](#7-الواجهة-الخلفية--rest-api)
8. [الذكاء الاصطناعي (AI Pipeline)](#8-الذكاء-الاصطناعي-ai-pipeline)
9. [الأمان (Security)](#9-الأمان-security)
10. [التشغيل المحلي على Replit](#10-التشغيل-المحلي-على-replit)
11. [التشغيل والنشر خارج Replit](#11-التشغيل-والنشر-خارج-replit)
12. [متغيرات البيئة (Environment Variables)](#12-متغيرات-البيئة-environment-variables)
13. [العمليات الإدارية الشائعة](#13-العمليات-الإدارية-الشائعة)
14. [استكشاف الأعطال](#14-استكشاف-الأعطال)
15. [خارطة الطريق المستقبلية](#15-خارطة-الطريق-المستقبلية)

---

## 1) نظرة عامة

**Brand Architect AI Pro** عبارة عن SaaS متكامل يخدم رواد الأعمال، الشركات الناشئة، ومحترفي التسويق. يعتمد على نموذجين رئيسيين من الذكاء الاصطناعي:

- **OpenAI** (GPT-4o + GPT-Image-1) — للنصوص والصور.
- **Google Gemini** (Gemini 2.5 Flash + Imagen) — كبديل أو fallback.

يعمل المشروع كنظام **monorepo** مكوّن من خدمتين منفصلتين تتشاركان مكتبات مشتركة، ويُدار عبر `pnpm workspaces`.

**الفائدة العملية للمستخدم:**

| المشكلة التقليدية | الحل في المنصة |
|---|---|
| إنشاء هوية تجارية يستغرق أسابيع وتكاليف | معالج هوية ذكي خلال دقائق |
| تصميم بوستات يحتاج مصمم محترف | استوديو تصميم Canvas ذكي مدعوم بالـ AI |
| إدارة محتوى متعدد المنصات | تقويم محتوى موحّد مع جدولة آلية |
| تكلفة أدوات التسويق المنفصلة | منصة واحدة تستبدل 5-7 أدوات |

---

## 2) الميزات الرئيسية

### 🎨 2.1 منشئ الهوية التجارية الذكي (Brand Wizard)
- معالج تفاعلي متعدد الخطوات لتجميع مدخلات المستخدم: اسم العلامة، الجمهور، نبرة الصوت، الصناعة، اللغة.
- توليد فوري لـ:
  - شعار احترافي (Logo) مع متغيرات لونية وأبعاد.
  - لوحة ألوان (Color Palette) متناسقة.
  - نظام طباعة (Typography) مع زوج خطوط رئيسي وثانوي.
  - نبرة صوت (Brand Voice) بصياغة قابلة للتطبيق.
  - قصة العلامة (Brand Story).

### 📐 2.2 استوديو التصميم (Brand Design Studio)
- محرر بصري شامل يعتمد على **Fabric.js v7** لتحرير العناصر بحرية.
- توليد تخطيطات (Layouts) ذكية تُطبَّق هوية العلامة تلقائياً.
- توليد صور خلفية مدمجة في التصميم عبر AI.
- إضافة شعار العلامة تلقائياً (`ensureLogo`) في كل تصميم جديد.
- إنشاء صفحات متعددة في وثيقة واحدة (`new-page` endpoint).
- تحرير ذكي بالـ AI (`ai-edit`): تعديل عنصر محدد بأمر نصي.
- تحليل صورة مرفوعة (`analyze-image`) واستخلاص الأنماط منها.
- التوليد الذكي الشامل (`smart-generate`): توليد مجموعة كاملة من التصاميم من فكرة واحدة.

### 📚 2.3 Brand Book (دليل الهوية)
- توليد دليل هوية كامل (PDF + عرض داخل المنصة) يحوي:
  - الشعار وقواعد استخدامه.
  - نظام الألوان مع أكواد HEX/RGB.
  - الطباعة وهرم الخطوط.
  - نبرة الصوت والكلمات المفتاحية.
  - أمثلة تطبيقية.
- التصدير عبر `jsPDF` على جانب العميل.

### 📣 2.4 ورشة الحملات التسويقية (Campaign Workspace)
- توليد حملة كاملة من فكرة واحدة:
  - استراتيجية الحملة وأهدافها.
  - منشورات لكل منصة (Instagram, X, LinkedIn, Facebook, TikTok).
  - صور احترافية مخصصة لكل منشور.
  - hashtags مقترحة.
- التوليد الفوري (Sync) أو غير المتزامن (`generate-campaign-async` + Job Store + Polling) للحملات الكبيرة.
- توليد جميع الصور بضغطة واحدة (`generate-all-images`).
- إعادة توليد منشور كامل أو متغير منه (variant).

### 🗓️ 2.5 تقويم المحتوى (Content Calendar)
- عرض جميع المنشورات على تقويم بصري.
- جدولة المنشورات على المنصات المرتبطة.
- إعادة جدولة (Reschedule) أو إلغاء (Unschedule).

### 🚀 2.6 النشر على وسائل التواصل (Social Publishing)
- ربط حسابات: Instagram, Facebook, X (Twitter), LinkedIn, TikTok.
- نشر فوري أو مجدول عبر **Scheduler** يعمل في الخلفية.
- منشور `/posts/:id/publish` ومنشور `/campaigns/:id/schedule` للجدولة الجماعية.

### 📊 2.7 لوحة التحليلات (Analytics)
- ملخص أداء العلامة: عدد المنشورات، الحملات، الاستهلاك.
- مقاييس الاستخدام (Usage Events) بالتجزئة.
- جدول الأحداث الزمنية لكل علامة.

### 📦 2.8 مكتبة الأصول والقوالب (Assets & Templates)
- تخزين جميع الأصول المُولَّدة (صور، تصاميم، ملفات).
- مكتبة قوالب جاهزة للاستخدام السريع.

### 🛡️ 2.9 لوحة تحكم Admin متكاملة
- **المستخدمون**: إدارة، تعليق، تعديل صلاحيات.
- **العلامات والحملات والمنشورات**: عرض وحذف على مستوى المنصة.
- **الخطط (Plans)**: إنشاء وتعديل خطط الاشتراك.
- **الاشتراكات (Subscriptions)**: ربط مستخدمين بخطط.
- **الصفحات (Pages)**: إدارة محتوى الصفحات الثابتة (Landing, Terms, Privacy).
- **مفاتيح API (API Keys)**: إنشاء وإلغاء.
- **Webhooks**: تسجيل ويب هوكس خارجية.
- **سجلات التدقيق (Audit Logs)**: تسجيل كل إجراء حساس.
- **المراقبة (Monitoring)**: حالة النظام، الـ workflows، الذاكرة.
- **الاستخدام (Usage)**: قياس استهلاك كل مستخدم لـ AI.
- **الإعدادات العامة (Settings)**: تعديل سلوك المنصة من الواجهة.

### 🔐 2.10 المصادقة (Authentication)
- نظامان مدعومان جنباً إلى جنب:
  - **Clerk** (موصى به للإنتاج) — مع SSO، MFA، Social Login.
  - **JWT/Session مدمج** (للتطوير والاستضافة الذاتية).
- Middleware ذكي (`requireAuth`, `requireAdmin`) يقرر تلقائياً أيهما يعمل.

### 🌐 2.11 دعم اللغة العربية الكامل
- واجهة RTL مدمجة.
- توليد محتوى بالعربية والإنجليزية.
- إشعارات الأخطاء بالإنجليزية فقط (تفضيل المستخدم).

---

## 3) التقنيات المستخدمة (Tech Stack)

| الطبقة | التقنية | الإصدار |
|---|---|---|
| Runtime | Node.js | 24 |
| اللغة | TypeScript | 5.9 |
| إدارة المونوريبو | pnpm Workspaces | 10.26+ |
| **Backend** | Express | 5 |
| **ORM** | Drizzle | 0.45 |
| قاعدة البيانات | PostgreSQL | 14+ |
| المصادقة | Clerk Express + JWT | 2.1 / 9.0 |
| تشفير كلمات المرور | bcryptjs | 3.0 |
| Validation | Zod | 3.25 |
| معالجة الصور | Sharp | 0.34 |
| تخزين الكائنات | Google Cloud Storage / Local FS | 7.19 |
| الأمان | Helmet + CORS + HPP + express-rate-limit | — |
| Logging | Pino + pino-http | 9 |
| **Frontend** | React | 19.1 |
| البندلر | Vite | 7.3 |
| التوجيه | wouter | 3.3 |
| إدارة الحالة | TanStack Query | 5.90 |
| Styling | TailwindCSS v4 + shadcn (Radix) | 4.1 |
| الأنيميشن | Framer Motion | 12 |
| محرر Canvas | Fabric.js | 7.2 |
| توليد PDF | jsPDF | 4.2 |
| الأيقونات | lucide-react | 0.545 |
| **AI** | OpenAI Integration + Gemini Integration | 2.0 |

---

## 4) هيكلية المشروع

```
workspace/
├── artifacts/                          ← الخدمات القابلة للنشر
│   ├── api-server/                     ← خادم Express
│   │   ├── src/
│   │   │   ├── app.ts                  ← تهيئة Express + Middleware
│   │   │   ├── index.ts                ← Entry point
│   │   │   ├── routes/                 ← جميع الـ REST endpoints
│   │   │   │   ├── auth.ts             ← تسجيل/دخول/ملف شخصي
│   │   │   │   ├── brands.ts           ← العلامات والتوليد
│   │   │   │   ├── designs.ts          ← استوديو التصميم
│   │   │   │   ├── campaigns.ts        ← الحملات
│   │   │   │   ├── posts.ts            ← المنشورات
│   │   │   │   ├── social.ts           ← الحسابات + الجدولة
│   │   │   │   ├── images.ts           ← خدمة الصور
│   │   │   │   ├── jobs.ts             ← المهام غير المتزامنة
│   │   │   │   ├── dashboard.ts        ← ملخص لوحة التحكم
│   │   │   │   ├── admin.ts            ← الإدارة الأساسية
│   │   │   │   ├── admin-platform.ts   ← إدارة المنصة (Plans/Pages/...)
│   │   │   │   └── health.ts           ← Health check
│   │   │   ├── middlewares/
│   │   │   │   ├── requireAuth.ts      ← فرض تسجيل الدخول
│   │   │   │   ├── requireAdmin.ts     ← فرض صلاحية المسؤول
│   │   │   │   ├── usageTracker.ts     ← قياس الاستهلاك
│   │   │   │   └── clerkProxyMiddleware.ts
│   │   │   └── lib/                    ← المكتبات الداخلية
│   │   │       ├── ai.ts               ← أوركستراتور الـ AI
│   │   │       ├── auth.ts             ← منطق المصادقة
│   │   │       ├── credits.ts          ← نظام الحدود/الاعتمادات
│   │   │       ├── jobStore.ts         ← مهام Async في الذاكرة
│   │   │       ├── scheduler.ts        ← جدولة النشر التلقائي
│   │   │       ├── publisher.ts        ← النشر على المنصات
│   │   │       ├── objectStorage.ts    ← تخزين الكائنات
│   │   │       ├── imageStorage.ts     ← تخزين الصور
│   │   │       ├── logoProcessor.ts    ← معالجة الشعارات
│   │   │       ├── brandBook.ts        ← توليد دليل الهوية
│   │   │       └── ...
│   │   └── package.json
│   │
│   └── brand-os/                       ← التطبيق الأمامي
│       ├── src/
│       │   ├── App.tsx                 ← التوجيه الرئيسي + Toaster
│       │   ├── pages/
│       │   │   ├── LandingPage.tsx
│       │   │   ├── SignIn.tsx / SignUp.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── BrandWizard.tsx     ← معالج الهوية
│       │   │   ├── BrandKit.tsx        ← عرض الهوية الكامل
│       │   │   ├── BrandEdit.tsx
│       │   │   ├── BrandBook.tsx       ← دليل الهوية
│       │   │   ├── BrandDesignStudio.tsx ← الاستوديو البصري
│       │   │   ├── CampaignList.tsx
│       │   │   ├── CampaignWorkspace.tsx
│       │   │   ├── ContentCalendar.tsx
│       │   │   ├── SocialAccounts.tsx
│       │   │   ├── Analytics.tsx
│       │   │   ├── Assets.tsx
│       │   │   ├── Templates.tsx
│       │   │   ├── Admin.tsx           ← لوحة الإدارة
│       │   │   └── admin/              ← تابات الإدارة
│       │   ├── components/
│       │   │   └── ui/                 ← مكونات shadcn
│       │   ├── contexts/
│       │   │   ├── AuthContext.tsx
│       │   │   └── SiteSettingsContext.tsx
│       │   ├── hooks/
│       │   └── lib/
│       │       └── apiError.ts         ← extractApiError + notify*
│       └── package.json
│
├── lib/                                ← مكتبات مشتركة
│   ├── api-client-react/               ← TanStack Query hooks
│   ├── api-spec/                       ← OpenAPI Spec + توليد العميل
│   ├── api-zod/                        ← Zod schemas مشتركة
│   ├── db/                             ← Drizzle schemas + client
│   │   └── src/schema/
│   │       ├── users.ts
│   │       ├── brands.ts
│   │       ├── campaigns.ts
│   │       ├── posts.ts
│   │       ├── designs.ts
│   │       ├── social-accounts.ts
│   │       ├── platform.ts
│   │       └── admin.ts
│   └── integrations/
│       └── integrations-openai-ai-server/
│           └── src/
│               ├── client.ts
│               └── image/client.ts
│
├── scripts/                            ← scripts cross-package
├── attached_assets/                    ← أصول المستخدم المرفوعة
├── DEPLOYMENT.md                       ← دليل النشر
├── DOCUMENTATION.md                    ← (هذا الملف)
├── AGENTS.md                           ← تعليمات الـ AI agents
├── replit.md                           ← ملخص لـ Replit Agent
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

---

## 5) قاعدة البيانات (Schema)

كل الجداول في `lib/db/src/schema/`. الجداول الرئيسية:

| الجدول | الموقع | الوصف |
|---|---|---|
| `users` | `users.ts` | الحسابات (Clerk ID + email + role) |
| `brands` | `brands.ts` | العلامات التجارية (logo, colors, voice, story) |
| `campaigns` | `campaigns.ts` | الحملات التسويقية |
| `posts` | `posts.ts` | المنشورات الفردية (محتوى + صورة + جدولة) |
| `designs` | `designs.ts` | تصاميم الاستوديو (Fabric JSON) |
| `social_accounts` | `social-accounts.ts` | حسابات منصات التواصل المربوطة |
| `pages` | `platform.ts` | محتوى الصفحات الثابتة |
| `plans` | `platform.ts` | خطط الاشتراك |
| `subscriptions` | `platform.ts` | اشتراكات المستخدمين |
| `usage_events` | `platform.ts` | كل عملية AI تُسجَّل هنا |
| `api_keys` | `platform.ts` | مفاتيح API للمستخدمين |
| `webhooks` | `platform.ts` | Webhooks مسجلة |
| `app_settings` | `admin.ts` | إعدادات المنصة العامة |
| `audit_logs` | `admin.ts` | سجل كل إجراء حساس |

**أوامر إدارة قاعدة البيانات:**

```bash
pnpm --filter @workspace/db run push        # دفع المخطط الحالي
pnpm --filter @workspace/db run studio      # فتح Drizzle Studio
pnpm --filter @workspace/db run generate    # توليد migration
```

---

## 6) الواجهة الأمامية — صفحات وميزات

### المسارات العامة (Public)
| المسار | الصفحة | الوصف |
|---|---|---|
| `/` | إعادة توجيه ذكية | يحوّل للوحة التحكم أو التسجيل |
| `/sign-in` | `SignIn` | تسجيل دخول (Clerk أو نموذج محلي) |
| `/sign-up` | `SignUp` | إنشاء حساب |

### المسارات المحمية (Protected — تتطلب تسجيل دخول)
| المسار | الصفحة | الوصف |
|---|---|---|
| `/dashboard` | `Dashboard` | ملخص النشاط، علاماتك، حملاتك |
| `/brands/new` | `BrandWizard` | معالج إنشاء هوية جديدة |
| `/brands/:id` | `BrandKit` | عرض الهوية كاملة |
| `/brands/:id/edit` | `BrandEdit` | تحرير بيانات الهوية |
| `/brands/:id/book` | `BrandBook` | دليل الهوية (PDF) |
| `/brands/:id/design` | `BrandDesignStudio` | الاستوديو البصري |
| `/brands/:id/campaigns` | `CampaignList` | قائمة حملات العلامة |
| `/brands/:brandId/social-accounts` | `SocialAccounts` | الحسابات المربوطة |
| `/campaigns/:id` | `CampaignWorkspace` | تفاصيل الحملة + المنشورات |
| `/calendar` | `ContentCalendar` | تقويم المحتوى |
| `/analytics` | `Analytics` | التحليلات |
| `/assets` | `Assets` | مكتبة الأصول |
| `/templates` | `Templates` | القوالب الجاهزة |

### المسارات الإدارية
| المسار | الصفحة | الصلاحية |
|---|---|---|
| `/admin` | `Admin` (تابات متعددة) | Admin فقط |

تحوي تابات Admin على: `Users`, `Brands`, `Plans`, `Subscriptions`, `Usage`, `Events`, `ApiKeys`, `Webhooks`, `Pages`, `Workflows`, `Monitoring`.

---

## 7) الواجهة الخلفية — REST API

كل المسارات مسبوقة بـ `/api`. الـ endpoints الرئيسية:

### 🔐 `/api/auth/*`
- `POST /auth/register` — إنشاء حساب
- `POST /auth/login` — تسجيل دخول (Rate limited)
- `POST /auth/logout` — خروج
- `GET  /auth/me` — معلومات المستخدم الحالي

### 🏷️ `/api/brands/*`
- `GET    /brands` — جلب علاماتي
- `POST   /brands` — إنشاء علامة
- `GET    /brands/:id` — تفاصيل
- `PATCH  /brands/:id` — تحديث
- `DELETE /brands/:id` — حذف
- `POST   /brands/:id/generate-kit` — توليد الهوية الكاملة (AI)
- `POST   /brands/:id/generate-logo-variants` — متغيرات الشعار
- `POST   /brands/:id/generate-story` — قصة العلامة
- `POST   /brands/:id/generate-content` — محتوى عام للعلامة
- `POST   /brands/:id/generate-campaign` — توليد حملة (sync)
- `POST   /brands/:id/generate-campaign-async` — توليد حملة (async + Job)
- `GET    /brands/:id/campaigns` — حملات العلامة
- `GET    /brands/:id/stats` — إحصائيات

### 🎨 `/api/designs/*`
- `GET/POST/PATCH/DELETE /designs[/:id]` — CRUD التصاميم
- `POST /designs/:id/preview` — توليد معاينة
- `POST /designs/generate-image` — توليد صورة فردية
- `POST /designs/generate-layout` — توليد تخطيط
- `POST /designs/smart-generate` — توليد ذكي شامل
- `POST /designs/analyze-image` — تحليل صورة
- `POST /designs/ai-edit` — تحرير ذكي
- `POST /designs/new-page` — صفحة جديدة في تصميم
- `POST /designs/generate-brand-book` — توليد دليل الهوية

### 📣 `/api/campaigns/*`
- `GET  /campaigns/:id` — تفاصيل
- `POST /campaigns/:id/generate-all-images` — توليد كل صور الحملة

### 📝 `/api/posts/*`
- `GET   /posts/:id` — تفاصيل
- `PATCH /posts/:id` — تعديل
- `POST  /posts/:id/generate-image` — توليد صورة
- `POST  /posts/:id/restore-image` — استعادة الصورة الأصلية
- `POST  /posts/:id/regenerate` — إعادة توليد كاملة
- `POST  /posts/:id/generate-variant` — متغير
- `POST  /posts/:id/generate-content` — توليد نص فقط

### 📲 `/api/social/*`
- `GET    /brands/:brandId/social-accounts` — الحسابات المربوطة
- `POST   /brands/:brandId/social-accounts` — ربط حساب
- `DELETE /social-accounts/:id` — فصل حساب
- `POST   /campaigns/:id/schedule` — جدولة كل منشورات الحملة
- `POST   /posts/:id/publish` — نشر فوري
- `POST   /posts/:id/unschedule` — إلغاء الجدولة
- `GET    /campaigns/:id/schedule` — استعلام الجدولة
- `POST   /scheduler/run` — تشغيل المجدول يدوياً (Admin)

### ⚙️ `/api/admin/*` و `/api/admin/...`
- إدارة كاملة (راجع الميزة 2.9 أعلاه).

### 📦 `/api/jobs/*`
- `GET /jobs/:id` — حالة Job غير متزامن.

### ❤️ `/api/healthz`
- فحص حالة الخادم.

### 🖼️ `/api/storage/images/objects/uploads/:id`
- خدمة صور المستخدم المُخزَّنة.

---

## 8) الذكاء الاصطناعي (AI Pipeline)

### 8.1 الموردون (Providers)
| المزود | الاستخدام | المتغير |
|---|---|---|
| **OpenAI** (GPT-4o, GPT-Image-1) | نصوص + صور | `OPENAI_API_KEY` |
| **Google Gemini** (2.5 Flash, Imagen) | نصوص + صور (Fallback) | `GEMINI_API_KEY` |

### 8.2 آلية الأولوية
1. إذا وُجد مفتاح OpenAI الخاص بالمستخدم → يُستخدم.
2. وإلا، إذا وُجد Replit OpenAI Integration → يُستخدم (`AI_INTEGRATIONS_OPENAI_*`).
3. وإلا، إذا وُجد Gemini → يُستخدم.
4. خلاف ذلك، يُرجَع خطأ واضح للمستخدم.

### 8.3 التوليد غير المتزامن (Async Jobs)
عمليات التوليد الكبيرة (حملات بأكثر من 5 منشورات) تستخدم:
- `generate-campaign-async` يُنشئ Job ID فوراً.
- الواجهة تستعلم عن `/jobs/:id` بشكل دوري.
- النتيجة تُحفظ في `jobStore` (in-memory) ثم تُنقَل لـ DB عند الاكتمال.

### 8.4 معالجة الأخطاء الموحدة
كل استدعاء AI من الواجهة يمر عبر:
- `extractApiError(error)` — يستخرج رسالة دقيقة من response.
- `notifyError(...)` / `notifySuccess(...)` — إشعارات Toast بالإنجليزية.
- موجود في `artifacts/brand-os/src/lib/apiError.ts` ومستخدَم في كل صفحات التوليد.

### 8.5 معالجة الصور
- **Sharp** للضغط، تغيير الحجم، تحويل الصيغ.
- **logoProcessor.ts** ينظف خلفيات الشعارات تلقائياً.
- **ensureLogo** يحقن شعار العلامة في كل تصميم جديد.

---

## 9) الأمان (Security)

### 9.1 Middlewares المطبَّقة (مرتبة)
1. **`trust proxy`** — للتعامل الصحيح مع Replit/Cloudflare proxies.
2. **Helmet** — رؤوس HTTP أمنية (CSP، XSS، Clickjacking).
3. **CORS** — قائمة بيضاء عبر `REPLIT_DOMAINS`.
4. **Compression** — gzip للاستجابات.
5. **cookie-parser** — قراءة الكوكيز.
6. **express.json** — حد أقصى `10mb`.
7. **express.urlencoded** — `10mb`.
8. **HPP** — حماية ضد HTTP Parameter Pollution.
9. **Clerk Middleware** — يستخرج جلسة Clerk إن وُجدت.
10. **`usageTracker`** — يسجل كل طلب `/api`.
11. **Rate Limiting**:
    - عام: `generalLimiter` على كل `/api`.
    - Auth: `authLimiter` على `/auth/login` و `/auth/register` و `__clerk`.
    - AI: `aiLimiter` على كل endpoints التوليد (للحماية من الإفراط).
12. **`requireAuth`** على كل العمليات الحساسة.
13. **`requireAdmin`** على عمليات الإدارة.

### 9.2 إدارة الأسرار
- لا توجد أسرار في الكود مطلقاً — كلها متغيرات بيئة.
- `.gitignore` يستثني `.env` وملفات الأسرار.
- المخزن السري (Replit Secrets) يحوي حالياً:
  - `GEMINI_API_KEY` ✓
  - `GITHUB_PERSONAL_ACCESS_TOKEN` ✓
  - `DATABASE_URL`، `SESSION_SECRET`، `AUTH_JWT_SECRET` (مدارة من Replit)
  - `OPENAI_API_KEY` (اختياري — يطلبه النظام عند الحاجة)

### 9.3 GitHub Secret Scanning
- المستودع البعيد لديه **Push Protection** مفعّل.
- أي commit يحوي token حقيقي سيُرفض تلقائياً قبل الرفع.

### 9.4 كلمات المرور
- مُجزَّأة بـ **bcryptjs** (10 rounds).
- لا تُخزَّن أبداً بصيغة plaintext.

### 9.5 JWT
- التوقيع بـ `AUTH_JWT_SECRET` (32 بايت hex).
- صلاحية محددة + refresh عبر cookies HTTP-Only.

### 9.6 Validation
- **Zod** لكل body, query, params.
- `validateBody`, `validateParams`, `validateQuery` helpers.

### 9.7 Audit Logging
- كل عملية إدارية حساسة تُسجَّل في `audit_logs`.

---

## 10) التشغيل المحلي على Replit

### 10.1 Workflows المُعدَّة
| الاسم | الأمر | المنفذ |
|---|---|---|
| `API Server` | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 |
| `Start application` | `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` | 5173 |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/brand-os: web` | `pnpm --filter @workspace/brand-os run dev` | (Vite default) |

> ملاحظة: لا تُشغِّل `API Server` و `artifacts/api-server: API Server` معاً (نفس المنفذ → `EADDRINUSE`).

### 10.2 الخطوات الأولى
1. `pnpm install` — تثبيت كل التبعيات.
2. تشغيل workflow `API Server`.
3. تشغيل workflow `Start application`.
4. افتح Webview Replit → ستفتح الواجهة على `:5173`.
5. سجّل حساب جديد أو ادخل بحساب admin (إن وُجد).

### 10.3 إعدادات الجدولة
- **Vite** مُعدّ بـ `server.allowedHosts: true` ليعمل عبر iframe بروكسي Replit.
- الـ API يستخدم `trust proxy: 1`.

---

## 11) التشغيل والنشر خارج Replit

راجع `DEPLOYMENT.md` للتفاصيل الكاملة. ملخص سريع:

### 11.1 وضع الحاوية الواحدة (Single-container)
```bash
SERVE_FRONTEND=1 NODE_ENV=production pnpm run build && node artifacts/api-server/dist/index.mjs
```
الـ API يخدم الـ SPA المبنية أيضاً على نفس المنفذ.

### 11.2 Docker Compose
ملف جاهز موثق في `DEPLOYMENT.md` (PostgreSQL + API + nginx).

### 11.3 منصات أخرى مدعومة
- Render, Railway, Fly.io, AWS, Azure, GCP, VPS عادي.
- يكفي تحديد `DATABASE_URL` + المتغيرات الأخرى.

---

## 12) متغيرات البيئة (Environment Variables)

### إلزامية في الإنتاج
| المتغير | الوصف |
|---|---|
| `DATABASE_URL` | Connection string لـ Postgres |
| `SESSION_SECRET` | توقيع كوكيز الجلسة (`openssl rand -hex 32`) |
| `AUTH_JWT_SECRET` | توقيع الـ JWT |
| `OPENAI_API_KEY` **أو** `GEMINI_API_KEY` | على الأقل واحد |

### اختيارية
| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `8080` | منفذ الـ API |
| `NODE_ENV` | `development` | في الإنتاج: `production` |
| `SERVE_FRONTEND` | `0` | `1` لتشغيل وضع الحاوية الواحدة |
| `BASE_PATH` | `/` | base path للـ frontend |
| `CLERK_SECRET_KEY` | — | لتفعيل Clerk |
| `CLERK_PUBLISHABLE_KEY` | — | لتفعيل Clerk |
| `VITE_CLERK_PUBLISHABLE_KEY` | — | للواجهة |
| `REPLIT_DOMAINS` | — | قائمة CORS بيضاء |
| `PRIVATE_OBJECT_DIR` | محلي | مجلد التخزين أو bucket |
| `PUBLIC_OBJECT_SEARCH_PATHS` | — | مجلدات الأصول العامة |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | (auto) | لـ Replit Integration |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | (auto) | لـ Replit Integration |

> ⚠️ **لا تُسجِّل أي مفتاح في Git مباشرة.** استخدم Replit Secrets أو `.env` المستثنى من Git.

---

## 13) العمليات الإدارية الشائعة

```bash
# تثبيت التبعيات
pnpm install

# فحص الأنواع (typecheck الكامل)
pnpm run typecheck

# بناء كل المشروع
pnpm run build

# دفع مخطط DB
pnpm --filter @workspace/db run push

# توليد migration
pnpm --filter @workspace/db run generate

# تشغيل API فقط
pnpm --filter @workspace/api-server run dev

# تشغيل Frontend فقط
pnpm --filter @workspace/brand-os run dev

# توليد عميل API من OpenAPI Spec
pnpm --filter @workspace/api-spec run codegen
```

### رفع التغييرات إلى GitHub
- المستودع: `https://github.com/mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2`
- التوكن مخزَّن في `~/.git-credentials` — لا حاجة لتمريره يدوياً.
- اضغط **Commit** ثم **Push** من لوحة Git في Replit.

---

## 14) استكشاف الأعطال

| العَرَض | السبب الأرجح | الحل |
|---|---|---|
| `EADDRINUSE :8080` | API workflow مكرر | أوقف أحد الـ workflows |
| `unable to access 'https://github.com/...': 404` | الـ remote URL خاطئ | عدّل في `.git/config` لاسم المستودع الصحيح |
| `terminal prompts disabled` | لا توجد credentials للـ Git | احفظ التوكن في `~/.git-credentials` |
| `Push protection: secret detected` | Commit يحوي مفتاح حقيقي | احذف المفتاح + غيّره فوراً + أعد commit |
| `OpenAI 401` | المفتاح خاطئ أو منتهي | حدّث `OPENAI_API_KEY` |
| `Vite preview blank` | host غير مسموح | تحقق من `server.allowedHosts: true` |
| `index.lock exists` | عملية Git سابقة فشلت | احذف `.git/index.lock` |
| `Unauthorized` على API | جلسة منتهية | سجّل خروج ثم دخول |
| Toaster لا يظهر | `Toaster` غير مركّب | متاكد من `App.tsx` (السطر 149) |

---

## 15) خارطة الطريق المستقبلية

أفكار تحسين تم تحديدها كأولويات (مفصّلة في `AGENTS.md` للوكلاء):

1. **Realtime AI Streaming** — بث استجابات GPT بدلاً من الانتظار.
2. **Webhook Bus** — إعلام المستخدم عند انتهاء توليد طويل.
3. **متعدد اللغات الكامل (i18n)** — عربي/إنجليزي مع RTL متبادل.
4. **Drag & Drop Calendar** — جدولة بصرية للمنشورات.
5. **Brand Voice Tester** — محاكي محادثة لاختبار النبرة.
6. **A/B Testing للمنشورات** — متغيران ينشران لجمهورين.
7. **OAuth حقيقي للمنصات** — استبدال الربط اليدوي.
8. **Insights AI** — تحليل أداء المنشورات السابقة وإعطاء توصيات.
9. **PWA + Offline mode** — يعمل على الجوال كتطبيق.
10. **CDN للأصول** — تسريع تحميل الصور.

---

> **آخر تحديث:** 26 أبريل 2026  
> **الحالة:** جاهز للإنتاج | متزامن مع GitHub  
> **المستودع:** [`mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2`](https://github.com/mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2)
