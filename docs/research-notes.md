# یادداشت‌های تحقیق فنی (Research Notes)

> این فایل یافته‌های تحقیقاتی مستندسازی‌شده (با منبع) درباره‌ی معماری صحیح یک اکستنشن کروم برای تبدیل گفتار به متن است. هدف: تصمیم‌گیری بر اساس واقعیت، نه حدس (طبق دستورالعمل عملیاتی #2 و #3).
>
> تاریخ تحقیق: ۲۰۲۶-۰۷-۰۷

---

## ۱) دسترسی به میکروفون در Manifest V3 — نکته‌ی حیاتی معماری

### یافته‌ی اصلی
`getUserMedia()` **مستقیماً داخل یک Offscreen Document کار نمی‌کند** اگر پیش از آن هیچ‌جا permission گرفته نشده باشد؛ در آن‌جا فقط request می‌فرستد ولی fail می‌شود (سند رسمی Chrome این نکته را صراحتاً توضیح نمی‌دهد ولی چند منبع مستقل از جمله بحث‌های خود تیم Chromium Extensions این را تأیید می‌کنند).

### چرا؟
- Service Worker (پس‌زمینه‌ی MV3): اصلاً DOM ندارد → نمی‌تواند `getUserMedia` صدا بزند.
- Content Script: در "isolated world" صفحه‌ی میزبان اجرا می‌شود؛ حتی اگر تئوریک بشود permission خواست، این permission به origin همان **وب‌سایت میزبان** گره می‌خورد نه به خود اکستنشن؛ یعنی کاربر باید در **هر سایتی که فیلد متنی دارد** دوباره اجازه بدهد (تجربه‌ی کاربری بد و غیرقابل قبول برای ابزاری که قرار است روی همه‌ی سایت‌ها کار کند).
- Offscreen Document: DOM کامل دارد و origin آن `chrome-extension://<id>/` است، اما نمایش prompt مجوز به یک ژست کاربر (user gesture) در یک صفحه‌ی **قابل مشاهده** نیاز دارد؛ Offscreen Document به‌طور پیش‌فرض هیچ‌وقت دیده نمی‌شود، پس دیالوگ اجازه در آن نمایش داده نمی‌شود / یا اصلاً اجازه دریافت نمی‌شود.

### راه‌حل استاندارد صنعت (تأییدشده در چند منبع)
۱. یک صفحه‌ی واقعی از خود اکستنشن (مثلاً `onboarding.html`) به‌صورت یک **تب کامل** باز می‌شود (نه popup، نه iframe — چون در popup/side panel هم درخواست permission با شکست مواجه می‌شود).
۲. کاربر روی دکمه‌ی «فعال‌سازی میکروفون» کلیک می‌کند (ژست کاربر لازم است) → `getUserMedia({audio:true})` صدا زده می‌شود → کروم دیالوگ استاندارد اجازه‌ی میکروفون را نشان می‌دهد.
۳. کاربر اجازه می‌دهد → این اجازه برای همیشه روی origin اکستنشن (`chrome-extension://<id>`) ذخیره می‌شود؛ از این نقطه به بعد، **هر context دیگری با همان origin (از جمله Offscreen Document)** بدون هیچ prompt دوباره‌ای می‌تواند از میکروفون استفاده کند.
۴. این permission را کاربر بعداً هم می‌تواند از مسیر Extension Details → Site Settings → Microphone مدیریت/لغو کند.

### نکته‌ی مهم دیگر
در Chrome **پرمیژن به‌نام "microphone" در manifest.json وجود ندارد** — دسترسی میکروفون کاملاً از طریق مدل استاندارد وب (`getUserMedia` + permission origin-based) کنترل می‌شود، نه از طریق `permissions` در مانیفست.

### معماری نهایی پیشنهادی برای این بخش
```
Content Script (روی هر صفحه)      Background Service Worker        Offscreen Document (chrome-extension://id)
──────────────────────────      ──────────────────────────        ──────────────────────────────────────────
تشخیص فوکوس روی فیلد متنی    →   دریافت پیام start/stop      →     getUserMedia + SpeechRecognition
نمایش آیکن میکروفون          ←   مسیردهی نتایج زنده          ←     ارسال interim/final transcript
نمایش پاپ‌آپ RTL زنده                (chrome.runtime.sendMessage)         (این‌جا اجرا می‌شود چون DOM دارد
                                                                          و origin آن از قبل اجازه گرفته)
```
اگر کاربر تا به حال یک‌بار هم صفحه‌ی onboarding را ندیده باشد (یعنی هنوز اجازه نگرفته‌ایم)، به‌جای نمایش خطا، باید هوشمندانه او را به آن صفحه هدایت کنیم.

منابع:
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/V09VMCLzvWM
- https://github.com/GoogleChrome/chrome-extensions-samples/issues/821
- https://medium.com/@lynchee.owo/how-to-enable-microphone-access-in-chrome-extensions-by-code-924295170080
- https://www.freecodecamp.org/news/handling-mic-input-permissions-and-speech-recognition-in-chrome-extensions-ff7e3ca84cb0/
- https://voicewriter.io/blog/the-architecture-of-chrome-extension-permissions-a-deep-dive

---

## ۲) موتور تشخیص گفتار (STT Engine) — گزینه‌ها

### گزینه‌ی A: Web Speech API مرورگر (`webkitSpeechRecognition`)
- رایگان، بدون نیاز به API key، پشتیبانی built-in از حالت continuous + interim results (یعنی «زنده بودن» رایگان و بی‌دردسر است).
- **نکته‌ی مهم درباره‌ی حریم خصوصی که باید صادقانه به کاربر گفت:** طبق مستندات MDN، در کروم این API یک "server-based recognition engine" است — یعنی صدا برای پردازش به سرورهای گوگل فرستاده می‌شود. کاملاً آفلاین/on-device نیست (برخلاف تصور رایج). اکستنشن‌های مشابه مثل Voice In که ادعای "no audio sent to servers" دارند دقیقاً منظورشان «به سرورهای خودشان» است، نه اینکه گوگل هم صدا را نمی‌بیند.
- زبان `fa-IR` در فهرست زبان‌های پشتیبانی‌شده هست، اما **هیچ داده‌ی مستند و قابل‌اتکایی درباره‌ی دقت واقعی آن برای فارسی پیدا نشد.** این دقیقاً همان جایی است که طبق دستورالعمل #3 («حدس نزن، تست کن») باید با یک نمونه صدای واقعی فارسی تست شود، نه فرض گرفته شود.
- باید در Offscreen Document اجرا شود (نه content script) — دلیلش دقیقاً همان بحث permission بالاست.

### گزینه‌ی B: OpenAI `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`
- جانشین مدرن‌تر Whisper با نرخ خطای کمتر و پشتیبانی چندزبانه‌ی بهتر از Whisper کلاسیک (طبق اعلام OpenAI).
- **از نسخه‌ی ۲۰۲۵ به بعد از `stream=true` پشتیبانی می‌کند** و رویدادهای `transcript.text.delta` را به‌صورت افزایشی می‌فرستد — یعنی می‌توان تجربه‌ی «زنده» نزدیک به Web Speech API ساخت (نه صرفاً یک درخواست batch کند).
- قیمت: حدود $0.006 به ازای هر دقیقه صوت (مدل کامل) یا $0.003 (نسخه‌ی mini، ارزان‌تر ولی کمی ضعیف‌تر). یعنی هر کاربر با API key خودش، هزینه‌ی بسیار ناچیزی می‌پردازد.
- نیازمند API key از طرف کاربر است (نمی‌شود key خود ما را داخل اکستنشن embed کرد — این یک ریسک امنیتی جدی است چون هر کسی می‌تواند اکستنشن را باز کند و key را استخراج کند). پس باید در صفحه‌ی تنظیمات، کاربر خودش key را وارد کند و به‌صورت local ذخیره شود.
- دقت فارسی Whisper/GPT-4o-transcribe به‌صورت رسمی و عددی پیدا نشد، ولی به‌صورت کیفی در منابع متعدد به‌عنوان یکی از بهترین گزینه‌های عمومی (غیر تخصصی) برای فارسی شناخته می‌شود.

### گزینه‌ی C: مدل‌های تخصصی فارسی (مثلاً fine-tune‌های Whisper روی دیتاست فارسی، یا سرویس‌های داخلی مثل نویسا/ای‌او‌تایپ)
- می‌تواند دقت بالاتری از یک مدل عمومی داشته باشد چون مخصوص فارسی fine-tune شده.
- نیازمند یک بک‌اند/سرور میانی است (این مدل‌ها API عمومی پایدار و مستند ندارند که مستقیماً از یک اکستنشن کلاینت-ساید صدا زده شوند) → پیچیدگی و هزینه‌ی زیرساخت اضافه می‌کند. **پیشنهاد: فاز ۲، نه MVP.**

### گزینه‌ی D (فاز آینده، صرفاً برای آگاهی): Whisper محلی در مرورگر (WASM/WebGPU، مثل Transformers.js)
- کاملاً آفلاین و خصوصی (هیچ صدایی از دستگاه خارج نمی‌شود).
- چالش‌ها: حجم دانلود مدل (چند ده تا صد+ مگابایت)، مصرف بالای CPU/GPU، و از همه مهم‌تر Whisper ذاتاً stream نیست (برای حس «زنده» باید با پنجره‌ی لغزان hack شود که می‌تواند لرزش/فلیکر در متن ایجاد کند). **مناسب یک تنظیم اختیاری «حالت کاملاً آفلاین» در فازهای بعدی، نه بخشی از MVP.**

منابع:
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/models/gpt-4o-transcribe
- https://openai.com/index/introducing-gpt-realtime/
- https://community.openai.com/t/implementing-gpt-realtime-and-gpt4-4o-transcribe-for-a-streaming-transcription/1356657
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

### یافته‌ی جدید و مهم: حالت On-Device خودِ Web Speech API (از Chrome 139، اوت ۲۰۲۵)

هنگام بررسی type definition های بسته‌ی `@types/dom-speech-recognition`، مشخص شد که خودِ استاندارد `SpeechRecognition` (همان API که قبلاً «حتماً سرور-محور» توصیف شد) از Chrome 139 به بعد یک **حالت on-device واقعی** هم دارد:

```ts
SpeechRecognition.available({ langs: ['fa-IR'], processLocally: true })
// → 'available' | 'downloadable' | 'downloading' | 'unavailable'

SpeechRecognition.install({ langs: ['fa-IR'], processLocally: true })
// دانلود بسته‌ی زبان برای تشخیص کاملاً محلی/آفلاین
```

اگر `processLocally: true` روی خودِ instance ست شود و زبان موردنظر available باشد، **هیچ صدایی از دستگاه خارج نمی‌شود** — دقیقاً همان مزیت حریم خصوصیِ گزینه‌ی «Whisper محلی (WASM)» که در بخش ۲ به‌عنوان فاز آینده مطرح شده بود، ولی این‌بار با API استاندارد و بدون نیاز به دانلود/اجرای یک مدل چند صد مگابایتی توسط خودِ ما.

**خبر بد (بررسی‌شده از سند رسمی توضیحات API در مخزن WebAudio/web-speech-api):** لیست زبان‌های پشتیبانی‌شده‌ی فعلی این حالت on-device فقط ۱۷ زبان است: آلمانی، انگلیسی (US)، اسپانیایی، فرانسوی، هندی، اندونزیایی، ایتالیایی، ژاپنی، کره‌ای، لهستانی، پرتغالی (برزیل)، روسی، تایلندی، ترکی، ویتنامی، و دو گویش چینی. **فارسی جزو این لیست نیست.**

**تصمیم:** فعلاً برای فارسی نمی‌توان از حالت on-device استفاده کرد و پیش‌فرض «رایگان» همچنان همان SpeechRecognition سرور-محور (بخش ۲، گزینه‌ی A) باقی می‌ماند. اما چون این قابلیت به‌مرور می‌تواند به زبان‌های بیشتری گسترش پیدا کند، **در کد صرفاً همیشه ابتدا availability را برای زبان درخواستی چک می‌کنیم و در صورت `available` بودن، خودکار سراغ حالت on-device می‌رویم** — یعنی کد از روز اول برای این آینده آماده است، بدون هیچ هزینه‌ی اضافه در حال حاضر (چون برای `fa-IR` این چک همیشه `unavailable` برمی‌گرداند و مسیر سرور-محور فعلی طی می‌شود).

منابع:
- https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static

---

## ۳) پردازش متن فارسی پس از تشخیص گفتار

هیچ موتور STT (نه Google، نه OpenAI) خروجی فارسی «تمیز و استاندارد» تحویل نمی‌دهد — نیم‌فاصله (ZWNJ)، حروف عربی به‌جای فارسی (ي/ك به‌جای ی/ک)، اعداد لاتین/فارسی نامنظم، و فاصله‌گذاری اطراف علائم نگارشی معمولاً نیاز به یک لایه‌ی normalization دارند.

کتابخانه‌ی معرفی‌شده و **به‌روز و فعال** برای این کار:
- **`@persian-tools/persian-tools`** (TypeScript، کار می‌کند در Node/Bun/Browser) — شامل توابعی مثل `halfSpace` (درج نیم‌فاصله‌ی صحیح)، نرمال‌سازی اعداد، و ابزارهای دیگر. این مورد به‌عنوان گزینه‌ی اصلی پیشنهاد می‌شود چون به‌صورت فعال نگه‌داری می‌شود.
- جایگزین‌ها: `persian-normalizer`, `persian-preprocess`, `persianize` — قدیمی‌تر/کم‌فعالیت‌تر.

منبع: https://persian-tools.js.org/ · https://github.com/persian-tools/persian-tools

---

## ۴) تزریق UI در صفحات دیگر (Content Script) — نکات فنی

- Content Script باید با `all_frames: true` تنظیم شود تا داخل iframe های هم‌مبدأ (same-origin) هم کار کند (خیلی از فرم‌های پیچیده داخل iframe رندر می‌شوند).
- برای جلوگیری از تداخل CSS با استایل‌های صفحه‌ی میزبان (که در ابزارهای مشابه یک مشکل شناخته‌شده است)، باید UI (آیکن + پاپ‌آپ) داخل **Shadow DOM با `mode: "closed"` یا حداقل `"open"`** رندر شود، نه مستقیم در DOM اصلی صفحه.
- برای فیلدهای `contenteditable` (مثل Gmail، Notion، ادیتورهای rich-text)، بهترین روش شنیدن eventهای `focusin`/`focusout` به‌صورت delegated روی `document` است (نه querySelector یک‌باره)، چون این عناصر معمولاً به‌صورت پویا توسط فریم‌ورک‌هایی مثل React ساخته/حذف می‌شوند.
- محدودیت شناخته‌شده: **Google Docs** با contenteditable معمولی کار نمی‌کند (ادیتور آن روی canvas رندر می‌شود) — تزریق مستقیم متن در آن از روش‌های استاندارد ممکن نیست. باید به‌عنوان یک limitation شناخته‌شده مستند شود.

منابع:
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://dev.to/developertom01/solving-css-and-javascript-interference-in-chrome-extensions-a-guide-to-react-shadow-dom-and-best-practices-9l
- https://github.com/crxjs/chrome-extension-tools/discussions/810

---

## ۵) هوش مصنوعی built-in خود کروم (Gemini Nano)

بررسی شد که آیا کروم یک API رسمی on-device برای speech-to-text دارد (که می‌توانست جایگزین کاملاً آفلاین و رایگان باشد). **نتیجه: خیر.** APIهای built-in فعلی کروم (`Prompt API`/`LanguageModel`, `Summarizer`, `Translator`, `Writer`, `Rewriter`, `Proofreader`) هیچ‌کدام قابلیت ورودی صوتی ندارند؛ فقط متن. پس این گزینه فعلاً از دور خارج است (شاید در آینده).

منبع: https://developer.chrome.com/docs/ai/built-in · https://developer.chrome.com/docs/extensions/ai

---

## ۶) ابزار ساخت (Build Tooling) — انتخاب فریم‌ورک

مقایسه‌ی سه گزینه‌ی رایج برای ساخت اکستنشن با TypeScript روی Manifest V3:

| فریم‌ورک | وضعیت نگه‌داری (۲۰۲۶) | جمع‌بندی |
|---|---|---|
| **WXT** | فعال، به‌روز، رشد سریع، پشتیبانی چندمرورگری، TypeScript به‌صورت پیش‌فرض | **پیشنهاد اصلی** |
| CRXJS | کندشدن توسعه در ۲۰۲۵-۲۰۲۶، صرفاً یک Vite plugin نه فریم‌ورک کامل | مناسب پروژه‌ی خیلی ساده، نه انتخاب اول |
| Plasmo | انتزاع بیشتر، ولی نگرانی‌های نگه‌داری مشابه گزارش شده | گزینه‌ی سوم |

**نتیجه: `WXT` (wxt.dev)** انتخاب می‌شود — دارای конвенشن فایل‌محور برای content scripts/background/popup، پشتیبانی از Manifest V3، HMR سریع مبتنی بر Vite، و utilities آماده برای storage.

منبع: https://wxt.dev/ · https://dev.to/quangpl/plasmo-vs-crxjs-vs-wxt-which-chrome-extension-framework-should-you-use-in-2026-37o4

---

## جمع‌بندی ریسک‌های باز (باید قبل از تصمیم نهایی تست شوند)

1. ~~**دقت واقعی Web Speech API برای `fa-IR`**~~ — با تست دستی کاربر در فاز ۰ بررسی شد؛ نتیجه در بخش «۱ب» پایین همین فایل.
2. ~~**رفتار دقیق `SpeechRecognition` داخل Offscreen Document**~~ — **تست شد و مشکل واقعی پیدا شد + رفع شد.** جزئیات در بخش «۱ب» پایین.
3. **رفتار روی سایت‌های پرکاربرد فارسی/ایرانی و افزونه‌های رایج (مثل Gmail، سایت‌های خبری، پنل‌های ادمین با فریم‌ورک‌های مختلف)** — هنوز باید به‌صورت دستی تست شود (فاز ۴).

---

## ۱ب) یافته‌ی تجربی: چرا SpeechRecognition خام داخل Offscreen Document شکست می‌خورد

نتیجه‌ی تست واقعی (فاز ۰، ۱۴۰۵/۰۴/۱۶): فراخوانی `recognition.start()` بدون آرگومان، داخل Offscreen Document، با خطای
`not-allowed` شکست خورد — با اینکه چند لحظه قبل، مجوز میکروفون از صفحه‌ی onboarding با موفقیت گرفته شده بود (یعنی
origin اکستنشن قطعاً مجوز داشت).

**علت:** برخلاف `getUserMedia()` خام (که طبق مستندات رسمی Chrome و reason ای به‌نام `USER_MEDIA` صریحاً برای
Offscreen Document پشتیبانی می‌شود)، خودِ `SpeechRecognition` یک مکانیزم داخلی و جداگانه برای گرفتن دسترسی میکروفون
دارد که ظاهراً به یک صفحه‌ی *قابل‌مشاهده* نیاز دارد؛ Offscreen Document به تعریف هیچ‌وقت قابل‌مشاهده نیست، پس این
مذاکره‌ی داخلی شکست می‌خورد و خطای `not-allowed` برمی‌گردد — درست مثل اینکه کاربر مجوز را رد کرده باشد، با اینکه
اصلاً چنین چیزی نیست.

---

## ۱ج) یافته‌ی تجربی مهم‌تر: باگ «دوبار پردازش شدن هر پیام» در فاز ۱ (تست content script)

بعد از رفع مشکل بالا، فاز ۱ (تزریق آیکن در صفحات وب) یک باگ بسیار گمراه‌کننده داشت: کلیک روی آیکن باعث می‌شد پاپ‌آپ
باز شود، وضعیت به «در حال راه‌اندازی…» برود، و بعد **برای همیشه در همان حالت بماند** — نه خطایی، نه نتیجه‌ای. تشخیص
این باگ حدود یک ساعت طول کشید چون رفتار به‌شدت نامنظم به نظر می‌رسید (گاهی کار می‌کرد، گاهی نه) و چندین فرضیه‌ی
اشتباه (تب قدیمی بعد از رفرش، bfcache، دابل‌کلیک کاربر، تغییر ID اکستنشن) قبل از رسیدن به علت واقعی رد شدند —
هرکدام از این‌ها *هم* واقعی بودند و در برخی از تست‌ها واقعاً رخ دادند، ولی هیچ‌کدام علت اصلی نبودند.

**علت واقعی:** در طراحی اولیه، پیام‌هایی که کلاینت (content script یا onboarding) برای *درخواست* شروع/توقف
می‌فرستاد، همان `target: 'offscreen'` را داشت که Offscreen Document خودش هم برایش گوش می‌داد. چون
`browser.runtime.sendMessage` به **همه‌ی context های اکستنشن** broadcast می‌شود (نه فقط به background)، وقتی
Offscreen Document از قبل وجود داشت (یعنی بعد از اولین session)، پیام اصلی کلاینت **مستقیماً** هم به گوش
Offscreen Document می‌رسید (چون با فیلتر خودش مطابقت داشت) **و هم** نسخه‌ی relay شده‌ی background به آن می‌رسید —
یعنی هر start/stop **دوبار** پردازش می‌شد. دو listener (یکی async از background، یکی sync از خود offscreen) هر دو
سعی می‌کردند به همان پیام اصلی جواب بدهند، که باعث خطای شناخته‌شده‌ی کروم هم می‌شد:

```
Uncaught (in promise) Error: A listener indicated an asynchronous response by returning
true, but the message channel closed before a response was received
```

این خطا (که در کنسول خودِ صفحه‌ی وب ظاهر می‌شود، نه در offscreen یا background) دقیقاً سرنخی بود که مسیر را به علت
اصلی رساند.

**راه‌حل:** پیام‌های *درخواست* کلاینت و پیام‌های *دستور* relay‌شده‌ی background حالا `target` متفاوتی دارند:
- کلاینت (content script / onboarding) → `target: 'background'` (نوع‌های `StartRecognitionRequest` /
  `StopRecognitionRequest`)
- background → Offscreen Document → `target: 'offscreen'` (نوع‌های `StartRecognitionCommand` /
  `StopRecognitionCommand`)

چون این دو مقدار متفاوتند، Offscreen Document دیگر هرگز پیام اصلی کلاینت را مستقیم دریافت نمی‌کند — فقط نسخه‌ی
relay‌شده را. پیاده‌سازی در [utils/messaging.ts](../utils/messaging.ts)، [entrypoints/background.ts](../entrypoints/background.ts).

**درس کلی‌تر برای بقیه‌ی پروژه:** در معماری‌ای که پیام‌ها broadcast می‌شوند (نه point-to-point)، **هرگز نباید پیام
«درخواست از کلاینت» و پیام «دستور اجراشده توسط واسطه» یک `target` مشترک داشته باشند**، چون هر context جدیدی که بعداً
اضافه شود و به آن target گوش بدهد، می‌تواند به‌طور غیرمنتظره پیام خام کلاینت را هم دریافت کند.

---

## ۱د) علت اصلی و نهایی: `runtime.sendMessage` به content script نمی‌رسد (فقط `tabs.sendMessage`)

این بزرگ‌ترین اشتباه معماری در طراحی اولیه بود و توضیح می‌دهد چرا در تمام مدت، صفحه‌ی onboarding **همیشه** کار
می‌کرد ولی content script روی صفحات وب **هیچ‌وقت** نتیجه‌ای نشان نمی‌داد.

**علائم:** لاگ‌های Offscreen Document نشان می‌دادند که تشخیص گفتار فارسی کاملاً درست کار می‌کند (کلمات دقیق تشخیص
داده می‌شدند). content script هم `mySource` را درست دریافت کرده بود و مقدارش با source پیام‌های نتیجه یکی بود. اما
listener پیام در content script **هیچ‌وقت** رویداد `recognition:result`/`recognition:started` را دریافت نمی‌کرد —
نه به‌عنوان پیام مطابق، نه به‌عنوان پیام نامطابق. یعنی پیام‌ها اصلاً به content script **نمی‌رسیدند**.

**علت:** طبق مدل پیام‌رسانی کروم:
- `chrome.runtime.sendMessage()` پیام را به **صفحات خود اکستنشن** می‌رساند: background (service worker)، صفحات
  popup/options، صفحه‌ی onboarding ما، و Offscreen Document. **اما به content scriptها نمی‌رسد.**
- برای رسیدن پیام به یک content script که در یک تب تزریق شده، **حتماً** باید از
  `chrome.tabs.sendMessage(tabId, message)` استفاده کرد.

برای همین onboarding (که یک صفحه‌ی اکستنشن با origin ‏`chrome-extension://` است) پیام‌های broadcast‌شده‌ی offscreen
را مستقیم می‌گرفت، ولی content script (که در origin صفحه‌ی وب اجرا می‌شود) هرگز آن‌ها را نمی‌گرفت. جمله‌ی اشتباه در
همین سند (بخش معماری) که می‌گفت «هر client page مستقیماً پیام‌ها را دریافت می‌کند» فقط برای صفحات اکستنشن درست بود،
نه content scriptها.

**راه‌حل (پیاده‌سازی شد):**
- Offscreen Document همچنان نتایج را با `runtime.sendMessage` و `target: 'client'` می‌فرستد (چون به `chrome.tabs`
  دسترسی ندارد — تنها API پیام‌رسانی که Offscreen Document دارد `chrome.runtime` است).
- background این پیام‌های `target: 'client'` را دریافت می‌کند و برای هر پیامی که `source.kind === 'tab'` باشد، آن را
  با `browser.tabs.sendMessage(source.tabId, message)` به تب درست هدایت می‌کند. برای `source.kind === 'onboarding'`
  کاری نمی‌کند چون آن صفحه پیام را از قبل مستقیم گرفته است (وگرنه دوبار می‌شد).
- به `wxt.config.ts` هم `host_permissions: ['<all_urls>']` اضافه شد، چون `tabs.sendMessage` به یک تب دلخواه نیازمند
  دسترسی host به آن تب است.

پیاده‌سازی در [entrypoints/background.ts](../entrypoints/background.ts) و [wxt.config.ts](../wxt.config.ts).

منبع: https://developer.chrome.com/docs/extensions/develop/concepts/messaging (بخش «one-time messages»:
runtime.sendMessage برای content-script→extension، و tabs.sendMessage برای extension→content-script).

