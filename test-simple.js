require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN не найден');
  process.exit(1);
}

console.log('🔑 BOT_TOKEN найден, длина:', BOT_TOKEN.length);

try {
  const bot = new TelegramBot(BOT_TOKEN, { polling: false });
  console.log('✅ Бот создан успешно');
  
  bot.getMe().then((botInfo) => {
    console.log('🤖 Информация о боте:', botInfo.username);
    process.exit(0);
  }).catch((error) => {
    console.log('❌ Ошибка получения информации о боте:', error.message);
    process.exit(1);
  });
} catch (error) {
  console.log('❌ Ошибка создания бота:', error.message);
  process.exit(1);
}