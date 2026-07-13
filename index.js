// ==========================================
// MOTION CORE DISCORD BOT — v2.0 (Independent)
// Auto VIP License Delivery via QRIS
// Components V2: No Express, Polling-based
// ==========================================

// ─── 1. IMPORTS ─────────────────────────────
require('dotenv').config();
const {
  // Core
  Client, GatewayIntentBits, MessageFlags,

  // ── Layout Components ──
  ActionRowBuilder,

  // ── Content Components (V2) ──
  LabelBuilder,

  // ── Interactive: Buttons & Selects ──
  ButtonBuilder, ButtonStyle,

  // ── Interactive: Modal Inputs (V2) ──
  ModalBuilder,
  TextInputBuilder, TextInputStyle,
  RadioGroupBuilder,

  // ── Rich Content ──
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const QRCode = require('qrcode');

// ─── 2. LOGGER (timestamped, leveled) ────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_THRESHOLD = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;

const logger = {
  _ts: () => new Date().toISOString(),
  debug: (...args) => { if (LOG_THRESHOLD <= 0) console.log(`[${logger._ts()}] [DEBUG]`, ...args); },
  info:  (...args) => { if (LOG_THRESHOLD <= 1) console.log(`[${logger._ts()}] [INFO]`,  ...args); },
  warn:  (...args) => { if (LOG_THRESHOLD <= 2) console.warn(`[${logger._ts()}] [WARN]`,  ...args); },
  error: (...args) => { if (LOG_THRESHOLD <= 3) console.error(`[${logger._ts()}] [ERROR]`, ...args); },
};

// ─── 3. CONSTANTS ────────────────────────────
const VIP_PRICES = {
  '1_DAY':   { price: 5000,  days: 1,  label: '1 Hari'   },
  '7_DAYS':  { price: 20000, days: 7,  label: '7 Hari'   },
  '14_DAYS': { price: 35000, days: 14, label: '14 Hari'  },
  '30_DAYS': { price: 60000, days: 30, label: '30 Hari'  },
};

const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QRIS_TIMEOUT_MS = 15 * 60 * 1000; // 15 menit
const POLL_INTERVAL_MS = 15 * 1000;      // 15 detik
const COMMAND_NAME = 'setup-vip';

// ─── 4. SUPABASE ─────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─── 5. DISCORD CLIENT ───────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Map<order_id, { discordUserId, channelId, plan, interaction }>
// Used for QRIS cleanup & expiry notification (in-memory, lost on restart — acceptable)
const activeOrders = new Map();

// ─── 6. LICENSE KEY GENERATOR ────────────────
function generateLicenseKey() {
  const part = () =>
    Array.from({ length: 4 }, () =>
      KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]
    ).join('');
  return `MC-${part()}-${part()}-${part()}`;
}

// ─── 7. TESTIMONIAL WEBHOOK ──────────────────
async function sendTestiWebhook(txData, discordUser) {
  const webhookUrl = process.env.TESTI_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const rawName = discordUser ? discordUser.username : 'User';
    const safeName = rawName.length >= 2
      ? rawName.substring(0, 2).toUpperCase() + '•••••'
      : 'US•••••';

    const { count } = await supabase
      .from('transaction_logs')
      .select('*', { count: 'exact', head: true })
      .eq('username', txData.username)
      .eq('status', 'completed');

    const totalOrder = count || 1;
    const unixTime = Math.floor(Date.now() / 1000);

    await axios.post(webhookUrl, {
      username: 'Motion Core Payment',
      avatar_url: 'https://i.postimg.cc/1zFrmJkR/photo-2026-07-06-18-11-06.jpg',
      embeds: [{
        title: '🎉 NEW PURCHASE VERIFIED',
        description: 'Terima kasih telah berlangganan layanan Motion Core!',
        color: 16766720,
        fields: [
          { name: '👤 Pembeli',      value: `\`${safeName}\``, inline: true },
          { name: '🛍️ Pembelian Ke', value: `**#${totalOrder}**`,   inline: true },
          { name: '📅 Waktu',        value: `<t:${unixTime}:f>`,   inline: true },
        ],
        footer: { text: 'Verified by Motion Core System' },
        timestamp: new Date().toISOString(),
      }],
    });

    logger.info(`Testimonial webhook sent for ${txData.username}`);
  } catch (err) {
    logger.warn(`Failed to send testimonial webhook: ${err.message}`);
  }
}

