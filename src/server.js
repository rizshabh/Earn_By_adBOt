const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Endpoints

// 1. Sync / Register User
app.post('/api/user/sync', async (req, res) => {
  try {
    const { telegram_id, first_name, username, referred_by } = req.body;
    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'telegram_id is required' });
    }

    const user = await db.getOrCreateUser(telegram_id, {
      first_name,
      username,
      referred_by
    });

    const withdrawals = await db.getUserWithdrawals(telegram_id);

    res.json({
      success: true,
      user,
      withdrawals
    });
  } catch (err) {
    console.error('Error syncing user:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 2. Get User Profile
app.get('/api/user/:telegramId', async (req, res) => {
  try {
    const user = await db.getUser(req.params.telegramId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const withdrawals = await db.getUserWithdrawals(req.params.telegramId);
    res.json({ success: true, user, withdrawals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ad Redirect Endpoint (Direct link / smartlink monetization)
app.get('/ad/go/:token', async (req, res) => {
  const token = req.params.token;
  const directUrl = process.env.DIRECT_AD_URL;

  if (directUrl && directUrl.startsWith('http')) {
    return res.redirect(directUrl);
  }

  // If no external direct link is set, serve a dedicated Monetag sponsored ad landing page
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Sponsored Ad</title>
      <!-- Monetag Rewarded Ad SDK (Zone 11718056) -->
      <script src="//libtl.com/sdk.js" data-zone="11718056" data-sdk="show_11718056"></script>
      <style>
        body { margin: 0; background: #0a0e17; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 20px; }
        .box { background: #162035; border: 1px solid #00e5ff; border-radius: 16px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,229,255,0.15); }
        h2 { margin-top: 0; color: #00e5ff; }
        .timer { font-size: 2.2rem; font-weight: bold; color: #ffd600; margin: 16px 0; }
        .btn { display: inline-block; background: #00e676; color: #000; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: bold; margin-top: 16px; font-size: 1.1rem; }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>🎬 Sponsored Video Ad</h2>
        <p>Aapka Monetag ad load ho raha hai. Countdown pura hone par reward claim karein.</p>
        <div class="timer" id="timer">5s</div>
        <div id="cta" style="display: none;">
          <p style="color: #00e676; font-weight: bold; font-size: 1.1rem;">✅ Ad Complete!</p>
          <p style="color: #94a3b8; font-size: 0.9rem;">Telegram par jakar <strong>Claim Reward</strong> dabayein.</p>
          <a href="https://t.me/Earn_By_adBOt" class="btn">Telegram Me Wapas Jayein ➔</a>
        </div>
      </div>
      <script>
        // Auto-trigger Monetag Rewarded Popup
        window.addEventListener('load', () => {
          if (typeof show_11718056 === 'function') {
            show_11718056('pop').catch(e => console.log('Monetag ad notice:', e));
          }
        });

        let count = 5;
        const t = setInterval(() => {
          count--;
          if (count > 0) {
            document.getElementById('timer').innerText = count + 's';
          } else {
            clearInterval(t);
            document.getElementById('timer').innerText = 'COMPLETE ✅';
            document.getElementById('cta').style.display = 'block';
          }
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// 3. Start Ad Session (Anti-fraud verification)
app.post('/api/ad/start', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'telegram_id is required' });
    }

    const sessionInfo = await db.startAdSession(telegram_id);
    res.json({ success: true, ...sessionInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Complete Ad Session & Claim Reward
app.post('/api/ad/complete', async (req, res) => {
  try {
    const { telegram_id, token } = req.body;
    if (!telegram_id || !token) {
      return res.status(400).json({ success: false, error: 'telegram_id and token are required' });
    }

    const result = await db.completeAdSession(telegram_id, token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Daily Streak Bonus
app.post('/api/daily-bonus', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'telegram_id is required' });
    }

    const result = await db.claimDailyBonus(telegram_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Submit Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
  try {
    const { telegram_id, amount, method, address } = req.body;
    if (!telegram_id || !amount || !address) {
      return res.status(400).json({ success: false, error: 'All withdrawal fields are required' });
    }

    const result = await db.createWithdrawal(telegram_id, amount, method, address);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard(15);
    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Global Stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getGlobalStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Ad Network Config
app.get('/api/ad-config', (req, res) => {
  res.json({
    success: true,
    adsgramBlockId: process.env.ADSGRAM_BLOCK_ID || '',
    monetagTagId: process.env.MONETAG_TAG_ID || '',
    testMode: !process.env.ADSGRAM_BLOCK_ID
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Fallback route for SPA (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Earn_By_adBOt Web Server Running!`);
    console.log(`🌐 Local Web App URL: http://localhost:${PORT}`);
    console.log(`📊 API Health: http://localhost:${PORT}/health`);
    console.log(`==============================================\n`);
  });
}

module.exports = app;
