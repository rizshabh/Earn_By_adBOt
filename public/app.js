// Telegram Mini App Client Script
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// User state
let currentUser = null;
let currentAdSession = null;
let adTimerInterval = null;
let selectedPaymentMethod = 'TON Wallet';

// Extract Telegram User or fallback to demo user for testing in desktop browser
function getTelegramUser() {
  const unsafeUser = tg?.initDataUnsafe?.user;
  if (unsafeUser && unsafeUser.id) {
    return {
      telegram_id: String(unsafeUser.id),
      first_name: unsafeUser.first_name || 'Player',
      username: unsafeUser.username || ''
    };
  }

  // Check URL params for testing (e.g. ?id=123456&name=Alex)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('id')) {
    return {
      telegram_id: urlParams.get('id'),
      first_name: urlParams.get('name') || 'Player',
      username: urlParams.get('username') || ''
    };
  }

  // Fallback demo user for direct browser preview
  let localDemoId = localStorage.getItem('demo_tg_id');
  if (!localDemoId) {
    localDemoId = 'demo_' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('demo_tg_id', localDemoId);
  }

  return {
    telegram_id: localDemoId,
    first_name: 'Ad Explorer',
    username: 'EarnPlayer'
  };
}

const activeUser = getTelegramUser();

let adConfig = { adsgramBlockId: '', monetagTagId: '', testMode: true };
let adsgramController = null;

// Initialize App
async function initApp() {
  // Update header avatar & name
  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = activeUser.first_name || activeUser.username || 'User';

  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) {
    const initial = (activeUser.first_name || activeUser.username || 'U')[0].toUpperCase();
    avatarEl.textContent = initial;
  }

  // Load Ad Network Config
  try {
    const cfgRes = await fetch('/api/ad-config');
    const cfgData = await cfgRes.json();
    if (cfgData.success) {
      adConfig = cfgData;
      if (adConfig.adsgramBlockId && window.Adsgram) {
        adsgramController = window.Adsgram.init({ blockId: adConfig.adsgramBlockId, debug: false });
        console.log('AdsGram SDK initialized with Block ID:', adConfig.adsgramBlockId);
      }
    }
  } catch (e) {
    console.warn('Ad config check failed:', e);
  }

  // Sync user with backend
  await syncUserData();
  // Fetch leaderboard
  fetchLeaderboard();
}

// Fetch / Sync User Data
async function syncUserData() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const startParam = tg?.initDataUnsafe?.start_param || urlParams.get('ref') || null;

    const res = await fetch('/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: activeUser.telegram_id,
        first_name: activeUser.first_name,
        username: activeUser.username,
        referred_by: startParam ? startParam.replace('ref_', '') : null
      })
    });

    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      updateUI();
      if (data.withdrawals) {
        renderWithdrawals(data.withdrawals);
      }
    }
  } catch (err) {
    console.error('Failed to sync user data:', err);
  }
}

// Update UI elements with latest state
function updateUI() {
  if (!currentUser) return;

  const balance = Number(currentUser.balance || 0);
  document.getElementById('userBalance').textContent = balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  // INR Conversion: 10 Coins = ₹1.00 INR (100 Coins = ₹10.00, 500 Coins = ₹50.00)
  const inrVal = (balance / 10).toFixed(2);
  const totalEarnedInr = (Number(currentUser.total_earned || 0) / 10).toFixed(2);

  const fiatEl = document.getElementById('fiatValue');
  if (fiatEl) fiatEl.textContent = inrVal;

  const earnedInrEl = document.getElementById('totalEarnedInr');
  if (earnedInrEl) earnedInrEl.textContent = totalEarnedInr;

  document.getElementById('adsToday').textContent = currentUser.ads_watched_today || 0;
  document.getElementById('refCount').textContent = currentUser.total_referrals || 0;
  document.getElementById('streakCount').textContent = currentUser.daily_streak || 0;

  // Referral tab
  document.getElementById('refTotalInvited').textContent = currentUser.total_referrals || 0;
  const refEarned = (Number(currentUser.total_referrals || 0) * 10).toFixed(0);
  document.getElementById('refTotalEarned').textContent = refEarned;

  const botName = window.location.hostname.includes('localhost') ? 'EarnByAdBot' : 'EarnByAdBot';
  const refLink = `https://t.me/${botName}?start=ref_${currentUser.telegram_id}`;
  const refLinkInput = document.getElementById('refLinkInput');
  if (refLinkInput) refLinkInput.value = refLink;

  renderStreakCalendar();
}

