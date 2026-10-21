# HamrohNasiya Undiruv

Undiruv portfelini hisoblash va nazorat qilish tizimi. U ikki paneldan iborat:

- **Rahbariyat paneli** (admin): asosiy oyna, ma'lumot yuklash (Excel) va xodimlar.
- **Xodim paneli**: asosiy oyna (faqat o'z mijozlari bo'yicha) va mijozlar ro'yxati.

Rahbariyat panelidagi **Asosiy oyna** tepasida ikki tugma bor:

- **Xodimlar**: xodimlarning real vaqtdagi natijalari. **Bugungi holat** yoki **Umumiy holat** (tanlangan oy) ko'rsatiladi. Kartalarda gaplashilgan mijozlar soni va statuslar bo'yicha taqsimot chiqadi. Hisobot jadvalida xodim ismini bossangiz, pastda o'sha xodimning to'lov/chiqish va statuslar diagrammasi ochiladi. O'ng tomonda eng ko'p chiqishlar reytingi turadi. Statuslar xodim panelidan keladi (keyingi bosqich).
- **Undiruv**: portfel kartalari va to'lov diagrammalari.

Sahifalar server bilan doimiy ulanib turadi: fayl yuklansa, tahrirlansa yoki o'chirilsa, ochiq oynalar o'zi yangilanadi.

**Chiqish** deganda Q ustuni 0 ga tushgan, ya'ni 100% to'lab muddati o'tganlar ro'yxatidan chiqqan mijoz tushuniladi.

## Ishga tushirish

Node.js 20 yoki undan yangi versiyasi kerak.

```bash
npm install
npm run build   # interfeysni yig'adi (dist/)
npm start       # http://localhost:3000
```

Birinchi ochilishda 3 soniyalik kirish animatsiyasi chiqadi. Keyin **birinchi rahbar** yaratiladi: ism, familiya, login va parol kiritiladi. Keyingi xodimlarni rahbar **Xodimlar** bo'limida qo'shadi va ularga login, parol hamda rol beradi.

Ma'lumotlar `data/undiruv.db` (SQLite) faylida saqlanadi. Zaxira nusxa olish uchun shu faylni nusxalash yetarli.

| O'zgaruvchi | Vazifasi | Standart qiymat |
|---|---|---|
| `PORT` | Server porti | `3000` |
| `DB_FILE` | Ma'lumotlar bazasi fayli | `data/undiruv.db` |
| `JWT_SECRET` | Sessiya kaliti (berilmasa avtomatik yaratiladi) | — |
| `COOKIE_SECURE` | HTTPS orqali ishlaganda `1` qiling | — |
| `TZ_NAME` | Soat bo'yicha diagramma uchun vaqt zonasi | `Asia/Tashkent` |

Dasturlash rejimida ikkita terminal oching: `npm run dev:server` va `npm run dev:web` (http://localhost:5173). Testlar `npm test` bilan ishga tushadi.

## Excel shabloni

Birinchi varaq o'qiladi. 1-qator sarlavha, keyingi qatorlarning har biri bitta mijoz.

| Ustun | Ma'nosi |
|---|---|
| B | Shartnoma raqami: mijozni fayllar orasida shu raqam bo'yicha taniymiz |
| C | Mijoz |
| Q | Grafik bo'yicha to'lanmagan summa |
| R | Umumiy to'lanmagan summa (portfel) |
| X | Undiruvchi (xodim) |

X ustunida formula bo'lsa (masalan VLOOKUP), Excel saqlagan natija olinadi.

**Xodimga biriktirish.** X ustunidagi ismning birinchi ikki so'zi xodimning "Familiya Ism"iga mos kelsa, mijoz o'sha xodimga biriktiriladi. Masalan, `Zokirov Muhammadqodir Ulug'bek o'g'li` → Familiya: Zokirov, Ism: Muhammadqodir. Katta-kichik harf va apostrof turlari (‘ ’ ʻ ') farq qilmaydi. Yangi xodim keyinroq qo'shilsa ham, mijozlar unga darhol o'tadi.

## Hisob-kitob qanday ishlaydi

Har bir fayl ma'lum bir **oy** uchun yuklanadi va ikki turdan biri bo'ladi:

- **Oy boshi portfeli**: oyning boshlang'ich holati. "Avtomatik" tanlansa, oyning birinchi fayli shu tur bo'ladi.
- **Yangilash**: oy davomida yuklanadigan joriy holat.

Asosiy oynadagi kartalar:

| Karta | Hisobi |
|---|---|
| Oy boshiga portfel | Oy boshi faylidagi R ustuni yig'indisi |
| Mijozlar soni | Oy boshi faylidagi mijozlar soni |
| Joriy portfel | Oxirgi holatda Q > 0 bo'lgan mijozlarning R yig'indisi va ularning soni |
| Qaytgan portfel | Q ustuni 0 ga tushgan (100% to'langan) mijozlarning oy boshidagi R summasi |
| 100% to'lagan mijozlar | Shunday mijozlar soni |

**To'lov** deb ikki fayl orasida R ustunining kamayishi hisoblanadi. Vaqti esa keyingi fayl yuklangan vaqt olinadi. Diagrammalar (kun, oy va kun soati bo'yicha) shu to'lovlardan quriladi.

Oy boshi faylida bo'lib, keyingi yangilash faylida yo'q shartnoma **100% to'langan** deb olinadi. Bunda to'lov summasi uning oxirgi Q qiymatiga teng bo'ladi.

**Ma'lumot yuklash** bo'limida yuklangan har bir faylni ochish, katakni tahrirlash (ikki marta bosish) va qatorni yoki butun faylni o'chirish mumkin. Har bir o'zgarishdan keyin hisob-kitob qaytadan bajariladi.
