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

// 3. Start Ad Session (Anti-fraud verification)
app.post('/api/ad/start', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) {
      return res.status(400).json({ success: false, error: 'telegram_id is required' });
    }

    const token = await db.startAdSession(telegram_id);
    res.json({ success: true, token });
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
