console.log('🔄 Запуск сервера...');

// Устанавливаем часовой пояс Москвы
process.env.TZ = 'Europe/Moscow';
console.log('🌍 Часовой пояс установлен:', process.env.TZ);

require('dotenv').config();
console.log('📁 .env файл загружен');

const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');

console.log('📦 Все модули загружены');

const app = express();
const PORT = process.env.PORT || 5000;

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://telegram-mini-app-gules-nine.vercel.app/';

console.log('🔑 BOT_TOKEN найден:', !!BOT_TOKEN);
console.log('🌐 APP_URL:', APP_URL);

if (!BOT_TOKEN) {
  console.error('❌ Ошибка: BOT_TOKEN не найден в .env файле');
  process.exit(1);
}

// Создаем бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 Бот создан с polling');

// Middleware
app.use(cors());
app.use(express.json());

// База данных пользователей
let users = new Map();
let notifications = new Map();

// Функции для работы с данными
function saveData() {
  const data = {
    users: Array.from(users.entries()),
    notifications: Array.from(notifications.entries()),
    timestamp: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    console.log('💾 Данные сохранены:', users.size, 'пользователей,', notifications.size, 'уведомлений');
  } catch (error) {
    console.error('❌ Ошибка сохранения:', error.message);
  }
}

function loadData() {
  try {
    if (fs.existsSync('data.json')) {
      const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
      users = new Map(data.users || []);
      notifications = new Map(data.notifications || []);
      console.log('📂 Данные загружены:', users.size, 'пользователей,', notifications.size, 'уведомлений');
    } else {
      console.log('📂 Файл данных не найден, начинаем с пустой базы');
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки:', error.message);
  }
}

console.log('💾 База данных инициализирована');
loadData();

// Автосохранение каждые 5 минут
setInterval(() => {
  console.log('🔄 Автосохранение данных...');
  saveData();
}, 5 * 60 * 1000);

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

  saveData();

  const welcomeMessage = `🌟 Добро пожаловать в Развивайка!

Привет, ${firstName}! Это бот для напоминаний о развивающих занятиях с детьми.

🎯 Что я умею:
• Напоминать о времени занятий
• Отправлять мотивирующие сообщения
• Следить за вашим прогрессом

Команды:
/app - Открыть приложение
/time - Проверить время
/notify HH:MM - Быстро настроить уведомление
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

// Команда для проверки времени сервера
bot.onText(/\/time/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const now = new Date();
  const serverTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const utcTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  
  let notificationsList = '';
  if (notifications.has(userId)) {
    const userNotification = notifications.get(userId);
    notificationsList = `Ваше уведомление: ${userNotification.time}`;
  } else {
    notificationsList = 'У вас нет уведомлений';
  }
  
  bot.sendMessage(chatId, 
    `🕐 Время сервера: ${serverTime}\n` +
    `🌍 UTC время: ${utcTime}\n` +
    `👥 Всего пользователей: ${users.size}\n` +
    `🔔 Всего уведомлений: ${notifications.size}\n\n` +
    `📋 ${notificationsList}`
  );
});

// Команда для быстрой настройки уведомлений
bot.onText(/\/notify (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const time = match[1];

  console.log(`🔔 Команда /notify от пользователя ${userId}, время: ${time}`);

  // Проверяем формат времени
  if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    bot.sendMessage(chatId, '❌ Неправильный формат времени! Используйте HH:MM, например: /notify 19:00');
    return;
  }

  // Сохраняем пользователя
  users.set(userId, {
    chatId,
    username: msg.from.username,
    firstName: msg.from.first_name,
    active: true,
    notifications: true,
    notificationTime: time
  });

  // Добавляем уведомление
  notifications.set(userId, {
    time: time,
    enabled: true,
    type: 'daily'
  });

  saveData();

  bot.sendMessage(chatId, `✅ Уведомления настроены на ${time}!\n\nТеперь каждый день в это время я буду напоминать о занятиях.\n\nПроверить: /time`);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `📱 Справка по использованию

🎯 Основные команды:
/start - Перезапустить бота
/app - Открыть приложение
/time - Показать время сервера
/notify HH:MM - Настроить уведомление
/help - Показать эту справку

🔔 Примеры настройки уведомлений:
/notify 09:00 - утреннее напоминание
/notify 19:00 - вечернее напоминание

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

    saveData();

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
app.post('/api/telegram/connect', (req, res) => {
  const { userId, username, settings } = req.body;

  console.log('🔗 Запрос на подключение уведомлений:', userId);
  console.log('📊 Данные запроса:', { userId, username, settings });

  if (users.has(userId)) {
    console.log('✅ Пользователь найден, обновляем...');
    const user = users.get(userId);
    user.notifications = true;
    user.notificationTime = settings.time;
    users.set(userId, user);

    notifications.set(userId, {
      time: settings.time,
      enabled: true,
      type: settings.reminderType || 'daily'
    });

    saveData();

    res.json({ success: true, message: 'Уведомления подключены' });
  } else {
    console.log('❌ Пользователь не найден! Создаём нового...');
    
    users.set(userId, {
      chatId: null,
      username: username,
      firstName: 'Пользователь',
      active: true,
      notifications: true,
      notificationTime: settings.time
    });

    notifications.set(userId, {
      time: settings.time,
      enabled: true,
      type: settings.reminderType || 'daily'
    });

    saveData();
    
    res.json({ success: true, message: 'Пользователь создан и уведомления подключены' });
  }
});

// Отправка тестового уведомления
app.post('/api/telegram/send-notification', (req, res) => {
  const { userId, message } = req.body;

  console.log('📧 Отправка тестового уведомления:', userId);

  if (users.has(userId)) {
    const user = users.get(userId);
    if (user.chatId) {
      bot.sendMessage(user.chatId, `🔔 ${message}`);
      res.json({ success: true, message: 'Уведомление отправлено' });
    } else {
      res.status(400).json({ success: false, message: 'ChatId не найден, сначала напишите боту /start' });
    }
  } else {
    res.status(404).json({ success: false, message: 'Пользователь не найден' });
  }
});

// Планировщик уведомлений
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  console.log('⏰ Проверка времени:', currentTime);
  console.log('👥 Всего пользователей:', users.size);
  console.log('🔔 Всего уведомлений:', notifications.size);

  if (notifications.size > 0) {
    notifications.forEach((notification, userId) => {
      console.log(`🔍 Пользователь ${userId}: время ${notification.time}, включено ${notification.enabled}`);
      
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

          if (user.chatId) {
            bot.sendMessage(user.chatId, `🔔 ${randomMessage}`, options)
              .then(() => {
                console.log('✅ Уведомление отправлено успешно');
              })
              .catch((error) => {
                console.error('❌ Ошибка отправки уведомления:', error.message);
              });
          } else {
            console.log('❌ ChatId не найден для пользователя:', userId);
          }
        } else {
          console.log(`❌ Пользователь ${userId} не найден в базе users`);
        }
      }
    });
  } else {
    console.log('📭 Нет настроенных уведомлений');
  }
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
    uptime: process.uptime(),
    timezone: process.env.TZ
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
