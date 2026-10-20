# Undiruv tizimi: loyiha rejasi

Qarzdorlik undiruvini boshqarish uchun veb-tizim. U ikki qismdan iborat:

- **Xodim paneli** (undiruvchi yoki operator): unga biriktirilgan qarzdorlar, kunlik vazifalar, qo'ng'iroqlar, to'lov va'dalari.
- **Admin panel** (rahbariyat): portfel holati, KPI, xodimlar samaradorligi, ishlarni taqsimlash, hisobotlar.

> Eslatma: talablar bosqichma-bosqich texnik vazifalar sifatida keladi. Reja ular asosida yangilanib boradi.

---

## 1. Rollar

| Rol | Vakolatlari |
|---|---|
| Super admin | Tizim sozlamalari, foydalanuvchilar, rollar, ma'lumotnomalar |
| Rahbar | Barcha ma'lumotni ko'rish, hisobotlar, ishlarni qayta taqsimlash, rejalar |
| Bo'lim boshlig'i | O'z bo'limi xodimlari va ishlari, taqsimlash |
| Xodim (undiruvchi) | Faqat o'ziga biriktirilgan ishlar: qo'ng'iroq, tashrif, izoh, va'da |
| Yurist | Sud va MIB bosqichidagi ishlar, hujjatlar |

## 2. Asosiy modullar

1. **Avtorizatsiya**: login/parol, rollar va huquqlar (RBAC), sessiyalar, harakatlar jurnali (audit log).
2. **Qarzdorlar va shartnomalar**: qarzdor kartasi (F.I.Sh., JShShIR, telefonlar, manzil), shartnoma, qarz tarkibi (asosiy qarz, foiz, penya), muddati o'tgan kunlar (DPD).
3. **Ma'lumot importi**: Excel/CSV orqali portfel yuklash, keyinchalik API orqali integratsiya.
4. **Ishlarni taqsimlash**: qo'lda va avtomatik (DPD, summa, hudud bo'yicha), qayta biriktirish tarixi.
5. **Undiruv jarayoni**: bosqichlar (Soft → Hard → Sudgacha → Sud → MIB → Yopilgan), harakatlar (qo'ng'iroq, SMS, tashrif, xat), natija kodlari, to'lov va'dalari va ularning nazorati.
6. **To'lovlar**: to'lovlarni kiritish/import qilish, qarzga avtomatik bog'lash, qoldiqni qayta hisoblash.
7. **Vazifalar va eslatmalar**: kunlik ish ro'yxati, muddati o'tgan va'dalar, bildirishnomalar.
8. **Hujjatlar**: shablon asosida ogohlantirish xati, da'vo arizasi (DOCX/PDF generatsiya).
9. **Dashboard va hisobotlar**: portfel, undiruv darajasi, reja va fakt, xodimlar reytingi, Excel eksport.
10. **Sozlamalar**: ma'lumotnomalar (bosqichlar, natija kodlari, hududlar), oylik rejalar.

## 3. Texnologiyalar (taklif)

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Frontend | React + TypeScript + Vite, TanStack Query, Tailwind | Tez, tipli, katta jamoaga qulay |
| Backend | Node.js (NestJS) + TypeScript | Modulli arxitektura, RBAC va validatsiya tayyor |
| Ma'lumotlar bazasi | PostgreSQL + Prisma ORM | Ishonchli tranzaksiyalar, migratsiyalar |
| Navbat/kesh | Redis (BullMQ) | Import, hisobot va SMS uchun fon vazifalari |
| Fayllar | S3-mos saqlash (MinIO) | Hujjatlar va importlar |
| Deploy | Docker Compose, Nginx | Bitta serverda oson ishga tushadi |

*Agar jamoangizda boshqa stek (masalan Laravel yoki Django) odat bo'lsa, unga moslashamiz.*

## 4. Bosqichlar (yo'l xaritasi)

| # | Bosqich | Natija |
|---|---|---|
| 0 | **Maketlar va reja** (hozirgi) | Dizayn yo'nalishi tanlanadi |
| 1 | Loyiha poydevori | Monorepo, Docker, DB sxemasi, CI, kod standartlari |
| 2 | Avtorizatsiya va rollar | Login, RBAC, foydalanuvchilarni boshqarish, audit log |
| 3 | Qarzdorlar va import | Qarzdor/shartnoma CRUD, Excel import, qidiruv va filtrlar |
| 4 | Taqsimlash | Ishlarni xodimlarga biriktirish (qo'lda va avtomatik) |
| 5 | Xodim paneli | Kunlik vazifalar, qarzdor kartasi, harakatlar, va'dalar |
| 6 | To'lovlar | Kiritish/import, qoldiqni qayta hisoblash, va'da nazorati |
| 7 | Admin dashboard | KPI, grafiklar, xodimlar reytingi, reja va fakt |
| 8 | Hisobotlar va hujjatlar | Excel eksport, xat/da'vo shablonlari |
| 9 | Integratsiyalar | SMS-shlyuz, IP-telefoniya, tashqi API |
| 10 | Test va ishga tushirish | Avtotestlar, yuklama testi, server, zaxira nusxa |

## 5. Ma'lumotlar modeli (dastlabki)

```
User(id, fio, login, role, department_id, active)
Department(id, name, head_id)
Debtor(id, fio, pinfl, birth_date, phones[], address, region)
Contract(id, debtor_id, number, date, principal, interest, penalty, dpd, stage, assignee_id)
Action(id, contract_id, user_id, type[call|sms|visit|letter], result_code, comment, created_at)
Promise(id, contract_id, user_id, amount, due_date, status[pending|kept|broken])
Payment(id, contract_id, amount, paid_at, source)
Assignment(id, contract_id, from_user, to_user, reason, created_at)
Plan(id, user_id, month, amount)
AuditLog(id, user_id, entity, entity_id, action, diff, created_at)
```

## 6. Maketlar

`maketlar.html` faylida uchta dizayn varianti bor. Har birida ikki ekran: **Xodim paneli** va **Rahbariyat paneli**.

- **A, Klassik**: oq fon, to'q ko'k yon menyu. Rasmiy, bank uslubi.
- **B, Tungi**: qorong'i analitik interfeys, ixcham ikonali menyu. Uzoq ish kuni uchun.
- **C, Ixcham**: yuqori menyu, iliq ranglar, katta kartochkalar. Zamonaviy SaaS uslubi.

Qo'shimcha ekran: **Xodim, mijozlar jadvali**. Google Sheets uslubidagi jadval:

- ustun harflari va qator raqamlari, `F5` kabi nom maydoni va `fx` qatori;
- katakni tanlash, strelkalar bilan yurish, Enter yoki ikki marta bosib tahrirlash, yozganda darhol tahrirlash;
- Bosqich va Natija ustunlari rangli ochiluvchi ro'yxat;
- DPD bo'yicha shartli rang berish, ustun bo'yicha saralash, pastda varaq-filtrlar va jami summa;
- tizim ustunlari (shartnoma, qarz, DPD) 🔒 bilan qulflangan, xodim ularni o'zgartira olmaydi;
- o'zgarishlar avtomatik saqlanadi (haqiqiy tizimda serverga yoziladi, audit logga tushadi).

Bitta variantni tanlang (yoki ulardan elementlarni aralashtiring). Keyin 1-bosqichga o'tamiz.
