const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const db = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || `http://localhost:${process.env.PORT || 3000}`;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_NEW_TOKEN') {
  console.warn('\n======================================================');
  console.warn('⚠️  TELEGRAM BOT NOTICE:');
  console.warn('BOT_TOKEN is not set or still set to placeholder in .env');
  console.warn('1. Open .env file');
  console.warn('2. Replace YOUR_NEW_TOKEN with your token from @BotFather');
  console.warn('3. Restart the bot');
  console.warn('======================================================\n');
}

const bot = new Telegraf(BOT_TOKEN || 'dummy_token');

// Helper to create main keyboard safely (Telegram WebApp requires HTTPS)
function getMainKeyboard(userId) {
  const isHttps = WEBAPP_URL && WEBAPP_URL.startsWith('https://');

  const firstRow = isHttps 
    ? [Markup.button.webApp('🚀 Open Mini App (Earn More)', `${WEBAPP_URL}?id=${userId}`)]
    : [Markup.button.callback('🚀 Open Mini App (Earn More)', 'open_miniapp_info')];

  return Markup.inlineKeyboard([
    firstRow,
    [
      Markup.button.callback('⚡ Quick Ad (+25)', 'watch_ad'),
      Markup.button.callback('💰 My Wallet', 'wallet')
    ],
    [
      Markup.button.callback('🎁 Daily Bonus', 'daily_bonus'),
      Markup.button.callback('👥 Refer & Earn', 'referral')
    ],
    [
      Markup.button.callback('🏆 Leaderboard', 'leaderboard'),
      Markup.button.callback('ℹ️ FAQ & Help', 'help')
    ]
  ]);
}

// /start command
bot.start(async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const startPayload = ctx.startPayload; // e.g., 'ref_123456'
    let referredBy = null;

    if (startPayload && startPayload.startsWith('ref_')) {
      referredBy = startPayload.replace('ref_', '');
    }

    const user = await db.getOrCreateUser(telegramId, {
      first_name: ctx.from.first_name,
      username: ctx.from.username,
      referred_by: referredBy
    });

    const welcomeMsg = 
`👋 *Welcome to Earn_By_adBOt, ${ctx.from.first_name || 'Friend'}!* 💎

Earn real cash & crypto rewards by watching short ads, checking in daily, and inviting friends.

📊 *Your Account:*
• 💎 *Balance:* \`${Number(user.balance || 0).toFixed(2)} Coins\` (≈ $${(Number(user.balance || 0)/1000).toFixed(2)})
• 🎬 *Ads Watched:* \`${user.total_ads_watched || 0}\`
• 🔥 *Daily Streak:* \`${user.daily_streak || 0} days\`
• 👥 *Referrals:* \`${user.total_referrals || 0}\`

👇 *Choose an option below to start earning:*`;

    await ctx.replyWithMarkdown(welcomeMsg, getMainKeyboard(telegramId));
  } catch (err) {
    console.error('Error in /start:', err);
    ctx.reply('⚠️ Welcome! Something went wrong initializing your account. Please try again.');
  }
});

// Action: Watch Quick Ad
bot.action('watch_ad', async (ctx) => {
  try {
    await ctx.answerCbQuery('🎬 Loading sponsored ad...');
    const telegramId = String(ctx.from.id);

    const token = await db.startAdSession(telegramId);

    const adMsg = await ctx.replyWithMarkdown(
`📺 *Sponsored Ad Spotlight:*
━━━━━━━━━━━━━━━━━━━
⚡ *Sponsor:* Web3 Crypto Staking & DEX
💡 *Explore top yield farming & Telegram apps.*

⏳ _Simulating ad view (5 seconds)..._`
    );

    setTimeout(async () => {
      // Complete ad
      const res = await db.completeAdSession(telegramId, token);
      if (res.success) {
        await ctx.replyWithMarkdown(
`🎉 *Ad Completed!*
You received *+${res.reward} Coins*! 💎
Current Balance: \`${res.newBalance.toFixed(2)} Coins\``,
          getMainKeyboard(telegramId)
        );
      } else {
        ctx.reply('⚠️ ' + (res.error || 'Ad verification failed.'));
      }
    }, 5000);

  } catch (err) {
    console.error('Error in watch_ad:', err);
    ctx.reply('Failed to watch ad. Please try opening the Mini App.');
  }
});