**راه‌حل (پیاده‌سازی و تست شد، کار می‌کند):** به‌جای گذاشتن مسئولیت گرفتن میکروفون به‌عهده‌ی خودِ SpeechRecognition،
خودمان با `getUserMedia()` (که در Offscreen Document کار می‌کند) یک `MediaStreamTrack` می‌گیریم و آن را مستقیم به
overload جدیدتر متد start می‌دهیم:

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const track = stream.getAudioTracks()[0];
recognition.start(track); // نه recognition.start() بدون آرگومان
```

طبق مشخصات فنی (Web Speech API spec)، وقتی `start()` با یک `MediaStreamTrack` صدا زده شود، پرچم داخلی
`requestMicrophonePermission` روی `false` تنظیم می‌شود — یعنی SpeechRecognition اصلاً وارد آن مذاکره‌ی داخلی
مشکل‌دار نمی‌شود و فقط از صدایی که خودمان already-legitimately می‌گیریم استفاده می‌کند. کد نهایی در
[entrypoints/offscreen/main.ts](../entrypoints/offscreen/main.ts).

منبع: https://github.com/w3c/speech-api/issues/66 (بحث طراحی همین قابلیت) · تست تجربی مستقیم در همین پروژه.

## ۱ج) نتیجه‌ی اولین تست کیفیت فارسی (غیررسمی، یک جمله، خوانده‌شده به‌صورت «شل»/غیردقیق)

جمله‌ی هدف: «بر اساس جواب شما، فاز ۱ را شروع می‌کنم و اگر **دقت** رایگان ناامیدکننده بود، همان‌جا مسیر را
به‌سمت فعال‌سازی پیش‌فرض موتور ابری تنظیم می‌کنیم.»

خروجی خام Web Speech API: «بر اساس جواب شما فاز یک را شروع می‌کنم و اگر رایگان ناامید کننده بود همانجا مسیر را
به سمت فعال سازی پیش فرض موتور ابری تنظیم می‌کنیم»

مشاهدات:
- کلمات به‌درستی تشخیص داده شدند (بدون جایگزینی غلط) — سطح کیفیت پایه‌ی تشخیص قابل قبول به نظر می‌رسد.
- **هیچ نیم‌فاصله‌ای (ZWNJ) درج نمی‌شود** — «ناامیدکننده»→«ناامید کننده»، «فعال‌سازی»→«فعال سازی»،
  «پیش‌فرض»→«پیش فرض». این دقیقاً همان چیزی است که در بخش ۳ همین سند پیش‌بینی شده بود؛ راه‌حلش (کتابخانه‌ی
  `persian-tools`) از قبل در فاز ۲ پلن قرار دارد، نه یک مشکل جدید و غیرمنتظره.
- **هیچ علامت نگارشی خودکاری درج نمی‌شود** (نه ویرگول، نه نقطه) — محدودیت شناخته‌شده‌ی Web Speech API، یکی از
  دلایلی که موتور ابری اختیاری (gpt-4o-transcribe) در پلن گنجانده شده.
- کلمه‌ی «دقت» در خروجی نیست — چون کاربر جمله را «شل» (غیردقیق/سرسری) خوانده، معلوم نیست این حذف واقعی توسط
  تشخیص گفتار بوده یا خودِ کاربر آن را نگفته؛ برای قضاوت قطعی به تست‌های بیشتر با خواندن طبیعی نیاز است (نه معیار
  قابل‌اتکا برای این یک مورد).

**نتیجه‌گیری موقت:** سطح دقت رایگان برای یک MVP قابل‌قبول به نظر می‌رسد، به‌شرط اضافه‌شدن پایپ‌لاین نرمال‌سازی
فارسی (فاز ۲) که از قبل برنامه‌ریزی شده بود. تصمیم قطعی درباره‌ی پیش‌فرض بودن رایگان/ابری با کاربر در میان گذاشته شد.

---

## ۵) تحقیق فاز ۲ — مدل‌های ابری به‌روز (تا ۲۰۲۶-۰۷-۰۸) و نکات فنی

### الف) مدل‌های STT اوپن‌ای‌آی (OpenAI)
Endpoint: `POST https://api.openai.com/v1/audio/transcriptions` (multipart/form-data، فیلد `file` + `model`).
پشتیبانی از `stream: true` برای استریم پاسخ (رویدادهای `transcript.text.delta`).

