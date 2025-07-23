require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация бота
let bot;
try {
  bot = new TelegramBot(TOKEN, { 
    polling: {
      interval: 1000,
      autoStart: true,
      params: { timeout: 10 }
    }
  });
  console.log('🤖 Бот инициализирован');
} catch (error) {
  console.error('❌ Ошибка инициализации бота:', error);
  process.exit(1);
}

// Обработка ошибок бота
bot.on('error', (error) => console.error('❌ Ошибка бота:', error));
bot.on('polling_error', (error) => console.error('❌ Ошибка polling:', error));

// Файл для хранения данных
const dataFile = path.join(__dirname, 'users.json');

// Инициализация файла данных
if (!fs.existsSync(dataFile)) {
  const initialData = { users: [], notifications: [] };
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

// Временные зоны
const timezones = {
  'Москва': 3,
  'Санкт-Петербург': 3,
  'Екатеринбург': 5,
  'Новосибирск': 7,
  'Красноярск': 7,
  'Иркутск': 8,
  'Владивосток': 10,
  'Калининград': 2,
  'Самара': 4,
  'Омск': 6,
  'Челябинск': 5,
  'Казань': 3,
  'Нижний Новгород': 3,
  'Ростов-на-Дону': 3,
  'Уфа': 5,
  'Пермь': 5
};

// Время для выбора (8:00-20:00 с шагом 30 мин)
const timeSlots = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00'
];

// Типы сообщений
const messageTypes = {
  'motivational': 'Мотивирующие 🌟',
  'simple': 'Простые ⏰',
  'streak': 'С достижениями 🏆',
  'playful': 'Игривые 🎮'
};

