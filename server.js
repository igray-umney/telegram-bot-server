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

// Хранилище ID сообщений меню для каждого пользователя
const userMenuMessages = new Map();

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

// Время для выбора
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

// Функция для отправки меню с автоудалением предыдущего
async function sendMenuMessage(chatId, text, keyboard, userId = null) {
  try {
    // Удаляем предыдущее меню если есть
    if (userId && userMenuMessages.has(userId)) {
      try {
        await bot.deleteMessage(chatId, userMenuMessages.get(userId));
      } catch (error) {
        // Сообщение уже удалено - игнорируем
      }
    }
    
    // Отправляем новое сообщение
    const sentMessage = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...keyboard });
    
    // Сохраняем ID нового сообщения
    if (userId) {
      userMenuMessages.set(userId, sentMessage.message_id);
    }
    
    return sentMessage;
  } catch (error) {
    console.error('❌ Ошибка отправки меню:', error);
  }
}

// Функция для редактирования существующего сообщения
async function editMenuMessage(chatId, messageId, text, keyboard) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (error) {
    // Если не удалось отредактировать, отправляем новое
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...keyboard });
  }
}

// API Endpoints
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
        botUsername: 'razvivayка_bot'
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Сначала напишите боту /start',
        botUsername: 'razvivayка_bot'
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка подключения:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Обработчики бота
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  console.log('👋 Получена команда /start от:', userId);
  
  try {
    // Удаляем команду пользователя
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch (error) {
      // Игнорируем если не удалось удалить
    }
    
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
    
    const welcomeMessage = `🌟 **Добро пожаловать в Развивайка!**

Я помогу вам не забывать о развивающих занятиях с ребенком!

Настройте уведомления с помощью кнопок ниже:`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚙️ Настройки уведомлений', callback_data: 'settings' }],
          [{ text: '📊 Мой статус', callback_data: 'status' }],
          [{ text: '❓ Помощь', callback_data: 'help' }]
        ]
      }
    };

    await sendMenuMessage(chatId, welcomeMessage, keyboard, userId);
    
  } catch (error) {
    console.error('❌ Ошибка обработки /start:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
});

bot.onText(/\/settings/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Удаляем команду пользователя
  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (error) {
    // Игнорируем
  }
  
  showSettingsMenu(chatId, userId);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Удаляем команду пользователя
  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (error) {
    // Игнорируем
  }
  
  showStatus(chatId, userId);
});

// Функции меню
async function showMainMenu(chatId, userId) {
  const welcomeMessage = `🌟 **Развивайка - Главное меню**

Выберите действие:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚙️ Настройки уведомлений', callback_data: 'settings' }],
        [{ text: '📊 Мой статус', callback_data: 'status' }],
        [{ text: '❓ Помощь', callback_data: 'help' }]
      ]
    }
  };

  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), welcomeMessage, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, welcomeMessage, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, welcomeMessage, keyboard, userId);
  }
}

async function showSettingsMenu(chatId, userId) {
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
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  };

  const message = `⚙️ **Настройки уведомлений**

${user.enabled ? '🟢' : '🔴'} Уведомления: ${user.enabled ? 'Включены' : 'Выключены'}
⏰ Время: ${user.time} 
🌍 Часовой пояс: ${user.timezone} (UTC+${timezones[user.timezone]})
💬 Тип сообщений: ${messageTypes[user.reminderType]}`;

  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), message, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, message, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, message, keyboard, userId);
  }
}

async function showStatus(chatId, userId) {
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
💬 Тип: ${messageTypes[user.reminderType]}`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚙️ Изменить настройки', callback_data: 'settings' }],
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  };

  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), message, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, message, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, message, keyboard, userId);
  }
}

async function showHelp(chatId, userId) {
  const helpMessage = `❓ **Справка**

**Команды:**
/start - Запуск бота
/settings - Настройки уведомлений  
/status - Текущий статус

**Возможности:**
🔔 Настройка времени уведомлений
🌍 Выбор часового пояса
💬 Разные типы сообщений
📱 Тестирование уведомлений

**Типы уведомлений:**
🌟 Мотивирующие - вдохновляющие сообщения
⏰ Простые - краткие напоминания
🏆 С достижениями - акцент на прогрессе
🎮 Игривые - веселые сообщения

Удачного развития! 🚀`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  };

  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), helpMessage, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, helpMessage, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, helpMessage, keyboard, userId);
  }
}

// Обработка callback кнопок
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const userId = callbackQuery.from.id.toString();
  const data = callbackQuery.data;

  try {
    if (data === 'main_menu') {
      await showMainMenu(message.chat.id, userId);
    } else if (data === 'settings') {
      await showSettingsMenu(message.chat.id, userId);
    } else if (data === 'status') {
      await showStatus(message.chat.id, userId);
    } else if (data === 'help') {
      await showHelp(message.chat.id, userId);
    } else if (data === 'toggle_notifications') {
      await toggleNotifications(message.chat.id, userId);
    } else if (data === 'change_time') {
      await showTimeMenu(message.chat.id, userId);
    } else if (data === 'change_timezone') {
      await showTimezoneMenu(message.chat.id, userId);
    } else if (data === 'change_type') {
      await showTypeMenu(message.chat.id, userId);
    } else if (data === 'test_notification') {
      await sendTestNotification(message.chat.id, userId);
    } else if (data.startsWith('time_')) {
      const time = data.replace('time_', '');
      await setUserTime(message.chat.id, userId, time);
    } else if (data.startsWith('tz_')) {
      const timezone = data.replace('tz_', '').replace(/_/g, ' ');
      await setUserTimezone(message.chat.id, userId, timezone);
    } else if (data.startsWith('type_')) {
      const type = data.replace('type_', '');
      await setUserType(message.chat.id, userId, type);
    } else if (data === 'back_to_settings') {
      await showSettingsMenu(message.chat.id, userId);
    }

    bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('❌ Ошибка обработки callback:', error);
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка' });
  }
});