| مدل | کیفیت/هزینه | توضیح |
|---|---|---|
| `gpt-4o-mini-transcribe` | ~$0.003/دقیقه | **پیش‌فرض پیشنهادی** — ارزان، کیفیت خوب |
| `gpt-4o-transcribe` | ~$0.006/دقیقه | کیفیت بالاتر |
| `whisper-1` | legacy | فقط برای سازگاری قدیمی |

فرمت‌های صوتی پذیرفته‌شده: mp3, mp4, mpeg, mpga, m4a, wav, **webm** ✅ (پس خروجی مستقیم MediaRecorder کروم کار می‌کند).

### ب) مدل‌های Gemini (گوگل)
تبدیل گفتار به متن در Gemini از طریق endpoint عمومی `generateContent` با ورودی صوتی انجام می‌شود (نه یک endpoint اختصاصی STT).
مدل‌های فعلی مناسب (از ارزان به گران):

| مدل | توضیح |
|---|---|
| `gemini-2.5-flash-lite` | **پیش‌فرض پیشنهادی** — سریع‌ترین و مقرون‌به‌صرفه‌ترین |
| `gemini-2.5-flash` | بهترین تعادل قیمت/کیفیت |
| `gemini-3.1-flash-lite` | نسل جدیدتر، frontier-class ارزان |
| `gemini-3.5-flash` | جدیدترین و باکیفیت‌ترین flash |

