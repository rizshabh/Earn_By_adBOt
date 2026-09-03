const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Ensure local data directory exists for file-based storage fallback
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const localDbPath = path.join(dataDir, 'database.json');

// Initialize in-memory / file db structure
let localData = {
  users: {},
  adViews: [],
  withdrawals: [],
  adSessions: {}
};

if (fs.existsSync(localDbPath)) {
  try {
    localData = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
  } catch (e) {
    console.error('Error reading local db, starting fresh:', e.message);
  }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(localData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local db:', e.message);
  }
}

// Check if PostgreSQL is configured
let pgPool = null;
let usePostgres = false;

if (process.env.DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    usePostgres = true;
    initPostgresSchema();
  } catch (err) {
    console.warn('Postgres connection failed, falling back to local database:', err.message);
    usePostgres = false;
  }
}

async function initPostgresSchema() {
  if (!pgPool) return;
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id BIGINT PRIMARY KEY,
        username VARCHAR(255),
        first_name VARCHAR(255),
        balance NUMERIC DEFAULT 0,
        total_earned NUMERIC DEFAULT 0,
        ads_watched_today INT DEFAULT 0,
        total_ads_watched INT DEFAULT 0,
        last_ad_watched_at TIMESTAMP,
        daily_streak INT DEFAULT 0,
        last_daily_reward_at TIMESTAMP,
        referred_by BIGINT,
        total_referrals INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ad_views (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT REFERENCES users(telegram_id),
        reward_amount NUMERIC,
        watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT REFERENCES users(telegram_id),
        amount NUMERIC,
        payment_method VARCHAR(50),
        payment_address VARCHAR(255),
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL tables initialized.');
  } catch (err) {
    console.error('PostgreSQL init error, using local fallback:', err.message);
    usePostgres = false;
  }
}