// API Endpoints (упрощенные)
app.get('/api/telegram/status/:userId', (req, res) => {
  const userId = req.params.userId;
  
  try {
    const data = loadData();
    const user = data.users.find(u => u.userId === userId);
    
    if (user && user.hasStarted) {
      res.json({
        connected: true,
        enabled: user.enabled,
        time: user.time,
        timezone: user.timezone || 'Москва',
        type: user.reminderType || 'motivational'
      });
    } else {
      res.json({
        connected: false,
        enabled: false,
        time: '19:00',
        timezone: 'Москва',
        type: 'motivational'
      });
    }
  } catch (error) {
    console.error('❌ Ошибка при получении статуса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/telegram/connect', (req, res) => {
  const { userId } = req.body;
  
  try {
    const data = loadData();
    let user = data.users.find(u => u.userId === userId);
    
    if (user && user.hasStarted) {
      res.json({ 
        success: true, 
        message: 'Уже подключен',
        botUsername: 'umney_kids_bot' // Замените на имя вашего бота
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Сначала напишите боту /start',
        botUsername: 'umney_kids_bot' // Замените на имя вашего бота
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка подключения:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
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
    
    if (!user) {
      user = {
        userId: userId,
        username: msg.from.username,
        firstName: msg.from.first_name,
        enabled: false,
        time: '19:00',
        timezone: 'Москва',
        reminderType: 'motivational',
        hasStarted: true,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      data.users.push(user);
    } else {
      user.hasStarted = true;
      user.lastActive = new Date().toISOString();
    }
    
    saveData(data);
    
    const welcomeMessage = `🌟 Добро пожаловать в Развивайка!

Я помогу вам не забывать о развивающих занятиях с ребенком!

Настройте уведомления:
/settings - Настройки уведомлений
/status - Текущие настройки
/help - Помощь

Удачного развития! 🚀`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚙️ Настройки', callback_data: 'settings' }],
          [{ text: '📊 Статус', callback_data: 'status' }]
        ]
      }
    };

    bot.sendMessage(chatId, welcomeMessage, keyboard);
    
  } catch (error) {
    console.error('❌ Ошибка обработки /start:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка настроек
bot.onText(/\/settings/, (msg) => {
  showSettingsMenu(msg.chat.id, msg.from.id.toString());
});

bot.onText(/\/status/, (msg) => {
  showStatus(msg.chat.id, msg.from.id.toString());
});

// Функция показа меню настроек
function showSettingsMenu(chatId, userId) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (!user) {
    bot.sendMessage(chatId, 'Сначала отправьте /start');
    return;
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: user.enabled ? '🔔 Выключить уведомления' : '🔕 Включить уведомления', callback_data: 'toggle_notifications' }],
        [{ text: `⏰ Время: ${user.time}`, callback_data: 'change_time' }],
        [{ text: `🌍 Город: ${user.timezone}`, callback_data: 'change_timezone' }],
        [{ text: `💬 Тип: ${messageTypes[user.reminderType]}`, callback_data: 'change_type' }],
        [{ text: '📱 Тест уведомления', callback_data: 'test_notification' }],
        [{ text: '❌ Закрыть', callback_data: 'close' }]
      ]
    }
  };

  const message = `⚙️ **Настройки уведомлений**

${user.enabled ? '🟢' : '🔴'} Уведомления: ${user.enabled ? 'Включены' : 'Выключены'}
⏰ Время: ${user.time} 
🌍 Часовой пояс: ${user.timezone} (UTC+${timezones[user.timezone]})
💬 Тип сообщений: ${messageTypes[user.reminderType]}`;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
}

// Функция показа статуса
function showStatus(chatId, userId) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (!user) {
    bot.sendMessage(chatId, 'Сначала отправьте /start');
    return;
  }

  const status = user.enabled ? '🟢 Включены' : '🔴 Выключены';
  const nextNotification = user.enabled ? 
    `Следующее уведомление сегодня в ${user.time} (${user.timezone})` : 
    'Уведомления отключены';

  const message = `📊 **Ваш статус**

${status}
⏰ ${nextNotification}
🌍 Часовой пояс: ${user.timezone}
💬 Тип: ${messageTypes[user.reminderType]}

Для изменения настроек: /settings`;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// Обработка callback кнопок
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const userId = callbackQuery.from.id.toString();
  const data = callbackQuery.data;

  try {
    if (data === 'settings') {
      showSettingsMenu(message.chat.id, userId);
    } else if (data === 'status') {
      showStatus(message.chat.id, userId);
    } else if (data === 'toggle_notifications') {
      toggleNotifications(message.chat.id, userId);
    } else if (data === 'change_time') {
      showTimeMenu(message.chat.id, userId);
    } else if (data === 'change_timezone') {
      showTimezoneMenu(message.chat.id, userId);
    } else if (data === 'change_type') {
      showTypeMenu(message.chat.id, userId);
    } else if (data === 'test_notification') {
      sendTestNotification(message.chat.id, userId);
    } else if (data === 'close') {
      bot.deleteMessage(message.chat.id, message.message_id);
    } else if (data.startsWith('time_')) {
      const time = data.replace('time_', '');
      setUserTime(message.chat.id, userId, time);
    } else if (data.startsWith('tz_')) {
      const timezone = data.replace('tz_', '').replace(/_/g, ' ');
      setUserTimezone(message.chat.id, userId, timezone);
    } else if (data.startsWith('type_')) {
      const type = data.replace('type_', '');
      setUserType(message.chat.id, userId, type);
    } else if (data === 'back_to_settings') {
      showSettingsMenu(message.chat.id, userId);
    }

    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('❌ Ошибка обработки callback:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка' });
  }
});

// Функции для обработки настроек
function toggleNotifications(chatId, userId) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.enabled = !user.enabled;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    const status = user.enabled ? 'включены' : 'выключены';
    bot.sendMessage(chatId, `✅ Уведомления ${status}!`);
    
    setTimeout(() => showSettingsMenu(chatId, userId), 1000);
  }
}

function showTimeMenu(chatId, userId) {
  const timeButtons = timeSlots.map(time => [{
    text: time,
    callback_data: `time_${time}`
  }]);
  
  timeButtons.push([{ text: '◀️ Назад', callback_data: 'back_to_settings' }]);

  const keyboard = { reply_markup: { inline_keyboard: timeButtons } };
  
  bot.sendMessage(chatId, '⏰ Выберите время для уведомлений:', keyboard);
}

function showTimezoneMenu(chatId, userId) {
  const tzButtons = Object.keys(timezones).map(tz => [{
    text: `${tz} (UTC+${timezones[tz]})`,
    callback_data: `tz_${tz.replace(/ /g, '_')}`
  }]);
  
  tzButtons.push([{ text: '◀️ Назад', callback_data: 'back_to_settings' }]);

  const keyboard = { reply_markup: { inline_keyboard: tzButtons } };
  
  bot.sendMessage(chatId, '🌍 Выберите ваш город:', keyboard);
}