قیمت صوت روی `gemini-2.5-flash`: هر ثانیه صوت = ۳۲ توکن ورودی؛ ورودی صوتی ~$1.00/1M توکن.

**⚠️ نکته‌ی حیاتی فنی:** فرمت‌های صوتی پذیرفته‌شده‌ی Gemini: `wav, mp3, aiff, aac, ogg, flac` — **webm پشتیبانی نمی‌شود!**
چون MediaRecorder کروم به‌طور پیش‌فرض `audio/webm;codecs=opus` تولید می‌کند، برای Gemini نمی‌توان خروجی خام MediaRecorder را
مستقیم فرستاد.

**تصمیم معماری برای موتور ابری:** به‌جای MediaRecorder، صوت را با `AudioContext` + `AudioWorklet` به‌صورت PCM خام
می‌گیریم و خودمان به **WAV (16kHz mono)** انکد می‌کنیم. WAV هم توسط OpenAI و هم Gemini پشتیبانی می‌شود، پس یک مسیر
واحد برای هر دو ارائه‌دهنده کار می‌کند و از مشکلات فرمت MediaRecorder کاملاً جلوگیری می‌شود.

### پ) کلیدهای API — امنیت
کلید API نباید داخل کد اکستنشن embed شود (هر کسی می‌تواند اکستنشن را باز کند و استخراج کند). کاربر باید کلید خودش را در
صفحه‌ی تنظیمات وارد کند و به‌صورت **`storage.local`** (نه `storage.sync`) ذخیره شود تا بین دستگاه‌ها sync نشود.
درخواست‌ها مستقیماً از offscreen document (client-side) به API ارائه‌دهنده می‌روند — هیچ سرور واسط از طرف ما نیست.

