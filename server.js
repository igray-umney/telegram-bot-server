// Добавьте эту переменную в начало файла (после инициализации бота)
const userMenuMessages = new Map(); // Хранит ID сообщений меню для каждого пользователя

// Функция для удаления старого меню и отправки нового
async function sendMenuMessage(chatId, text, keyboard, userId = null) {
  try {
    // Удаляем предыдущее меню если есть
    if (userId && userMenuMessages.has(userId)) {
      try {
        await bot.deleteMessage(chatId, userMenuMessages.get(userId));
      } catch (error) {
        // Сообщение уже удалено или недоступно - игнорируем
      }
    }
    
    // Отправляем новое сообщение
    const sentMessage = await bot.sendMessage(chatId, text, keyboard);
    
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
    console.log('Не удалось отредактировать, отправляем новое сообщение');
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...keyboard });
  }
}

// Обновленная функция /start
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

// Обновленная функция настроек
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

// Обновленная функция показа меню настроек
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

  // Если есть сохраненное сообщение меню, редактируем его
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

// Обновленная функция показа статуса
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

// Обновленная обработка callback кнопок
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

// Новая функция главного меню
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

// Функция помощи
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

// Обновленные функции с автоудалением уведомлений
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

// Обновленные функции меню времени и часовых поясов
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
