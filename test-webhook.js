/**
 * TEST WEBHOOK — Simulasi callback pembayaran dari Pakasir
 *
 * Cara pakai:
 *   1. Jalankan bot dulu: npm start
 *   2. Buka terminal lain, jalankan: npm run test-webhook
 *      atau: node test-webhook.js INV-xxxxx
 *
 *   Argumen opsional: ORDER_ID (kalau tidak diberikan, pakai default)
 */

require('dotenv').config();
const axios = require('axios');

// Ambil order ID dari argumen CLI atau pakai default
const orderId = process.argv[2] || process.env.TEST_ORDER_ID;

if (!orderId) {
  console.error('❌ Gunakan: node test-webhook.js INV-xxxxx');
  console.error('   atau set TEST_ORDER_ID di .env');
  process.exit(1);
}

const WEBHOOK_URL = process.env.TEST_WEBHOOK_URL || 'http://localhost:3000/webhook/pakasir';

async function testPembayaran() {
  console.log(`\n🔔 Mengirim simulasi pembayaran sukses...`);
  console.log(`   Order ID : ${orderId}`);
  console.log(`   URL      : ${WEBHOOK_URL}\n`);

  try {
    const response = await axios.post(WEBHOOK_URL, {
      order_id: orderId,
      status: 'completed',
      amount: 5000,
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    console.log('✅ RESPON DARI BOT:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.status === 'success') {
      console.log('\n🎉 License berhasil diaktivasi! Cek DM Discord Anda.');
    } else if (response.data.status === 'ignored') {
      console.log('\n⚠️ Order sudah diproses sebelumnya (duplicate webhook).');
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ ERROR:', error.response.status, JSON.stringify(error.response.data));
    } else {
      console.error('❌ ERROR:', error.message);
    }
  }
}

testPembayaran();