منابع:
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://ai.google.dev/gemini-api/docs/audio
- https://ai.google.dev/gemini-api/docs/models

### ت) باگ فیلدهای داخل Shadow DOM (یوتیوب، گوگل‌ترنسلیت) — علت و رفع
**علائم:** آیکن میکروفون روی فیلد جستجوی یوتیوب و ورودی گوگل‌ترنسلیت ظاهر نمی‌شد.
**علت:** این فیلدها داخل web componentهایی با shadow root هستند (مثل `<ytd-searchbox>`). وقتی رویداد `focusin` از داخل
shadow root به `document` می‌رسد، مرورگر `event.target` را به **shadow host** «بازهدف‌گذاری» (retarget) می‌کند، نه input
واقعی. کد ما `isEditableField(event.target)` را چک می‌کرد که روی host (که editable نیست) رد می‌شد.
**رفع:** استفاده از `event.composedPath()[0]` که همیشه عنصر واقعیِ منشأ رویداد را (قبل از retargeting) می‌دهد.
منبع: https://javascript.info/shadow-dom-events · https://pm.dartus.fr/posts/2021/shadow-dom-and-event-propagation/

---

## ۶) نکته‌ی حیاتی: Offscreen Document فقط `chrome.runtime` دارد — نه `chrome.storage`

