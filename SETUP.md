# ShopERP — সেটআপ গাইড

কম্পিউটার, IT এক্সেসরিজ ও নেটওয়ার্কিং দোকানের জন্য POS ও শপ ম্যানেজমেন্ট সফটওয়্যার।
ডাটাবেস: **Google Sheets** · ব্যাকএন্ড API: **Google Apps Script** · ফ্রন্টএন্ড: **React (Vite)** · ডেস্কটপ: **Electron / Tauri**

```
shop-erp/
├── backend/
│   ├── Code.gs              ← Apps Script-এ এই একটা ফাইলই পেস্ট করবেন
│   ├── parts/               ← Code.gs-এর উৎস (অংশে ভাগ করা, পড়তে সুবিধা)
│   └── test/
│       ├── simulate.js      ← অফলাইন টেস্ট (152টা চেক)
│       └── server.js        ← লোকাল মক API সার্ভার (Google ছাড়া ট্রায়ালের জন্য)
├── frontend/                ← React অ্যাপ
│   ├── src/lib/             ← api.js, store.js, export.js, receipt.js
│   ├── src/components/      ← DataTable, Layout, widgets, PartyPage, ui
│   ├── src/pages/           ← প্রতিটা মেনুর পেজ
│   ├── desktop/main.cjs     ← Electron
│   └── src-tauri/           ← Tauri
└── SETUP.md
```

---

## ধাপ ১ — Google Sheet ও Apps Script ব্যাকএন্ড