// Render Daily Streak 7-Day Grid
function renderStreakCalendar() {
  const streakGrid = document.getElementById('streakGrid');
  if (!streakGrid) return;
  streakGrid.innerHTML = '';

  const bonuses = [20, 30, 45, 60, 80, 100, 150];
  const currentStreak = Number(currentUser?.daily_streak || 0);

  for (let i = 1; i <= 7; i++) {
    const tile = document.createElement('div');
    tile.className = 'streak-tile';
    
    if (i <= currentStreak) {
      tile.classList.add('completed');
    } else if (i === currentStreak + 1 || (currentStreak === 0 && i === 1)) {
      tile.classList.add('active');
    }

    tile.innerHTML = `
      <span class="streak-day">Day ${i}</span>
      <span class="streak-reward">+${bonuses[i - 1]}</span>
      <span style="font-size: 0.8rem">${i <= currentStreak ? '✅' : '💎'}</span>
    `;
    streakGrid.appendChild(tile);
  }
}

// Switch Bottom Tabs
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add('active');
  if (btn) btn.classList.add('active');

  triggerHaptic('light');

  if (tabId === 'leaderboard') {
    fetchLeaderboard();
  }
}

// AD WATCHING WORKFLOW
async function startAd(adType) {
  triggerHaptic('medium');

  try {
    const res = await fetch('/api/ad/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: activeUser.telegram_id, ad_type: adType })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Ad unavailable right now.');
      return;
    }

    currentAdSession = data.token;

    // If real AdsGram ad network is configured, trigger real rewarded video ad
    if (adsgramController && (adType === 'video' || adType === 'sponsor')) {
      showToast('🎬 Loading sponsored video ad...');
      adsgramController.show().then(async (result) => {
        // User watched the complete real ad!
        await claimAdReward();
      }).catch((err) => {
        console.warn('AdsGram ad dismissed or error:', err);
        showToast('⚠️ Ad was closed early or could not be loaded.');
      });
      return;
    }

    // Default: Open Interactive Ad Player modal
    openAdModal(adType);
  } catch (err) {
    showToast('Failed to load ad. Please try again.');
  }
}

function openAdModal(adType) {
  const modal = document.getElementById('adModal');
  const timerEl = document.getElementById('adTimer');
  const barEl = document.getElementById('adProgressBar');
  const claimBtn = document.getElementById('btnClaimAdReward');
  const instrEl = document.getElementById('adInstruction');

  modal.classList.remove('hidden');
  claimBtn.classList.add('hidden');
  instrEl.style.display = 'block';
  instrEl.textContent = 'Please watch until the countdown finishes...';

  let duration = adType === 'fast' ? 5 : (adType === 'sponsor' ? 8 : 10);
  let timeLeft = duration;
  timerEl.textContent = `${timeLeft}s`;
  barEl.style.width = '0%';

  const adTitles = [
    { title: 'TON Ecosystem Games', sub: 'Play & earn real crypto rewards on Telegram.' },
    { title: 'DEX Liquidity Staking', sub: 'Earn up to 18% APY on stablecoins.' },
    { title: 'AI Telegram Trading Bot', sub: 'Automate high-frequency crypto trading.' }
  ];
  const randAd = adTitles[Math.floor(Math.random() * adTitles.length)];
  document.getElementById('adTitle').textContent = randAd.title;
  document.getElementById('adSubtitle').textContent = randAd.sub;

  if (adTimerInterval) clearInterval(adTimerInterval);

  const startTime = Date.now();
  adTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const progress = Math.min(100, (elapsed / duration) * 100);
    barEl.style.width = `${progress}%`;

    const remaining = Math.max(0, Math.ceil(duration - elapsed));
    timerEl.textContent = `${remaining}s`;

    if (remaining <= 0) {
      clearInterval(adTimerInterval);
      timerEl.textContent = 'COMPLETE ✅';
      instrEl.style.display = 'none';
      claimBtn.classList.remove('hidden');
      triggerHaptic('success');
    }
  }, 100);
}

async function claimAdReward() {
  if (!currentAdSession) return;

  try {
    const res = await fetch('/api/ad/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: activeUser.telegram_id,
        token: currentAdSession
      })
    });

    const data = await res.json();
    if (data.success) {
      closeAdModal();
      showToast(`🎉 Earned +${data.reward} Coins!`);
      triggerHaptic('success');
      await syncUserData();
    } else {
      showToast(data.error || 'Failed to verify ad reward.');
    }
  } catch (err) {
    showToast('Network error verifying ad.');
  }
}

function closeAdModal() {
  if (adTimerInterval) clearInterval(adTimerInterval);
  document.getElementById('adModal').classList.add('hidden');
  currentAdSession = null;
}

// DAILY BONUS WORKFLOW
async function claimDailyBonus() {
  triggerHaptic('medium');
  try {
    const res = await fetch('/api/daily-bonus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: activeUser.telegram_id })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`🎁 Claimed +${data.reward} Coins! Streak: Day ${data.streak}`);
      triggerHaptic('success');
      await syncUserData();
    } else {
      showToast(data.error || 'Daily bonus cannot be claimed right now.');
    }
  } catch (err) {
    showToast('Network error claiming bonus.');
  }
}

