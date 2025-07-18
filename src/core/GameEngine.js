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
    const isPartyBattle = party ? !party.settings.afk : false;

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
        zeny: monsterData.zeny || 0,
        agility: monsterData.agility || 5 // Default agility
      },
      turn: 'player',
      status: 'active',
      currentPlayerIndex: 0,
      playerActions: new Map(),
      lastActionTimestamp: Date.now(),
      turnTimer: null
    };

    // Set combat for all participating players
    for (const memberId of partyMembers) {
      this.activeCombats.set(memberId, combat);
    }
    
    return combat;
  }

  registerPlayerAction(userId, action) {
    const combat = this.activeCombats.get(userId);
    if (!combat || combat.status !== 'active' || combat.turn !== 'player') {
      return { error: 'Bukan giliranmu atau pertarungan tidak aktif.' };
    }

    const player = combat.players.find(p => p.id === userId);
    if (!player) {
      return { error: 'Pemain tidak ditemukan dalam pertarungan.' };
    }

    if (player.hp <= 0) {
      return { error: 'Kamu sudah kalah dan tidak bisa beraksi.' };
    }

    if (combat.playerActions.has(userId)) {
      return { error: 'Kamu sudah memilih aksi untuk giliran ini.' };
    }

    // Validasi item sebelum mencatat aksi
    if (typeof action === 'object' && action.type === 'item') {
        const item = this.db.getItem(action.itemId);
        const character = this.getCharacter(userId);
        if (!item || !character.inventory.items[action.itemId]) {
            action = { type: 'action_failed', message: 'Item not found or you do not have it.' };
        } else if (item.type !== 'consumable') {
            action = { type: 'action_failed', message: `You cannot use ${item.name}.` };
        }
    }

    combat.playerActions.set(userId, action);
    combat.lastActionTimestamp = Date.now();

    const alivePlayersInRegister = combat.players.filter(p => p.hp > 0);
    if (combat.playerActions.size === alivePlayersInRegister.length) {
      return this.executeCombatTurn(userId);
    }

    return { success: true, message: 'Aksi dicatat. Menunggu pemain lain.' };
  }

  executeCombatTurn(userId) {
    const combat = this.activeCombats.get(userId);
    if (!combat || combat.status !== 'active') return null;

    const results = [];
    let alivePlayers;

    console.log('--- executeCombatTurn start ---');
    console.log('Initial Monster HP:', combat.monster.hp);
    console.log('Initial Combat Status:', combat.status);

    // 1. Process Player Actions
    if (combat.turn === 'player') {
      const runActions = Array.from(combat.playerActions.values()).filter(a => a === 'run');
      if (runActions.length > 0) {
        const canAttemptRun = !combat.isPartyBattle || runActions.length === combat.players.length;
        if (canAttemptRun) {
          const runChance = Math.random();
          if (runChance < 0.7) { // 70% chance to run
            results.push({ type: 'run_success' });
            this.endCombat(userId, combat);
            console.log('--- executeCombatTurn end (run success) ---');
            return { success: true, combat, results };
          } else {
            results.push({ type: 'run_fail' });
          }
        }
      }

      for (const [playerId, action] of combat.playerActions.entries()) {
        const player = combat.players.find(p => p.id === playerId);
        if (!player) continue;

        const actionType = typeof action === 'object' ? action.type : action;

        switch (actionType) {
          case 'attack':
            const playerAccuracy = player.agility * 0.5 + 80; // Base 80% hit chance
            const monsterEvasion = combat.monster.agility * 0.2;
            const hitChance = Math.max(10, Math.min(95, playerAccuracy - monsterEvasion));
            const isMiss = Math.random() * 100 > hitChance;

            if (isMiss) {
              results.push({ attacker: player.name, target: combat.monster.name, type: 'player_attack', isCritical: false, isMiss: true });
            } else {
              const critChance = Math.min(50, player.luck * 0.5);
              const isCritical = Math.random() * 100 < critChance;
              const baseDamage = player.attack - combat.monster.defense;
              let damage = Math.max(1, baseDamage + Math.floor(Math.random() * (player.attack * 0.1))); // Dmg variance

              if (isCritical) {
                damage = Math.floor(damage * 1.5);
              }

              combat.monster.hp -= damage;
              console.log(`Player ${player.name} attacked monster. Monster HP: ${combat.monster.hp}`);
              results.push({ attacker: player.name, target: combat.monster.name, damage: damage, type: 'player_attack', isCritical: isCritical, isMiss: false });
            }
            break;

          case 'defend':
            player.isDefending = true;
            results.push({ type: 'defend', player: player.name });
            break;

          case 'item':
            const itemResult = this.useItem(playerId, action.itemId, true);
            results.push({ type: itemResult.success ? 'item_use' : 'player_action_failed', player: player.name, message: itemResult.message });
            break;
          case 'action_failed':
            results.push({ type: 'player_action_failed', player: player.name, message: action.message });
            break;
        }
      }

      combat.playerActions.clear();

      console.log('Monster HP after player actions:', combat.monster.hp);
      console.log('Checking monster HP for victory condition:', combat.monster.hp);
      if (combat.monster.hp <= 0) {
        combat.status = 'victory';
      } else {
        combat.turn = 'monster';
      }
    }

    // 2. Monster's Turn
    if (combat.turn === 'monster' && combat.status === 'active') {
      alivePlayers = combat.players.filter(p => p.hp > 0);
      const targetPlayer = combat.isPartyBattle ?
        alivePlayers[Math.floor(Math.random() * alivePlayers.length)] :
        combat.players[0];

      const monsterAccuracy = 90; // Base 90% hit chance for monster
      const playerEvasion = targetPlayer.agility * 0.2;
      const monsterHitChance = Math.max(10, Math.min(95, monsterAccuracy - playerEvasion));
      const isMissedByMonster = Math.random() * 100 > monsterHitChance;

      if (isMissedByMonster) {
        results.push({ attacker: combat.monster.name, target: targetPlayer.name, type: 'monster_attack', isCritical: false, isMiss: true });
      } else {
        const critChanceMonster = Math.min(50, 5 + combat.monster.level * 0.5); // Base 5% crit
        const isCriticalMonster = Math.random() * 100 < critChanceMonster;
        
        let defense = targetPlayer.defense;
        if (targetPlayer.isDefending) {
            defense *= 1.5;
        }
        const baseDamage = combat.monster.attack - defense;
        let damage = Math.max(1, baseDamage + Math.floor(Math.random() * 3));

        if (isCriticalMonster) {
          damage = Math.floor(damage * 1.5);
        }

        console.log(`Monster attacking ${targetPlayer.name}. Initial HP: ${targetPlayer.hp}, Damage: ${damage}`);
        targetPlayer.hp -= damage;
        console.log(`Monster attacking ${targetPlayer.name}. Final HP: ${targetPlayer.hp}`);
        results.push({ attacker: combat.monster.name, target: targetPlayer.name, damage: damage, type: 'monster_attack', isCritical: isCriticalMonster, isMiss: false });
      }

      alivePlayers = combat.players.filter(p => p.hp > 0);
      console.log('Alive players after monster turn:', alivePlayers.length);
      if (alivePlayers.length === 0) {
        console.log('All players defeated. Setting combat status to defeat.');
        combat.status = 'defeat';
      } else {
        combat.turn = 'player';
        combat.currentPlayerIndex = 0;
      }
    }

    // 3. Reset Temporary Statuses for the next turn
    for (const player of combat.players) {
      if (player.isDefending) {
        player.isDefending = false;
      }
    }

    // 4. Handle End of Combat
    console.log('Checking combat status for end of combat:', combat.status);
    if (combat.status !== 'active') {
      if (combat.status === 'victory') {
        results.push({ type: 'victory' });
      } else if (combat.status === 'defeat') {
        results.push({ type: 'defeat' });
      }
      const rewards = this.endCombat(userId, combat);
      if (rewards) {
          results.push({ type: 'rewards', rewards: rewards });
      }
    }
    console.log('Final results array before returning:', results);
    console.log('--- executeCombatTurn end ---');
    return { success: true, combat, results };
  }

  endCombat(userId, combat = null, isCancelled = false) {
    console.log('Entering endCombat for combat status:', combat.status);
    if (!combat) {
      combat = this.activeCombats.get(userId);
    }
    if (!combat) return null;

    // Remove combat for all participating players first
    for (const player of combat.players) {
      this.activeCombats.delete(player.id);
    }

    if (isCancelled) {
      console.log('Combat cancelled.');
      return { cancelled: true };
    }
    
    const rewards = {
      exp: 0,
      zeny: 0,
      items: [],
      levelUp: false
    };

    const partyPlugin = this.pluginManager ? this.pluginManager.getPlugin('party') : null;
    const party = combat.partyId ? (partyPlugin ? partyPlugin.parties.get(combat.partyId) : null) : null;

    if (combat.status === 'victory') {
      console.log('Processing victory rewards.');
      const totalParticipants = combat.players.length;
      const expPerPlayer = (party && party.settings.expShare) || !combat.isPartyBattle ? 
        Math.floor(combat.monster.exp / totalParticipants) : 
        combat.monster.exp;
      
      const zenyPerPlayer = (party && party.settings.expShare) || !combat.isPartyBattle ? 
        Math.floor((combat.monster.zeny || 0) / totalParticipants) : 
        (combat.monster.zeny || 0);

      rewards.exp = expPerPlayer;
      rewards.zeny = zenyPerPlayer;

      for (const player of combat.players) {
        const character = this.getCharacter(player.id);
        if (character) {
          character.stats.hp = Math.max(0, player.hp);
          console.log(`Player ${character.name} initial EXP: ${character.exp}, adding ${expPerPlayer} EXP.`);
          character.exp += expPerPlayer;
          console.log(`Player ${character.name} final EXP: ${character.exp}.`);
          character.inventory.zeny = (character.inventory.zeny || 0) + zenyPerPlayer;
          
          let hasLeveledUp = false;
          while (character.exp >= character.expToNext) {
            console.log(`Player ${character.name} leveling up! Current EXP: ${character.exp}, EXP to next: ${character.expToNext}`);
            character.exp -= character.expToNext;
            character.level++;
            character.expToNext = Math.floor(character.expToNext * 1.2);
            character.stats.maxHp += 10;
            character.stats.maxSp += 5;
            character.statusPoints += 3;
            character.skillPoints += 1;
            hasLeveledUp = true;
          }
          if(hasLeveledUp) {
              character.stats.hp = character.stats.maxHp;
              character.stats.sp = character.stats.maxSp;
              rewards.levelUp = true;
          }
          
          this.updateCharacter(player.id, character);
        }
      }
      
      if (combat.monster.drops && combat.monster.drops.length > 0) {
          const dropRecipient = combat.isPartyBattle && party && party.settings.itemShare ?
              combat.players[Math.floor(Math.random() * combat.players.length)] :
              combat.players[0]; // In solo, it's just the one player

          for (const drop of combat.monster.drops) {
              const dropChance = drop.chance || 0.3; // Default 30%
              if (Math.random() < dropChance) {
                  const item = this.db.getItem(drop.itemId);
                  if (item) {
                      const characterToReceive = this.getCharacter(dropRecipient.id);
                      if(characterToReceive) {
                          if (!characterToReceive.inventory.items[drop.itemId]) {
                              characterToReceive.inventory.items[drop.itemId] = 0;
                          }
                          characterToReceive.inventory.items[drop.itemId] += 1;
                          rewards.items.push({ id: drop.itemId, name: item.name, quantity: 1, recipient: characterToReceive.name });
                          this.updateCharacter(dropRecipient.id, characterToReceive);
                      }
                  }
              }
          }
      }

    } else if (combat.status === 'defeat') {
      console.log('Processing defeat consequences.');
      let totalExpLoss = 0;
      for (const player of combat.players) {
        const character = this.getCharacter(player.id);
        if (character) {
          const expLoss = Math.floor(character.exp * 0.01); // Lose 1% exp
          character.exp = Math.max(0, character.exp - expLoss);
          character.stats.hp = 1;
          this.updateCharacter(player.id, character);
          totalExpLoss += expLoss;
        }
      }
      rewards.exp = -totalExpLoss;
    }
    console.log('Rewards calculated:', rewards);
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

  useItem(userId, itemId, fromCombat = false) {
    const character = this.getCharacter(userId);
    const item = this.db.getItem(itemId);

    if (!character || !item || !character.inventory.items[itemId] || character.inventory.items[itemId] <= 0) {
      return { success: false, message: 'Item not found or you do not have it.' };
    }

    if (item.type === 'consumable' && item.effect) {
      let messageParts = [];
      let target = character; // Default target is the character

      if (fromCombat) {
        const combat = this.activeCombats.get(userId);
        if (combat) {
          target = combat.players.find(p => p.id === userId);
          if (!target) return { success: false, message: 'Player not in combat.' };
        }
      }

      const maxHp = target.maxHp || character.stats.maxHp;
      const maxSp = target.maxSp || character.stats.maxSp;

      let finalHp = target.hp || character.stats.hp;
      let finalSp = target.sp || character.stats.sp;

      // Apply item effects
      if (item.effect.hp) {
        const newHp = Math.min(maxHp, finalHp + item.effect.hp);
        const hpHealed = newHp - finalHp;
        if (hpHealed > 0) {
          finalHp = newHp;
          messageParts.push(`recovers ${hpHealed} HP`);
        }
      }
      if (item.effect.sp) {
        const newSp = Math.min(maxSp, finalSp + item.effect.sp);
        const spHealed = newSp - finalSp;
        if (spHealed > 0) {
          finalSp = newSp;
          messageParts.push(`recovers ${spHealed} SP`);
        }
      }

      if (messageParts.length === 0) {
        return { success: false, message: `You are already at full HP/SP.` };
      }

      // Update the character/player in combat
      character.stats.hp = finalHp;
      character.stats.sp = finalSp;
      if (fromCombat) {
        target.hp = finalHp;
        target.sp = finalSp; // Update SP in combat player object
      }

      // Remove item from inventory
      character.inventory.items[itemId]--;
      if (character.inventory.items[itemId] <= 0) {
        delete character.inventory.items[itemId];
      }
      this.updateCharacter(userId, character);

      const message = `${character.name} used ${item.name} and ${messageParts.join(' and ')}.`;
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

  checkInactiveCombats() {
    const now = Date.now();
    const processedCombatIds = new Set();
    for (const [userId, combat] of this.activeCombats.entries()) {
      if (processedCombatIds.has(combat.id)) {
        continue; // Already processed this combat
      }
      if (combat.status === 'active' && now - combat.lastActionTimestamp > 120000) { // 2 menit
        // Iterate over all players in the combat and end combat for each of them
        for (const player of combat.players) {
          this.endCombat(player.id, combat, true); // Batalkan pertarungan
        }
      }
      processedCombatIds.add(combat.id);
    }
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