**علامت (باگ فاز ۲):** بعد از افزودن نرمال‌سازی، کلیک روی آیکن باعث می‌شد وضعیت روی «در حال راه‌اندازی…» **برای همیشه
گیر کند**، بدون هیچ خطا و بدون هیچ نتیجه‌ای — دقیقاً شبیه باگ فاز ۱، ولی با علت کاملاً متفاوت.

**علت:** برای خواندن تنظیمات (punctuationCommands / persianDigits)، یک `getSettings()` (که `chrome.storage.local`
می‌خواند) در `startRecognition` داخل Offscreen Document اضافه شده بود. اما طبق طراحی عمدی کروم، **تنها API افزونه‌ای
که در Offscreen Document در دسترس است `chrome.runtime` است** — `chrome.storage` **در دسترس نیست** (تا توسعه‌دهنده‌ها
از offscreen به‌جای service worker سوءاستفاده نکنند). پس `getSettings()` در offscreen throw می‌کرد، کل
`startRecognition` قبل از `getUserMedia` می‌مرد، و چون با `void startRecognition(...)` صدا زده می‌شد، این rejection
هیچ‌جا هندل نمی‌شد و هیچ پیام error/ended به کلاینت نمی‌رفت → گیر ابدی.

**رفع:**
1. **معماری:** offscreen حق خواندن storage ندارد. background (که service worker است و storage دارد) تنظیمات لازم را
   می‌خواند و در **همان پیام `recognition:start`** به‌صورت یک آبجکت `config` به offscreen پاس می‌دهد
   (`OffscreenRunConfig` در [utils/messaging.ts](../utils/messaging.ts)). این الگو برای فاز ۲E (کلید API و مدل موتور
   ابری) هم استفاده می‌شود — offscreen هر چیزی از تنظیمات که لازم دارد را از background می‌گیرد، نه از storage.
