/**
 * @name ChatLogger
 * @version 1.0.0
 * @description Логирует сообщения чата в JSON файл
 * @author Simuss
 * @source https://github.com/ваш-репозиторий
 */

const { Plugin } = require('powercord/entities');
const { getModule, React } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');

module.exports = class ChatLogger extends Plugin {
  constructor() {
    super();
    this.logs = new Map(); // Хранит логи для каждого канала
    this.logDirectory = join(__dirname, 'chat_logs');
    
    // Создаем директорию для логов, если её нет
    if (!existsSync(this.logDirectory)) {
      mkdirSync(this.logDirectory);
    }
  }

  async startPlugin() {
    // Получаем необходимые модули Discord
    const MessageActions = await getModule(['sendMessage', 'editMessage']);
    const ChannelStore = await getModule(['getChannel']);
    const UserStore = await getModule(['getCurrentUser', 'getUser']);

    // Перехватываем отправку сообщений
    inject('chat-logger-send', MessageActions, 'sendMessage', (args, res) => {
      const [channelId, message] = args;
      const channel = ChannelStore.getChannel(channelId);
      
      if (channel && message && message.content) {
        this.logMessage(channel, UserStore.getCurrentUser(), message.content);
      }
      
      return res;
    });

    // Перехватываем получение сообщений (если нужно логировать входящие тоже)
    const MessageDispatcher = await getModule(['dispatch']);
    if (MessageDispatcher && MessageDispatcher.dispatch) {
      inject('chat-logger-receive', MessageDispatcher, 'dispatch', (args, res) => {
        const [action] = args;
        
        if (action.type === 'MESSAGE_CREATE' && action.message) {
          const channel = ChannelStore.getChannel(action.message.channel_id);
          const user = UserStore.getUser(action.message.author.id);
          
          if (channel && user && action.message.content) {
            this.logMessage(channel, user, action.message.content);
          }
        }
        
        return res;
      });
    }

    this.log('Плагин ChatLogger запущен');
  }

  pluginWillUnload() {
    // Сохраняем все логи при выгрузке плагина
    this.saveAllLogs();
    uninject('chat-logger-send');
    uninject('chat-logger-receive');
  }

  logMessage(channel, user, content) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      user: user.username,
      timestamp,
      content,
      channel: channel.name
    };

    // Добавляем запись в лог канала
    if (!this.logs.has(channel.id)) {
      this.logs.set(channel.id, []);
    }
    
    this.logs.get(channel.id).push(logEntry);
    
    // Сохраняем лог каждые 10 сообщений или сразу для важных сообщений
    if (this.logs.get(channel.id).length >= 10 || content.length > 100) {
      this.saveChannelLog(channel.id);
    }
  }

  saveChannelLog(channelId) {
    if (!this.logs.has(channelId) || this.logs.get(channelId).length === 0) {
      return;
    }

    const channelLogs = this.logs.get(channelId);
    const logFileName = join(this.logDirectory, `channel_${channelId}.json`);
    
    try {
      // Читаем существующие логи, если есть
      let existingLogs = [];
      if (existsSync(logFileName)) {
        const data = readFileSync(logFileName, 'utf8');
        existingLogs = JSON.parse(data);
      }
      
      // Добавляем новые записи
      const updatedLogs = [...existingLogs, ...channelLogs];
      
      // Сохраняем обновленные логи
      writeFileSync(logFileName, JSON.stringify(updatedLogs, null, 2));
      
      // Очищаем временное хранилище для этого канала
      this.logs.set(channelId, []);
      
      this.log(`Логи для канала ${channelId} сохранены (${updatedLogs.length} записей)`);
    } catch (error) {
      console.error('Ошибка при сохранении логов:', error);
    }
  }

  saveAllLogs() {
    for (const [channelId] of this.logs) {
      this.saveChannelLog(channelId);
    }
  }
};