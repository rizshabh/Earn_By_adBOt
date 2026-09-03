# 🚀 Deployment Guide — Earn_By_adBOt

This guide explains how to host your Telegram Bot and Mini App online with a **free HTTPS URL** (so real ads and Telegram Web App buttons work 24/7).

---

## 🌟 Option A: Deploy Free to [Render.com](https://render.com) (Recommended)

1. Create a free account at [render.com](https://render.com).
2. Push your project to a GitHub repository (make sure `.env` is ignored by `.gitignore`).
3. In Render Dashboard, click **New +** → **Web Service**.
4. Connect your GitHub repository.
5. Set:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** `Free`
6. Under **Environment Variables**, add:
   - `BOT_TOKEN`: *(Your Telegram bot token from @BotFather)*
   - `WEBAPP_URL`: *(Your Render service URL, e.g. `https://earn-by-adbot.onrender.com`)*
   - `ADSGRAM_BLOCK_ID`: *(Optional: Your block ID from adsgram.ai)*
7. Click **Deploy Web Service**!

---

## ⚡ Option B: Instant Local HTTPS with [ngrok](https://ngrok.com) or [localtunnel](https://localtunnel.github.io/www/) (No GitHub needed!)

If you want to test HTTPS directly from your computer right now:

### Using localtunnel (Free, zero install required):
Open a new terminal on your PC and run:
```bash
npx localtunnel --port 3000
```
You will receive an HTTPS URL, for example: `https://cool-panda-42.loca.lt`

1. Open `.env` and add:
   ```env
   WEBAPP_URL=https://cool-panda-42.loca.lt
   ```
2. Restart the app (`npm start`).
3. Now clicking **Open Mini App** in Telegram will open the real Mini App directly inside Telegram!

---

## 💰 Connecting Real Ads (AdsGram & Monetag)

### 1. AdsGram ([adsgram.ai](https://adsgram.ai))
1. Register on [adsgram.ai](https://adsgram.ai) with your Telegram account.
2. Add your bot: `@Earn_By_adBOt`.
3. Create a **Rewarded Video Ad Block** and copy the **Block ID** (e.g. `block-1234`).
4. Add to your `.env`:
   ```env
   ADSGRAM_BLOCK_ID=block-1234
   ```
5. When users click "Watch Video Ad", real advertisers' video ads will play and payout directly to you!

### 2. Monetag ([monetag.com](https://monetag.com))
1. Sign up on Monetag as a Publisher.
2. Add your website/Mini App domain.
3. Choose **Rewarded Interstitial** or **In-Page Push**.
4. Place the zone/tag script inside `public/index.html`.
