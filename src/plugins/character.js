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

    const hpBar = this.createProgressBar(character.stats.hp, character.stats.maxHp, 10, '❤️', '🤍');
    const spBar = this.createProgressBar(character.stats.sp, character.stats.maxSp, 10, '💙', '🤍');
    const expBar = this.createProgressBar(character.exp, character.expToNext, 10, '🟩', '⬜');

    const statusMessage = `
    👤 *${character.name}* - (${character.id})
    
    JOB : ${character.class}
    LEVEL : ${character.level}
    *[ STATUS ]*
    ❤️ HP:  ${hpBar} ${character.stats.hp}/${character.stats.maxHp}
    💙 SP:  ${spBar} ${character.stats.sp}/${character.stats.maxSp}
    ✨ EXP: ${expBar} ${character.exp}/${character.expToNext}

    *[ ATTRIBUTES ]*
    ⚔️ ATK: ${character.stats.attack}   | 🛡️ DEF: ${character.stats.defense}
    💨 AGI: ${character.stats.agility}  | 🧠 INT: ${character.stats.intelligence}
    ❤️ VIT: ${character.stats.vitality} | 🍀 LUK: ${character.stats.luck}

    *[ INFO ]*
    💰 Zeny: ${character.inventory.zeny}
    🗺️ Location: ${character.position.map}
    `;

    await this.bot.sendMessage(msg.chat.id, statusMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
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
      await this.bot.sendMessage(msg.chat.id, inventoryText, { parse_mode: 'Markdown' });
      return;
    }

    const categorizedItems = {
      equipment: [],
      consumable: [],
      etc: []
    };

    for (const [itemId, quantity] of Object.entries(character.inventory.items)) {
      const item = this.db.getItem(itemId);
      if (item) {
        const itemInfo = { ...item, quantity, id: itemId };
        if (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') {
          categorizedItems.equipment.push(itemInfo);
        } else if (item.type === 'consumable') {
          categorizedItems.consumable.push(itemInfo);
        } else {
          categorizedItems.etc.push(itemInfo);
        }
      }
    }

    const keyboard = { inline_keyboard: [] };

    if (categorizedItems.equipment.length > 0) {
      inventoryText += '⚔️ *Equipment*\n';
      for (const item of categorizedItems.equipment) {
        let statsText = '';
        if (item.stats) {
            statsText = Object.entries(item.stats).map(([stat, value]) => `${stat.toUpperCase()}: ${value}`).join(', ');
        }
        inventoryText += `• ${item.name} x${item.quantity} - (${statsText || 'No stats'})\n`;
        keyboard.inline_keyboard.push([{ text: `Equip ${item.name}`, callback_data: `equip_item_${item.id}` }]);
      }
      inventoryText += '\n';
    }

    if (categorizedItems.consumable.length > 0) {
      inventoryText += '💊 *Consumables*\n';
      for (const item of categorizedItems.consumable) {
        inventoryText += `• ${item.name} x${item.quantity} - (${item.description})\n`;
        keyboard.inline_keyboard.push([{ text: `Use ${item.name}`, callback_data: `use_item_${item.id}` }]);
      }
      inventoryText += '\n';
    }

    if (categorizedItems.etc.length > 0) {
      inventoryText += '📦 *Etc*\n';
      for (const item of categorizedItems.etc) {
        inventoryText += `• ${item.name} x${item.quantity} - (${item.description})\n`;
      }
    }

    await this.bot.sendMessage(msg.chat.id, inventoryText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined
    });
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
    const keyboard = { inline_keyboard: [] };
    
    const equipment = character.equipment;
    const slots = ['weapon', 'armor', 'accessory'];
    
    for (const slot of slots) {
      const itemId = equipment[slot];
      if (itemId) {
        const item = this.db.getItem(itemId);
        if (item) {
          equipmentText += `${this.getEquipmentIcon(slot)} ${slot}: ${item.name}\n`;
          keyboard.inline_keyboard.push([{ text: `Unequip ${item.name}`, callback_data: `unequip_item_${slot}` }]);
        }
      }
      else {
        equipmentText += `${this.getEquipmentIcon(slot)} ${slot}: *Not equipped*\n`;
      }
    }

    await this.bot.sendMessage(msg.chat.id, equipmentText, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined
    });
  }

  async handleUse(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);

    if (!character) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You don't have a character! Use /create <name> to create one.`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Usage: /use <item_id>\n` +
        `Example: /use red_potion`
      );
      return;
    }

    const itemId = args[0];
    const item = this.db.getItem(itemId);

    if (!item) {
      await this.bot.sendMessage(msg.chat.id, `❌ Item not found!`);
      return;
    }

    if (!character.inventory.items[itemId] || character.inventory.items[itemId] <= 0) {
      await this.bot.sendMessage(msg.chat.id, `❌ You don't have ${item.name} in your inventory!`);
      return;
    }

    const result = this.gameEngine.useItem(userId, itemId);

    if (result.success) {
      await this.bot.sendMessage(msg.chat.id, `✅ ${result.message}`);
      // Optionally update inventory display after use
      setTimeout(async () => {
        await this.handleInventory({ chat: msg.chat, from: msg.from });
      }, 500);
    } else {
      await this.bot.sendMessage(msg.chat.id, `❌ ${result.message}`);
    }
  }

  getEquipmentIcon(slot) {
    switch (slot) {
      case 'weapon': return '⚔️';
      case 'armor': return '🛡️';
      case 'accessory': return '💍';
      default: return '📦';
    }
  }

  createProgressBar(current, max, length = 10, filledChar = '█', emptyChar = '░') {
    const percentage = Math.max(0, Math.min(1, current / max));
    const filledLength = Math.round(percentage * length);
    const emptyLength = length - filledLength;
    return `${filledChar.repeat(filledLength)}${emptyChar.repeat(emptyLength)}`;
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    console.log(`[CharacterPlugin] Raw data received: ${data}`); // Added log
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

      // Apply stat-specific bonuses
      if (stat === 'vitality') {
        character.stats.maxHp += 15; // Increase Max HP by 15 for each VIT point
        character.stats.hp += 15;    // Also heal the character for the same amount
      }
      if (stat === 'intelligence') {
        character.stats.maxSp += 10; // Increase Max SP by 10 for each INT point
        character.stats.sp += 10;    // Also restore SP for the same amount
      }
      
      this.gameEngine.updateCharacter(userId, character);
      
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: `${stat.toUpperCase()} increased!` });
      
      // Update the stats display
      setTimeout(async () => {
        await this.handleStats({ chat: callbackQuery.message.chat, from: callbackQuery.from });
      }, 500);
      
      return true;
    }

    if (data.startsWith('use_item_')) {
      const itemId = data.replace('use_item_', '');
      const result = this.gameEngine.useItem(userId, itemId);

      // Always answer the callback query to remove the "loading" state
      await this.bot.answerCallbackQuery(callbackQuery.id);

      if (result.success) {
        // Send a message to the chat about the item used
        await this.bot.sendMessage(callbackQuery.message.chat.id, `✅ ${result.message}`);

        // Update inventory display
        setTimeout(async () => {
          await this.handleInventory({ chat: callbackQuery.message.chat, from: callbackQuery.from });
        }, 500);
      } else {
        // Send a failure message to the chat
        await this.bot.sendMessage(callbackQuery.message.chat.id, `❌ ${result.message}`);
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

    if (data.startsWith('unequip_item_')) {
      const slot = data.replace('unequip_item_', '');
      const success = this.gameEngine.unequipItem(userId, slot);
      
      if (success) {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Item unequipped!' });
        
        // Update equipment display
        setTimeout(async () => {
          await this.handleEquipment({ chat: callbackQuery.message.chat, from: callbackQuery.from });
        }, 500);
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Failed to unequip item!' });
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

    // If no specific callback was handled, return false
    return false;
  }

  async middleware(msg) {
    // Only apply character check for text messages that are commands
    if (msg && msg.text && msg.text.startsWith('/')) {
      const command = msg.text.split(' ')[0].substring(1);
      const requiresCharacter = ['status', 'stats', 'inventory', 'equipment', 'map', 'move', 'hunt', 'guild', 'party']; // Added guild and party for completeness
      
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
    
    return true; // Continue processing for all other messages (including callbacks)
  }
}

module.exports = CharacterPlugin;