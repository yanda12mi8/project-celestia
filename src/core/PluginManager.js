const fs = require('fs-extra');
const path = require('path');

class PluginManager {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    this.gameEngine.pluginManager = this; // Set reference
    this.plugins = new Map();
    this.commands = new Map();
    this.middlewares = [];
  }

  async loadPlugins() {
    const pluginsDir = path.join(__dirname, '../plugins');
    
    try {
      // Ensure plugins directory exists
      await fs.ensureDir(pluginsDir);
      
      // Read plugin files
      const pluginFiles = await fs.readdir(pluginsDir);
      const jsFiles = pluginFiles.filter(file => file.endsWith('.js'));
      
      console.log(`📦 Loading ${jsFiles.length} plugins...`);
      
      for (const file of jsFiles) {
        await this.loadPlugin(file);
      }
      
      // Setup bot handlers
      this.setupBotHandlers();
      
    } catch (error) {
      console.error('Error loading plugins:', error);
      throw error;
    }
  }

  async loadPlugin(filename) {
    const pluginPath = path.join(__dirname, '../plugins', filename);
    const pluginName = path.basename(filename, '.js');
    
    try {
      // Clear require cache for hot reload
      delete require.cache[require.resolve(pluginPath)];
      
      const PluginClass = require(pluginPath);
      const plugin = new PluginClass(this.bot, this.db, this.gameEngine);
      
      // Initialize plugin
      if (plugin.init) {
        await plugin.init();
      }
      
      this.plugins.set(pluginName, plugin);
      
      // Register commands
      if (plugin.commands) {
        for (const [command, handler] of Object.entries(plugin.commands)) {
          if (typeof handler === 'function') {
            this.commands.set(command, handler.bind(plugin));
          }
        }
      }
      
      // Register middlewares
      if (plugin.middleware) {
        this.middlewares.push(plugin.middleware.bind(plugin));
      }
      
      console.log(`✅ Loaded plugin: ${pluginName}`);
      
    } catch (error) {
      console.error(`❌ Failed to load plugin ${pluginName}:`, error);
    }
  }

  setupBotHandlers() {
    // Message handler
    this.bot.on('message', async (msg) => {
      try {
        // Run middlewares
        for (const middleware of this.middlewares) {
          const result = await middleware(msg);
          if (result === false) return; // Stop processing if middleware returns false
        }
        
        // Handle commands
        if (msg.text && msg.text.startsWith('/')) {
          const command = msg.text.split(' ')[0].substring(1);
          const handler = this.commands.get(command);
          
          if (handler) {
            await handler(msg);
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
        this.bot.sendMessage(msg.chat.id, '❌ An error occurred while processing your request.');
      }
    });

    // Callback query handler
    this.bot.on('callback_query', async (callbackQuery) => {
      try {
        // Run middlewares for callback queries
        for (const middleware of this.middlewares) {
          if (middleware.length > 1) { // Check if middleware accepts callback queries
            const result = await middleware(null, callbackQuery);
            if (result === false) return;
          }
        }
        
        // Handle callback queries in plugins
        for (const plugin of this.plugins.values()) {
          if (plugin.handleCallback) {
            const handled = await plugin.handleCallback(callbackQuery);
            if (handled) break;
          }
        }
      } catch (error) {
        console.error('Error handling callback query:', error);
        this.bot.answerCallbackQuery(callbackQuery.id, '❌ An error occurred.');
      }
    });
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }
}

module.exports = PluginManager;