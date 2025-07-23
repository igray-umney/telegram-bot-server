require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация бота с обработкой ошибок
let bot;
try {
  bot = new TelegramBot(TOKEN, { 
    polling: {
      interval: 1000,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });
  
  console.log('🤖 Бот инициализирован');
} catch (error) {
  console.error('❌ Ошибка инициализации бота:', error);
  process.exit(1);
}

// Обработка ошибок бота
bot.on('error', (error) => {
  console.error('❌ Ошибка бота:', error);
});

bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error);
});

// Файл для хранения данных
const dataFile = path.join(__dirname, 'users.json');

// Инициализация файла данных
if (!fs.existsSync(dataFile)) {
  const initialData = {
    users: [],
    notifications: []
  };
  fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
  console.log('📄 Создан файл данных');
}

// Функции для работы с данными
function loadData() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Ошибка загрузки данных:', error);
    return { users: [], notifications: [] };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Ошибка сохранения данных:', error);
    return false;
  }
}

// API Endpoints
app.get('/api/telegram/status/:userId', (req, res) => {
  const userId = req.params.userId;
  
  try {
    console.log('🔍 Проверка статуса для пользователя:', userId);
    
    const data = loadData();
    const user = data.users.find(u => u.userId === userId);
    
    if (user) {
      console.log('✅ Пользователь найден:', { userId: user.userId, enabled: user.enabled, time: user.time });
      res.json({
        connected: true,
        enabled: user.enabled,
        time: user.time,
        type: user.reminderType || 'motivational'
      });
    } else {
      console.log('❌ Пользователь не найден');
      res.json({
        connected: false,
        enabled: false,
        time: '19:00',
        type: 'motivational'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка при получении статуса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/telegram/connect', (req, res) => {
  const { userId, username, settings } = req.body;
  
  try {
    console.log('🔗 Запрос на подключение:', { userId, username });
    
    const data = loadData();
    let user = data.users.find(u => u.userId === userId);
    
    if (user) {
      // Обновляем существующего пользователя
      user.enabled = true;
      user.time = settings.time;
      user.reminderType = settings.reminderType;
      user.lastActive = new Date().toISOString();
      console.log('✅ Обновлен существующий пользователь');
    } else {
      // Создаем нового пользователя
      user = {
        userId: userId,
        username: username,
        enabled: true,
        time: settings.time,
        reminderType: settings.reminderType,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      data.users.push(user);
      console.log('✅ Создан новый пользователь');
    }
    
    if (saveData(data)) {
      res.json({ 
        success: true, 
        message: 'Подключение успешно',
        needsBotStart: !user.hasStarted 
      });
    } else {
      res.status(500).json({ success: false, message: 'Ошибка сохранения' });
    }
    
  } catch (error) {
    console.error('❌ Ошибка подключения:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

app.post('/api/telegram/send-notification', (req, res) => {
  const { userId, message } = req.body;
  
  try {
    console.log('📤 Отправка уведомления:', { userId, message: message.substring(0, 50) + '...' });
    
    bot.sendMessage(userId, message)
      .then(() => {
        console.log('✅ Уведомление отправлено');
        res.json({ success: true });
      })
      .catch((error) => {
        console.error('❌ Ошибка отправки:', error);
        res.status(500).json({ success: false, error: error.message });
      });
      
  } catch (error) {
    console.error('❌ Ошибка при отправке уведомления:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Обработчики бота
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  console.log('👋 Получена команда /start от:', userId);
  
  try {
    const data = loadData();
    let user = data.users.find(u => u.userId === userId);
    
    if (user) {
      user.hasStarted = true;
      user.lastActive = new Date().toISOString();
      saveData(data);
    }
    
    const welcomeMessage = `
🌟 Добро пожаловать в бота Развивайка!

Я буду напоминать вам о занятиях с ребенком и помогать отслеживать прогресс.

Для настройки уведомлений вернитесь в приложение и нажмите "Подключить уведомления".

Удачного развития! 🚀`;

    bot.sendMessage(chatId, welcomeMessage);
    
  } catch (error) {
    console.error('❌ Ошибка обработки /start:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

// Cron для проверки уведомлений
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM
  
  console.log(`⏰ Проверка времени: ${currentTime}`);
  
  try {
    const data = loadData();
    console.log(`👥 Всего пользователей: ${data.users.length}`);
    console.log(`🔔 Всего уведомлений: ${data.notifications?.length || 0}`);
    
    data.users.forEach(user => {
      console.log(`🔍 Пользователь ${user.userId}: время ${user.time}, включено ${user.enabled}`);
      
      if (user.enabled && user.time === currentTime && user.hasStarted) {
        // Отправляем уведомление
        const messages = [
          `🌟 Время для развития! Готовы к новым открытиям?`,
          `💫 Пора заниматься! Каждый день - новое достижение!`,
          `🎯 Время развиваться! Ваш малыш ждет интересную активность!`
        ];
        
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        bot.sendMessage(user.userId, message)
          .then(() => {
            console.log(`✅ Уведомление отправлено пользователю ${user.userId}`);
          })
          .catch((error) => {
            console.error(`❌ Ошибка отправки пользователю ${user.userId}:`, error);
          });
      }
    });
  } catch (error) {
    console.error('❌ Ошибка в cron задаче:', error);
  }
});

// Базовый маршрут
app.get('/', (req, res) => {
  res.json({ 
    message: 'Telegram Bot Server работает!', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Запуск сервера с правильной обработкой
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});

// Настройка keep-alive
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

// Правильная обработка сигналов завершения
let isShuttingDown = false;

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`📤 Получен сигнал ${signal}, начинаем корректное завершение...`);
  
  // Останавливаем бота
  if (bot) {
    try {
      bot.stopPolling();
      console.log('✅ Бот остановлен');
    } catch (error) {
      console.error('❌ Ошибка остановки бота:', error);
    }
  }
  
  // Закрываем сервер
  server.close((err) => {
    if (err) {
      console.error('❌ Ошибка закрытия сервера:', err);
      process.exit(1);
    }
    
    console.log('✅ Сервер остановлен корректно');
    process.exit(0);
  });
  
  // Принудительное завершение через 10 секунд
  setTimeout(() => {
    console.log('⏰ Принудительное завершение процесса');
    process.exit(1);
  }, 10000);
}

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  gracefulShutdown('unhandledRejection');
});

console.log('🎉 Сервер полностью инициализирован');