function showTypeMenu(chatId, userId) {
  const typeButtons = Object.entries(messageTypes).map(([key, value]) => [{
    text: value,
    callback_data: `type_${key}`
  }]);
  
  typeButtons.push([{ text: '◀️ Назад', callback_data: 'back_to_settings' }]);

  const keyboard = { reply_markup: { inline_keyboard: typeButtons } };
  
  bot.sendMessage(chatId, '💬 Выберите тип уведомлений:', keyboard);
}

function setUserTime(chatId, userId, time) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.time = time;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    bot.sendMessage(chatId, `✅ Время установлено: ${time}`);
    setTimeout(() => showSettingsMenu(chatId, userId), 1000);
  }
}

function setUserTimezone(chatId, userId, timezone) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.timezone = timezone;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    bot.sendMessage(chatId, `✅ Часовой пояс установлен: ${timezone} (UTC+${timezones[timezone]})`);
    setTimeout(() => showSettingsMenu(chatId, userId), 1000);
  }
}

function setUserType(chatId, userId, type) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.reminderType = type;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    bot.sendMessage(chatId, `✅ Тип сообщений установлен: ${messageTypes[type]}`);
    setTimeout(() => showSettingsMenu(chatId, userId), 1000);
  }
}

function sendTestNotification(chatId, userId) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    const messages = getMessagesForType(user.reminderType);
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    bot.sendMessage(chatId, `🧪 **Тестовое уведомление:**\n\n${message}`, { parse_mode: 'Markdown' });
  }
}

// Сообщения по типам
function getMessagesForType(type) {
  const messages = {
    motivational: [
      '🌟 Время для развития! Готовы к новым открытиям?',
      '💫 Пора заниматься! Каждый день - новое достижение!',
      '🎯 Время развиваться! Ваш малыш ждет интересную активность!',
      '🚀 Развиваемся вместе! Сегодня изучаем что-то новое?'
    ],
    simple: [
      '⏰ Время для занятий с ребенком',
      '🎯 Напоминание о развивающих активностях',
      '📚 Пора заниматься!',
      '⭐ Время развития!'
    ],
    streak: [
      '🔥 Продолжаем серию! Сегодня занимаемся?',
      '🏆 Каждый день - новое достижение!',
      '👑 Вы на правильном пути! Продолжаем?',
      '⭐ Развиваемся каждый день!'
    ],
    playful: [
      '🎮 Время для игр и развития!',
      '🎪 А что, если сегодня устроим веселые занятия?',
      '🎯 Играем и развиваемся!',
      '🎨 Творим и учимся вместе!'
    ]
  };
  
  return messages[type] || messages.motivational;
}

// Cron для отправки уведомлений с учетом часовых поясов
cron.schedule('* * * * *', () => {
  try {
    const data = loadData();
    const now = new Date();
    
    data.users.forEach(user => {
      if (user.enabled && user.hasStarted) {
        // Рассчитываем время в часовом поясе пользователя
        const userTimezone = timezones[user.timezone] || 3;
        const userTime = new Date(now.getTime() + (userTimezone * 60 * 60 * 1000));
        const currentTime = userTime.toTimeString().slice(0, 5);
        
        if (user.time === currentTime) {
          const messages = getMessagesForType(user.reminderType);
          const message = messages[Math.floor(Math.random() * messages.length)];
          
          bot.sendMessage(user.userId, message)
            .then(() => {
              console.log(`✅ Уведомление отправлено пользователю ${user.userId}`);
            })
            .catch((error) => {
              console.error(`❌ Ошибка отправки пользователю ${user.userId}:`, error);
            });
        }
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

// Запуск сервера
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

// Настройка keep-alive
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

// Обработка сигналов завершения
let isShuttingDown = false;

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`📤 Получен сигнал ${signal}, завершаем работу...`);
  
  if (bot) {
    try {
      bot.stopPolling();
      console.log('✅ Бот остановлен');
    } catch (error) {
      console.error('❌ Ошибка остановки бота:', error);
    }
  }
  
  server.close((err) => {
    if (err) {
      console.error('❌ Ошибка закрытия сервера:', err);
      process.exit(1);
    }
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log('⏰ Принудительное завершение');
    process.exit(1);
  }, 10000);
}

process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  gracefulShutdown('unhandledRejection');
});

console.log('🎉 Сервер полностью инициализирован');
