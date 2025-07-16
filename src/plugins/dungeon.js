class DungeonPlugin {
  constructor(bot, db, gameEngine) {
    this.bot = bot;
    this.db = db;
    this.gameEngine = gameEngine;
    
    this.commands = {
      'dungeon': this.handleDungeon,
      'denter': this.handleEnterDungeon,
      'dexit': this.handleExitDungeon,
      'dstatus': this.handleDungeonStatus,
      'dboss': this.handleBossFight
    };
    
    this.activeDungeons = new Map();
    this.dungeonCooldowns = new Map();
  }

  async init() {
    console.log('Dungeon plugin initialized');
    await this.initializeDungeons();
  }

  async initializeDungeons() {
    const dungeons = {
      'orc_dungeon': {
        id: 'orc_dungeon',
        name: 'Orc Dungeon',
        description: 'A dark dungeon filled with orcs and their minions',
        minLevel: 10,
        maxLevel: 25,
        minPartySize: 2,
        maxPartySize: 6,
        floors: 3,
        timeLimit: 1800000, // 30 minutes
        monsters: ['orc_warrior', 'orc_archer', 'orc_shaman'],
        boss: 'orc_lord',
        rewards: {
          exp: 1000,
          items: ['orc_axe', 'orc_armor', 'red_potion'],
          zeny: 5000
        },
        cooldown: 3600000 // 1 hour
      },
      'ant_hell': {
        id: 'ant_hell',
        name: 'Ant Hell',
        description: 'Underground tunnels infested with giant ants',
        minLevel: 15,
        maxLevel: 35,
        minPartySize: 3,
        maxPartySize: 6,
        floors: 4,
        timeLimit: 2400000, // 40 minutes
        monsters: ['ant_soldier', 'ant_worker', 'ant_queen_guard'],
        boss: 'ant_queen',
        rewards: {
          exp: 2000,
          items: ['ant_jaw', 'chitin_armor', 'blue_potion'],
          zeny: 8000
        },
        cooldown: 7200000 // 2 hours
      },
      'goblin_cave': {
        id: 'goblin_cave',
        name: 'Goblin Cave',
        description: 'A treacherous cave system ruled by goblin tribes',
        minLevel: 5,
        maxLevel: 20,
        minPartySize: 2,
        maxPartySize: 4,
        floors: 2,
        timeLimit: 1200000, // 20 minutes
        monsters: ['goblin', 'goblin_archer', 'hobgoblin'],
        boss: 'goblin_king',
        rewards: {
          exp: 500,
          items: ['goblin_dagger', 'leather_boots', 'yellow_potion'],
          zeny: 2000
        },
        cooldown: 1800000 // 30 minutes
      }
    };

    for (const [id, dungeon] of Object.entries(dungeons)) {
      this.db.maps.set(id, {
        id: id,
        name: dungeon.name,
        width: 15,
        height: 15,
        spawn: { x: 1, y: 1 },
        tiles: this.generateDungeonTiles(15, 15),
        monsters: dungeon.monsters,
        npcs: [],
        isDungeon: true,
        dungeonData: dungeon
      });
    }
  }

  generateDungeonTiles(width, height) {
    const tiles = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          row.push('wall');
        } else {
          const rand = Math.random();
          if (rand < 0.3) {
            row.push('wall');
          } else {
            row.push('floor');
          }
        }
      }
      tiles.push(row);
    }
    return tiles;
  }

  async handleDungeon(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const partyPlugin = this.gameEngine.pluginManager.getPlugin('party');
    const party = partyPlugin ? partyPlugin.getPlayerParty(userId) : null;

    if (!party) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You need to be in a party to enter dungeons!\n\n` +
        `Use /pcreate to create a party or /party to join one.`
      );
      return;
    }

    await this.showDungeonList(msg.chat.id, party);
  }

  async handleEnterDungeon(msg) {
    const userId = msg.from.id;
    const character = this.gameEngine.getCharacter(userId);
    
    if (!character) return;

    const partyPlugin = this.gameEngine.pluginManager.getPlugin('party');
    const party = partyPlugin ? partyPlugin.getPlayerParty(userId) : null;

    if (!party) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ You need to be in a party to enter dungeons!`
      );
      return;
    }

    if (party.leader !== userId) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Only the party leader can enter dungeons!`
      );
      return;
    }

    const args = msg.text.split(' ').slice(1);
    if (args.length < 1) {
      await this.bot.sendMessage(msg.chat.id,
        `❌ Please specify a dungeon!\n\n` +
        `Usage: /denter <dungeon_id>\n` +
        `Example: /denter orc_dungeon\n\n` +
        `Use /dungeon to see available dungeons.`
      );
      return;
    }

    const dungeonId = args[0];
    await this.enterDungeon(msg.chat.id, party, dungeonId);
  }

  async showDungeonList(chatId, party) {
    const dungeonMaps = Array.from(this.db.maps.values()).filter(map => map.isDungeon);
    
    let message = `🏰 *Available Dungeons*\n\n`;
    const keyboard = { inline_keyboard: [] };

    for (const map of dungeonMaps) {
      const dungeon = map.dungeonData;
      const canEnter = this.canPartyEnterDungeon(party, dungeon);
      const cooldownKey = `${party.id}_${dungeon.id}`;
      const cooldown = this.dungeonCooldowns.get(cooldownKey);
      const onCooldown = cooldown && cooldown > Date.now();

      message += `🏰 **${dungeon.name}**\n`;
      message += `   📊 Level: ${dungeon.minLevel}-${dungeon.maxLevel}\n`;
      message += `   👥 Party: ${dungeon.minPartySize}-${dungeon.maxPartySize} members\n`;
      message += `   🏢 Floors: ${dungeon.floors}\n`;
      message += `   ⏱️ Time Limit: ${Math.floor(dungeon.timeLimit / 60000)} minutes\n`;
      message += `   ${canEnter && !onCooldown ? '🟢 Available' : '🔴 Unavailable'}\n`;
      
      if (onCooldown) {
        const remaining = Math.ceil((cooldown - Date.now()) / 60000);
        message += `   ⏰ Cooldown: ${remaining} minutes\n`;
      }
      
      message += `\n`;

      if (canEnter && !onCooldown) {
        keyboard.inline_keyboard.push([
          { text: `🏰 Enter ${dungeon.name}`, callback_data: `dungeon_enter_${dungeon.id}` },
          { text: `ℹ️ Info`, callback_data: `dungeon_info_${dungeon.id}` }
        ]);
      }
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined
    });
  }

  canPartyEnterDungeon(party, dungeon) {
    // Check party size
    if (party.members.length < dungeon.minPartySize || party.members.length > dungeon.maxPartySize) {
      return false;
    }

    // Check member levels
    for (const memberId of party.members) {
      const character = this.gameEngine.getCharacter(memberId);
      if (!character || character.level < dungeon.minLevel || character.level > dungeon.maxLevel) {
        return false;
      }
    }

    return true;
  }

  async enterDungeon(chatId, party, dungeonId) {
    const map = this.db.getMap(dungeonId);
    if (!map || !map.isDungeon) {
      await this.bot.sendMessage(chatId,
        `❌ Dungeon "${dungeonId}" not found!`
      );
      return;
    }

    const dungeon = map.dungeonData;
    const canEnter = this.canPartyEnterDungeon(party, dungeon);

    if (!canEnter) {
      await this.bot.sendMessage(chatId,
        `❌ Your party cannot enter this dungeon!\n\n` +
        `Requirements:\n` +
        `• Party size: ${dungeon.minPartySize}-${dungeon.maxPartySize} members\n` +
        `• Level range: ${dungeon.minLevel}-${dungeon.maxLevel}\n` +
        `• Current party: ${party.members.length} members`
      );
      return;
    }

    // Check cooldown
    const cooldownKey = `${party.id}_${dungeon.id}`;
    const cooldown = this.dungeonCooldowns.get(cooldownKey);
    if (cooldown && cooldown > Date.now()) {
      const remaining = Math.ceil((cooldown - Date.now()) / 60000);
      await this.bot.sendMessage(chatId,
        `❌ Dungeon is on cooldown! Wait ${remaining} minutes.`
      );
      return;
    }

    // Create dungeon instance
    const { randomUUID } = require('crypto');
    const instanceId = `dungeon_${randomUUID().slice(0, 8)}`;
    const instance = {
      id: instanceId,
      dungeonId: dungeonId,
      partyId: party.id,
      currentFloor: 1,
      startTime: Date.now(),
      timeLimit: dungeon.timeLimit,
      status: 'active',
      monstersKilled: 0,
      bossDefeated: false,
      rewards: []
    };

    this.activeDungeons.set(instanceId, instance);

    // Move all party members to dungeon
    for (const memberId of party.members) {
      const character = this.gameEngine.getCharacter(memberId);
      if (character) {
        character.position.map = dungeonId;
        character.position.x = map.spawn.x;
        character.position.y = map.spawn.y;
        character.dungeonInstance = instanceId;
        this.gameEngine.updateCharacter(memberId, character);
      }
    }

    // Notify party
    const partyPlugin = this.gameEngine.pluginManager.getPlugin('party');
    if (partyPlugin) {
      await partyPlugin.notifyPartyMembers(party,
        `🏰 *Entered ${dungeon.name}!*\n\n` +
        `⏱️ Time Limit: ${Math.floor(dungeon.timeLimit / 60000)} minutes\n` +
        `🏢 Floor: 1/${dungeon.floors}\n\n` +
        `Good luck, adventurers!`
      );
    }

    // Set cooldown
    this.dungeonCooldowns.set(cooldownKey, Date.now() + dungeon.cooldown);

    // Start dungeon timer
    setTimeout(() => {
      this.checkDungeonTimeout(instanceId);
    }, dungeon.timeLimit);
  }

  async checkDungeonTimeout(instanceId) {
    const instance = this.activeDungeons.get(instanceId);
    if (!instance || instance.status !== 'active') return;

    instance.status = 'timeout';
    await this.exitDungeon(instanceId, 'timeout');
  }

  async exitDungeon(instanceId, reason = 'manual') {
    const instance = this.activeDungeons.get(instanceId);
    if (!instance) return;

    const map = this.db.getMap(instance.dungeonId);
    const dungeon = map.dungeonData;
    
    const partyPlugin = this.gameEngine.pluginManager.getPlugin('party');
    const party = partyPlugin ? partyPlugin.parties.get(instance.partyId) : null;

    if (party) {
      // Move party members back to prontera
      for (const memberId of party.members) {
        const character = this.gameEngine.getCharacter(memberId);
        if (character && character.dungeonInstance === instanceId) {
          character.position.map = 'prontera';
          character.position.x = 10;
          character.position.y = 10;
          delete character.dungeonInstance;
          this.gameEngine.updateCharacter(memberId, character);
        }
      }

      // Notify party
      let message = `🏰 *Dungeon ${reason === 'timeout' ? 'Timeout' : 'Completed'}!*\n\n`;
      
      if (reason === 'completed') {
        message += `🎉 Congratulations! You completed ${dungeon.name}!\n\n`;
        message += `📊 *Results:*\n`;
        message += `👹 Monsters Killed: ${instance.monstersKilled}\n`;
        message += `👑 Boss Defeated: ${instance.bossDefeated ? '✅' : '❌'}\n`;
        
        if (instance.bossDefeated) {
          // Give rewards
          for (const memberId of party.members) {
            this.gameEngine.gainExp(memberId, dungeon.rewards.exp);
            
            const character = this.gameEngine.getCharacter(memberId);
            character.inventory.zeny += dungeon.rewards.zeny;
            
            // Random item rewards
            for (const itemId of dungeon.rewards.items) {
              if (Math.random() < 0.3) { // 30% chance per item
                this.gameEngine.addItemToInventory(memberId, itemId, 1);
              }
            }
            
            this.gameEngine.updateCharacter(memberId, character);
          }
          
          message += `\n🎁 *Rewards:*\n`;
          message += `✨ EXP: ${dungeon.rewards.exp}\n`;
          message += `💰 Zeny: ${dungeon.rewards.zeny}\n`;
          message += `🎁 Items: Random drops from ${dungeon.rewards.items.join(', ')}`;
          
          // Update party stats
          party.stats.dungeonsCleared++;
        }
      } else {
        message += `⏰ Time's up! You were teleported out of the dungeon.`;
      }

      await partyPlugin.notifyPartyMembers(party, message);
    }

    this.activeDungeons.delete(instanceId);
  }

  async handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('dungeon_enter_')) {
      const dungeonId = data.replace('dungeon_enter_', '');
      
      const partyPlugin = this.gameEngine.pluginManager.getPlugin('party');
      const party = partyPlugin ? partyPlugin.getPlayerParty(userId) : null;
      
      if (!party) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'You need to be in a party!');
        return true;
      }
      
      if (party.leader !== userId) {
        await this.bot.answerCallbackQuery(callbackQuery.id, 'Only party leader can enter!');
        return true;
      }

      await this.bot.answerCallbackQuery(callbackQuery.id, 'Entering dungeon...');
      await this.enterDungeon(callbackQuery.message.chat.id, party, dungeonId);
      return true;
    }

    if (data.startsWith('dungeon_info_')) {
      const dungeonId = data.replace('dungeon_info_', '');
      const map = this.db.getMap(dungeonId);
      
      if (map && map.isDungeon) {
        const dungeon = map.dungeonData;
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
        await this.bot.sendMessage(callbackQuery.message.chat.id,
          `🏰 *${dungeon.name}*\n\n` +
          `📖 ${dungeon.description}\n\n` +
          `📊 *Requirements:*\n` +
          `• Level: ${dungeon.minLevel}-${dungeon.maxLevel}\n` +
          `• Party Size: ${dungeon.minPartySize}-${dungeon.maxPartySize}\n\n` +
          `🏢 Floors: ${dungeon.floors}\n` +
          `⏱️ Time Limit: ${Math.floor(dungeon.timeLimit / 60000)} minutes\n` +
          `⏰ Cooldown: ${Math.floor(dungeon.cooldown / 60000)} minutes\n\n` +
          `👹 *Monsters:*\n${dungeon.monsters.join(', ')}\n\n` +
          `👑 *Boss:* ${dungeon.boss}\n\n` +
          `🎁 *Rewards:*\n` +
          `• ${dungeon.rewards.exp} EXP\n` +
          `• ${dungeon.rewards.zeny} Zeny\n` +
          `• Items: ${dungeon.rewards.items.join(', ')}`,
          { parse_mode: 'Markdown' }
        );
      }
      return true;
    }

    return false;
  }
}

module.exports = DungeonPlugin;