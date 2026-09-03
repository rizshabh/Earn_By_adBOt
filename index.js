const app = require('./src/server');
const { startBot } = require('./src/bot');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Earn_By_adBOt System Started!`);
  console.log(`🌐 Web App & API: http://localhost:${PORT}`);
  console.log(`📱 Mini App Preview: http://localhost:${PORT}/?id=123456&name=Tester`);
  console.log(`📡 Health Check: http://localhost:${PORT}/health`);
  console.log(`======================================================\n`);

  // Start Telegram Bot
  startBot();
});

module.exports = server;
