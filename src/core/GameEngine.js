class GameEngine {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.activeCombats = new Map();
    this.playerSessions = new Map();
    this.pluginManager = null; // Will be set by PluginManager
  }

  async init() {
    console.log('🎮 Game Engine initialized');
  }

  createCharacter(userId, name, className = 'novice') {
    const character = {
      id: userId,
      name: name,
      class: className,
      level: 1,
      exp: 0,
      expToNext: 100,
      stats: {
        hp: 100,
        maxHp: 100,
        sp: 50,
        maxSp: 50,
        attack: 10,
        defense: 5,
        agility: 10,
        intelligence: 10,
        vitality: 10,
        luck: 10
      },
      statusPoints: 0,
      skillPoints: 0,
      inventory: {
        items: {},
        zeny: 1000
      },
      equipment: {
        weapon: null,
        armor: null,
        accessory: null
      },
      position: {
        map: 'prontera',
        x: 5,
        y: 5
      },
      quests: {
        active: [],
        completed: []
      },
      guild: null,
      lastLogin: Date.now(),
      playtime: 0
    };

    this.db.setCharacter(userId, character);
    return character;
  }

  getCharacter(userId) {
    return this.db.getCharacter(userId);
  }

  updateCharacter(userId, updates) {
    const character = this.getCharacter(userId);
    if (!character) return null;

    const updatedCharacter = { ...character, ...updates };
    this.db.setCharacter(userId, updatedCharacter);
    return updatedCharacter;
  }

  gainExp(userId, amount) {
    const character = this.getCharacter(userId);
    if (!character) return null;

    character.exp += amount;
    
    // Check for level up
    while (character.exp >= character.expToNext) {
      character.exp -= character.expToNext;
      character.level++;
      character.expToNext = Math.floor(character.expToNext * 1.2);
      
      // Level up bonuses
      character.stats.maxHp += 10;
      character.stats.maxSp += 5;
      character.stats.hp = character.stats.maxHp;
      character.stats.sp = character.stats.maxSp;
      character.statusPoints += 3;
      character.skillPoints += 1;
    }

    this.updateCharacter(userId, character);
    return character;
  }

  moveCharacter(userId, direction) {
    const character = this.getCharacter(userId);
    if (!character) return null;

    const map = this.db.getMap(character.position.map);
    if (!map) return null;

    let newX = character.position.x;
    let newY = character.position.y;

    switch (direction) {
      case 'north':
        newY = Math.max(0, newY - 1);
        break;
      case 'south':
        newY = Math.min(map.height - 1, newY + 1);
        break;
      case 'east':
        newX = Math.min(map.width - 1, newX + 1);
        break;
      case 'west':
        newX = Math.max(0, newX - 1);
        break;
      default:
        return null;
    }

    // Check if tile is walkable
    const tile = map.tiles[newY][newX];
    if (tile === 'wall' || tile === 'water') {
      return null;
    }

    character.position.x = newX;
    character.position.y = newY;
    this.updateCharacter(userId, character);

    return character;
  }

  startCombat(userId, monsterId) {
    const character = this.getCharacter(userId);
    const monsterData = this.db.getMonster(monsterId);
    
    if (!character || !monsterData) return null;

    const combat = {
      id: `${userId}_${Date.now()}`,
      player: {
        id: userId,
        name: character.name,
        hp: character.stats.hp,
        maxHp: character.stats.maxHp,
        attack: character.stats.attack,
        defense: character.stats.defense
      },
      monster: {
        id: monsterId,
        name: monsterData.name,
        hp: monsterData.hp,
        maxHp: monsterData.hp,
        attack: monsterData.attack,
        defense: monsterData.defense,
        level: monsterData.level,
        exp: monsterData.exp,
        drops: monsterData.drops,
        zeny: monsterData.zeny || 0
      },
      turn: 'player',
      status: 'active'
    };

    this.activeCombats.set(userId, combat);
    return combat;
  }

  performAttack(userId, action = 'attack') {
    const combat = this.activeCombats.get(userId);
    if (!combat || combat.status !== 'active') return null;

    const results = [];

    if (combat.turn === 'player') {
      // Player attack
      const baseDamage = combat.player.attack - combat.monster.defense;
      const damage = Math.max(1, baseDamage + Math.floor(Math.random() * 5)); // Add some randomness
      combat.monster.hp -= damage;
      results.push({
        attacker: combat.player.name,
        target: combat.monster.name,
        damage: damage,
        type: 'attack'
      });

      if (combat.monster.hp <= 0) {
        combat.status = 'victory';
        results.push({ type: 'victory' });
        const rewards = this.endCombat(userId);
        results.push({ type: 'rewards', rewards: rewards });
      } else {
        combat.turn = 'monster';
      }
    }

    if (combat.turn === 'monster' && combat.status === 'active') {
      // Monster attack
      const baseDamage = combat.monster.attack - combat.player.defense;
      const damage = Math.max(1, baseDamage + Math.floor(Math.random() * 3)); // Add some randomness
      combat.player.hp -= damage;
      results.push({
        attacker: combat.monster.name,
        target: combat.player.name,
        damage: damage,
        type: 'attack'
      });

      if (combat.player.hp <= 0) {
        combat.status = 'defeat';
        results.push({ type: 'defeat' });
        this.endCombat(userId);
      } else {
        combat.turn = 'player';
      }
    }

    return { combat, results };
  }

  endCombat(userId) {
    const combat = this.activeCombats.get(userId);
    if (!combat) return null;
    
    const character = this.getCharacter(userId);
    if (!character) return null;
    
    // Update player HP to match combat HP
    character.stats.hp = Math.max(0, combat.player.hp);
    
    const rewards = {
      exp: 0,
      zeny: 0,
      items: [],
      levelUp: false
    };

    if (combat.status === 'victory') {

      // Give EXP
      const expGained = combat.monster.exp;
      character.exp += expGained;
      rewards.exp = expGained;
      
      // Give Zeny
      const zenyGained = combat.monster.zeny || Math.floor(Math.random() * 50) + 10;
      character.inventory.zeny += zenyGained;
      rewards.zeny = zenyGained;

      // Give item drops
      if (combat.monster.drops && combat.monster.drops.length > 0) {
        // Check each possible drop with individual drop rates
        for (const drop of combat.monster.drops) {
          const dropChance = Math.random() * 100; // Convert to percentage
          let dropId, dropRate, quantity = 1;
          
          // Handle both old format (string) and new format (object)
          if (typeof drop === 'string') {
            dropId = drop;
            dropRate = 30; // Default 30% for old format
          } else {
            dropId = drop.item;
            dropRate = drop.rate;
            quantity = drop.quantity || 1;
          }
          
          if (dropChance < dropRate) {
            const item = this.db.getItem(dropId);
            if (item) {
              if (!character.inventory.items[dropId]) {
                character.inventory.items[dropId] = 0;
              }
              character.inventory.items[dropId] += quantity;
              rewards.items.push({ id: dropId, name: item.name, quantity: quantity });
            }
          }
        }
      }

      // Check for level up
      const oldLevel = character.level;
      while (character.exp >= character.expToNext) {
        character.exp -= character.expToNext;
        character.level++;
        character.expToNext = Math.floor(character.expToNext * 1.2);
        
        character.stats.maxHp += 10;
        character.stats.maxSp += 5;
        character.stats.hp = character.stats.maxHp; // Full heal on level up
        character.stats.sp = character.stats.maxSp;
        character.statusPoints += 3;
        character.skillPoints += 1;
        rewards.levelUp = true;
      }
    } else if (combat.status === 'defeat') {
      // Player died - lose some EXP and reset HP to 1
      const expLoss = Math.floor(character.exp * 0.1); // Lose 10% EXP
      character.exp = Math.max(0, character.exp - expLoss);
      character.stats.hp = 1; // Revive with 1 HP
      rewards.exp = -expLoss;
    }

    this.updateCharacter(userId, character);

    this.activeCombats.delete(userId);
    return rewards;
  }

  getCombat(userId) {
    return this.activeCombats.get(userId);
  }

  addItemToInventory(userId, itemId, quantity = 1) {
    const character = this.getCharacter(userId);
    if (!character) return false;

    if (!character.inventory.items[itemId]) {
      character.inventory.items[itemId] = 0;
    }
    
    character.inventory.items[itemId] += quantity;
    this.updateCharacter(userId, character);
    return true;
  }

  useItem(userId, itemId) {
    const character = this.getCharacter(userId);
    const item = this.db.getItem(itemId);
    
    if (!character || !item || !character.inventory.items[itemId] || character.inventory.items[itemId] <= 0) {
      return false;
    }

    if (item.type === 'consumable' && item.effect) {
      // Apply item effects
      if (item.effect.hp) {
        character.stats.hp = Math.min(character.stats.maxHp, character.stats.hp + item.effect.hp);
      }
      if (item.effect.sp) {
        character.stats.sp = Math.min(character.stats.maxSp, character.stats.sp + item.effect.sp);
      }

      // Remove item from inventory
      character.inventory.items[itemId]--;
      if (character.inventory.items[itemId] <= 0) {
        delete character.inventory.items[itemId];
      }

      this.updateCharacter(userId, character);
      return true;
    }

    return false;
  }

  equipItem(userId, itemId) {
    const character = this.getCharacter(userId);
    const item = this.db.getItem(itemId);
    
    if (!character || !item || !character.inventory.items[itemId] || character.inventory.items[itemId] <= 0) {
      return false;
    }

    if (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') {
      // Unequip current item if any
      const currentEquipId = character.equipment[item.type];
      if (currentEquipId) {
        this.unequipItem(userId, item.type, false); // Don't add back to inventory yet
      }

      // Equip new item
      character.equipment[item.type] = itemId;
      
      // Apply stats
      if (item.stats) {
        for (const [stat, value] of Object.entries(item.stats)) {
          character.stats[stat] = (character.stats[stat] || 0) + value;
        }
      }

      // Add the previously equipped item back to inventory
      if (currentEquipId) {
        this.addItemToInventory(userId, currentEquipId, 1);
      }

      // Remove newly equipped item from inventory
      character.inventory.items[itemId]--;
      if (character.inventory.items[itemId] <= 0) {
        delete character.inventory.items[itemId];
      }

      this.updateCharacter(userId, character);
      return true;
    }

    return false;
  }

  unequipItem(userId, slot, addToInventory = true) {
    const character = this.getCharacter(userId);
    if (!character || !character.equipment[slot]) {
      return false;
    }

    const itemId = character.equipment[slot];
    const item = this.db.getItem(itemId);

    // Remove stats
    if (item && item.stats) {
      for (const [stat, value] of Object.entries(item.stats)) {
        character.stats[stat] -= value;
      }
    }

    // Add back to inventory
    if (addToInventory) {
        this.addItemToInventory(userId, itemId, 1);
    }

    character.equipment[slot] = null;
    this.updateCharacter(userId, character);
    return true;
  }

  generateMapView(userId, radius = 3) {
    const character = this.getCharacter(userId);
    if (!character) return null;

    const map = this.db.getMap(character.position.map);
    if (!map) return null;

    const centerX = character.position.x;
    const centerY = character.position.y;
    const view = [];

    for (let y = centerY - radius; y <= centerY + radius; y++) {
      const row = [];
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
          row.push('⬛');
        } else if (x === centerX && y === centerY) {
          row.push('🚶');
        } else {
          const tile = map.tiles[y][x];
          switch (tile) {
            case 'grass':
              row.push('🟩');
              break;
            case 'tree':
              row.push('🌳');
              break;
            case 'water':
              row.push('🌊');
              break;
            case 'wall':
              row.push('🧱');
              break;
            case 'floor':
              row.push('⬜');
              break;
            default:
              row.push('❓');
          }
        }
      }
      view.push(row.join(''));
    }

    return view.join('\n');
  }

  isInCity(mapId) {
    return this.config.locations.cities.includes(mapId);
  }

  isDungeon(mapId) {
    return this.config.locations.dungeons.includes(mapId);
  }
}

module.exports = GameEngine;