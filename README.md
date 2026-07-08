# 🤖 Motion Core — Discord VIP License Bot

Bot Discord otomatis untuk penjualan lisensi VIP script Roblox.
Terintegrasi dengan **Pakasir** (QRIS) dan **Supabase**.

## ✨ Fitur

- 🛒 **Menu Order Interaktif** — Select menu + Modal input
- 💳 **QRIS Pembayaran** — Generate QRIS via Pakasir API
- 🔑 **Auto License Delivery** — Key dikirim otomatis ke DM Discord
- ⏱️ **Extend Otomatis** — User lama langsung diperpanjang masa aktif
- 🎭 **Privacy Safe** — Nama di-masking di testimonial (Mu•••••)
- 🏷️ **Auto Role** — Role VIP langsung ditambahkan setelah bayar
- 🧪 **Webhook Test** — `npm run test-webhook` untuk simulasi callback
- 🛡️ **Production Ready** — Graceful shutdown, IP whitelist, atomic DB

## 📦 Tech Stack

| Tech | Versi |
|------|-------|
| Node.js | ≥ 18 |
| Express | 4.x |
| Discord.js | 14.x (Components V2: Label, Radio, Checkbox, dll) |
| Supabase | 2.x |
| Pakasir | — |

## 🚀 Deploy ke Railway

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/motioncore-bot-discord
cd motioncore-bot-discord
npm install
cp .env.example .env
# Isi .env dengan credentials Anda
```

### 2. Environment Variables (wajib diisi)

| Variable | Deskripsi |
|----------|-----------|
| `DISCORD_TOKEN` | Bot token dari [Discord Developer Portal](https://discord.com/developers/applications) |
| `GUILD_ID` | ID Server Discord tempat bot |
| `VIP_ROLE_ID` | ID Role VIP yang akan diberikan |
| `SUPABASE_URL` | Project URL Supabase |
| `SUPABASE_KEY` | Service role key (dari Supabase dashboard → Settings → API) |
| `PAKASIR_SLUG` | Slug project Pakasir |
| `PAKASIR_API_KEY` | API Key Pakasir |
| `PAKASIR_IPS` | (Opsional) Whitelist IP Pakasir, pisah dengan koma |

**Opsional:**

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `PORT` | `3000` | Port webhook server |
| `NODE_ENV` | `development` | `production` untuk global slash command |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `TESTI_WEBHOOK_URL` | — | Discord webhook untuk notifikasi pembelian |

### 3. Deploy ke Railway

1. Push repo ke GitHub
2. Di Railway: **New Project** → **Deploy from GitHub repo**
3. Tambahkan semua environment variables di Railway dashboard
4. Railway otomatis detect `npm start` dan expose port
5. Set **Pakasir callback URL** → `https://your-app.railway.app/webhook/pakasir`

## 🧪 Testing Lokal

```bash
# Terminal 1 — Jalankan bot
npm start

# Terminal 2 — Kirim simulasi callback pembayaran
node test-webhook.js INV-1234567890
```

## 📁 Struktur File

```
motioncore-bot-discord/
├── index.js          # Main bot (Express + Discord.js)
├── test-webhook.js   # Testing tool
├── package.json
├── .env              # 🔒 Environment (jangan commit!)
├── .env.example      # Template env untuk GitHub
├── .gitignore
└── backup/           # Backup file original
```

## 🔒 Keamanan

- **IP Whitelist**: Hanya IP Pakasir yang bisa akses webhook endpoint
- **Atomic Claim**: Race condition dicegah dengan `UPDATE ... WHERE status='pending'`
- **Graceful Shutdown**: Discord client disconnect clean saat dimatikan
- **No Secrets in Code**: Semua credential via environment variables

## 📜 License

© Motion Core — All rights reserved.