// Функции обработки действий
async function toggleNotifications(chatId, userId) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.enabled = !user.enabled;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    const status = user.enabled ? 'включены ✅' : 'выключены ❌';
    
    // Отправляем временное уведомление
    const tempMessage = await bot.sendMessage(chatId, `Уведомления ${status}`);
    
    // Удаляем через 2 секунды
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, tempMessage.message_id);
      } catch (error) {
        // Игнорируем если не удалось удалить
      }
    }, 2000);
    
    // Обновляем меню настроек
    setTimeout(() => showSettingsMenu(chatId, userId), 500);
  }
}

async function showTimeMenu(chatId, userId) {
  const timeButtons = [];
  
  // Группируем по 3 кнопки в ряд для компактности
  for (let i = 0; i < timeSlots.length; i += 3) {
    const row = timeSlots.slice(i, i + 3).map(time => ({
      text: time,
      callback_data: `time_${time}`
    }));
    timeButtons.push(row);
  }
  
  timeButtons.push([{ text: '◀️ Назад к настройкам', callback_data: 'back_to_settings' }]);

  const keyboard = { reply_markup: { inline_keyboard: timeButtons } };
  
  const message = '⏰ **Выберите время для уведомлений:**';
  
  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), message, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, message, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, message, keyboard, userId);
  }
}

async function showTimezoneMenu(chatId, userId) {
  const tzButtons = [];
  
  // Группируем города по 2 в ряд
  const cities = Object.keys(timezones);
  for (let i = 0; i < cities.length; i += 2) {
    const row = cities.slice(i, i + 2).map(tz => ({
      text: `${tz}`,
      callback_data: `tz_${tz.replace(/ /g, '_')}`
    }));
    tzButtons.push(row);
  }
  
  tzButtons.push([{ text: '◀️ Назад к настройкам', callback_data: 'back_to_settings' }]);

  const keyboard = { reply_markup: { inline_keyboard: tzButtons } };
  
  const message = '🌍 **Выберите ваш город:**';
  
  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), message, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, message, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, message, keyboard, userId);
  }
}

async function showTypeMenu(chatId, userId) {
  const typeButtons = Object.entries(messageTypes).map(([key, value]) => [{
    text: value,
    callback_data: `type_${key}`
  }]);
  
  typeButtons.push([{ text: '◀️ Назад к настройкам', callback_data: 'back_to_settings' }]);

  const keyboard = { reply_markup: { inline_keyboard: typeButtons } };
  
  const message = '💬 **Выберите тип уведомлений:**';
  
  if (userMenuMessages.has(userId)) {
    try {
      await editMenuMessage(chatId, userMenuMessages.get(userId), message, keyboard);
    } catch (error) {
      await sendMenuMessage(chatId, message, keyboard, userId);
    }
  } else {
    await sendMenuMessage(chatId, message, keyboard, userId);
  }
}

async function setUserTime(chatId, userId, time) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.time = time;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    // Временное уведомление
    const tempMessage = await bot.sendMessage(chatId, `⏰ Время установлено: ${time}`);
    
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, tempMessage.message_id);
      } catch (error) {}
    }, 2000);
    
    setTimeout(() => showSettingsMenu(chatId, userId), 500);
  }
}

async function setUserTimezone(chatId, userId, timezone) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.timezone = timezone;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    const tempMessage = await bot.sendMessage(chatId, `🌍 Город установлен: ${timezone}`);
    
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, tempMessage.message_id);
      } catch (error) {}
    }, 2000);
    
    setTimeout(() => showSettingsMenu(chatId, userId), 500);
  }
}

async function setUserType(chatId, userId, type) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    user.reminderType = type;
    user.lastActive = new Date().toISOString();
    saveData(data);
    
    const tempMessage = await bot.sendMessage(chatId, `💬 Тип установлен: ${messageTypes[type]}`);
    
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, tempMessage.message_id);
      } catch (error) {}
    }, 2000);
    
    setTimeout(() => showSettingsMenu(chatId, userId), 500);
  }
}

async function sendTestNotification(chatId, userId) {
  const data = loadData();
  const user = data.users.find(u => u.userId === userId);
  
  if (user) {
    const messages = getMessagesForType(user.reminderType);
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    const testMessage = await bot.sendMessage(chatId, `🧪 **Тестовое уведомление:**\n\n${message}`, { parse_mode: 'Markdown' });
    
    // Удаляем тестовое сообщение через 10 секунд
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, testMessage.message_id);
      } catch (error) {}
    }, 10000);
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

// Cron для отправки уведомлений
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
