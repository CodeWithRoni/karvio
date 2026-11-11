# Karvio 1.2.0 — আপলোড ও ব্যবহার

মালিকের অনুমোদনের পরে বাকি সমস্যার সংশোধন backend Version 42-এ একই ওয়েব অ্যাপ ঠিকানায় deploy করা হয়েছে; এই ফাইলগুলো অনুমোদিত main publication-এর অংশ। Native installer আলাদাভাবে প্রকাশ করতে হবে। বর্তমান নির্দেশনা Karvio 1.2.0-এর জন্য; FIXES-1.0.6.md শুধু পুরোনো release-এর ইতিহাস।

এই প্যাকেজে সংশোধিত source code, তৈরি করা web build, Google Apps Script backend, offline Electron desktop runtime, icons ও পরীক্ষার ফাইল আছে। প্যাকেজ থেকে কোনো customer data, local database, backup বা login session দেওয়া হয়নি।

## আগে backend, তারপর website

১. নিজের Google Sheet-এর একটি backup রাখুন। এটি আপগ্রেডের আগে আপনার হাতে করা backup; প্যাকেজে আপনার ডেটা নেই।

২. বর্তমান Apps Script project-এ শুধু `backend/Code.gs`-এর পুরো লেখা বসিয়ে Save করুন। পুরোনো database reset বা admin password reset করবেন না। বিদ্যমান Sheet ও deployment ব্যবহার করুন।

৩. **Deploy → Manage deployments → বর্তমান Web app-এর Edit → New version → Deploy** করুন। একই deployment ব্যবহার করলে URL একই থাকবে। অতিরিক্ত কলাম শেষে যোগ হয়; পুরোনো কলামের ক্রম বদলানোর প্রয়োজন নেই।

৪. এরপর এই ফোল্ডারের source ফাইলগুলো আপনার GitHub repository-তে বসান। `.github/workflows`, `frontend`, `backend` এবং root documentation রাখুন। ZIP ফাইলটিকে repository-তে একমাত্র ফাইল হিসেবে আপলোড করলে website তৈরি হবে না—ZIP খুলে তার ভেতরের project files বসাতে হবে।

৫. GitHub Actions-এর বিদ্যমান Pages workflow চালু থাকলে main branch আপডেটের পর পরীক্ষা ও build করে প্রকাশ করবে। এই প্রস্তুতির সময় কোনো GitHub push, deployment বা Google Sheet update করা হয়নি।

৬. website reload করে নতুন করে sign in করুন। নিরাপত্তার কারণে পুরোনো session আর গ্রহণ করা হয় না। Settings → API connection থেকে প্রয়োজন হলে নিজের Web app URL দিন। Login/Settings-এর API configuration এবং `VITE_API_URL` আগের মতো কাজ করে।

**ক্রমটি জরুরি:** 1.2.0-এর সংশোধিত backend আগে প্রকাশ করুন, তারপর frontend। নতুন frontend পুরোনো backend চিনে unsafe automatic write retry বন্ধ রাখে, কিন্তু নতুন হিসাব ও recovery সুবিধা পেতে দুটোই আপডেট করতে হবে।

## অন্য static hosting-এ সরাসরি web build

`frontend/dist/`-এর ভেতরের সব ফাইল আপনার static hosting-এর web root-এ বসাতে পারেন। `assets/`-সহ পুরো build দিতে হবে। এটি online edition; Google Apps Script API-এর সংযোগ প্রয়োজন।

নিজের API ঠিকানা build-এর সময় দিতে চাইলে `.env.example` দেখে local `.env.local` তৈরি করুন এবং নতুন build করুন। আসল `.env.local` বা credentials GitHub-এ দেবেন না।

## লোকালে চালানো ও পরীক্ষা

Node.js 22.12 বা পরের সংস্করণ ব্যবহার করুন। Terminal-এ `frontend` ফোল্ডারে:

```sh
npm ci
npm test
npm run build
npm run dev
```

সম্পূর্ণ browser regression চালাতে Microsoft Edge থাকা প্রয়োজন:

```sh
npm run test:e2e
```

পরীক্ষাগুলো local in-memory server বা আলাদা temporary directory ব্যবহার করে। Production Google Sheet-এ test transaction পাঠানো হয় না।

