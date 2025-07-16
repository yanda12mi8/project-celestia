const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config.json');
const PluginManager = require('./src/core/PluginManager');
const Database = require('./src/core/Database');
const GameEngine = require('./src/core/GameEngine');

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN || config.bot.token;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Initialize core systems
const db = new Database();
const gameEngine = new GameEngine(db, config);
const pluginManager = new PluginManager(bot, db, gameEngine);

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

// Initialize bot
async function initializeBot() {
  try {
    console.log('🚀 Initializing Ragnarok RPG Bot...');
    
    // Initialize database
    await db.init();
    console.log('✅ Database initialized');
    
    // Initialize game engine
    await gameEngine.init();
    console.log('✅ Game engine initialized');
    
    // Load plugins
    await pluginManager.loadPlugins();
    console.log('✅ Plugins loaded');
    
    // Start bot
    console.log('🎮 Ragnarok RPG Bot is now running!');
    console.log('Bot username:', (await bot.getMe()).username);
    
  } catch (error) {
    console.error('❌ Failed to initialize bot:', error);
    process.exit(1);
  }
}

// Handle bot errors
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Start the bot
initializeBot();