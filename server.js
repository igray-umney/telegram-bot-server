console.log('🔄 Запуск сервера...');

require('dotenv').config();
console.log('📁 .env файл загружен');

const express = require('express');
console.log('📦 Express загружен');

const cors = require('cors');
console.log('📦 CORS загружен');

const TelegramBot = require('node-telegram-bot-api');
console.log('📦 TelegramBot загружен');

const cron = require('node-cron');
console.log('📦 node-cron загружен');

const app = express();
const PORT = process.env.PORT || 5000;
console.log('🔧 Express app создан, порт:', PORT);

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://your-app.netlify.app';

console.log('🔑 BOT_TOKEN найден:', !!BOT_TOKEN);
console.log('🌐 APP_URL:', APP_URL);

if (!BOT_TOKEN) {
  console.error('❌ Ошибка: BOT_TOKEN не найден в .env файле');
  process.exit(1);
}

console.log('✅ Создаём бота...');

// Создаем бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 Бот создан с polling');

// Middleware
app.use(cors());
app.use(express.json());

// База данных пользователей (в реальном проекте используй MongoDB/PostgreSQL)
let users = new Map();
let notifications = new Map();

console.log('💾 База данных инициализирована');

// Обработчики команд бота
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;

  console.log('👤 Новый пользователь:', firstName, userId);

  // Сохраняем пользователя
  users.set(userId, {
    chatId,
    username,
    firstName,
    active: true,
    notifications: false
  });

  const welcomeMessage = `🌟 Добро пожаловать в Развивайка!

Привет, ${firstName}! Это бот для напоминаний о развивающих занятиях с детьми.

🎯 Что я умею:
• Напоминать о времени занятий
• Отправлять мотивирующие сообщения
• Следить за вашим прогрессом

Команды:
/app - Открыть приложение
/help - Справка

Для начала нажмите на кнопку "Открыть приложение" ⬇️`;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Открыть приложение',
            web_app: { url: APP_URL }
          }
        ],
        [
          { text: '🔔 Настроить уведомления', callback_data: 'setup_notifications' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeMessage, options);
});

bot.onText(/\/app/, (msg) => {
  const chatId = msg.chat.id;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Открыть приложение',
            web_app: { url: APP_URL }
          }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, '🎯 Нажмите на кнопку ниже, чтобы открыть приложение:', options);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `📱 Справка по использованию

🎯 Основные команды:
/start - Перезапустить бота
/app - Открыть приложение
/help - Показать эту справку

🔔 Уведомления:
Бот может напоминать о времени занятий с ребенком. Настройте время и тип уведомлений в приложении.

❓ Возникли вопросы?
Напишите разработчику`;

  bot.sendMessage(chatId, helpMessage);
});

