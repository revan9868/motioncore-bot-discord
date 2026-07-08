// ==========================================
// MOTION CORE DISCORD BOT — PRODUCTION v1.2
// Auto VIP License Delivery via QRIS
// Components V2: LabelBuilder, TextDisplay, etc.
// ==========================================

// ─── 1. IMPORTS ─────────────────────────────
require('dotenv').config();
const express = require('express');
const {
  // Core
  Client, GatewayIntentBits, MessageFlags,

  // ── Layout Components ──
  ActionRowBuilder,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,

  // ── Content Components (V2) ──
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ThumbnailBuilder,
  FileBuilder,

  // ── Interactive: Buttons & Selects ──
  ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelSelectMenuBuilder,

  // ── Interactive: Modal Inputs (V2) ──
  ModalBuilder,
  TextInputBuilder, TextInputStyle,
  LabelBuilder,
  RadioGroupBuilder, RadioGroupOptionBuilder,
  CheckboxBuilder,
  CheckboxGroupBuilder, CheckboxGroupOptionBuilder,
  FileUploadBuilder,

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
const PK_ALLOWED_IPS = (process.env.PAKASIR_IPS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const PORT = process.env.PORT || 3000;
const COMMAND_NAME = 'setup-vip';

// ─── 4. EXPRESS SETUP ────────────────────────
const app = express();
app.set('trust proxy', true); // Railway behind reverse proxy
app.use(express.json({ limit: '1mb' }));

// ─── 5. SUPABASE ─────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ─── 6. DISCORD CLIENT ───────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Map<order_id, interaction> — track active QRIS payments for cleanup
const activeOrders = new Map();

// ─── 7. LICENSE KEY GENERATOR ────────────────
function generateLicenseKey() {
  const part = () =>
    Array.from({ length: 4 }, () =>
      KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]
    ).join('');
  return `MC-${part()}-${part()}-${part()}`;
}

// ─── 7a. TESTIMONIAL WEBHOOK (Worker-compatible) ─
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
      embeds: [{
        title: '🎉 NEW PURCHASE VERIFIED',
        description: 'Terima kasih telah berlangganan layanan Motion Core!',
        color: 16766720, // Gold #FFD700
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

// ─── 7b. ADMIN TRANSCRIPT WEBHOOK ──────────────
async function sendAdminLog(txData, keyString, isExtension, planLabel) {
  const webhookUrl = process.env.ADMIN_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const fmtPrice = new Intl.NumberFormat('id-ID').format(txData.amount);
    const title = isExtension ? '🔄 LICENSE EXTENDED' : '💸 NEW AUTOMATIC PAYMENT';
    const color = isExtension ? 3066993 : 5763719; // Green : Blue

    await axios.post(webhookUrl, {
      username: 'Motion Core Web Bot',
      embeds: [{
        title,
        description: [
          `**User:** \`${txData.username}\``,
          `**Plan:** ${planLabel || txData.payment_method}`,
          `**Amount:** Rp ${fmtPrice}`,
          `**Key:** \`${keyString}\``,
          `**Ref:** ${txData.ref_code || '-'}`,
          `**Order ID:** \`${txData.order_id}\``,
        ].join('\n'),
        color,
        footer: { text: 'Motion Core Auto System via Pakasir' },
        timestamp: new Date().toISOString(),
      }],
    });

    logger.info(`Admin log sent for order ${txData.order_id}`);
  } catch (err) {
    logger.warn(`Failed to send admin log: ${err.message}`);
  }
}

// ─── 9. DISCORD INTERACTIONS ─────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // ── 9a. /setup-vip ──────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
      if (!interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ Hanya Admin yang dapat menggunakan command ini.',
            flags: MessageFlags.Ephemeral,
          });
      }

      // ── Tombol aksi ──
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

      // ── Row 2: Support ──
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
          '### 💳 Order System',
          'Pilih tombol **Beli Sekarang** untuk memulai pembelian lisensi.',
          '',
          '> Key dikirim otomatis via **DM Discord** setelah pembayaran dikonfirmasi.',
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

    // ── 9b. Tombol Beli → Modal (RadioGroup + TextInput) ──
    if (interaction.isButton() && interaction.customId === 'buy_vip') {
      const modal = new ModalBuilder()
        .setCustomId('modal_order_v2')
        .setTitle('Motion Core • Beli Lisensi');

      // ── RadioGroup: pilih paket ──
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

      // ── TextInput: username ──
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

    // ── 9d. Modal Submit → QRIS ────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_order_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Ambil paket dari RadioGroup (V2) atau dari custom_id (legacy)
      let plan;
      if (interaction.customId === 'modal_order_v2') {
        // V2: cari nilai RadioGroup — Label punya .component (singular), ActionRow punya .components (plural)
        const radioWrapper = interaction.components.find(c => {
          const children = c.component ? [c.component] : (c.components ?? []);
          return children.some(sub => sub.customId === 'package_radio');
        });
        const children = radioWrapper?.component ? [radioWrapper.component] : (radioWrapper?.components ?? []);
        plan = children.find(sub => sub.customId === 'package_radio')?.value;
      } else {
        // Legacy: dari custom_id (backward compat)
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
          ].join('\n'))
          .setImage('attachment://qris.png')
          .setFooter({ text: `Order: ${orderId}`, iconURL: client.user?.displayAvatarURL() })
          .setTimestamp();

        await interaction.editReply({ embeds: [embedQris], files: [attachment] });
        logger.info(
          `Order ${orderId}: ${robloxUsername} → ${packageInfo.label} (Rp${packageInfo.price})`
        );

        // Track for webhook cleanup
        activeOrders.set(orderId, interaction);
        setTimeout(() => {
          activeOrders.delete(orderId);

          // ── Notifikasi QRIS expired ──
          // Cek di DB apakah masih pending
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

    // ── 9e. Tombol: Cek Status ───────────
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
          return interaction.editReply('📭 Belum ada transaksi ditemukan untuk akun Discord kamu.');
        }

        const pkg = VIP_PRICES[orders.payment_method];
        const statusEmoji = orders.status === 'completed' ? '✅' : orders.status === 'pending' ? '⏳' : '❌';

        await interaction.editReply([
          `${statusEmoji} **Status Pesanan Terakhir**`,
          `▸ **Paket:** ${pkg ? pkg.label : orders.payment_method}`,
          `▸ **Username:** ${orders.username}`,
          `▸ **Order ID:** \`${orders.order_id}\``,
          `▸ **Status:** ${orders.status === 'completed' ? '✅ LUNAS' : orders.status === 'pending' ? '⏳ Menunggu Pembayaran' : '❌ Gagal'}`,
          orders.status === 'completed' ? '🎉 License sudah aktif! Cek DM Discord kamu.' : '💳 Silakan selesaikan pembayaran jika belum.',
        ].join('\n'));
      } catch (err) {
        logger.error(`Cek status error: ${err.message}`);
        await interaction.editReply('❌ Gagal mengecek status. Coba lagi nanti.');
      }
      return;
    }

  } catch (err) {
    logger.error(`Unhandled interaction error: ${err.message}`, err.stack);
    // Try to notify user if possible
    if (interaction.deferred || interaction.replied) {
      interaction.editReply('❌ Terjadi kesalahan internal. Silakan coba lagi.').catch(() => {});
    } else {
      interaction.reply({ content: '❌ Terjadi kesalahan internal.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// ─── 10. HEALTH CHECK ────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:  'ok',
    service: 'MotionCore Bot',
    version: '1.2.0',
    uptime:  Math.floor(process.uptime()),
    orders:  activeOrders.size,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 11. WEBHOOK: PAKASIR PAYMENT CALLBACK ───
app.post('/webhook/pakasir', async (req, res) => {
  // ── 11a. IP whitelist check ──────────────
  const clientIp = req.ip || req.connection.remoteAddress;
  if (PK_ALLOWED_IPS.length > 0 && !PK_ALLOWED_IPS.includes(clientIp)) {
    logger.warn(`Webhook access denied from IP: ${clientIp}`);
    return res.status(403).json({ status: 'forbidden', message: 'IP not allowed' });
  }

  const { order_id, status } = req.body;

  if (!order_id) {
    return res.status(400).json({ status: 'error', message: 'Missing order_id' });
  }

  // Only process completed/paid/success statuses
  if (status !== 'completed' && status !== 'paid' && status !== 'success') {
    return res.status(200).json({ status: 'ignored', message: `Status "${status}" not actionable` });
  }

  logger.info(`Webhook received for order ${order_id}`);

  try {
    // ── 11b. Atomic claim: ONLY update if status='pending' ──
    // This prevents race conditions — if two webhooks arrive simultaneously,
    // only the first UPDATE succeeds; the second affects 0 rows.
    const { data: claimData, error: claimError } = await supabase
      .from('transaction_logs')
      .update({ status: 'completed' })
      .eq('order_id', order_id)
      .eq('status', 'pending')
      .select()
      .single();

    if (claimError) {
      logger.error(`DB claim error for ${order_id}: ${claimError.message}`);
      return res.status(500).json({ status: 'error', message: 'Database error' });
    }

    if (!claimData) {
      // Already processed or doesn't exist — safe to ignore
      logger.info(`Order ${order_id} already processed or not found — ignored`);
      return res.status(200).json({ status: 'ignored', message: 'Already processed' });
    }

    const txData = claimData; // claimData has all transaction fields

    // ── 11c. Extract Discord ID from ref_code ──
    let discordUserId = null;
    if (txData.ref_code && txData.ref_code.startsWith('DSCRD-')) {
      discordUserId = txData.ref_code.replace('DSCRD-', '');
    }

    if (!discordUserId) {
      logger.warn(`Order ${order_id} has no Discord ID in ref_code — key generated but no DM sent`);
    }

    // ── 11d. License key logic (Worker-compatible) ──
    // Parse duration dari plan string (sama seperti Worker)
    const plan = txData.payment_method;
    let durationDays = 1;
    if (plan.includes('30')) durationDays = 30;
    else if (plan.includes('14')) durationDays = 14;
    else if (plan.includes('7')) durationDays = 7;

    const planInfo = VIP_PRICES[txData.payment_method];

    // Cek apakah key sudah pernah di-generate untuk order ini (duplicate check)
    const { data: existingKeyForOrder } = await supabase
      .from('license_keys')
      .select('*')
      .contains('transaction_proof', order_id)
      .maybeSingle();

    if (existingKeyForOrder) {
      logger.info(`Order ${order_id} already has key generated — duplicate callback`);
      return res.status(200).json({ status: 'success', message: 'Already processed' });
    }

    // Cari existing user
    const { data: existingUser } = await supabase
      .from('license_keys')
      .select('*')
      .eq('assigned_username', txData.username)
      .eq('is_active', true)
      .maybeSingle();

    let finalKey;
    let statusText;
    let expiresAt;
    let isExtension = false;

    if (existingUser) {
      const now = Date.now();
      const isExpired = existingUser.expires_at && new Date(existingUser.expires_at).getTime() < now;

      if (isExpired) {
        // ── Key expired → mark inactive + buat key baru ──
        await supabase.from('license_keys')
          .update({ is_active: false })
          .eq('id', existingUser.id);

        logger.info(`Key ${existingUser.key_string} expired — marked inactive, creating new`);

        // Buat key baru (fresh)
        finalKey = generateLicenseKey();
        statusText = 'New Key (Expired Renewal)';
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
          transaction_proof:  order_id,
          allowed_modules:    ['all'],
          note:               'Auto Payment via Pakasir (Fresh Key - Expired Renewal)',
        }]);

        logger.info(`New KEY (expired renewal): ${finalKey} for ${txData.username} (${durationDays} days)`);

      } else {
        // ── Key still active → EXTEND ──
        isExtension = true;
        finalKey = existingUser.key_string;
        statusText = 'Renewed (Key Diperpanjang)';

        const addMillis = durationDays * 24 * 60 * 60 * 1000;
        const currentExp = new Date(existingUser.expires_at).getTime();
        const baseTime = currentExp > now ? currentExp : now;
        expiresAt = new Date(baseTime + addMillis).toISOString();

        const updateData = {
          expires_at:         expiresAt,
          duration_days:      (existingUser.duration_days || 0) + durationDays,
          transaction_amount: (Number(existingUser.transaction_amount) || 0) + Number(txData.amount),
          transaction_proof:  `${existingUser.transaction_proof || ''} | ${order_id}`,
          note:               `${existingUser.note || ''} [AutoExtend: +${durationDays}d]`,
        };

        await supabase.from('license_keys').update(updateData).eq('id', existingUser.id);

        logger.info(`Key EXTENDED: ${finalKey} for ${txData.username} (+${durationDays} days)`);
      }

    } else {
      // ── NEW user → fresh key ──
      finalKey = generateLicenseKey();
      statusText = 'New User (Fresh Key)';
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
        transaction_proof:  order_id,
        allowed_modules:    ['all'],
        note:               'Auto Payment via Pakasir (Fresh Key)',
      }]);

      logger.info(`New KEY: ${finalKey} for ${txData.username} (${durationDays} days)`);
    }

    // ── 11e. Send DM & assign role ──
    let dUser = null;
    if (discordUserId) {
      try {
        dUser = await client.users.fetch(discordUserId);
      } catch (fetchErr) {
        logger.warn(`Cannot fetch Discord user ${discordUserId}: ${fetchErr.message}`);
      }

      if (dUser) {
        const unixTs = Math.floor(new Date(expiresAt).getTime() / 1000);

        const dmEmbed = new EmbedBuilder()
          .setColor('#6bff8f')
          .setTitle('✅ **License Active**')
          .setDescription([
            '```',
            finalKey,
            '```',
          ].join('\n'))
          .addFields(
            { name: '📌 Status',   value: statusText,                     inline: true },
            { name: '⏳ Expired',  value: `<t:${unixTs}:R>`,              inline: true },
            { name: '📜 Script',   value: [
              '```lua',
              'loadstring(game:HttpGet("https://vip.motioncore.web.id"))()',
              '```',
            ].join('\n'), inline: false },
          )
          .setFooter({ text: 'Motion Core Auto System', iconURL: client.user?.displayAvatarURL() })
          .setTimestamp();

        await dUser.send({ embeds: [dmEmbed] }).catch(dmErr => {
          logger.warn(`Failed to DM user ${discordUserId}: ${dmErr.message}`);
          // DM failed — user likely has DMs closed.
          // The role is still assigned below so they can access VIP channels.
        });

        logger.info(`DM sent to ${dUser.tag} with key ${finalKey}`);
      }

      // Assign VIP role
      try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordUserId);
        if (member) {
          await member.roles.add(process.env.VIP_ROLE_ID);
          logger.info(`VIP role added to ${txData.username} (Discord: ${discordUserId})`);
        }
      } catch (roleErr) {
        logger.warn(`Failed to assign VIP role: ${roleErr.message}`);
      }
    }

    // ── 11f. Send testimonial webhook + admin transcript ──
    await sendTestiWebhook(txData, dUser);
    await sendAdminLog(txData, finalKey, isExtension, planInfo?.label);

    // ── 11g. Cleanup: remove QRIS message ──
    const pendingInteraction = activeOrders.get(order_id);
    if (pendingInteraction) {
      try {
        await pendingInteraction.deleteReply();
      } catch (cleanupErr) {
        // Interaction might have expired — that's okay
        logger.debug(`QRIS cleanup for ${order_id}: ${cleanupErr.message}`);
      }
      activeOrders.delete(order_id);
    }

    logger.info(`Order ${order_id} completed successfully for ${txData.username}`);
    return res.status(200).json({ status: 'success', message: 'License activated' });

  } catch (err) {
    logger.error(`Webhook processing error for ${order_id}: ${err.message}`, err.stack);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// ─── 12. GRACEFUL SHUTDOWN ──────────────────
async function gracefulShutdown(signal) {
  logger.info(`${signal} received — starting graceful shutdown...`);

  // Stop accepting new requests
  // (In production with a load balancer, you'd first remove from rotation)

  // Destroy Discord client (clean WS disconnect)
  if (client.isReady()) {
    await client.destroy();
    logger.info('Discord client disconnected');
  }

  // Exit
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors gracefully (don't crash the process)
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION:', reason);
});

// ─── 13. STARTUP ─────────────────────────────
// Start Express webhook server
const server = app.listen(PORT, () => {
  logger.info(`Webhook server listening on port ${PORT}`);
  logger.info(`Allowed Pakasir IPs: ${PK_ALLOWED_IPS.length > 0 ? PK_ALLOWED_IPS.join(', ') : 'ALL (no filter)'}`);
});

// Login Discord bot
client.once('clientReady', async () => {
  logger.info(`Bot ${client.user.tag} is online! (${client.guilds.cache.size} guilds)`);

  // Register slash command globally (or per-guild for testing)
  // For production, use global registration so it works across all servers
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
    // Development mode — register on specific guild for instant updates
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
});

// ─── 14. WEEKLY CRON: Hapus role expired ──────
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
      // Set inactive
      await supabase.from('license_keys')
        .update({ is_active: false })
        .eq('id', key.id);

      // Hapus role Discord
      if (key.discord_id) {
        try {
          const guild = await client.guilds.fetch(process.env.GUILD_ID);
          const member = await guild.members.fetch(key.discord_id);
          if (member) {
            await member.roles.remove(process.env.VIP_ROLE_ID);
            logger.info(`Role removed from ${key.discord_id} (expired key)`);

            // DM notifikasi
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

// Jalankan setiap minggu setelah bot online
setTimeout(() => {
  cleanupExpiredKeys();
  setInterval(cleanupExpiredKeys, WEEKLY_MS);
  logger.info(`⏰ Weekly cleanup scheduled (every ${WEEKLY_MS / 86400000} days)`);
}, 10000); // Tunggu 10 detik setelah startup

client.login(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN)
  .then(() => logger.info('Discord login successful'))
  .catch(err => {
    logger.error('Discord login FAILED:', err.message);
    process.exit(1);
  });

module.exports = { app, server, client };
