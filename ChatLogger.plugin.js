/**
 * @name ChatLogger
 * @version 1.0.0
 * @description Log chat in JSON file
 * @author Simuss
 * @source https://github.com/SalivionR/ChatLogger
 */

const { Plugin } = require('powercord/entities'); // ← УДАЛИ ЭТУ СТРОКУ
const { getModule, React } = require('powercord/webpack'); // ← УДАЛИ ЭТУ СТРОКУ
const { inject, uninject } = require('powercord/injector'); // ← УДАЛИ ЭТУ СТРОКУ

// Добавь эти импорты для BetterDiscord
const { webpack: { getModule, getModules }, patcher, plugins: { getFolder } } = require('@betterdiscord/bdapi');
const { join } = require('path');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');

module.exports = class ChatLogger { // ← Убери "extends Plugin"
  constructor() {
    this.logs = new Map();
    
    // Правильный путь для BetterDiscord
    this.logDirectory = join(getFolder(), '..', 'PluginData', 'ChatLogger');
    
    if (!existsSync(this.logDirectory)) {
      mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  async start() { // ← Переименуй startPlugin в start
    const MessageActions = await getModule(['sendMessage', 'editMessage']);
    const ChannelStore = await getModule(['getChannel']);
    const UserStore = await getModule(['getCurrentUser', 'getUser']);

    // Используй patcher вместо inject
    patcher.instead('ChatLogger', MessageActions, 'sendMessage', (args, original) => {
      const [channelId, message] = args;
      const channel = ChannelStore.getChannel(channelId);
      
      if (channel && message && message.content) {
        this.logMessage(channel, UserStore.getCurrentUser(), message.content);
      }
      
      return original(...args);
    });

    const MessageDispatcher = await getModule(['dispatch']);
    if (MessageDispatcher && MessageDispatcher.dispatch) {
      patcher.instead('ChatLogger', MessageDispatcher, 'dispatch', (args, original) => {
        const [action] = args;
        
        if (action.type === 'MESSAGE_CREATE' && action.message) {
          const channel = ChannelStore.getChannel(action.message.channel_id);
          const user = UserStore.getUser(action.message.author.id);
          
          if (channel && user && action.message.content) {
            this.logMessage(channel, user, action.message.content);
          }
        }
        
        return original(...args);
      });
    }

    this.log('Плагин ChatLogger запущен');
  }

  stop() { // ← Переименуй pluginWillUnload в stop
    this.saveAllLogs();
    patcher.unpatchAll('ChatLogger'); // ← Используй unpatchAll вместо uninject
  }

  // Остальной код остается без изменений
  logMessage(channel, user, content) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      user: user.username,
      timestamp,
      content,
      channel: channel.name
    };

    if (!this.logs.has(channel.id)) {
      this.logs.set(channel.id, []);
    }
    
    this.logs.get(channel.id).push(logEntry);
    
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
      let existingLogs = [];
      if (existsSync(logFileName)) {
        const data = readFileSync(logFileName, 'utf8');
        existingLogs = JSON.parse(data);
      }
      
      const updatedLogs = [...existingLogs, ...channelLogs];
      
      writeFileSync(logFileName, JSON.stringify(updatedLogs, null, 2));
      
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

  // Добавь метод log для BetterDiscord
  log(message) {
    console.log(`%c[ChatLogger]%c ${message}`, 'color: #3a71c1; font-weight: 700;', '');
  }
};