// ─── 8. ADMIN LOG WEBHOOK ────────────────────
async function sendAdminLog(txData, keyString, isExtension, planLabel, discordUser) {
  const webhookUrl = process.env.ADMIN_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const fmtPrice = new Intl.NumberFormat('id-ID').format(txData.amount);
    const title = isExtension ? '🔄 LICENSE EXTENDED' : '💸 NEW AUTOMATIC PAYMENT';
    const color = isExtension ? 3066993 : 5763719;
    const discordName = discordUser ? discordUser.tag : 'Unknown#0000';

    await axios.post(webhookUrl, {
      username: 'Motion Core Web Bot',
      avatar_url: 'https://i.postimg.cc/1zFrmJkR/photo-2026-07-06-18-11-06.jpg',
      embeds: [{
        title,
        description: [
          `**Roblox:** \`${txData.username}\``,
          `**Discord:** \`${discordName}\``,
          `**Plan:** ${planLabel || txData.payment_method}`,
          `**Amount:** Rp ${fmtPrice}`,
          `**Key:** \`${keyString}\``,
          `**Ref:** ${txData.ref_code || '-'}`,
          `**Order ID:** \`${txData.order_id}\``,
        ].join('\n'),
        color,
        footer: { text: 'Motion Core Auto System via Polling' },
        timestamp: new Date().toISOString(),
      }],
    });

    logger.info(`Admin log sent for order ${txData.order_id}`);
  } catch (err) {
    logger.warn(`Failed to send admin log: ${err.message}`);
  }
}

