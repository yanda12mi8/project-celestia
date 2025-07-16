class MapPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'map': this.handleMap,
      'move': this.handleMove,
      'teleport': this.handleTeleport,
      'where': this.handleWhere
    };
  }

  async init() {
    console.log('Map plugin initialized');
  }

  async handleMap(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const mapView = this.gameEngine.generateMapView(userId);
    const map = this.db.getMap(character.position.map);
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '⬆️ North', callback_data: 'move_north' },
        ],
        [
          { text: '⬅️ West', callback_data: 'move_west' },
          { text: '🗺️ Info', callback_data: 'map_info' },
          { text: '➡️ East', callback_data: 'move_east' },
        ],
        [
          { text: '⬇️ South', callback_data: 'move_south' },
        ],
        [
          { text: '🔍 Search', callback_data: 'search_area' },
          { text: '⚔️ Hunt', callback_data: 'hunt_monsters' }
        ]
      ]
    };

    await this.bot.sendMessage(msg.chat.id,
      `🗺️ *${map.name}*\n\n` +
      `📍 Position: (${character.position.x}, ${character.position.y})\n\n` +
      `\`\`\`\n${mapView}\n\`\`\`\n\n` +
      `🚶 = You\n` +
      `🟩 = Grass\n` +
      `🌳 = Tree\n` +
      `🌊 = Water\n` +
      `🧱 = Wall\n` +
      `⬜ = Floor`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleMove(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please specify a direction!\n\n` +
        `Usage: /move <direction>\n` +
        `Directions: north, south, east, west\n\n` +
        `Example: /move north`
      );
      return;
    }

    const direction = args[0].toLowerCase();
    const validDirections = ['north', 'south', 'east', 'west'];
    
    if (!validDirections.includes(direction)) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Invalid direction! Use: north, south, east, west`
      );
      return;
    }

    const result = this.gameEngine.moveCharacter(userId, direction);
    
    if (result) {
      const map = this.db.getMap(result.position.map);
      await this.bot.sendMessage(msg.chat.id,
        `🚶 You moved ${direction}!\n\n` +
        `📍 New position: (${result.position.x}, ${result.position.y})\n` +
        `🗺️ Location: ${map.name}\n\n` +
        `Use /map to see your surroundings!`
      );
      
      // Random encounter chance
      if (Math.random() < 0.3) {
        await this.triggerRandomEncounter(msg.chat.id, userId);
      }
    } else {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You can't move there! There's an obstacle blocking your path.`
      );
    }
  }

  async handleTeleport(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      const maps = this.db.getAllMaps();
      let mapsList = '🗺️ *Available Maps:*\n\n';
      
      for (const map of maps) {
        mapsList += `• ${map.name} (${map.id})\n`;
      }
      
      await this.bot.sendMessage(msg.chat.id,
        mapsList + '\n' +
        `Usage: /teleport <map_id>\n` +
        `Example: /teleport prontera`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const mapId = args[0];
    const targetMap = this.db.getMap(mapId);
    
    if (!targetMap) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Map "${mapId}" not found!`
      );
      return;
    }

    character.position.map = mapId;
    character.position.x = targetMap.spawn.x;
    character.position.y = targetMap.spawn.y;
    
    this.gameEngine.updateCharacter(userId, character);
    
    await this.bot.sendMessage(msg.chat.id,
      `✨ *Teleported to ${targetMap.name}!*\n\n` +
      `📍 Position: (${character.position.x}, ${character.position.y})\n\n` +
      `Use /map to explore your new surroundings!`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleWhere(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const map = this.db.getMap(character.position.map);
    
    await this.bot.sendMessage(msg.chat.id,
      `📍 *Current Location*\n\n` +
      `🗺️ Map: ${map.name}\n` +
      `📍 Position: (${character.position.x}, ${character.position.y})\n` +
      `🌍 World: Midgard\n\n` +
      `Use /map to see your surroundings!`,
      { parse_mode: 'Markdown' }
    );
  }

  async triggerRandomEncounter(chatId, userId) {
    const character = this.gameEngine.getCharacter(userId);
    const map = this.db.getMap(character.position.map);
    
    if (!map.monsters || map.monsters.length === 0) return;

    const randomMonster = map.monsters[Math.floor(Math.random() * map.monsters.length)];
    const monster = this.db.getMonster(randomMonster);
    
    if (!monster) return;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⚔️ Attack', callback_data: `encounter_attack_${randomMonster}` },
          { text: '🏃 Run', callback_data: 'encounter_run' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId,
      `🎯 *Wild Encounter!*\n\n` +
      `A wild ${monster.name} (Level ${monster.level}) appears!\n\n` +
      `💀 HP: ${monster.hp}\n` +
      `⚔️ Attack: ${monster.attack}\n` +
      `🛡️ Defense: ${monster.defense}\n\n` +
      `What do you want to do?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('move_')) {
      const direction = data.replace('move_', '');
      const result = this.gameEngine.moveCharacter(userId, direction);
      
      if (result) {
        await this.bot.answerCallbackQuery(callbackQuery.id, `Moved ${direction}!`);
        await this.handleMap({ chat: callbackQuery.message.chat, from: callbackQuery.from });
        
        // Random encounter chance
        if (Math.random() < 0.3) {
          await this.triggerRandomEncounter(callbackQuery.message.chat.id, userId);
        }
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, "Can't move there!");
      }
      return true;
    }

    if (data === 'map_info') {
      const character = this.gameEngine.getCharacter(userId);
      const map = this.db.getMap(character.position.map);
      
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id,
        `🗺️ *Map Information*\n\n` +
        `📍 Name: ${map.name}\n` +
        `📏 Size: ${map.width}x${map.height}\n` +
        `🎯 Your Position: (${character.position.x}, ${character.position.y})\n` +
        `👹 Monsters: ${map.monsters.join(', ')}\n` +
        `👥 NPCs: ${map.npcs.join(', ')}\n\n` +
        `Explore to find items, monsters, and NPCs!`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (data === 'search_area') {
      const searchResult = Math.random();
      let message = '🔍 *Search Results*\n\n';
      
      if (searchResult < 0.3) {
        const character = this.gameEngine.getCharacter(userId);
        const foundZeny = Math.floor(Math.random() * 50) + 10;
        character.inventory.zeny += foundZeny;
        this.gameEngine.updateCharacter(userId, character);
        
        message += `💰 You found ${foundZeny} Zeny!`;
      } else if (searchResult < 0.6) {
        message += `🌿 You found some herbs, but they're not useful right now.`;
      } else {
        message += `🔍 You searched the area but found nothing interesting.`;
      }
      
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.bot.sendMessage(callbackQuery.message.chat.id, message, { parse_mode: 'Markdown' });
      return true;
    }

    if (data === 'hunt_monsters') {
      const character = this.gameEngine.getCharacter(userId);
      const map = this.db.getMap(character.position.map);
      
      if (!map.monsters || map.monsters.length === 0) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'No monsters in this area!');
        return true;
      }

      const randomMonster = map.monsters[Math.floor(Math.random() * map.monsters.length)];
      await this.bot.answerCallbackQuery(callbackQuery.id);
      await this.triggerRandomEncounter(callbackQuery.message.chat.id, userId);
      return true;
    }

    if (data.startsWith('encounter_attack_')) {
      const monsterId = data.replace('encounter_attack_', '');
      const combat = this.gameEngine.startCombat(userId, monsterId);
      
      if (combat) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Combat started!');
        // This will be handled by the combat plugin
        const combatPlugin = require('./combat');
        const combatInstance = new combatPlugin(this.bot, this.db, this.gameEngine);
        await combatInstance.showCombatStatus(callbackQuery.message.chat.id, userId);
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Failed to start combat!');
      }
      return true;
    }

    if (data === 'encounter_run') {
      const runChance = Math.random();
      
      if (runChance < 0.8) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'You ran away successfully!');
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `🏃 *You ran away successfully!*\n\nYou escaped from the monster.`
        );
      } else {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Failed to run away!');
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `❌ *Failed to run away!*\n\nThe monster blocked your escape!`
        );
      }
      return true;
    }

    return false;
  }
}

module.exports = MapPlugin;