// Database Operations
const db = {
  async getUser(telegramId) {
    const tid = String(telegramId);
    if (usePostgres && pgPool) {
      try {
        const res = await pgPool.query('SELECT * FROM users WHERE telegram_id = $1', [tid]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.error('PG getUser error:', err.message);
      }
    }

    return localData.users[tid] || null;
  },

  async getOrCreateUser(telegramId, info = {}) {
    const tid = String(telegramId);
    let user = await this.getUser(tid);
    const now = new Date().toISOString();

    if (!user) {
      user = {
        telegram_id: tid,
        username: info.username || '',
        first_name: info.first_name || 'User',
        balance: 0,
        total_earned: 0,
        ads_watched_today: 0,
        total_ads_watched: 0,
        last_ad_watched_at: null,
        daily_streak: 0,
        last_daily_reward_at: null,
        referred_by: info.referred_by ? String(info.referred_by) : null,
        total_referrals: 0,
        created_at: now
      };

      if (info.referred_by && info.referred_by !== tid) {
        const refUser = await this.getUser(info.referred_by);
        if (refUser) {
          refUser.total_referrals = (refUser.total_referrals || 0) + 1;
          // Referral signup bonus (e.g. 10 coins / $0.01)
          refUser.balance = Number((Number(refUser.balance || 0) + 10).toFixed(2));
          refUser.total_earned = Number((Number(refUser.total_earned || 0) + 10).toFixed(2));
          if (!usePostgres) {
            localData.users[String(info.referred_by)] = refUser;
          }
        }
      }

      if (usePostgres && pgPool) {
        try {
          await pgPool.query(
            `INSERT INTO users (telegram_id, username, first_name, balance, total_earned, ads_watched_today, total_ads_watched, daily_streak, referred_by, total_referrals)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (telegram_id) DO NOTHING`,
            [user.telegram_id, user.username, user.first_name, user.balance, user.total_earned, user.ads_watched_today, user.total_ads_watched, user.daily_streak, user.referred_by, user.total_referrals]
          );
        } catch (e) {
          console.error('PG create user error:', e.message);
        }
      }

      localData.users[tid] = user;
      saveLocalDb();
    } else {
      // Update names if changed
      if (info.username && info.username !== user.username) user.username = info.username;
      if (info.first_name && info.first_name !== user.first_name) user.first_name = info.first_name;
      localData.users[tid] = user;
      saveLocalDb();
    }

    return user;
  },

  async startAdSession(telegramId) {
    const tid = String(telegramId);
    const token = 'ad_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localData.adSessions[token] = {
      telegram_id: tid,
      startTime: Date.now(),
      reward: 25 // 25 Coins ($0.025)
    };
    return token;
  },

  async completeAdSession(telegramId, token) {
    const tid = String(telegramId);
    const session = localData.adSessions[token];

    if (!session || session.telegram_id !== tid) {
      return { success: false, error: 'Invalid or expired ad session' };
    }

    const elapsed = (Date.now() - session.startTime) / 1000;
    // Require minimum 5 seconds watch time for testing / anti-cheat
    if (elapsed < 4.5) {
      return { success: false, error: 'Ad skipped too quickly. Please watch till the end!' };
    }

    // Delete session token
    delete localData.adSessions[token];

    const reward = session.reward || 25;
    const user = await this.getOrCreateUser(tid);

    user.balance = Number((Number(user.balance || 0) + reward).toFixed(2));
    user.total_earned = Number((Number(user.total_earned || 0) + reward).toFixed(2));
    user.ads_watched_today = (user.ads_watched_today || 0) + 1;
    user.total_ads_watched = (user.total_ads_watched || 0) + 1;
    user.last_ad_watched_at = new Date().toISOString();

    // Reward referrer 10% commission if user was referred
    if (user.referred_by && user.referred_by !== tid) {
      const refUser = await this.getUser(user.referred_by);
      if (refUser) {
        const comm = Number((reward * 0.1).toFixed(2));
        refUser.balance = Number((Number(refUser.balance || 0) + comm).toFixed(2));
        refUser.total_earned = Number((Number(refUser.total_earned || 0) + comm).toFixed(2));
      }
    }

    localData.users[tid] = user;
    localData.adViews.push({
      telegram_id: tid,
      reward,
      watched_at: new Date().toISOString()
    });
    saveLocalDb();

    if (usePostgres && pgPool) {
      try {
        await pgPool.query(
          `UPDATE users SET balance = balance + $1, total_earned = total_earned + $1,
           ads_watched_today = ads_watched_today + 1, total_ads_watched = total_ads_watched + 1,
           last_ad_watched_at = NOW() WHERE telegram_id = $2`,
          [reward, tid]
        );
        await pgPool.query(
          `INSERT INTO ad_views (telegram_id, reward_amount) VALUES ($1, $2)`,
          [tid, reward]
        );
      } catch (err) {
        console.error('PG complete ad error:', err.message);
      }
    }

    return {
      success: true,
      reward,
      newBalance: user.balance,
      totalAds: user.total_ads_watched
    };
  },

  async claimDailyBonus(telegramId) {
    const tid = String(telegramId);
    const user = await this.getOrCreateUser(tid);
    const now = Date.now();
    const lastClaim = user.last_daily_reward_at ? new Date(user.last_daily_reward_at).getTime() : 0;
    const hoursSince = (now - lastClaim) / (1000 * 60 * 60);

    if (hoursSince < 20 && lastClaim > 0) {
      const waitHours = Math.ceil(20 - hoursSince);
      return { success: false, error: `Daily bonus already claimed. Return in ~${waitHours} hours!` };
    }

    // Check streak
    if (hoursSince > 48 && lastClaim > 0) {
      user.daily_streak = 1;
    } else {
      user.daily_streak = ((user.daily_streak || 0) % 7) + 1;
    }

    // Dynamic bonus by streak day: Day 1=20, Day 2=30, ... Day 7=150
    const bonuses = [20, 30, 45, 60, 80, 100, 150];
    const bonus = bonuses[user.daily_streak - 1] || 25;

    user.balance = Number((Number(user.balance || 0) + bonus).toFixed(2));
    user.total_earned = Number((Number(user.total_earned || 0) + bonus).toFixed(2));
    user.last_daily_reward_at = new Date().toISOString();

    localData.users[tid] = user;
    saveLocalDb();

    return {
      success: true,
      reward: bonus,
      streak: user.daily_streak,
      newBalance: user.balance
    };
  },

  async createWithdrawal(telegramId, amount, method, address) {
    const tid = String(telegramId);
    const user = await this.getOrCreateUser(tid);
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Invalid withdrawal amount' };
    }

    // Minimum withdrawal threshold: 500 Coins ($0.50)
    const MIN_WITHDRAW = 500;
    if (numAmount < MIN_WITHDRAW) {
      return { success: false, error: `Minimum withdrawal is ${MIN_WITHDRAW} Coins.` };
    }

    if (Number(user.balance || 0) < numAmount) {
      return { success: false, error: 'Insufficient balance' };
    }

    if (!address || address.trim().length < 4) {
      return { success: false, error: 'Please provide a valid wallet or account address.' };
    }

    user.balance = Number((Number(user.balance) - numAmount).toFixed(2));

    const withdrawalRecord = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      telegram_id: tid,
      amount: numAmount,
      method: method || 'TON Wallet',
      address: address.trim(),
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    localData.withdrawals.push(withdrawalRecord);
    localData.users[tid] = user;
    saveLocalDb();

    if (usePostgres && pgPool) {
      try {
        await pgPool.query(
          `UPDATE users SET balance = balance - $1 WHERE telegram_id = $2`,
          [numAmount, tid]
        );
        await pgPool.query(
          `INSERT INTO withdrawals (telegram_id, amount, payment_method, payment_address, status)
           VALUES ($1, $2, $3, $4, 'PENDING')`,
          [tid, numAmount, method, address]
        );
      } catch (e) {
        console.error('PG withdraw error:', e.message);
      }
    }

    return {
      success: true,
      withdrawal: withdrawalRecord,
      newBalance: user.balance
    };
  },

  async getUserWithdrawals(telegramId) {
    const tid = String(telegramId);
    return localData.withdrawals
      .filter(w => String(w.telegram_id) === tid)
      .slice(-10)
      .reverse();
  },

  async getLeaderboard(limit = 10) {
    const userList = Object.values(localData.users);
    return userList
      .sort((a, b) => (Number(b.total_earned) || 0) - (Number(a.total_earned) || 0))
      .slice(0, limit)
      .map((u, i) => ({
        rank: i + 1,
        name: u.first_name || u.username || `User ${u.telegram_id.slice(-4)}`,
        total_earned: u.total_earned || 0,
        total_ads: u.total_ads_watched || 0
      }));
  },

  async getGlobalStats() {
    const users = Object.values(localData.users);
    const totalUsers = users.length;
    const totalEarned = users.reduce((acc, u) => acc + (Number(u.total_earned) || 0), 0);
    const totalAds = users.reduce((acc, u) => acc + (Number(u.total_ads_watched) || 0), 0);
    const totalPaid = localData.withdrawals.reduce((acc, w) => acc + (w.status === 'APPROVED' ? Number(w.amount) : 0), 0);

    return {
      totalUsers,
      totalEarned,
      totalAds,
      totalPaid,
      pendingWithdrawals: localData.withdrawals.filter(w => w.status === 'PENDING').length
    };
  }
};

module.exports = db;