// ─── 9. PROCESS PAYMENT (Worker-style: simple, reliable) ──
async function processPayment(txData) {
  const orderId = txData.order_id;

  // ── 9a. Extract Discord ID from ref_code ──
  let discordUserId = null;
  if (txData.ref_code && txData.ref_code.startsWith('DSCRD-')) {
    discordUserId = txData.ref_code.replace('DSCRD-', '');
  }

  // ── 9b. Parse duration ──
  const plan = txData.payment_method;
  let durationDays = 1;
  if (plan.includes('30')) durationDays = 30;
  else if (plan.includes('14')) durationDays = 14;
  else if (plan.includes('7')) durationDays = 7;

  const planInfo = VIP_PRICES[txData.payment_method];

  // ── 9c. Anti double claim (Worker-style) ──
  const { data: dupKeys } = await supabase
    .from('license_keys')
    .select('*')
    .contains('transaction_proof', orderId)
    .limit(1);

  if (dupKeys?.[0]) {
    logger.info(`Order ${orderId} already has key — duplicate poll`);
    return;
  }

  // ── 9d. Mark completed (simple PATCH, like Worker) ──
  await supabase
    .from('transaction_logs')
    .update({ status: 'completed' })
    .eq('order_id', orderId)
    .eq('status', 'pending');

  // ── 9e. Cek existing user (like Worker) ──
  const { data: existingRows } = await supabase
    .from('license_keys')
    .select('*')
    .eq('assigned_username', txData.username)
    .eq('is_active', true)
    .limit(1);

  let finalKey = '', statusText = '';
  let expiresAt = '';
  let isExtension = false;
  let shouldCreateNew = true; // Worker-style: default buat baru

  if (existingRows?.[0]) {
    const user = existingRows[0];
    const now = Date.now();
    const isExpired = user.expires_at && new Date(user.expires_at).getTime() < now;

    if (isExpired) {
      // User expired → matikan lama, buat baru (shouldCreateNew tetap true)
      await supabase.from('license_keys')
        .update({ is_active: false }).eq('key_string', user.key_string);
      logger.info(`Key ${user.key_string} expired — marked inactive`);
    } else {
      // User aktif → EXTEND
      shouldCreateNew = false;
      isExtension = true;
      finalKey = user.key_string;
      statusText = 'Renewed (Key Diperpanjang)';

      const addMillis = durationDays * 24 * 60 * 60 * 1000;
      const currentExp = new Date(user.expires_at).getTime();
      const baseTime = currentExp > now ? currentExp : now;
      expiresAt = new Date(baseTime + addMillis).toISOString();

      await supabase.from('license_keys').update({
        expires_at:         expiresAt,
        duration_days:      (user.duration_days || 0) + durationDays,
        transaction_amount: (Number(user.transaction_amount) || 0) + Number(txData.amount),
        transaction_proof:  `${user.transaction_proof || ''} | ${orderId}`,
        note:               `${user.note || ''} [AutoExtend: +${durationDays}d]`,
      }).eq('key_string', user.key_string);
    }
  }

  if (shouldCreateNew) {
    // User baru ATAU expired → buat key baru
    finalKey = generateLicenseKey();
    statusText = existingRows?.[0] ? 'New Key (Expired Renewal)' : 'New User (Fresh Key)';
    expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

    await supabase.from('license_keys').insert([{
      key_string:         finalKey,
      assigned_username:  txData.username,
      discord_id:         discordUserId,
      is_active:          true,
      duration_mode:      txData.payment_method,
      duration_days:      durationDays,
      expires_at:         expiresAt,
      transaction_amount: txData.amount,
      transaction_proof:  orderId,
      allowed_modules:    ['all'],
      note:               'Auto Payment via Polling (Fresh Key)',
    }]);
  }

  // ── 9f. Send DM & assign role ──
  let dUser = null;
  if (discordUserId) {
    try { dUser = await client.users.fetch(discordUserId); } catch (_) {}
    if (dUser) {
      const unixTs = Math.floor(new Date(expiresAt).getTime() / 1000);
      await dUser.send({
        embeds: [new EmbedBuilder()
          .setColor('#6bff8f')
          .setTitle('✅ **License Active**')
          .setDescription(['```', finalKey, '```'].join('\n'))
          .addFields(
            { name: '📌 Status',   value: statusText,                inline: true },
            { name: '⏳ Expired',  value: `<t:${unixTs}:R>`,         inline: true },
            { name: '📜 Script',   value: '```lua\nloadstring(game:HttpGet("https://vip.motioncore.web.id"))()\n```', inline: false },
          )
          .setFooter({ text: 'Motion Core Auto System', iconURL: client.user?.displayAvatarURL() })
          .setTimestamp()
        ],
      }).catch(() => {});
      logger.info(`DM sent to ${dUser.tag} with key ${finalKey}`);
    }
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const member = await guild.members.fetch(discordUserId);
      if (member) await member.roles.add(process.env.VIP_ROLE_ID);
    } catch (_) {}
  }

  // ── 9g. Webhooks ──
  await sendTestiWebhook(txData, dUser);
  await sendAdminLog(txData, finalKey, isExtension, planInfo?.label, dUser);

  // ── 9h. Cleanup QRIS ──
  const pendingOrder = activeOrders.get(orderId);
  if (pendingOrder?.interaction) {
    try { await pendingOrder.interaction.deleteReply(); } catch (_) {}
    activeOrders.delete(orderId);
  }

  logger.info(`Order ${orderId} completed for ${txData.username}`);
}

// ─── 10. POLLING ENGINE ──────────────────────
async function pollPendingPayments() {
  try {
    // Ambil semua transaksi pending dari Discord (ref_code LIKE 'DSCRD-%')
    const { data: pendingTx, error } = await supabase
      .from('transaction_logs')
      .select('*')
      .eq('status', 'pending')
      .like('ref_code', 'DSCRD-%');

    if (error) {
      logger.error(`Poll query error: ${error.message}`);
      return;
    }

    if (!pendingTx || pendingTx.length === 0) {
      logger.debug('Poll: no pending Discord transactions');
      return;
    }

    logger.info(`Poll: checking ${pendingTx.length} pending transaction(s)`);

    for (const tx of pendingTx) {
      try {
        logger.info(`Poll[${tx.order_id}]: Checking Pakasir...`);
        // Cek status ke Pakasir API
        const checkRes = await axios.get(
          'https://app.pakasir.com/api/transactiondetail',
          {
            params: {
              project:  process.env.PAKASIR_SLUG,
              amount:   tx.amount,
              order_id: tx.order_id,
              api_key:  process.env.PAKASIR_API_KEY,
            },
            timeout: 10000,
          }
        );

        const checkData = checkRes.data;
        logger.info(`Poll[${tx.order_id}]: Pakasir response — ${JSON.stringify(checkData).slice(0, 300)}`);

        if (checkData.transaction && checkData.transaction.status === 'completed') {
          logger.info(`Poll[${tx.order_id}]: PAID — processing...`);
          await processPayment(tx);

        } else {
          logger.info(`Poll[${tx.order_id}]: Still pending (Pakasir: ${checkData.transaction?.status || 'unknown'})`);
        }
      } catch (txErr) {
        logger.warn(`Poll[${tx.order_id}]: Pakasir check FAILED — ${txErr.message}`);
        if (txErr.response) logger.warn(`  Response: ${txErr.response.status} ${JSON.stringify(txErr.response.data).slice(0, 200)}`);
      }
    }
  } catch (err) {
    logger.error(`Poll engine error: ${err.message}`);
  }
}

