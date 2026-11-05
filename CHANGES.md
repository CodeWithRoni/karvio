# ShopERP 1.0.2

## Product groups ও categories

- চারটি আলাদা কার্ড: Product groups, Categories, Brands, Warranty periods। Product groups-এ PROCESSOR-এর মতো গ্রুপ তৈরি করুন। Categories-এ গ্রুপ বেছে INTEL বা AMD যোগ করুন।
- গ্রুপ বাছাই ছাড়া category তৈরি করা যায় না। একই গ্রুপে একই category নাম দ্বিতীয়বার যোগ করা যায় না; আলাদা গ্রুপে একই নাম ব্যবহার করা যায়।
- আগে রাখা main category এখন Product group হিসেবে এবং তার sub-category এখন Category হিসেবে দেখা যায়। বিদ্যমান ID, পণ্যের সম্পর্ক ও stock history বদলায় না; কোনো database reset প্রয়োজন নেই।
- Add product, stock filter ও export-এ Product group / Category নাম ব্যবহার করা হয়। PC builder-ও group অনুযায়ী পণ্য খুঁজে পায়।
- ব্যবহৃত group বা category মুছে ফেলা যায় না।

## আগের 1.0.1 সংশোধন

## সংশোধন

- ক্রয় করার আগে ও পরে স্টক ও গড় ক্রয়মূল্য সংরক্ষণ করা হয়। ক্রয় বাতিল করলে সেই মূল্যের পরিবর্তনও ফেরত আসে। একই পণ্য একাধিক লাইনে থাকলেও সঠিকভাবে ফেরত আসে।
- পরের বিক্রি, supplier return বা manual stock adjustment-এর ওপর নির্ভরশীল পুরোনো ক্রয় বাতিল করে লাভের হিসাব নষ্ট করা ঠেকানো হয়।
- পুরোনো PurchaseItems শিটে শেষের দিকে `valuation` কলাম যোগ হয়; আগের ডেটা মুছে ফেলা বা database reset করা লাগে না। পুরোনো ক্রয়ে snapshot না থাকলে স্টকের বর্তমান মূল্য থেকে ক্রয়ের মূল্য বাদ দিয়ে বাকি গড় মূল্য বের করা হয়।
- ড্যাশবোর্ড দৃশ্যমান থাকলে প্রতি ৩০ সেকেন্ডে এবং অ্যাপে ফিরে এলে আপডেট হয়। সাময়িক সংযোগ সমস্যা হলে আগের তথ্য রেখে সতর্কবার্তা দেখায়।
- লোকাল কপিতে অনুপস্থিত confirmation dialog যোগ করা হয়েছে। GitHub-এর পরের POS collection, delete button এবং অন্যান্য পরিবর্তনও কাজের কপিতে রাখা হয়েছে।
- বাংলা PDF-এ ব্রাউজারের বাংলা অক্ষর সাজানোর ব্যবস্থা ব্যবহার করা হয়; বড় রিপোর্টে একাধিক পৃষ্ঠা হয়। এই PDF-এ বাংলা অংশ ছবি হিসেবে থাকে। Latin রিপোর্টের text PDF আগের মতো থাকে।
- বাংলা/ইংরেজি ফন্ট অ্যাপের সঙ্গে থাকে। প্রিন্টের আগে বাংলা ফন্ট লোড হওয়া পর্যন্ত অপেক্ষা করা হয়।
- মোবাইল ফিল্টারের অস্বাভাবিক উচ্চতা ঠিক করা হয়েছে।
- Electron ও Tauri build dependency, platform build command এবং icon যোগ করা হয়েছে।

## চালানো

Frontend ফোল্ডারে:

সম্পূর্ণ web ও desktop development setup-এর জন্য Node.js 22.12 বা পরের সংস্করণ ব্যবহার করুন। GitHub Pages build-ও Node.js 22 ব্যবহার করে।

```sh
npm ci
npm run dev
```

Web build: `npm run build`। Windows installer: `npm run desktop:build:win`। Mac-এ DMG তৈরি করতে: `npm run desktop:build:mac`। এই Windows পিসিতে macOS installer চালিয়ে যাচাই করা হয়নি। Tauri বিকল্পটি Rust ও প্রয়োজনীয় Windows/macOS build tools চায়।

Electron packaging-এর নিয়ম: https://www.electron.build/v26/docs/nsis/
Tauri icon-এর নিয়ম: https://v2.tauri.app/develop/icons/

## পরীক্ষা

```sh
npm test
npm run test:e2e
npm run verify:live
```

অফলাইন পরীক্ষা: ১৫২টি পুরোনো + ১৮টি valuation + ২২টি product group/category check। ব্রাউজারের ৭টি পরীক্ষা: মূল স্ক্রিনগুলো, dashboard refresh ও error recovery, confirmation, বাংলা PDF/Excel ও দুই মাপের receipt document, মোবাইল, বড় বাংলা PDF এবং Group → Category → Product → Stock filter → PC builder। Browser test-এ Microsoft Edge ব্যবহার করা হয়।

সব fixture লেনদেন local in-memory mock server-এ চলে। Google Sheet-এ পরীক্ষার ক্রয়-বিক্রয় লেখা হয় না। SMS mock দিয়ে পরীক্ষা করা হয়েছে; বাস্তব SMS delivery এবং physical thermal printer আলাদাভাবে পরীক্ষা করতে হবে।

## Backend update ও rollback

নতুন Code.gs পুরোনো project-এ বসিয়ে **Manage deployments → Edit → New version → Deploy** করতে হবে; একই deployment রাখলে URL বদলায় না। `setupDatabase` পুনরায় চালানোর প্রয়োজন নেই। প্রয়োজনে Manage deployments থেকে আগের version বেছে rollback করা যায়। নতুন valuation কলাম রেখে দিতে হবে।

প্রথম কাজের কপি ERP 4 ফোল্ডারে; আগের ShopERP ফোল্ডারটি পরিবর্তন করা হয়নি।
