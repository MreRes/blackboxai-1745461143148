# Financial WhatsApp Bot Assistant

Asisten keuangan berbasis WhatsApp dengan antarmuka web untuk mencatat, mengatur, dan menganalisis keuangan pribadi. Bot ini menggunakan NLP (Natural Language Processing) tingkat lanjut untuk memahami perintah dalam Bahasa Indonesia, baik formal maupun informal.

## 🌟 Fitur Utama

### WhatsApp Bot
- 🤖 Bot pintar dengan pemahaman bahasa alami (NLP)
- 💬 Mendukung bahasa formal, informal, dan slang Indonesia
- 📝 Pencatatan transaksi melalui chat
- 💰 Cek saldo dan budget
- 📊 Laporan keuangan langsung di WhatsApp
- 🔐 Sistem aktivasi dan manajemen multi-perangkat

### Antarmuka Web
- 📱 Tampilan responsif dan modern
- 📈 Dashboard dengan visualisasi data
- 📋 Manajemen transaksi lengkap
- 💼 Pengaturan budget per kategori
- 📑 Laporan detail dan analisis

### Keamanan
- 🔒 Sistem autentikasi dengan JWT
- 📱 Verifikasi perangkat
- ⏰ Manajemen masa aktif
- 👥 Pembatasan jumlah perangkat
- 🔄 Backup dan restore data

## 🛠️ Teknologi

- **Backend**: Node.js, Express
- **Database**: MongoDB
- **WhatsApp**: whatsapp-web.js
- **NLP**: node-nlp
- **Frontend**: HTML, Tailwind CSS, JavaScript
- **Keamanan**: JWT, bcrypt, helmet

## 📋 Prasyarat

- Node.js (v14 atau lebih baru)
- MongoDB
- WhatsApp yang terhubung ke internet
- Git

## 🚀 Instalasi

1. Clone repositori
```bash
git clone https://github.com/username/financial-whatsapp-bot.git
cd financial-whatsapp-bot
```

2. Install dependensi
```bash
npm install
```

3. Salin file konfigurasi
```bash
cp .env.example .env
```

4. Sesuaikan konfigurasi di file `.env`

5. Jalankan aplikasi
```bash
# Mode development
npm run dev

# Mode production
npm start
```

## 🤖 Penggunaan Bot

### Aktivasi
1. Dapatkan kode aktivasi dari admin
2. Kirim pesan ke bot: `aktivasi KODE_AKTIVASI`
3. Tunggu konfirmasi aktivasi

### Contoh Perintah
```
# Catat Pengeluaran
keluar 50rb makan
bayar 100k parkir
-50000 bensin

# Catat Pemasukan
masuk 2jt gaji
dapat 500rb bonus
+1500000 proyek

# Cek Budget
budget makan
sisa budget transport

# Lihat Laporan
laporan hari ini
laporan minggu ini
laporan bulan ini
```

## 👨‍💻 Pengembangan

### Struktur Proyek
```
financial-whatsapp-bot/
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   └── server.js
├── frontend/
│   ├── js/
│   ├── public/
│   └── *.html
├── whatsapp-bot/
│   ├── handlers/
│   └── nlp/
└── package.json
```

### Skrip NPM
```bash
# Development dengan hot-reload
npm run dev

# Production
npm start

# Test
npm test

# Backup database
npm run backup

# Restore database
npm run restore

# Generate dokumentasi
npm run generate-docs
```

## 🔒 Keamanan

- Semua password di-hash menggunakan bcrypt
- Kode aktivasi menggunakan hashing
- Rate limiting untuk mencegah spam
- Validasi input ketat
- Sanitasi data untuk mencegah injeksi
- Headers keamanan dengan helmet
- CORS yang dikonfigurasi dengan aman

## 📝 API Endpoints

### Autentikasi
- `POST /api/auth/login` - Login user
- `POST /api/auth/activate` - Aktivasi akun

### Transaksi
- `GET /api/transactions` - Daftar transaksi
- `POST /api/transactions` - Tambah transaksi
- `PUT /api/transactions/:id` - Update transaksi
- `DELETE /api/transactions/:id` - Hapus transaksi

### Budget
- `GET /api/budget` - Daftar budget
- `POST /api/budget` - Tambah budget
- `PUT /api/budget/:id` - Update budget

### Laporan
- `GET /api/reports/daily` - Laporan harian
- `GET /api/reports/weekly` - Laporan mingguan
- `GET /api/reports/monthly` - Laporan bulanan

### WhatsApp
- `POST /api/whatsapp/webhook` - Webhook WhatsApp
- `GET /api/whatsapp/status` - Status bot

### Admin
- `GET /api/admin/users` - Daftar user
- `POST /api/admin/users` - Tambah user
- `POST /api/admin/backup` - Backup database
- `POST /api/admin/restore` - Restore database

## 🤝 Kontribusi

Kontribusi selalu diterima! Silakan buat pull request atau issue untuk perbaikan dan saran.

1. Fork repositori
2. Buat branch fitur (`git checkout -b fitur/AmazingFeature`)
3. Commit perubahan (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin fitur/AmazingFeature`)
5. Buat Pull Request

## 📄 Lisensi

Didistribusikan di bawah Lisensi MIT. Lihat `LICENSE` untuk informasi lebih lanjut.

## 📞 Kontak

Your Name - [@yourtwitter](https://twitter.com/yourtwitter) - email@example.com

Project Link: [https://github.com/username/financial-whatsapp-bot](https://github.com/username/financial-whatsapp-bot)

## 🙏 Pengakuan

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- [node-nlp](https://github.com/axa-group/nlp.js)
- [Tailwind CSS](https://tailwindcss.com)
- [Express](https://expressjs.com)
- [MongoDB](https://www.mongodb.com)