// ─── 11. DISCORD INTERACTIONS ─────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // ── 11a. /setup-vip ─────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
      if (!interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ Hanya Admin yang dapat menggunakan command ini.',
            flags: MessageFlags.Ephemeral,
          });
      }

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('buy_vip')
          .setLabel('💳 Beli Sekarang')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💳'),
        new ButtonBuilder()
          .setCustomId('cek_status')
          .setLabel('🔍 Cek Status')
          .setStyle(ButtonStyle.Secondary),
      );

      const extraRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📞 Support')
          .setStyle(ButtonStyle.Link)
          .setURL('https://discord.com/channels/1523647512337055917/1523684804728717383'),
      );

      const embed = new EmbedBuilder()
        .setColor('#7803eb')
        .setTitle('👑 **Motion Core**')
        .setURL('https://dsc.gg/motioncore')
        .setDescription([
          '━━━━━━━━━━━━━━━━━━━━',
          '**📌 Cara Pembelian:**',
          '',
          '**1.** Klik tombol **💳 Beli Sekarang**',
          '**2.** Pilih paket + **Username Roblox**',
          '**3.** Cek **DM Discord** — QRIS dikirim ke DM',
          '**4.** Scan QRIS & bayar via E-Wallet',
          '**5.** Key dikirim otomatis ke DM ✅',
          '━━━━━━━━━━━━━━━━━━━━',
          '⏳ *Proses: scan QR → bayar → 0-15 dtk → key*',
          '❌ *Jangan buka order baru — tunggu otomatis*',
        ].join('\n'))
        .addFields(
          { name: '💎 **VIP Script**', value: 'Akses penuh • Update prioritas • Support 24/7', inline: true },
          { name: '⏳ **QRIS**',       value: 'Scan E-Wallet • Key otomatis • 15 menit',        inline: true },
        )
        .setFooter({ text: 'Motion Core Auto System', iconURL: client.user?.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({
        content: '✅ Menu order VIP berhasil dipasang di channel ini.',
        flags: MessageFlags.Ephemeral,
      });
      await interaction.channel.send({ embeds: [embed], components: [actionRow, extraRow] });
      logger.info(`Menu order VIP deployed by ${interaction.user.tag} in #${interaction.channel.name}`);
      return;
    }

    // ── 11b. Tombol Beli → Modal ──
    if (interaction.isButton() && interaction.customId === 'buy_vip') {
      const modal = new ModalBuilder()
        .setCustomId('modal_order_v2')
        .setTitle('Motion Core • Beli Lisensi');

      const radioGroup = new RadioGroupBuilder()
        .setCustomId('package_radio')
        .setRequired(true)
        .addOptions(
          Object.entries(VIP_PRICES).map(([key, pkg]) => ({
            label:       `${pkg.label} — Rp${pkg.price.toLocaleString('id-ID')}`,
            value:       key,
            description: `Akses ${pkg.days} hari`,
          }))
        );

      const packageLabel = new LabelBuilder()
        .setLabel('Pilih Paket VIP')
        .setDescription('Durasi lisensi yang diinginkan')
        .setRadioGroupComponent(radioGroup);

      const usernameInput = new TextInputBuilder()
        .setCustomId('roblox_username')
        .setPlaceholder('Masukkan username Roblox kamu')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(30);

      const usernameLabel = new LabelBuilder()
        .setLabel('Username Roblox')
        .setDescription('Perhatikan huruf besar/kecil')
        .setTextInputComponent(usernameInput);

      modal.addComponents(packageLabel, usernameLabel);
      await interaction.showModal(modal);
      return;
    }

    // ── 11c. Modal Submit → QRIS ────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_order_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let plan;
      if (interaction.customId === 'modal_order_v2') {
        const radioWrapper = interaction.components.find(c => {
          const children = c.component ? [c.component] : (c.components ?? []);
          return children.some(sub => sub.customId === 'package_radio');
        });
        const children = radioWrapper?.component ? [radioWrapper.component] : (radioWrapper?.components ?? []);
        plan = children.find(sub => sub.customId === 'package_radio')?.value;
      } else {
        plan = interaction.customId.replace('modal_order_', '');
      }

      const packageInfo = VIP_PRICES[plan];
      if (!packageInfo) {
        return interaction.editReply('❌ Paket tidak valid. Silakan coba lagi.');
      }

      let robloxUsername = interaction.fields
        .getTextInputValue('roblox_username')
        .trim();
      if (robloxUsername.startsWith('@')) robloxUsername = robloxUsername.substring(1);

      const discordUserId = interaction.user.id;
      const orderId = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      try {
        // Generate QRIS via Pakasir
        const pakasirRes = await axios.post(
          'https://app.pakasir.com/api/transactioncreate/qris',
          {
            project:  process.env.PAKASIR_SLUG,
            order_id: orderId,
            amount:   packageInfo.price,
            api_key:  process.env.PAKASIR_API_KEY,
          },
          { timeout: 15000 }
        );

        const qrString = pakasirRes.data.payment.payment_number;
        if (!qrString) throw new Error('Pakasir response missing payment_number');

        // Simpan ke database
        const { error: dbError } = await supabase
          .from('transaction_logs')
          .insert([{
            order_id:       orderId,
            username:       robloxUsername,
            amount:         packageInfo.price,
            payment_method: plan,
            status:         'pending',
            ref_code:       `DSCRD-${discordUserId}`,
          }]);

        if (dbError) {
          logger.error(`DB insert failed: ${dbError.message}`);
          return interaction.editReply('❌ Gagal menyimpan pesanan. Hubungi Admin.');
        }

        // Generate & attach QR code image
        const qrBuffer = await QRCode.toBuffer(qrString, { width: 300, margin: 2 });
        const attachment = new AttachmentBuilder(qrBuffer, { name: 'qris.png' });

        const expiryUnix = Math.floor((Date.now() + QRIS_TIMEOUT_MS) / 1000);
        const embedQris = new EmbedBuilder()
          .setColor('#7803eb')
          .setTitle('💳 **Pembayaran**')
          .setDescription([
            `### ${packageInfo.label}`,
            `**Harga:** Rp ${packageInfo.price.toLocaleString('id-ID')}`,
            `**Target:** \`${robloxUsername}\``,
            '',
            'Silakan scan QRIS di bawah ini dengan **E-Wallet** atau **M-Banking**.',
            '',
            `🕐 Kedaluwarsa <t:${expiryUnix}:R>`,
            `📅 Aktif hingga <t:${Math.floor((Date.now() + packageInfo.days * 86400000) / 1000)}:f>`,
            '',
            '> 🔄 **Status:** Menunggu pembayaran...',
            '> ✅ Key akan dikirim **otomatis** ke DM ini setelah pembayaran terkonfirmasi.',
            '> ❌ Jangan buka order baru — cukup tunggu, sistem memproses otomatis.',
            ].join('\n'))
          .setImage('attachment://qris.png')
          .setFooter({ text: `Order: ${orderId}`, iconURL: client.user?.displayAvatarURL() })
          .setTimestamp();

        // Kirim QR ke DM user (permanent — gak ilang meski Discord ditutup/discroll)
        try {
          const qrUser = await client.users.fetch(discordUserId);
          await qrUser.send({ embeds: [embedQris], files: [attachment] });
          await interaction.editReply({
            content: '✅ **QRIS Payment dikirim ke DM!**\nSilakan cek **Direct Message (DM)** Discord kamu untuk melakukan pembayaran.\n\n> ⏳ Key akan dikirim otomatis ke DM setelah pembayaran terkonfirmasi. **Jangan buka order baru.**',
          });
          logger.info(`Order ${orderId}: QR sent to DM — ${robloxUsername} → ${packageInfo.label} (Rp${packageInfo.price})`);
        } catch (dmErr) {
          logger.warn(`Cannot DM user ${discordUserId}: ${dmErr.message}`);
          await interaction.editReply({
            content: '❌ Gagal mengirim DM. Pastikan pengaturan **Privasi Discord** kamu mengizinkan pesan dari anggota server ini.\n\n> 📌 **Settings → Privacy & Safety → Allow direct messages from server members**\n\nSetelah itu, coba lagi.',
          }).catch(() => {});
          return;
        }

        // Track for cleanup
        activeOrders.set(orderId, {
          discordUserId,
          channelId: interaction.channelId,
          plan: plan,
          interaction,
        });

        // QRIS expiry notification (15 menit)
        setTimeout(() => {
          activeOrders.delete(orderId);

          supabase
            .from('transaction_logs')
            .select('status')
            .eq('order_id', orderId)
            .single()
            .then(({ data }) => {
              if (data && data.status === 'pending') {
                client.users.fetch(discordUserId).then(user => {
                  user.send({
                    content: `⏳ **QRIS untuk ${packageInfo.label} sudah expired.**\nSilakan order ulang melalui channel <#${interaction.channelId}>.`,
                  }).catch(() => {});
                  logger.info(`Expired notification sent to ${discordUserId} for ${orderId}`);
                }).catch(() => {});
              }
            }).catch(() => {});

        }, QRIS_TIMEOUT_MS);

      } catch (err) {
        logger.error(`Order failed for ${interaction.user.tag}: ${err.message}`);
        await interaction.editReply(
          '❌ Terjadi kesalahan saat memproses pesanan. Silakan coba lagi atau hubungi Admin.'
        ).catch(() => {});
      }
      return;
    }

    // ── 11d. Tombol: Cek Status ───────────
    if (interaction.isButton() && interaction.customId === 'cek_status') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const { data: orders, error } = await supabase
          .from('transaction_logs')
          .select('*')
          .eq('ref_code', `DSCRD-${interaction.user.id}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !orders) {
          return interaction.editReply('📭 Belum ada transaksi ditemukan untuk akun Discord kamu.').catch(() => {});
        }

        // Kalo pending, cek langsung ke Pakasir API
        if (orders.status === 'pending') {
          try {
            const checkRes = await axios.get(
              'https://app.pakasir.com/api/transactiondetail',
              {
                params: {
                  project:  process.env.PAKASIR_SLUG,
                  amount:   orders.amount,
                  order_id: orders.order_id,
                  api_key:  process.env.PAKASIR_API_KEY,
                },
                timeout: 10000,
              }
            );

            const checkData = checkRes.data;
            logger.info(`CekStatus[${orders.order_id}]: Pakasir response — ${JSON.stringify(checkData).slice(0, 300)}`);

            if (checkData.transaction && checkData.transaction.status === 'completed') {
              logger.info(`CekStatus[${orders.order_id}]: PAID via manual check — processing...`);
              try {
                await interaction.editReply({ content: '⏳ **Pembayaran terdeteksi!** Sedang memproses lisensi...' }).catch(() => {});
                await processPayment(orders);
                return interaction.editReply({ content: '✅ **Pembayaran lunas!** Cek DM Discord untuk key.' }).catch(() => {});
              } catch (procErr) {
                logger.error(`CekStatus[${orders.order_id}]: processPayment error: ${procErr.message}`);
                await interaction.editReply({ content: '✅ Pembayaran terdeteksi! Key sedang dikirim... Cek DM Discord.' }).catch(() => {});
                return;
              }
            }
          } catch (pErr) {
            logger.warn(`CekStatus[${orders.order_id}]: Pakasir check failed: ${pErr.message}`);
            // Fallback: tunjukkin status dari Supabase
          }
        }

        const pkg = VIP_PRICES[orders.payment_method];
        const statusEmoji = orders.status === 'completed' ? '✅' : orders.status === 'pending' ? '⏳' : '❌';

        await interaction.editReply([
          `${statusEmoji} **Status Pesanan Terakhir**`,
          `▸ **Paket:** ${pkg ? pkg.label : orders.payment_method}`,
          `▸ **Username:** ${orders.username}`,
          `▸ **Order ID:** \`${orders.order_id}\``,
          `▸ **Status:** ${orders.status === 'completed' ? '✅ LUNAS' : orders.status === 'pending' ? '⏳ Menunggu Pembayaran' : '❌ Gagal'}`,
          orders.status === 'completed' ? '🎉 License sudah aktif! Cek DM Discord kamu.' : '💳 Jika sudah bayar, klik **Cek Status** lagi untuk memproses otomatis.',
        ].join('\n')).catch(() => {});
      } catch (err) {
        logger.error(`Cek status error: ${err.message}`);
        await interaction.editReply('❌ Gagal mengecek status. Coba lagi nanti.').catch(() => {});
      }
      return;
    }

  } catch (err) {
    logger.error(`Unhandled interaction error: ${err.message}`, err.stack);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply('❌ Terjadi kesalahan internal. Silakan coba lagi.').catch(() => {});
    } else {
      interaction.reply({ content: '❌ Terjadi kesalahan internal.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// ─── 12. WEEKLY CRON: Hapus role expired ──────
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

async function cleanupExpiredKeys() {
  logger.info('🔍 Running weekly expired key cleanup...');

  try {
    const now = new Date().toISOString();
    const { data: expiredKeys, error } = await supabase
      .from('license_keys')
      .select('*')
      .eq('is_active', true)
      .lt('expires_at', now);

    if (error) {
      logger.error(`Cleanup DB error: ${error.message}`);
      return;
    }

    if (!expiredKeys || expiredKeys.length === 0) {
      logger.info('✅ No expired keys found');
      return;
    }

    logger.info(`Found ${expiredKeys.length} expired key(s)`);

    for (const key of expiredKeys) {
      await supabase.from('license_keys')
        .update({ is_active: false })
        .eq('key_string', key.key_string);

      logger.info(`Key ${key.key_string} deactivated (expired)`);

      if (key.discord_id) {
        try {
          const guild = await client.guilds.fetch(process.env.GUILD_ID);
          const member = await guild.members.fetch(key.discord_id);
          if (member) {
            await member.roles.remove(process.env.VIP_ROLE_ID);
            logger.info(`Role removed from ${key.discord_id} (expired key)`);

            await member.send({
              content: '⏳ **Lisensi VIP kamu sudah expired.**\nSilakan perpanjang melalui channel <#1523684804728717383> agar tetap bisa menggunakan script.',
            }).catch(() => {});
          }
        } catch (memberErr) {
          logger.debug(`Cannot process member ${key.discord_id}: ${memberErr.message}`);
        }
      }
    }

    logger.info(`✅ Cleanup complete: ${expiredKeys.length} key(s) deactivated`);
  } catch (err) {
    logger.error(`Cleanup error: ${err.message}`);
  }
}

// ─── 13. GRACEFUL SHUTDOWN ──────────────────
async function gracefulShutdown(signal) {
  logger.info(`${signal} received — starting graceful shutdown...`);
  if (client.isReady()) {
    await client.destroy();
    logger.info('Discord client disconnected');
  }
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION:', reason);
});

// ─── 14. STARTUP ─────────────────────────────
client.once('ready', async () => {
  logger.info(`Bot ${client.user.tag} is online! (${client.guilds.cache.size} guilds)`);

  // Register slash command
  if (process.env.NODE_ENV === 'production') {
    try {
      await client.application.commands.create({
        name: COMMAND_NAME,
        description: 'Memunculkan menu order VIP Motion Core (Hanya Admin)',
      });
      logger.info('Slash command registered globally');
    } catch (err) {
      logger.error('Failed to register global slash command:', err.message);
    }
  } else if (process.env.GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.create({
        name: COMMAND_NAME,
        description: 'Memunculkan menu order VIP Motion Core (Hanya Admin)',
      });
      logger.info(`Slash command registered on guild ${process.env.GUILD_ID}`);
    } catch (err) {
      logger.error('Failed to register guild slash command:', err.message);
    }
  }

  // Start polling engine
  logger.info(`⏰ Starting payment poller (every ${POLL_INTERVAL_MS / 1000}s)`);
  pollPendingPayments(); // Run immediately
  setInterval(pollPendingPayments, POLL_INTERVAL_MS);

  // Start weekly cleanup (10s delay)
  setTimeout(() => {
    cleanupExpiredKeys();
    setInterval(cleanupExpiredKeys, WEEKLY_MS);
    logger.info(`⏰ Weekly cleanup scheduled (every ${WEEKLY_MS / 86400000} days)`);
  }, 10000);
});

client.login(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN)
  .then(() => logger.info('Discord login successful'))
  .catch(err => {
    logger.error('Discord login FAILED:', err.message);
    process.exit(1);
  });