// Обработка callback кнопок
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;

  if (data === 'setup_notifications') {
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🌅 Утром (09:00)', callback_data: 'time_09:00' },
            { text: '🌆 Вечером (19:00)', callback_data: 'time_19:00' }
          ],
          [
            { text: '⚙️ Настроить в приложении', web_app: { url: APP_URL } }
          ]
        ]
      }
    };

    bot.editMessageText(
      '⏰ Выберите время для напоминаний:',
      {
        chat_id: chatId,
        message_id: message.message_id,
        reply_markup: options.reply_markup
      }
    );
  }

  if (data.startsWith('time_')) {
    const time = data.replace('time_', '');
    
    // Сохраняем настройки
    if (users.has(userId)) {
      const user = users.get(userId);
      user.notifications = true;
      user.notificationTime = time;
      users.set(userId, user);
    }

    // Добавляем в расписание уведомлений
    notifications.set(userId, {
      time: time,
      enabled: true,
      type: 'daily'
    });

    bot.editMessageText(
      `✅ Уведомления настроены на ${time}!\n\nТеперь я буду напоминать о занятиях каждый день в это время.`,
      {
        chat_id: chatId,
        message_id: message.message_id
      }
    );

    console.log('🔔 Настроены уведомления для пользователя:', userId, 'время:', time);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// API эндпоинты для приложения

// Подключение уведомлений
app.post('/api/telegram/connect', (req, res) => {
  const { userId, username, settings } = req.body;

  console.log('🔗 Запрос на подключение уведомлений:', userId);

  if (users.has(userId)) {
    const user = users.get(userId);
    user.notifications = true;
    user.notificationTime = settings.time;
    users.set(userId, user);

    notifications.set(userId, {
      time: settings.time,
      enabled: true,
      type: settings.reminderType || 'daily'
    });

    res.json({ success: true, message: 'Уведомления подключены' });
  } else {
    res.status(404).json({ success: false, message: 'Пользователь не найден' });
  }
});

// Отправка тестового уведомления
app.post('/api/telegram/send-notification', (req, res) => {
  const { userId, message } = req.body;

  console.log('📧 Отправка тестового уведомления:', userId);

  if (users.has(userId)) {
    const user = users.get(userId);
    bot.sendMessage(user.chatId, `🔔 ${message}`);
    res.json({ success: true, message: 'Уведомление отправлено' });
  } else {
    res.status(404).json({ success: false, message: 'Пользователь не найден' });
  }
});

// Создание инвойса для оплаты
app.post('/api/telegram/create-invoice', async (req, res) => {
  const { userId, amount, description, payload } = req.body;

  try {
    console.log('💳 Создание инвойса для пользователя:', userId);
    
    // Пока что симуляция - в реальном проекте здесь будет настоящий платёж
    res.json({ 
      success: true, 
      invoiceUrl: 'https://t.me/invoice/test',
      message: 'Функция оплаты в разработке' 
    });
  } catch (error) {
    console.error('Ошибка создания инвойса:', error);
    res.status(500).json({ success: false, message: 'Ошибка создания платежа' });
  }
});

// Планировщик уведомлений - проверяем каждую минуту
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // ===== ДОБАВЛЯЕМ ОТЛАДОЧНЫЕ СООБЩЕНИЯ =====
  console.log('⏰ Проверка времени:', currentTime, 'UTC время:', now.toISOString());
  console.log('👥 Всего пользователей:', users.size);
  console.log('🔔 Всего уведомлений:', notifications.size);
  
  // Показываем все настроенные уведомления
  if (notifications.size > 0) {
    console.log('📋 Список всех уведомлений:');
    notifications.forEach((notification, userId) => {
      const user = users.get(userId);
      console.log(`  - Пользователь: ${user?.firstName || userId} (ID: ${userId})`);
      console.log(`    Время: ${notification.time}, Включено: ${notification.enabled}`);
    });
  } else {
    console.log('📭 Нет настроенных уведомлений');
  }
  // ===== КОНЕЦ ОТЛАДКИ =====

  // Оригинальный код проверки уведомлений
  notifications.forEach((notification, userId) => {
    console.log(`🔍 Проверяем: ${notification.time} === ${currentTime}? ${notification.time === currentTime}`);
    
    if (notification.enabled && notification.time === currentTime) {
      if (users.has(userId)) {
        const user = users.get(userId);
        console.log(`📬 ОТПРАВЛЯЕМ уведомление пользователю: ${user.firstName} (${userId})`);
        
        const messages = [
          '🌟 Время для развития! Готовы к новым открытиям?',
          '🎯 Пора заниматься! Каждый день - это прогресс!',
          '💫 Время интересных активностей с малышом!',
          '🚀 Готовы развиваться? Выберите активность в приложении!'
        ];

        const randomMessage = messages[Math.floor(Math.random() * messages.length)];

        const options = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🚀 Открыть приложение',
                  web_app: { url: APP_URL }
                }
              ]
            ]
          }
        };

        bot.sendMessage(user.chatId, `🔔 ${randomMessage}`, options)
          .then(() => {
            console.log('✅ Уведомление отправлено успешно');
          })
          .catch((error) => {
            console.error('❌ Ошибка отправки уведомления:', error.message);
          });
      } else {
        console.log(`❌ Пользователь ${userId} не найден в базе users`);
      }
    }
  });
});

// Команда для проверки времени сервера
bot.onText(/\/time/, (msg) => {
  const chatId = msg.chat.id;
  const now = new Date();
  const utcTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const serverTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let notificationsList = '';
  notifications.forEach((notification, userId) => {
    const user = users.get(userId);
    notificationsList += `${user?.firstName || userId}: ${notification.time}\n`;
  });
  
  bot.sendMessage(chatId, 
    `🕐 Время сервера: ${serverTime}\n` +
    `🌍 UTC время: ${utcTime}\n` +
    `👥 Пользователей: ${users.size}\n` +
    `🔔 Уведомлений: ${notifications.size}\n\n` +
    `📋 Настроенные уведомления:\n${notificationsList || 'Нет уведомлений'}`
  );
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
});

bot.on('error', (error) => {
  console.error('❌ Ошибка бота:', error.message);
});

// Статические эндпоинты
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Telegram Bot API для Развивайка работает!',
    users: users.size,
    notifications: notifications.size,
    uptime: process.uptime()
  });
});

app.get('/status', (req, res) => {
  res.json({
    bot: 'online',
    users: users.size,
    notifications: notifications.size,
    uptime: process.uptime()
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('🚀 Сервер запущен на порту', PORT);
  console.log('📱 Подключено пользователей:', users.size);
  console.log('🔔 Активных уведомлений:', notifications.size);
  console.log('⏰ Планировщик уведомлений запущен');
  console.log('✅ Всё готово к работе!');
});

// Обработка ошибок процесса
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught Exception:', error);
  process.exit(1);
});