// Action: Wallet
bot.action('wallet', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await db.getOrCreateUser(telegramId, { first_name: ctx.from.first_name });
    const balance = Number(user.balance || 0);

    const walletMsg = 
`💳 *Your Wallet Overview:*
━━━━━━━━━━━━━━━━━━━
💎 *Available Balance:* \`${balance.toFixed(2)} Coins\`
💵 *USD Equivalent:* \`$${(balance / 1000).toFixed(2)} USD\`
⚡ *TON Equivalent:* \`${(balance / 3000).toFixed(3)} TON\`

📈 *Earnings Stats:*
• Total Earned: \`${Number(user.total_earned || 0).toFixed(2)} Coins\`
• Ads Watched: \`${user.total_ads_watched || 0}\`

📌 *Withdrawal Rules:*
• Minimum Payout: *500 Coins ($0.50)*
• Supported Methods: *TON Wallet, USDT (TRC20), UPI, Crypto*

👉 Open the Mini App to submit instant withdrawal requests!`;

    const isHttps = WEBAPP_URL && WEBAPP_URL.startsWith('https://');
    const appBtn = isHttps
      ? Markup.button.webApp('🚀 Open Wallet in Mini App', `${WEBAPP_URL}?id=${telegramId}`)
      : Markup.button.callback('🚀 Open Wallet in Mini App', 'open_miniapp_info');

    await ctx.replyWithMarkdown(walletMsg, Markup.inlineKeyboard([
      [appBtn],
      [Markup.button.callback('⬅️ Back to Menu', 'back_home')]
    ]));
  } catch (err) {
    console.error('Error in wallet action:', err);
  }
});

// Action: Mini App Info / HTTPS notice
bot.action('open_miniapp_info', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const previewUrl = `${WEBAPP_URL}/?id=${telegramId}&name=${encodeURIComponent(ctx.from.first_name || 'Player')}`;

    const infoMsg = 
`📱 *Telegram Mini App:*
━━━━━━━━━━━━━━━━━━━
🌐 *Local Browser URL:*
${previewUrl}

💡 *Note:* Telegram requires an **HTTPS** URL (e.g. via Cloudflare tunnel, ngrok, or free Vercel/Render hosting) to open inside Telegram as an embedded web app.

You can also use all features directly right here in the bot!`;

    await ctx.replyWithMarkdown(infoMsg, Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back to Menu', 'back_home')]
    ]));
  } catch (err) {
    console.error('Error in open_miniapp_info:', err);
  }
});

// Action: Daily Bonus
bot.action('daily_bonus', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const result = await db.claimDailyBonus(telegramId);

    if (result.success) {
      await ctx.replyWithMarkdown(
`🎁 *Daily Bonus Claimed!*
• Reward: *+${result.reward} Coins* 💎
• Current Streak: *Day ${result.streak}* 🔥
• New Balance: \`${result.newBalance.toFixed(2)} Coins\`

_Come back tomorrow for an even bigger bonus!_`,
        getMainKeyboard(telegramId)
      );
    } else {
      await ctx.replyWithMarkdown(
`⏳ *Notice:* ${result.error}`,
        getMainKeyboard(telegramId)
      );
    }
  } catch (err) {
    console.error('Error in daily bonus:', err);
  }
});