// WALLET & WITHDRAWAL WORKFLOW
function selectMethod(btn) {
  document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedPaymentMethod = btn.getAttribute('data-method');

  const addrLabel = document.getElementById('addressLabel');
  const inputEl = document.getElementById('withdrawAddress');

  if (selectedPaymentMethod.includes('UPI')) {
    addrLabel.textContent = 'UPI ID (e.g. mobile@upi / username@okhdfcbank)';
    inputEl.placeholder = 'e.g. 9876543210@paytm or name@okaxis';
  } else if (selectedPaymentMethod.includes('Paytm')) {
    addrLabel.textContent = 'Paytm Registered Mobile Number (10 digits)';
    inputEl.placeholder = 'e.g. 9876543210';
  } else if (selectedPaymentMethod.includes('Bank')) {
    addrLabel.textContent = 'Bank Account Number + IFSC Code';
    inputEl.placeholder = 'e.g. 123456789012, SBIN0001234';
  } else {
    addrLabel.textContent = 'Crypto (USDT TRC20 or TON Wallet Address)';
    inputEl.placeholder = 'e.g. T... or UQ...';
  }
}

function setMaxWithdraw() {
  if (currentUser) {
    document.getElementById('withdrawAmount').value = Math.floor(currentUser.balance || 0);
  }
}

async function submitWithdrawal() {
  const address = document.getElementById('withdrawAddress').value.trim();
  const amount = Number(document.getElementById('withdrawAmount').value);

  if (!address) {
    showToast('Please enter your payment address / UPI ID.');
    return;
  }

  if (isNaN(amount) || amount < 500) {
    showToast('Minimum withdrawal is 500 Coins (₹50.00).');
    return;
  }

  if (Number(currentUser?.balance || 0) < amount) {
    showToast('Insufficient balance.');
    return;
  }

  triggerHaptic('medium');

  try {
    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: activeUser.telegram_id,
        amount,
        method: selectedPaymentMethod,
        address
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('✅ Payout requested! Processing in 1-24 hours.');
      document.getElementById('withdrawAddress').value = '';
      document.getElementById('withdrawAmount').value = '';
      triggerHaptic('success');
      await syncUserData();
    } else {
      showToast(data.error || 'Failed to submit withdrawal.');
    }
  } catch (err) {
    showToast('Network error submitting request.');
  }
}

function renderWithdrawals(txs) {
  const listEl = document.getElementById('txHistoryList');
  if (!listEl) return;

  if (!txs || txs.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No withdrawal requests yet.</div>';
    return;
  }

  listEl.innerHTML = txs.map(tx => `
    <div class="tx-item">
      <div>
        <strong>${tx.amount} Coins</strong>
        <div style="font-size: 0.72rem; color: #94a3b8">${tx.method} &bull; ${new Date(tx.created_at).toLocaleDateString()}</div>
      </div>
      <span class="tx-status-pending">${tx.status}</span>
    </div>
  `).join('');
}

// REFERRAL ACTIONS
function copyReferralLink() {
  const input = document.getElementById('refLinkInput');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('📋 Referral link copied to clipboard!');
    triggerHaptic('light');
  }
}

function shareReferral() {
  const input = document.getElementById('refLinkInput');
  const url = input ? input.value : '';
  const text = encodeURIComponent('🚀 Earn free crypto & money by watching quick ads! Join with my link:');
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`;

  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
}

// LEADERBOARD WORKFLOW
async function fetchLeaderboard() {
  const listEl = document.getElementById('leaderboardList');
  if (!listEl) return;

  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();

    if (data.success && data.leaderboard) {
      if (data.leaderboard.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No leaderboard data yet. Start watching ads!</div>';
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];
      listEl.innerHTML = data.leaderboard.map(item => `
        <div class="leaderboard-row">
          <div class="leaderboard-left">
            <span class="leader-rank">${medals[item.rank - 1] || '#' + item.rank}</span>
            <div>
              <div class="leader-name">${escapeHtml(item.name)}</div>
              <div style="font-size: 0.7rem; color: #64748b">${item.total_ads} ads watched</div>
            </div>
          </div>
          <div class="leader-score">${Number(item.total_earned).toFixed(2)} 💎</div>
        </div>
      `).join('');
    }
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state">Unable to load leaderboard.</div>';
  }
}

// UTILITIES
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function triggerHaptic(type) {
  try {
    if (tg?.HapticFeedback) {
      if (type === 'light') tg.HapticFeedback.impactOccurred('light');
      else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (e) {}
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

// Launch
initApp();