2. **مقاوم‌سازی (دفاع در برابر تکرار):** کل بدنه‌ی `startRecognition` حالا در try/catch است؛ **هر** throw غیرمنتظره
   به یک `recognition:error` + `recognition:ended` تمیز تبدیل می‌شود. این تضمین می‌کند هیچ باگ آینده‌ای دیگر نمی‌تواند
   کلاینت را در حالت «راه‌اندازی» بی‌صدا گیر بیندازد — همیشه یا نتیجه یا خطای مشخص برمی‌گردد.

**درس کلی:** Offscreen Document یک محیط شدیداً محدود است (فقط `chrome.runtime`). هر داده‌ای که لازم دارد باید از طریق
پیام‌رسانی از service worker به آن برسد. `IndexedDB` و DOM APIها (مثل getUserMedia، AudioContext) در دسترس‌اند، ولی
`chrome.storage`, `chrome.tabs`, و بقیه‌ی APIهای افزونه‌ای نه.

منبع: https://developer.chrome.com/docs/extensions/reference/api/offscreen ·
https://groups.google.com/a/chromium.org/g/chromium-extensions/c/99aUpv85-8A

---

## ۷) باگ فوکوس: `Node.contains()` از مرز Shadow DOM رد نمی‌شود

**علامت:** کلیک روی آیکن باعث می‌شد «همه‌چیز ناپدید شود».
**علت:** در فاز ۲، `onFocusOut` با کمک `deepActiveElement()` عنصر واقعیِ فوکوس‌شده را (که هنگام کلیک روی آیکن، خودِ
دکمه‌ی آیکن داخل shadow root ماست) پیدا می‌کرد، بعد `ui.shadowHost.contains(active)` را چک می‌کرد. اما
`Node.contains()` **وارد shadow tree نمی‌شود** — پس برای دکمه‌ای که داخل shadow root است `false` برمی‌گرداند، و کد
اشتباهاً نتیجه می‌گرفت «فوکوس از UI ما خارج شده» و کل UI را پاک می‌کرد.
**رفع:** به‌جای `ui.shadowHost.contains(active)` از `ui.shadow.contains(active)` استفاده شد (خودِ ShadowRoot، که
عناصر داخل خودش را شامل می‌شود). منبع: https://developer.mozilla.org/en-US/docs/Web/API/Node/contains

---

## ۸) محدودیت‌های ذاتی مرورگر (نه باگ ما) — کجاها آیکن ظاهر نمی‌شود

اکستنشن‌ها به‌دلیل امنیت، **مجاز نیستند** روی این صفحات content script تزریق کنند؛ پس آیکن میکروفون آن‌جا ظاهر نمی‌شود
و این قابل‌رفع نیست:
- صفحات `chrome://` و `edge://` (از جمله **صفحه‌ی New Tab پیش‌فرض کروم** و کادر جستجوی آن).
- صفحه‌ی Chrome Web Store و برخی صفحات ویژه‌ی گوگل.
- فایل‌های `view-source:` و صفحات خطای مرورگر.
- `chrome-extension://` صفحات اکستنشن‌های دیگر.

**نکته:** روی `google.com` واقعی (یک صفحه‌ی وب عادی) آیکن کار می‌کند؛ فقط صفحه‌ی **New Tab** (که یک صفحه‌ی
`chrome://` است) استثناست. این را باید در توضیحات Chrome Web Store و راهنمای کاربر شفاف نوشت.
منبع: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns (بخش محدودیت‌های تزریق)
