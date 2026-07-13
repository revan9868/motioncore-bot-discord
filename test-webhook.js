/**
 * TEST WEBHOOK — Simulasi pembayaran untuk v2.0 (Polling-based)
 *
 * v2.0 pake polling, bukan webhook. Jadi test ini langsung UPDATE
 * status transaksi di Supabase jadi 'completed' — bot akan detect
 * via polling dalam 0-15 detik.
 *
 * Cara pakai:
 *   1. Jalankan bot dulu: npm start
 *   2. Buka terminal lain, jalankan: npm run test-webhook INV-xxxxx
 *
 *   Argumen: ORDER_ID (wajib)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const orderId = process.argv[2];
if (!orderId) {
  console.error('❌ Gunakan: node test-webhook.js INV-xxxxx');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function testPayment() {
  console.log(`\n🔔 Simulasi pembayaran untuk order: ${orderId}\n`);

  // 1. Cek transaksi
  const { data: tx, error: txErr } = await supabase
    .from('transaction_logs')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (txErr || !tx) {
    console.error(`❌ Transaksi ${orderId} tidak ditemukan di DB`);
    console.error(txErr?.message || 'No data');
    process.exit(1);
  }

  console.log(`📋 Transaksi ditemukan:`);
  console.log(`   User     : ${tx.username}`);
  console.log(`   Amount   : Rp ${tx.amount}`);
  console.log(`   Status   : ${tx.status}`);
  console.log(`   Ref Code : ${tx.ref_code}`);
  console.log(`   Method   : ${tx.payment_method}\n`);

  if (tx.status === 'completed') {
    console.log('⚠️ Transaksi sudah completed — skip');
    process.exit(0);
  }

  // 2. Update status jadi completed (simulasi pembayaran)
  const { error: updErr } = await supabase
    .from('transaction_logs')
    .update({ status: 'completed' })
    .eq('order_id', orderId)
    .eq('status', 'pending');

  if (updErr) {
    console.error('❌ Gagal update status:', updErr.message);
    process.exit(1);
  }

  console.log('✅ Status transaksi di-update ke "completed"');
  console.log('');
  console.log('⏳ Bot akan mendeteksi dalam 0-15 detik via polling...');
  console.log('   Cek DM Discord untuk key!');
  console.log('   Cek log bot untuk detail.');
}

testPayment();
