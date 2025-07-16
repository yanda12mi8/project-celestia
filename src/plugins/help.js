class HelpPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'help': this.handleHelp,
      'commands': this.handleCommands,
      'guide': this.handleGuide,
      'about': this.handleAbout
    };
  }

  async init() {
    console.log('Help plugin initialized');
  }

  async handleHelp(msg) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 All Commands', callback_data: 'help_commands' },
          { text: '📖 Game Guide', callback_data: 'help_guide' }
        ],
        [
          { text: '⚔️ Combat Help', callback_data: 'help_combat' },
          { text: '🗺️ Map Help', callback_data: 'help_map' }
        ],
        [
          { text: '🏛️ Guild Help', callback_data: 'help_guild' },
          { text: 'ℹ️ About', callback_data: 'help_about' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      `🎮 *Ragnarok RPG Help*\n\n` +
      `Welcome to the help system! Choose a category below to get detailed information about the game features.\n\n` +
      `🚀 *Quick Start:*\n` +
      `1. /create <name> - Create your character\n` +
      `2. /map - View your surroundings\n` +
      `3. /hunt - Find monsters to fight\n` +
      `4. /status - Check your stats\n\n` +
      `Select a help topic:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleCommands(msg) {
    const commandsText = `📋 *All Commands*\n\n` +
      `👤 **Character Commands:**\n` +
      `/start - Start the game\n` +
      `/create <name> - Create character\n` +
      `/status - View character status\n` +
      `/stats - View and upgrade stats\n` +
      `/inventory - Check inventory\n` +
      `/equipment - View equipment\n\n` +
      `🗺️ **Map Commands:**\n` +
      `/map - View current map\n` +
      `/move <direction> - Move around\n` +
      `/where - Current location\n` +
      `/teleport <map> - Teleport to map\n\n` +
      `⚔️ **Combat Commands:**\n` +
      `/hunt - Hunt for monsters\n` +
      `/attack - Attack in combat\n` +
      `/combat - View combat status\n\n` +
      `🏛️ **Guild Commands:**\n` +
      `/guild - Guild information\n` +
      `/gcreate <name> - Create guild\n` +
      `/gjoin <name> - Join guild\n` +
      `/gleave - Leave guild\n` +
      `/gmembers - View guild members\n` +
      `/gchat <message> - Guild chat\n\n` +
      `❓ **Help Commands:**\n` +
      `/help - Show this help\n` +
      `/guide - Game guide\n` +
      `/about - About the game`;

    await this.bot.sendMessage(msg.chat.id, commandsText, { parse_mode: 'Markdown' });
  }

  async handleGuide(msg) {
    const guideText = `📖 *Game Guide*\n\n` +
      `🎯 **Getting Started:**\n` +
      `1. Create your character with /create <name>\n` +
      `2. Use /status to see your character info\n` +
      `3. Explore the world with /map and /move\n` +
      `4. Fight monsters with /hunt\n` +
      `5. Level up and get stronger!\n\n` +
      `📊 **Character System:**\n` +
      `• Level up by gaining EXP from combat\n` +
      `• Allocate status points to improve stats\n` +
      `• Equip better weapons and armor\n` +
      `• Use items to restore HP and SP\n\n` +
      `🗺️ **World Exploration:**\n` +
      `• Use /map to see your surroundings\n` +
      `• Move with /move north/south/east/west\n` +
      `• Different areas have different monsters\n` +
      `• Search areas for hidden items\n\n` +
      `⚔️ **Combat System:**\n` +
      `• Turn-based combat with monsters\n` +
      `• Attack, defend, use items, or run\n` +
      `• Gain EXP and items from victories\n` +
      `• Death results in EXP loss\n\n` +
      `🏛️ **Guild System:**\n` +
      `• Create or join guilds for teamwork\n` +
      `• Chat with guild members\n` +
      `• Participate in guild activities\n` +
      `• Share resources and knowledge\n\n` +
      `💡 **Tips:**\n` +
      `• Keep healing items in your inventory\n` +
      `• Upgrade your equipment regularly\n` +
      `• Join a guild for support\n` +
      `• Explore different areas for variety`;

    await this.bot.sendMessage(msg.chat.id, guideText, { parse_mode: 'Markdown' });
  }

  async handleAbout(msg) {
    const aboutText = `ℹ️ *About Ragnarok RPG*\n\n` +
      `🎮 **Game Information:**\n` +
      `Version: 1.0.0\n` +
      `Type: Text-based RPG\n` +
      `Platform: Telegram Bot\n` +
      `Language: JavaScript (Node.js)\n\n` +
      `🎯 **Features:**\n` +
      `• Character creation and progression\n` +
      `• Turn-based combat system\n` +
      `• Map exploration with grid system\n` +
      `• Inventory and equipment management\n` +
      `• Guild system for multiplayer\n` +
      `• Plugin-based architecture\n\n` +
      `🏗️ **Technical Details:**\n` +
      `• Built with Node.js and Telegram Bot API\n` +
      `• Modular plugin system (CJS)\n` +
      `• File-based database storage\n` +
      `• Real-time multiplayer support\n\n` +
      `👨‍💻 **Development:**\n` +
      `Created as a comprehensive RPG experience\n` +
      `Inspired by classic MMORPG games\n` +
      `Designed for easy extension and modification\n\n` +
      `🎉 **Enjoy your adventure in Midgard!**`;

    await this.bot.sendMessage(msg.chat.id, aboutText, { parse_mode: 'Markdown' });
  }

  async handleCallback(callbackQuery) {
    const data = callbackQuery.data;

    if (data === 'help_commands') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleCommands({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'help_guide') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleGuide({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'help_about') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleAbout({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }

    if (data === 'help_combat') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `⚔️ *Combat Help*\n\n` +
        `🎯 **Starting Combat:**\n` +
        `• Use /hunt to find monsters\n` +
        `• Choose to attack or look for another\n` +
        `• Combat is turn-based\n\n` +
        `🥊 **Combat Actions:**\n` +
        `• ⚔️ Attack - Deal damage to enemy\n` +
        `• 🛡️ Defend - Reduce incoming damage\n` +
        `• 💊 Use Item - Heal or buff yourself\n` +
        `• 🏃 Run - Attempt to escape\n\n` +
        `📊 **Combat Mechanics:**\n` +
        `• Damage = Attack - Defense\n` +
        `• Critical hits can occur\n` +
        `• Speed affects turn order\n` +
        `• Status effects can change combat\n\n` +
        `🏆 **Victory Rewards:**\n` +
        `• Gain EXP to level up\n` +
        `• Random item drops\n` +
        `• Zeny (currency) rewards\n\n` +
        `💀 **Death:**\n` +
        `• Lose some EXP\n` +
        `• Return to spawn point\n` +
        `• Keep all items and equipment`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data === 'help_map') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🗺️ *Map Help*\n\n` +
        `🧭 **Navigation:**\n` +
        `• /map - View current area\n` +
        `• /move <direction> - Move around\n` +
        `• Directions: north, south, east, west\n\n` +
        `🎭 **Map Symbols:**\n` +
        `• 🚶 You (player position)\n` +
        `• 🟩 Grass (walkable)\n` +
        `• 🌳 Tree (obstacle)\n` +
        `• 🌊 Water (obstacle)\n` +
        `• 🧱 Wall (obstacle)\n` +
        `• ⬜ Floor (walkable)\n\n` +
        `🔍 **Exploration:**\n` +
        `• Search areas for hidden items\n` +
        `• Random encounters while moving\n` +
        `• Different monsters in different areas\n` +
        `• NPCs provide quests and services\n\n` +
        `🗺️ **Map Features:**\n` +
        `• Multiple maps to explore\n` +
        `• Teleportation between maps\n` +
        `• Safe zones and dangerous areas\n` +
        `• Dynamic weather and events\n\n` +
        `💡 **Tips:**\n` +
        `• Explore thoroughly for secrets\n` +
        `• Check map info for monster types\n` +
        `• Use teleport for quick travel`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data === 'help_guild') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🏛️ *Guild Help*\n\n` +
        `🎯 **Guild System:**\n` +
        `• Social feature for team play\n` +
        `• Create or join existing guilds\n` +
        `• Chat with guild members\n` +
        `• Participate in guild activities\n\n` +
        `📋 **Guild Commands:**\n` +
        `• /guild - Guild information\n` +
        `• /gcreate <name> - Create guild (10,000 Zeny)\n` +
        `• /gjoin <name> - Join guild\n` +
        `• /gleave - Leave guild\n` +
        `• /gmembers - View members\n` +
        `• /gchat <message> - Guild chat\n\n` +
        `👑 **Guild Roles:**\n` +
        `• Leader - Full guild control\n` +
        `• Member - Standard guild member\n` +
        `• Different permissions for each role\n\n` +
        `💰 **Guild Features:**\n` +
        `• Guild treasury for shared funds\n` +
        `• Guild level and experience\n` +
        `• Guild announcements\n` +
        `• Public or private joining\n\n` +
        `🎮 **Guild Benefits:**\n` +
        `• Team coordination\n` +
        `• Shared knowledge and resources\n` +
        `• Group activities and events\n` +
        `• Social interaction\n\n` +
        `💡 **Tips:**\n` +
        `• Choose guild names carefully\n` +
        `• Be active in guild chat\n` +
        `• Help other guild members\n` +
        `• Participate in guild events`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    return false;
  }
}

module.exports = HelpPlugin;