// Action: Referral
bot.action('referral', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await db.getOrCreateUser(telegramId, { first_name: ctx.from.first_name });
    const botInfo = ctx.botInfo;
    const botUsername = botInfo?.username || 'EarnByAdBot';
    const refLink = `https://t.me/${botUsername}?start=ref_${telegramId}`;

    const refMsg = 
`👥 *Referral Program:*
━━━━━━━━━━━━━━━━━━━
Share your referral link with friends and channels to earn passive income!

🎁 *Rewards:*
• *+10 Coins* instant bonus per joined friend
• *10% lifetime commission* on all ads your friends watch!

🔗 *Your Unique Referral Link:*
\`${refLink}\`

📊 *Your Referral Stats:*
• Invited Friends: \`${user.total_referrals || 0}\`
• Total Referral Income: \`${(user.total_referrals * 10).toFixed(0)} Coins\``;

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('🚀 Earn free cash & TON crypto by watching ads on Telegram!')}`;

    await ctx.replyWithMarkdown(refMsg, Markup.inlineKeyboard([
      [Markup.button.url('✈️ Share on Telegram', shareUrl)],
      [Markup.button.callback('⬅️ Back to Menu', 'back_home')]
    ]));
  } catch (err) {
    console.error('Error in referral action:', err);
  }
});

// Action: Leaderboard
bot.action('leaderboard', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const leaderboard = await db.getLeaderboard(5);

    let boardText = `🏆 *Top 5 Earners Leaderboard:* \n━━━━━━━━━━━━━━━━━━━\n`;
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    if (leaderboard.length === 0) {
      boardText += `_No ranked players yet. Be the first to earn!_`;
    } else {
      leaderboard.forEach((u, i) => {
        boardText += `${medals[i] || '#' + (i+1)} *${u.name}* — \`${Number(u.total_earned).toFixed(2)} Coins\` (${u.total_ads} ads)\n`;
      });
    }

    await ctx.replyWithMarkdown(boardText, Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back to Menu', 'back_home')]
    ]));
  } catch (err) {
    console.error('Error in leaderboard:', err);
  }
});

// Action: Help & FAQ
bot.action('help', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);

    const helpMsg = 
`ℹ️ *Earn_By_adBOt FAQ & Guide:*
━━━━━━━━━━━━━━━━━━━
❓ *How do I earn money?*
• Watch short sponsored video ads (10-15s).
• Claim daily streak login rewards every 24h.
• Invite friends with your referral link (10% commission).

❓ *How do withdrawals work?*
• Once you reach *500 Coins ($0.50)*, open the Mini App wallet to request payout in TON, USDT, or UPI.
• Payouts are processed within 24 hours.

❓ *Is it safe & legit?*
• Advertisers pay to show ads in the bot/Mini App, and we share revenue directly with you!`;

    await ctx.replyWithMarkdown(helpMsg, Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Back to Menu', 'back_home')]
    ]));
  } catch (err) {
    console.error('Error in help:', err);
  }
});

// Action: Back Home
bot.action('back_home', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await db.getOrCreateUser(telegramId, { first_name: ctx.from.first_name });

    const welcomeMsg = 
`👋 *Earn_By_adBOt Dashboard* 💎

💎 *Balance:* \`${Number(user.balance || 0).toFixed(2)} Coins\`
🎬 *Ads Watched:* \`${user.total_ads_watched || 0}\`
🔥 *Streak:* \`${user.daily_streak || 0} days\`

Choose an option below:`;

    await ctx.replyWithMarkdown(welcomeMsg, getMainKeyboard(telegramId));
  } catch (err) {
    console.error('Error in back_home:', err);
  }
});

// Start bot function with auto-reconnect & error handler
async function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === 'YOUR_NEW_TOKEN') {
    return;
  }

  try {
    const me = await bot.telegram.getMe();
    console.log(`🤖 Telegram Bot Connected: @${me.username} (${me.first_name})`);
    await bot.launch();
    console.log('⚡ Polling active — listening for /start and user actions!');
  } catch (err) {
    console.error('❌ Bot launch error:', err.message);
  }

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

if (require.main === module) {
  startBot();
}

module.exports = { bot, startBot };