## সম্পূর্ণ অফলাইন ডেস্কটপ

`frontend` ফোল্ডারে:

```sh
npm run desktop
```

এটি default-এ offline mode চালায়। Internet/API ব্যবহার করে না। নতুন কম্পিউটারে নতুন স্থানীয় database হয়; প্রাথমিক login `admin` / `admin123`। লগইনের পর password বদলান।

Offline ডেটা থাকে **Karvio Offline** folder-এ (Windows-এ `%APPDATA%\Karvio Offline`)। আগের `ShopERP Offline` folder থাকলে নতুন Karvio প্রথমবার চালু হওয়ার সময় সেটা নিজে থেকেই `Karvio Offline` নামে সরিয়ে নেয় — কোনো ডেটা মুছে না। পুরোনো অ্যাপ বন্ধ করে নতুন desktop version চালান। আপনার পুরোনো desktop shortcut এই project folder-এ স্বয়ংক্রিয়ভাবে বদলে দেওয়া হয়নি।

Settings → Offline data & backup থেকে backup save/restore করা যায়। পুরোনো offline backup-এর append-only schema upgrade সমর্থিত। Offline mode-এ SMS ও online customer invoice sharing উপলব্ধ নয়। নতুন offline database এবং online Google Sheet-এর মধ্যে স্বয়ংক্রিয় synchronization নেই।

Online desktop mode আলাদাভাবে চালাতে:

```sh
npm run desktop:online
```

এটি পৃথক `Karvio Online` profile ব্যবহার করে; offline records সরায় বা একত্র করে না।

Windows installer/portable, Mac DMG এবং Linux DEB-এর build commands package.json-এ আছে। উদাহরণ:

```sh
npm run desktop:build:win
npm run offline:build
npm run desktop:build:mac
npm run desktop:build:linux
```

প্যাকেজটি source ও web build; আগে থেকে তৈরি সব OS-এর installer নয়। Mac build-এর জন্য Mac ও iOS signing-এর জন্য Apple-এর প্রয়োজনীয় setup লাগে।

## Android, iOS ও Tauri

Android/iOS এবং Tauri edition অনলাইন API ব্যবহার করে। Electron-এর local database এই edition-গুলোর অংশ নয়।

```sh
npm run android:prepare
npm run ios:prepare
npm run tauri:build
```

Android-এর জন্য Android Studio/JDK/SDK, iOS-এর জন্য macOS/Xcode এবং Tauri-এর জন্য Rust/platform build tools প্রয়োজন। Native icon copying Windows/space/Bengali path-এর জন্য ঠিক করা হয়েছে। শুধু source update থেকে স্বয়ংক্রিয়ভাবে signed APK/IPA/DMG হয়ে যায় না।

## হিসাব ও recovery সম্পর্কে

- নতুন purchase discount inventory cost-এ বণ্টন হয়; পুরোনো লেনদেনের historically booked cost নীরবে বদলানো হয় না।
- পরে stock বিক্রি/পুনরায় কেনা/পরিবর্তিত হয়ে থাকলে যে cancellation অবশিষ্ট হিসাব অসংগত করবে, সেটি আগে dependent transaction reverse করতে বলে।
- API-র প্রতিটি write request-এর আলাদা ID থাকে। একই request retry হলে আগের result ফেরত আসে।
- Apps Script-এ private transaction journal ও request receipt sheet স্বয়ংক্রিয়ভাবে তৈরি হয়। এগুলো manually delete/edit করবেন না। মাঝপথে লেখা থামলে পরের API request lock নিয়ে recovery শেষ করে।
- Financial commit-এর পরে SMS হয়। Sale saved কিন্তু SMS নিশ্চিত না হলে log/gateway পরীক্ষা করুন; একই sale আবার বানাবেন না।
- Google Sheet-এ সরাসরি manual edit করলে API lock/journal তার সঙ্গে সমন্বয় করতে পারে না। দৈনন্দিন transaction অ্যাপ দিয়ে লিখুন।

বর্তমান সংশোধন `FIXES-REVIEW.md` এবং পরীক্ষার ফল `VERIFICATION.md`-এ আছে।