1. [sheets.new](https://sheets.new) খুলে একটা নতুন খালি Google Sheet বানান। নাম দিন, যেমন `ShopERP Database`।
2. মেনু থেকে **Extensions → Apps Script** খুলুন।
3. ডিফল্ট `Code.gs`-এর ভেতরের সব লেখা মুছে দিন। তারপর `backend/Code.gs` ফাইলের পুরোটা কপি করে পেস্ট করুন। **Save** (Ctrl+S) চাপুন।
4. উপরের ফাংশন ড্রপডাউন থেকে `setupDatabase` বেছে **Run** চাপুন।
   - প্রথমবার Google অনুমতি চাইবে: **Review permissions → আপনার অ্যাকাউন্ট → Advanced → Go to (project name) → Allow**।
   - কাজ শেষ হলে Sheet-এ ২৬টা ট্যাব তৈরি হবে (Products, Sales, Accounts …), সাথে ডিফল্ট ক্যাটাগরি, ওয়ারেন্টি পিরিয়ড আর একটা Cash অ্যাকাউন্ট।
5. টাইমজোন ঠিক করুন: Apps Script-এ **Project Settings (⚙) → Time zone → (GMT+06:00) Dhaka**।
6. ডিপ্লয় করুন: **Deploy → New deployment → ⚙ Select type → Web app**
   - Description: `ShopERP API`
   - **Execute as: Me**
   - **Who has access: Anyone**
   - **Deploy** চাপুন, তারপর **Web app URL** কপি করুন (`https://script.google.com/macros/s/…/exec`)।

> **"Anyone" কেন?** ব্রাউজার/ডেস্কটপ অ্যাপ যেন Google লগইন ছাড়াই API-তে পৌঁছাতে পারে। নিরাপত্তা দেয় ShopERP-এর নিজস্ব লগইন: প্রতিটা রিকোয়েস্টে সেশন টোকেন আর রোল-ভিত্তিক পারমিশন চেক হয়। পাসওয়ার্ড SHA-256 + salt দিয়ে হ্যাশ করে রাখা হয়।

### কোড আপডেট করলে
**Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**। এভাবে করলে URL একই থাকে। নতুন deployment বানালে URL বদলে যাবে, তখন অ্যাপের Settings-এ নতুন URL দিতে হবে।

---

## ধাপ ২ — React অ্যাপ চালানো

দরকার: [Node.js 18+](https://nodejs.org) (LTS)।

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 এ খুলবে
```

1. প্রথম স্ক্রিনে **Apps Script Web App URL** পেস্ট করে **Test & save connection** চাপুন।
2. লগইন: **admin / admin123**
3. সাথে সাথে **Settings → My password** থেকে পাসওয়ার্ড বদলান।

### অনলাইনে হোস্ট করা (ওয়েব অ্যাপ)
```bash
npm run build        # dist/ ফোল্ডার তৈরি হবে
```
`dist/` ফোল্ডারটা যেকোনো স্ট্যাটিক হোস্টে আপলোড করুন: Netlify (ড্র্যাগ-এন্ড-ড্রপ), Vercel, Cloudflare Pages, GitHub Pages বা নিজের cPanel। HashRouter ব্যবহার করা হয়েছে, তাই আলাদা রিরাইট রুল লাগবে না।

### Google ছাড়া আগে ট্রায়াল দিতে চাইলে
```bash
node backend/test/server.js      # মক API: http://localhost:8787
```
অ্যাপে URL হিসেবে `http://localhost:8787` দিন। ডাটা শুধু মেমোরিতে থাকে, সার্ভার বন্ধ করলে মুছে যাবে।

---

## ধাপ ৩ — ডেস্কটপ অ্যাপ (.exe / .dmg)

### Electron দিয়ে (সহজ)
```bash
cd frontend
npm install --save-dev electron electron-builder
npm run desktop          # টেস্ট রান
npm run desktop:build    # release/ ফোল্ডারে ইনস্টলার
```
- Windows `.exe` বানাতে Windows পিসিতে চালান। macOS `.dmg` বানাতে Mac-এ চালান।

### Tauri দিয়ে (ছোট ইনস্টলার, ~১০ MB)
দরকার: [Rust](https://rustup.rs) + [Tauri prerequisites](https://tauri.app/start/prerequisites/)।
```bash
cd frontend
npm install --save-dev @tauri-apps/cli@2
npx tauri icon path/to/logo.png   # src-tauri/icons তৈরি করবে
npx tauri build                   # src-tauri/target/release/bundle/ এ ইনস্টলার
```

### মোবাইল
আলাদা অ্যাপ লাগবে না। ওয়েব অ্যাপটা মোবাইলের জন্য রেসপন্সিভ। ফোনের Chrome-এ খুলে **Add to Home screen** করে নিলে অ্যাপের মতো চলবে।

---

## ধাপ ৪ — প্রথম দিনের কনফিগারেশন

| কোথায় | কী করবেন |
|---|---|
| **Settings → Shop & receipts** | দোকানের নাম, ফোন, ঠিকানা, রিসিপ্ট ফুটার, প্রিন্টার সাইজ (58/80mm), খরচের ক্যাটাগরি |
| **Cash, bank & MFS** | Cash অ্যাকাউন্টের ওপেনিং ব্যালেন্স দিন। bKash, Nagad, Rocket, AB Bank, Islami Bank ইত্যাদি অ্যাকাউন্ট যোগ করুন |
| **Products & stock → Categories, brands & warranty** | ব্র্যান্ড যোগ করুন, প্রয়োজনে ক্যাটাগরি বা ওয়ারেন্টি পিরিয়ড বদলান |
| **Products & stock → Add product** | Unit বেছে নিন: pcs, অথবা ক্যাবলের জন্য meter/feet। ওয়ারেন্টি থাকলে Serial-based বা Invoice-based বেছে নিন |
| **Purchases → New purchase** | স্টক ঢোকান। Serial-based পণ্যের প্রতিটা সিরিয়াল স্ক্যান করুন |
| **Customers / Suppliers** | পুরনো বাকি থাকলে Opening balance দিন |
| **Users & roles** | স্টাফ অ্যাকাউন্ট খুলুন। Manager ও Sales staff কী দেখতে বা করতে পারবে, টিক দিয়ে ঠিক করুন |
| **Settings → SMS gateway** | API URL, API key, Sender ID দিন → Save → Send test |

### SMS গেটওয়ে
- GET ও POST (form/JSON) দুই ধরনের API চলে। URL বা body-তে এই placeholder বসান: `{api_key}` `{sender_id}` `{number}` `{message}`।
- মেসেজ টেমপ্লেটে বসানো যায়: `{name}` `{shop}` `{items}` `{invoice}` `{total}` `{paid}` `{due}` `{date}`।
- SMS শুধু তখনই যায় যখন বিক্রিতে নামসহ কাস্টমার যুক্ত থাকে। Walk-in বিক্রিতে কখনো SMS যায় না।
- বাইরের URL-এ কল করার অনুমতি (SMS-এর জন্য) ধাপ ১-এ `setupDatabase` চালানোর সময়ই দেওয়া হয়ে যায়।

---

## কীবোর্ড শর্টকাট

| শর্টকাট | কাজ |
|---|---|
| `Alt+1` … `Alt+9` | মেনুর পেজে যাওয়া (Dashboard, POS, Sales, Customers, Stock, Purchases, Warranty, History, Reports) |
| `F2` | POS-এ প্রোডাক্ট সার্চ / বারকোড |
| `F4` | কাস্টমার সার্চ |
| `F8` | ডিসকাউন্ট |
| `F9` | বিক্রি সম্পন্ন |
| `F10` | বিক্রি সম্পন্ন + রিসিপ্ট প্রিন্ট |
| `Ctrl+Del` | কার্ট খালি করা |

USB বারকোড স্ক্যানার কীবোর্ডের মতো কাজ করে: স্ক্যান করলে কোড টাইপ হয়ে Enter পড়ে, আর পণ্যটা সরাসরি কার্টে চলে যায়।

---

## কীভাবে কাজ করে (সংক্ষেপে)

- **ব্যালেন্স সবসময় হিসাব করে বের হয়, কোথাও আলাদা করে লেখা থাকে না।** প্রতিটা বিক্রি, ক্রয়, খরচ, রিটার্ন বা পেমেন্ট `AccountTxns`, `CustomerLedger` বা `SupplierLedger`-এ একটা লাইন যোগ করে। ব্যালেন্স = ওপেনিং + সব লাইনের যোগফল। তাই হিসাব কখনো "অমিল" হয় না।
- **Cancel / Reverse:** লেনদেন মুছে ফেলা হয় না। এর লেজার লাইনগুলো `voided` চিহ্নিত হয়, স্টক আর সিরিয়ালের অবস্থা আগের মতো ফিরে যায়, আর রেকর্ডটা `cancelled` হিসেবে থেকে যায়। এর জন্য অ্যাডমিন পাসওয়ার্ড লাগে।
  - নিরাপত্তা চেক: যে ইনভয়েসে রিটার্ন আছে সেটা আগে রিটার্ন ক্যান্সেল না করে ক্যান্সেল করা যায় না। যে পারচেজের মাল বিক্রি হয়ে গেছে সেটাও ক্যান্সেল হয় না।
- **সিরিয়াল ট্র্যাকিং:** `SerialItems` শিটে প্রতিটা সিরিয়ালের অবস্থা থাকে (in_stock / sold / returned_supplier)। `ItemEvents` শিটে প্রতিটা ঘটনার টাইমলাইন থাকে, আর Item History Explorer সেটাই দেখায়।
- **মিটার/ফিট:** স্টক দশমিকে রাখা হয় (যেমন 584.5 m)। 305m রোল কিনে 12.5m করে বিক্রি করা যায়।
- **খরচের হিসাব:** নন-সিরিয়াল পণ্যে weighted-average cost, সিরিয়াল পণ্যে প্রতিটা ইউনিটের আসল ক্রয়মূল্য ধরা হয়।
- **একসাথে অনেকে কাজ করলে:** প্রতিটা write অপারেশন `LockService` দিয়ে লক করা থাকে, তাই দুই কাউন্টার থেকে একসাথে বিক্রি হলেও স্টক ভুল হয় না।

### API এন্ডপয়েন্ট
সব রিকোয়েস্ট `POST` হয়, body হলো `{ "action": "...", "token": "...", "payload": {...} }`। Content-Type `text/plain` রাখা হয় যাতে CORS preflight না লাগে।

| গ্রুপ | action |
|---|---|
| Auth | `login` `logout` `password.change` `bootstrap` `ping` |
| Products | `products.list` `product.save` `product.delete` `stock.adjust` `serials.list` `master.save` `master.delete` |
| Sales | `sale.create` `sale.detail` `sales.list` `sreturn.create` `sreturns.list` |
| Purchase | `purchase.create` `purchase.detail` `purchases.list` `preturn.create` `preturns.list` |
| Parties | `customers.list` `customer.save` `customer.quickAdd` `customer.statement` `customer.payment` `suppliers.list` `supplier.save` `supplier.statement` `supplier.payment` |
| Money | `accounts.list` `account.save` `account.entry` `account.ledger` `expense.create` `expenses.list` |
| Control | `reverse` (sale / purchase / sreturn / preturn / cpay / spay / expense) |
| Warranty | `warranty.lookup` `claim.create` `claim.update` `claims.list` `history` |
| Reports | `dashboard` `reports` (sales, purchases, sales_returns, purchase_returns, daily_summary, payment_methods, product_sales, expenses, warranty) |
| Admin | `users.list` `user.save` `rolePerms.save` `settings.get` `settings.save` `sms.test` `sms.log` |

---

## সীমাবদ্ধতা ও পরামর্শ

- Google Sheets ছোট-মাঝারি দোকানের জন্য যথেষ্ট, মোটামুটি **৫০,০০০–১,০০,০০০ ইনভয়েস** পর্যন্ত ভালো চলে। প্রতিটা রিকোয়েস্ট ১–৩ সেকেন্ড নিতে পারে, এটা Apps Script-এর স্বাভাবিক গতি।
- বছর শেষে Sheet-এর একটা কপি রেখে দিন (**File → Make a copy**)। এটাই সবচেয়ে সহজ ব্যাকআপ।
- Sheet-এ হাতে ডাটা এডিট করবেন না। বিশেষ করে `id` কলাম বা লেজার শিট বদলালে হিসাব গোলমাল হতে পারে।
- অ্যাডমিন পাসওয়ার্ড ভুলে গেলে Sheet খুলে **ShopERP → Reset admin password** চাপুন। পাসওয়ার্ড `admin123` হয়ে যাবে।
- Apps Script-এর দৈনিক কোটা আছে (যেমন বাইরের URL কল, যা SMS-এ লাগে)। সাধারণ দোকানের জন্য যথেষ্ট, তবে বিস্তারিত দেখে নিন: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)।

## টেস্ট
```bash
node backend/test/simulate.js      # পুরো ব্যবসায়িক ফ্লো: 152টা চেক
```
এতে যা যা পরীক্ষা হয়: ক্রয়, বিক্রি (সিরিয়াল, মিটার, বাকি), SMS শুধু নামসহ কাস্টমারে যাওয়া, রিটার্ন/এক্সচেঞ্জ, প্রতিটা ক্যান্সেলের পর স্টক-ব্যালেন্স-লেজার হুবহু আগের অবস্থায় ফেরা, ওয়ারেন্টি লাইফসাইকেল, রিপোর্ট আর রোল পারমিশন।
