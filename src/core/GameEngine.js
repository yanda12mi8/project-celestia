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

    // Check if player is in a party and party battle is enabled
    const partyPlugin = this.pluginManager ? this.pluginManager.getPlugin('party') : null;
    const party = partyPlugin ? partyPlugin.getPlayerParty(userId) : null;
    const isPartyBattle = party && !party.settings.afk;

    let partyMembers = [userId];
    if (isPartyBattle) {
      // Get all party members in the same map
      partyMembers = party.members.filter(memberId => {
        const memberChar = this.getCharacter(memberId);
        return memberChar && memberChar.position.map === character.position.map;
      });
    }
    const combat = {
      id: `${userId}_${Date.now()}`,
      isPartyBattle: isPartyBattle,
      partyId: party ? party.id : null,
      players: partyMembers.map(memberId => {
        const memberChar = this.getCharacter(memberId);
        return {
          id: memberId,
          name: memberChar.name,
          hp: memberChar.stats.hp,
          maxHp: memberChar.stats.maxHp,
          attack: memberChar.stats.attack,
          defense: memberChar.stats.defense,
          agility: memberChar.stats.agility,
          luck: memberChar.stats.luck
        };
      }),
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
      status: 'active',
      currentPlayerIndex: 0
    };

    // Set combat for all participating players
    for (const memberId of partyMembers) {
      this.activeCombats.set(memberId, combat);
    }
    
    return combat;
  }

  performAttack(userId, action = 'attack') {
    const combat = this.activeCombats.get(userId);
    if (!combat || combat.status !== 'active') return null;

    // For party battles, only the current player can act
    if (combat.isPartyBattle) {
      const currentPlayer = combat.players[combat.currentPlayerIndex];
      if (currentPlayer.id !== userId) {
        return { error: 'Not your turn!' };
      }
    }

    const results = [];

    if (combat.turn === 'player') {
      const currentPlayer = combat.isPartyBattle ? 
        combat.players[combat.currentPlayerIndex] : 
        combat.players[0];
      
      // Player attack
      const critChance = Math.min(50, currentPlayer.luck * 0.5);
      const isCritical = Math.random() * 100 < critChance;
      const baseDamage = currentPlayer.attack - combat.monster.defense;
      let damage = Math.max(1, baseDamage + Math.floor(Math.random() * 5)); // Add some randomness
      
      if (isCritical) {
        damage = Math.floor(damage * 1.5); // 150% damage on critical
      }

      combat.monster.hp -= damage;
      results.push({
        attacker: currentPlayer.name,
        target: combat.monster.name,
        damage: damage,
        type: isCritical ? 'critical' : 'attack'
      });

      if (combat.monster.hp <= 0) {
        combat.status = 'victory';
        results.push({ type: 'victory' });
        const rewards = this.endCombat(userId, combat);
        results.push({ type: 'rewards', rewards: rewards });
      } else {
        if (combat.isPartyBattle) {
          // Move to next player or monster turn
          combat.currentPlayerIndex++;
          if (combat.currentPlayerIndex >= combat.players.length) {
            combat.currentPlayerIndex = 0;
            combat.turn = 'monster';
          }
        } else {
          combat.turn = 'monster';
        }
      }
    }

    if (combat.turn === 'monster' && combat.status === 'active') {
      // Monster attacks random player in party battle, or the single player
      const targetPlayer = combat.isPartyBattle ? 
        combat.players[Math.floor(Math.random() * combat.players.length)] :
        combat.players[0];
      
      const evasionChance = Math.min(75, targetPlayer.agility * 0.2);
      const isEvaded = Math.random() * 100 < evasionChance;

      if (isEvaded) {
        results.push({
            attacker: combat.monster.name,
            target: targetPlayer.name,
            type: 'evade'
        });
      } else {
        const baseDamage = combat.monster.attack - targetPlayer.defense;
        const damage = Math.max(1, baseDamage + Math.floor(Math.random() * 3)); // Add some randomness
        targetPlayer.hp -= damage;
        results.push({
            attacker: combat.monster.name,
            target: targetPlayer.name,
            damage: damage,
            type: 'attack'
        });

        // Check if any player is still alive
        const alivePlayers = combat.players.filter(p => p.hp > 0);
        if (alivePlayers.length === 0) {
          combat.status = 'defeat';
          results.push({ type: 'defeat' });
          this.endCombat(userId, combat);
        }
      }

      if (combat.status === 'active') {
        combat.turn = 'player';
        combat.currentPlayerIndex = 0;
      }
    }

    return { combat, results };
  }

  endCombat(userId, combat = null) {
    if (!combat) {
      combat = this.activeCombats.get(userId);
    }
    if (!combat) return null;
    
    const rewards = {
      exp: 0,
      zeny: 0,
      items: [],
      levelUp: false
    };

    // Get party plugin for party battle handling
    const partyPlugin = this.pluginManager ? this.pluginManager.getPlugin('party') : null;
    const party = combat.partyId ? (partyPlugin ? partyPlugin.parties.get(combat.partyId) : null) : null;

    // Update all players' HP to match combat HP
    for (const player of combat.players) {
      const character = this.getCharacter(player.id);
      if (character) {
        character.stats.hp = Math.max(0, player.hp);
        this.updateCharacter(player.id, character);
      }
    }
    if (combat.status === 'victory') {
      const totalParticipants = combat.players.length;
      const expPerPlayer = party && party.settings.expShare ? 
        Math.floor(combat.monster.exp / totalParticipants) : 
        combat.monster.exp;
      
      const zenyPerPlayer = party && party.settings.expShare ? 
        Math.floor((combat.monster.zeny || Math.floor(Math.random() * 50) + 10) / totalParticipants) : 
        (combat.monster.zeny || Math.floor(Math.random() * 50) + 10);

      // Distribute EXP and Zeny
      for (const player of combat.players) {
        const character = this.getCharacter(player.id);
        if (character) {
          // Give EXP
          character.exp += expPerPlayer;
          
          // Give Zeny
          character.inventory.zeny += zenyPerPlayer;
          
          // Check for level up
          while (character.exp >= character.expToNext) {
            character.exp -= character.expToNext;
            character.level++;
            character.expToNext = Math.floor(character.expToNext * 1.2);
            
            character.stats.maxHp += 10;
            character.stats.maxSp += 5;
            character.stats.hp = character.stats.maxHp;
            character.stats.sp = character.stats.maxSp;
            character.statusPoints += 3;
            character.skillPoints += 1;
            rewards.levelUp = true;
          }
          
          this.updateCharacter(player.id, character);
        }
      }
      
      rewards.exp = expPerPlayer;
      rewards.zeny = zenyPerPlayer;

      // Give item drops
      if (combat.monster.drops && combat.monster.drops.length > 0) {
        if (party && party.settings.itemShare) {
          // Random distribution for party
          for (const drop of combat.monster.drops) {
            let dropId, baseRate, quantity = 1;

            if (typeof drop === 'string') {
              dropId = drop;
              baseRate = 30;
            } else {
              dropId = drop.item;
              baseRate = drop.rate;
              quantity = drop.quantity || 1;
            }

            const avgLuck = combat.players.reduce((sum, p) => sum + p.luck, 0) / combat.players.length;
            const dropRate = Math.min(100, baseRate + (avgLuck * 0.1));
            const dropChance = Math.random() * 100;

            if (dropChance < dropRate) {
              const item = this.db.getItem(dropId);
              if (item) {
                // Give to random party member
                const randomPlayer = combat.players[Math.floor(Math.random() * combat.players.length)];
                const character = this.getCharacter(randomPlayer.id);
                if (character) {
                  if (!character.inventory.items[dropId]) {
                    character.inventory.items[dropId] = 0;
                  }
                  character.inventory.items[dropId] += quantity;
                  rewards.items.push({ id: dropId, name: item.name, quantity: quantity, recipient: character.name });
                  this.updateCharacter(randomPlayer.id, character);
                }
              }
            }
          }
        } else {
          // Individual drops for each player or solo player
          for (const player of combat.players) {
            const character = this.getCharacter(player.id);
            if (character) {
              for (const drop of combat.monster.drops) {
                let dropId, baseRate, quantity = 1;

                if (typeof drop === 'string') {
                  dropId = drop;
                  baseRate = 30;
                } else {
                  dropId = drop.item;
                  baseRate = drop.rate;
                  quantity = drop.quantity || 1;
                }

                const dropRate = Math.min(100, baseRate + (character.stats.luck * 0.1));
                const dropChance = Math.random() * 100;

                if (dropChance < dropRate) {
                  const item = this.db.getItem(dropId);
                  if (item) {
                    if (!character.inventory.items[dropId]) {
                      character.inventory.items[dropId] = 0;
                    }
                    character.inventory.items[dropId] += quantity;
                    rewards.items.push({ id: dropId, name: item.name, quantity: quantity, recipient: character.name });
                  }
                }
              }
              this.updateCharacter(player.id, character);
            }
          }
        }
      }

    } else if (combat.status === 'defeat') {
      // All players died - lose some EXP and reset HP to 1
      for (const player of combat.players) {
        const character = this.getCharacter(player.id);
        if (character) {
          const expLoss = Math.floor(character.exp * 0.1);
          character.exp = Math.max(0, character.exp - expLoss);
          character.stats.hp = 1;
          this.updateCharacter(player.id, character);
        }
      }
      rewards.exp = -Math.floor(combat.players[0] ? this.getCharacter(combat.players[0].id).exp * 0.1 : 0);
    }

    // Remove combat for all participating players
    for (const player of combat.players) {
      this.activeCombats.delete(player.id);
    }
    
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
    const combat = this.getCombat(userId);

    if (!character || !item || !character.inventory.items[itemId] || character.inventory.items[itemId] <= 0) {
      return { success: false, message: 'Item not found or you do not have it.' };
    }

    if (item.type === 'consumable' && item.effect) {
      let messageParts = [];
      
      // Determine the source of truth for current stats
      const currentHp = combat ? combat.player.hp : character.stats.hp;
      const currentSp = character.stats.sp; // Combat doesn't track SP

      const maxHp = character.stats.maxHp;
      const maxSp = character.stats.maxSp;

      let finalHp = currentHp;
      let finalSp = currentSp;

      // Apply item effects
      if (item.effect.hp) {
        const newHp = Math.min(maxHp, currentHp + item.effect.hp);
        const hpHealed = newHp - currentHp;
        if (hpHealed > 0) {
          finalHp = newHp;
          messageParts.push(`recovers ${hpHealed} HP`);
        }
      }
      if (item.effect.sp) {
        const newSp = Math.min(maxSp, currentSp + item.effect.sp);
        const spHealed = newSp - currentSp;
        if (spHealed > 0) {
          finalSp = newSp;
          messageParts.push(`recovers ${spHealed} SP`);
        }
      }

      if (messageParts.length === 0) {
        return { success: false, message: `You are already at full HP/SP.` };
      }

      // Update the character in the database
      character.stats.hp = finalHp;
      character.stats.sp = finalSp;

      // Remove item from inventory
      character.inventory.items[itemId]--;
      if (character.inventory.items[itemId] <= 0) {
        delete character.inventory.items[itemId];
      }
      this.updateCharacter(userId, character);

      // If in combat, update the combat object as well
      if (combat) {
        combat.player.hp = finalHp;
      }
      
      const message = `You used ${item.name} and ${messageParts.join(' and ')}.`;
      return { success: true, message: message };
    }

    return { success: false, message: `You cannot use ${item.name}.` };
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