class CharacterPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'start': this.handleStart,
      'create': this.handleCreate,
      'status': this.handleStatus,
      'stats': this.handleStats,
      'inventory': this.handleInventory,
      'equipment': this.handleEquipment
    };
  }

  async init() {
    console.log('Character plugin initialized');
  }

  async handleStart(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (character) {
      await this.bot.sendMessage(msg.chat.id, 
        `🎮 *Welcome back, ${character.name}!*\n\n` +
        `Level: ${character.level}\n` +
        `Location: ${character.position.map}\n` +
        `HP: ${character.stats.hp}/${character.stats.maxHp}\n\n` +
        `Use /status to see your full character info!`,
        { parse_mode: 'Markdown' }
      );
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: '⚔️ Create Character', callback_data: 'create_character' }],
          [{ text: '📖 Game Guide', callback_data: 'game_guide' }]
        ]
      };

      await this.bot.sendMessage(msg.chat.id,
        `🎮 *Welcome to Ragnarok RPG!*\n\n` +
        `An adventure awaits you in the world of Midgard!\n\n` +
        `🗡️ Choose your class and embark on epic quests\n` +
        `🏰 Explore vast dungeons and cities\n` +
        `👥 Join guilds and make allies\n` +
        `⚔️ Battle monsters and other players\n\n` +
        `Start your journey by creating a character!`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    }
  }

  async handleCreate(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (character) {
      await this.bot.sendMessage(msg.chat.id, 
        `❌ You already have a character named *${character.name}*!\nUse /status to view your character.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please provide a character name!\n\n` +
        `Usage: /create <name>\n` +
        `Example: /create MyHero`
      );
      return;
    }

    const name = args.join(' ');
    if (name.length < 3 || name.length > 20) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Character name must be between 3 and 20 characters!`
      );
      return;
    }

    const newCharacter = this.gameEngine.createCharacter(userId, name);
    
    await this.bot.sendMessage(msg.chat.id,
      `🎉 *Character Created Successfully!*\n\n` +
      `👤 Name: ${newCharacter.name}\n` +
      `🏅 Class: ${newCharacter.class}\n` +
      `📊 Level: ${newCharacter.level}\n` +
      `❤️ HP: ${newCharacter.stats.hp}/${newCharacter.stats.maxHp}\n` +
      `💙 SP: ${newCharacter.stats.sp}/${newCharacter.stats.maxSp}\n` +
      `🗺️ Location: ${newCharacter.position.map}\n\n` +
      `Welcome to Midgard! Use /help to see available commands.`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleStatus(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You don't have a character! Use /create <name> to create one.`
      );
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Stats', callback_data: 'view_stats' },
          { text: '🎒 Inventory', callback_data: 'view_inventory' }
        ],
        [
          { text: '⚔️ Equipment', callback_data: 'view_equipment' },
          { text: '🗺️ Map', callback_data: 'view_map' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      `👤 *${character.name}*\n\n` +
      `🏅 Class: ${character.class}\n` +
      `📊 Level: ${character.level}\n` +
      `✨ EXP: ${character.exp}/${character.expToNext}\n` +
      `❤️ HP: ${character.stats.hp}/${character.stats.maxHp}\n` +
      `💙 SP: ${character.stats.sp}/${character.stats.maxSp}\n` +
      `🗺️ Location: ${character.position.map} (${character.position.x}, ${character.position.y})\n` +
      `💰 Zeny: ${character.inventory.zeny}\n\n` +
      `⚔️ Attack: ${character.stats.attack}\n` +
      `🛡️ Defense: ${character.stats.defense}\n` +
      `💨 Agility: ${character.stats.agility}\n` +
      `🧠 Intelligence: ${character.stats.intelligence}\n` +
      `❤️ Vitality: ${character.stats.vitality}\n` +
      `🍀 Luck: ${character.stats.luck}`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleStats(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You don't have a character! Use /create <name> to create one.`
      );
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚔️ +ATK', callback_data: 'stat_attack' },
          { text: '🛡️ +DEF', callback_data: 'stat_defense' },
          { text: '💨 +AGI', callback_data: 'stat_agility' }
        ],
        [
          { text: '🧠 +INT', callback_data: 'stat_intelligence' },
          { text: '❤️ +VIT', callback_data: 'stat_vitality' },
          { text: '🍀 +LUK', callback_data: 'stat_luck' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      `📊 *${character.name}'s Stats*\n\n` +
      `📈 Status Points: ${character.statusPoints}\n` +
      `🎯 Skill Points: ${character.skillPoints}\n\n` +
      `⚔️ Attack: ${character.stats.attack}\n` +
      `🛡️ Defense: ${character.stats.defense}\n` +
      `💨 Agility: ${character.stats.agility}\n` +
      `🧠 Intelligence: ${character.stats.intelligence}\n` +
      `❤️ Vitality: ${character.stats.vitality}\n` +
      `🍀 Luck: ${character.stats.luck}\n\n` +
      `${character.statusPoints > 0 ? 'Click a stat to increase it!' : 'No status points available'}`,
      { parse_mode: 'Markdown', reply_markup: character.statusPoints > 0 ? keyboard : undefined }
    );
  }

  async handleInventory(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You don't have a character! Use /create <name> to create one.`
      );
      return;
    }

    let inventoryText = `🎒 *${character.name}'s Inventory*\n\n`;
    inventoryText += `💰 Zeny: ${character.inventory.zeny}\n\n`;

    if (Object.keys(character.inventory.items).length === 0) {
      inventoryText += `📦 Your inventory is empty!`;
    } else {
      inventoryText += `📦 *Items:*\n`;
      const keyboard = { inline_keyboard: [] };
      
      for (const [itemId, quantity] of Object.entries(character.inventory.items)) {
        const item = this.db.getItem(itemId);
        if (item) {
          inventoryText += `• ${item.name} x${quantity}\n`;
          keyboard.inline_keyboard.push([
            { text: `Use ${item.name}`, callback_data: `use_item_${itemId}` },
            { text: `Equip ${item.name}`, callback_data: `equip_item_${itemId}` }
          ]);
        }
      }

      await this.bot.sendMessage(msg.chat.id, inventoryText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined
      });
      return;
    }

    await this.bot.sendMessage(msg.chat.id, inventoryText, { parse_mode: 'Markdown' });
  }

  async handleEquipment(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You don't have a character! Use /create <name> to create one.`
      );
      return;
    }

    let equipmentText = `⚔️ *${character.name}'s Equipment*\n\n`;
    
    const equipment = character.equipment;
    const slots = ['weapon', 'armor', 'accessory'];
    
    for (const slot of slots) {
      const itemId = equipment[slot];
      if (itemId) {
        const item = this.db.getItem(itemId);
        if (item) {
          equipmentText += `${this.getEquipmentIcon(slot)} ${slot}: ${item.name}\n`;
        }
      } else {
        equipmentText += `${this.getEquipmentIcon(slot)} ${slot}: *Not equipped*\n`;
      }
    }

    await this.bot.sendMessage(msg.chat.id, equipmentText, { parse_mode: 'Markdown' });
  }

  getEquipmentIcon(slot) {
    switch (slot) {
      case 'weapon': return '⚔️';
      case 'armor': return '🛡️';
      case 'accessory': return '💍';
      default: return '📦';
    }
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    console.log(`Character plugin handling callback: ${data} for user ${userId}`);

    if (data === 'create_character') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🎮 *Character Creation*\n\n` +
        `To create your character, use the command:\n` +
        `/create \\<character\\_name\\>\n\n` +
        `Example: /create MyHero\n\n` +
        `Choose a name between 3\\-20 characters\\!`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }

    if (data === 'game_guide') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `📖 *Game Guide*\n\n` +
        `🎮 *Basic Commands:*\n` +
        `/start \\- Start the game\n` +
        `/create \\<name\\> \\- Create character\n` +
        `/status \\- View character status\n` +
        `/map \\- View current map\n` +
        `/move \\<direction\\> \\- Move around\n` +
        `/hunt \\- Hunt for monsters\n` +
        `/inventory \\- Check inventory\n` +
        `/guild \\- Guild commands\n\n` +
        `🗺️ *Movement:*\n` +
        `Use /move north, south, east, west to explore\\!\n\n` +
        `⚔️ *Combat:*\n` +
        `Find monsters and engage in turn\\-based combat\\!\n\n` +
        `🎯 *Quests:*\n` +
        `Complete quests to gain experience and rewards\\!`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }

    if (data.startsWith('stat_')) {
      const character = this.gameEngine.getCharacter(userId);
      if (!character || character.statusPoints <= 0) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'No status points available!');
        return true;
      }

      const stat = data.replace('stat_', '');
      
      // Validate stat name
      const validStats = ['attack', 'defense', 'agility', 'intelligence', 'vitality', 'luck'];
      if (!validStats.includes(stat)) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid stat!' });
        return true;
      }
      
      character.stats[stat]++;
      character.statusPoints--;
      
      this.gameEngine.updateCharacter(userId, character);
      
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: `${stat} increased!` });
      
      // Update the stats display
      setTimeout(async () => {
        await this.handleStats({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      }, 500);
      
      return true;
    }

    if (data.startsWith('use_item_')) {
      const itemId = data.replace('use_item_', '');
      const success = this.gameEngine.useItem(userId, itemId);
      
      if (success) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Item used!' });
        
        // Update inventory display
        setTimeout(async () => {
          await this.handleInventory({ chat: callbackQuery.message.chat, from: callbackQuery.from });
        }, 500);
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Cannot use this item!' });
      }
      return true;
    }

    if (data.startsWith('equip_item_')) {
      const itemId = data.replace('equip_item_', '');
      const success = this.gameEngine.equipItem(userId, itemId);
      
      if (success) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Item equipped!' });
        
        // Update inventory display
        setTimeout(async () => {
          await this.handleInventory({ chat: callbackQuery.message.chat, from: callbackQuery.from });
        }, 500);
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Cannot equip this item!' });
      }
      return true;
    }
    
    if (data === 'view_stats') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleStats({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }
    
    if (data === 'view_inventory') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleInventory({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }
    
    if (data === 'view_equipment') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.handleEquipment({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      return true;
    }
    
    if (data === 'view_map') {
      await this.bot.answerCallbackQuery(callbackQuery.id);
      const mapPlugin = this.gameEngine.pluginManager.getPlugin('map');
      if (mapPlugin) {
        await mapPlugin.handleMap({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      }
      return true;
    }

    return false;
  }

  async middleware(msg) {
    // Check if user has character for commands that require it
    const requiresCharacter = ['status', 'stats', 'inventory', 'equipment', 'map', 'move', 'hunt'];
    
    if (msg && msg.text && msg.text.startsWith('/')) {
      const command = msg.text.split(' ')[0].substring(1);
      
      if (requiresCharacter.includes(command)) {
        const userId = msg.from.id;
        const character = this.gameEngine.getCharacter(userId);
        
        if (!character) {
          await this.bot.sendMessage(msg.chat.id,
            `❌ You need a character to use this command!\nUse /create <name> to create one.`
          );
          return false; // Stop processing
        }
      }
    }
    
    return true; // Continue processing
  }
}

module.exports = CharacterPlugin;