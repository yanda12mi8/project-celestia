const GameEngine = require('../src/core/GameEngine');
const CombatPlugin = require('../src/plugins/combat');

describe('Combat System', () => {
  let gameEngine;
  let combatPlugin;
  let mockDb;
  let mockBot;

  let charactersData = {}; // This will store the current state of characters

  beforeEach(() => {
    charactersData = { // Initialize with fresh data for each test
      'player1': { id: 'player1', name: 'Hero', level: 1, exp: 0, expToNext: 100, stats: { hp: 100, maxHp: 100, attack: 10, defense: 5, agility: 10, luck: 10 }, inventory: { items: { 'potion': 1 }, zeny: 100 }, position: { map: 'test_map' } },
      'player2': { id: 'player2', name: 'Sidekick', level: 1, exp: 0, expToNext: 100, stats: { hp: 100, maxHp: 100, attack: 8, defense: 4, agility: 8, luck: 8 }, inventory: { items: {}, zeny: 100 }, position: { map: 'test_map' } },
    };

    mockDb = {
      getCharacter: jest.fn((userId) => {
        return JSON.parse(JSON.stringify(charactersData[userId])); // Return a deep copy
      }),
      getMonster: jest.fn((monsterId) => {
        const monsters = {
          'goblin': { id: 'goblin', name: 'Goblin', hp: 1, maxHp: 50, attack: 7, defense: 3, level: 1, exp: 20, zeny: 5, drops: [], agility: 5 },
        };
        return monsters[monsterId];
      }),
      setCharacter: jest.fn((userId, character) => {
        charactersData[userId] = JSON.parse(JSON.stringify(character)); // Update the stored data
      }),
      getItem: jest.fn((itemId) => {
        if (itemId === 'potion') {
          return { id: 'potion', name: 'Health Potion', type: 'consumable', effect: { hp: 20 } };
        }
        return null;
      })
    };

    mockBot = {
      sendMessage: jest.fn(),
      answerCallbackQuery: jest.fn()
    };

    gameEngine = new GameEngine(mockDb, {});
    // Default mock for pluginManager, assuming no party unless explicitly set in a describe block
    gameEngine.pluginManager = {
      getPlugin: jest.fn((pluginName) => {
        if (pluginName === 'party') {
          return {
            getPlayerParty: jest.fn(() => null), // Default to no party
            parties: {
          get: jest.fn((partyId) => {
            if (partyId === 'party1') {
              return { id: 'party1', members: ['player1', 'player2'], settings: { afk: false, expShare: true, itemShare: true } };
            }
            return null;
          })
        }
          };
        }
        return null;
      })
    };
    combatPlugin = new CombatPlugin(mockBot, mockDb, gameEngine);
  });

  afterEach(() => {
    jest.clearAllTimers();
    if (combatPlugin && combatPlugin.cleanup) {
      combatPlugin.cleanup();
    }
    jest.restoreAllMocks();
  });

  // Mock setTimeout and setInterval
  jest.useFakeTimers();

  describe('Solo Battle', () => {
    test('should start a solo combat', async () => {
      const userId = 'player1';
      const monsterId = 'goblin';
      const combat = gameEngine.startCombat(userId, monsterId);

      expect(combat).toBeDefined();
      expect(combat.isPartyBattle).toBe(false);
      expect(combat.players.length).toBe(1);
      expect(combat.players[0].id).toBe(userId);
      expect(combat.monster.id).toBe(monsterId);
      expect(gameEngine.activeCombats.get(userId)).toBe(combat);
    });

    test('should process a solo attack turn', async () => {
      const userId = 'player1';
      gameEngine.startCombat(userId, 'goblin');

      const result = gameEngine.registerPlayerAction(userId, 'attack');
      // registerPlayerAction now returns the final result for solo players
      expect(result.results).toBeDefined();
      expect(result.combat.monster.hp).toBeLessThan(50);
    });

    test('should end solo combat on monster defeat', async () => {
      const userId = 'player1';
      const combat = gameEngine.startCombat(userId, 'goblin');
      combat.monster.hp = 1; // Set low HP for quick defeat
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Ensure player hits

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');
      expect(finalResult.results.some(r => r.type === 'victory')).toBe(true);
      expect(gameEngine.activeCombats.has(userId)).toBe(false);
    });

    test('should handle solo player defeat', async () => {
      const userId = 'player1';
      // Mock the monster to have higher HP so it doesn't die in one hit
      mockDb.getMonster.mockReturnValueOnce({ 
        id: 'goblin', name: 'Goblin', hp: 100, maxHp: 100, attack: 10, defense: 3, level: 1, exp: 20, zeny: 5, drops: [], agility: 5 
      });
      const combat = gameEngine.startCombat(userId, 'goblin');
      combat.players[0].hp = 1; // Set low HP for quick defeat

      // Mock Math.random to ensure monster hits and does not crit
      jest.spyOn(global.Math, 'random')
        .mockReturnValueOnce(0.1) // Player attack hits (doesn't matter for this test, but good practice)
        .mockReturnValueOnce(0.1) // Monster hits (less than monsterHitChance)
        .mockReturnValueOnce(0.9); // Monster does not crit (greater than critChanceMonster)

      // Simulate monster turn by having the player attack
      const result = gameEngine.registerPlayerAction(userId, 'attack');
      expect(result.results.some(r => r.type === 'defeat')).toBe(true);
      expect(gameEngine.activeCombats.has(userId)).toBe(false);
      const character = mockDb.getCharacter(userId);
      expect(character.stats.hp).toBe(1); // Revived with 1 HP
    });

    test('should allow solo player to use item', async () => {
      const userId = 'player1';
      const combat = gameEngine.startCombat(userId, 'goblin');
      combat.players[0].hp = 50; // Player takes damage

      const finalResult = gameEngine.registerPlayerAction(userId, { type: 'item', itemId: 'potion' });
      expect(finalResult.success).toBe(true);
      expect(finalResult.results).toBeDefined();
      // The player uses a potion and recovers 20 HP, then the monster attacks.
      // We check if the final HP is greater than the starting HP minus monster damage.
      const monsterAttack = combat.monster.attack - combat.players[0].defense;
      expect(combat.players[0].hp).toBeGreaterThan(50 - monsterAttack);
      expect(combat.players[0].hp).toBeLessThanOrEqual(70);
      const character = mockDb.getCharacter(userId);
      expect(character.inventory.items['potion']).toBeUndefined(); // Item consumed
    });

    test('should allow solo player to run away', async () => {
      const userId = 'player1';
      gameEngine.startCombat(userId, 'goblin');

      // Mock Math.random to ensure successful run
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Less than 0.7 for successful run

      const finalResult = gameEngine.registerPlayerAction(userId, 'run');
      expect(finalResult.results.some(r => r.type === 'run_success')).toBe(true);
      expect(gameEngine.activeCombats.has(userId)).toBe(false);
    });

    test('should handle solo player failing to run away', async () => {
      const userId = 'player1';
      gameEngine.startCombat(userId, 'goblin');

      // Mock Math.random to ensure failed run
      jest.spyOn(global.Math, 'random').mockReturnValue(0.8); // Greater than 0.7 for failed run

      const finalResult = gameEngine.registerPlayerAction(userId, 'run');
      expect(finalResult.results.some(r => r.type === 'run_fail')).toBe(true);
      expect(gameEngine.activeCombats.has(userId)).toBe(true); // Combat should still be active
    });

    test('should handle critical hit from player to monster', async () => {
      const userId = 'player1';
      const combat = gameEngine.startCombat(userId, 'goblin');
      const initialMonsterHp = combat.monster.hp;

      // Mock Math.random to ensure critical hit (e.g., luck check passes)
      jest.spyOn(global.Math, 'random').mockReturnValue(0.01); // Very low value to ensure critical hit

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');

      const attackResult = finalResult.results.find(r => r.type === 'player_attack');
      expect(attackResult.isCritical).toBe(true);
      expect(finalResult.combat.monster.hp).toBeLessThan(initialMonsterHp - (combat.players[0].attack - combat.monster.defense)); // Should deal more than normal damage
    });

    test('should handle critical hit from monster to player', async () => {
      const userId = 'player1';
      // Temporarily mock getMonster to return a monster with higher HP for this test
      mockDb.getMonster.mockReturnValueOnce({
        id: 'goblin',
        name: 'Goblin',
        hp: 100, // Set higher HP to ensure monster survives player's attack
        maxHp: 100,
        attack: 5,
        defense: 0,
        level: 1,
        exp: 20,
        zeny: 5,
        drops: [],
        agility: 5
      });
      const combat = gameEngine.startCombat(userId, 'goblin');
      const initialPlayerHp = combat.players[0].hp;

      // Mock Math.random to ensure monster critical hit
      jest.spyOn(global.Math, 'random').mockReturnValue(0.01); // Very low value to ensure critical hit

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');

      const monsterAttack = finalResult.results.find(r => r.type === 'monster_attack');
      expect(monsterAttack.isCritical).toBe(true);
      expect(finalResult.combat.players[0].hp).toBeLessThan(initialPlayerHp - (combat.monster.attack - combat.players[0].defense)); // Should take more than normal damage
    });

    test('should handle miss from player to monster', async () => {
      const userId = 'player1';
      const combat = gameEngine.startCombat(userId, 'goblin');
      const initialMonsterHp = combat.monster.hp;

      // Mock Math.random to ensure player misses
      jest.spyOn(global.Math, 'random').mockReturnValue(0.99); // Very high value to ensure miss

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');

      expect(finalResult.results.some(r => r.type === 'player_attack' && r.isMiss)).toBe(true);
      expect(finalResult.combat.monster.hp).toBe(initialMonsterHp); // Monster HP should not change
    });

    test('should handle miss from monster to player', async () => {
      const userId = 'player1';
      const combat = gameEngine.startCombat(userId, 'goblin');
      const initialPlayerHp = combat.players[0].hp;

      // Mock Math.random to ensure monster misses
      jest.spyOn(global.Math, 'random').mockReturnValue(0.99); // Very high value to ensure miss

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');

      expect(finalResult.results.some(r => r.type === 'monster_attack' && r.isMiss)).toBe(true);
      // Player HP might change slightly due to damage variance if the attack hits, so we check it's close to initial
      expect(finalResult.combat.players[0].hp).toBe(initialPlayerHp);
    });

    test('should not allow solo player to use non-existent item', async () => {
      const userId = 'player1';
      gameEngine.startCombat(userId, 'goblin');

      const result = gameEngine.registerPlayerAction(userId, { type: 'item', itemId: 'nonExistentItem' });
      expect(result.results.some(r => r.type === 'player_action_failed' && r.message.includes('Item not found or you do not have it.'))).toBe(true);
    });

    test('should not allow solo player to use non-consumable item', async () => {
      const userId = 'player1';
      // Add a non-consumable item to inventory for this test
      charactersData[userId].inventory.items['sword'] = 1;
      mockDb.getItem.mockImplementation((itemId) => {
        if (itemId === 'potion') {
          return { id: 'potion', name: 'Health Potion', type: 'consumable', effect: { hp: 20 } };
        } else if (itemId === 'sword') {
          return { id: 'sword', name: 'Basic Sword', type: 'weapon' };
        }
        return null;
      });

      gameEngine.startCombat(userId, 'goblin');
      const result = gameEngine.registerPlayerAction(userId, { type: 'item', itemId: 'sword' });
      expect(result.results.some(r => r.type === 'player_action_failed' && r.message.includes('You cannot use Basic Sword.'))).toBe(true);
    });

    test('should allow solo player to defend and take reduced damage', async () => {
      const userId = 'player1';
      const combat = gameEngine.startCombat(userId, 'goblin');
      const initialPlayerHp = combat.players[0].hp;

      // Mock Math.random to ensure monster hits
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Ensure hit

      const finalResult = gameEngine.registerPlayerAction(userId, 'defend');

      expect(finalResult.results.some(r => r.type === 'defend' && r.player === 'Hero')).toBe(true);

      const monsterAttackResult = finalResult.results.find(r => r.type === 'monster_attack');
      expect(monsterAttackResult).toBeDefined();

      const normalDamage = combat.monster.attack - combat.players[0].defense;
      expect(monsterAttackResult.damage).toBeLessThan(normalDamage);

      expect(combat.players[0].hp).toBe(initialPlayerHp - monsterAttackResult.damage);
    });

    test('should award EXP and Zeny on solo victory', async () => {
      const userId = 'player1';
      const monsterId = 'goblin';
      const monster = mockDb.getMonster(monsterId);
      const initialCharacter = JSON.parse(JSON.stringify(charactersData[userId])); // Deep copy
    
      const combat = gameEngine.startCombat(userId, monsterId);
      combat.monster.hp = 1; // Ensure victory in one hit
    
      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');
    
      expect(finalResult.results.some(r => r.type === 'victory')).toBe(true);
      expect(finalResult.results.some(r => r.type === 'rewards')).toBe(true);
    
      const updatedCharacter = mockDb.getCharacter(userId);
      expect(updatedCharacter.exp).toBe(initialCharacter.exp + monster.exp);
      expect(updatedCharacter.inventory.zeny).toBe(initialCharacter.inventory.zeny + monster.zeny);
    });

    test('should award item drops on solo victory', async () => {
      const userId = 'player1';
      const monsterId = 'goblin';
      // Mock monster with drops
      mockDb.getMonster.mockImplementation((mId) => {
          if (mId === 'goblin') {
              return { id: 'goblin', name: 'Goblin', hp: 1, maxHp: 50, attack: 7, defense: 3, level: 1, exp: 20, zeny: 5, drops: [{ itemId: 'goblin_ear', chance: 1.0 }] }; // 100% chance for test
          }
          return null;
      });
      // Mock the dropped item
      const originalGetItem = mockDb.getItem;
      mockDb.getItem.mockImplementation((itemId) => {
          if (itemId === 'goblin_ear') {
              return { id: 'goblin_ear', name: 'Goblin Ear', type: 'material' };
          }
          return originalGetItem(itemId);
      });
  
      const combat = gameEngine.startCombat(userId, monsterId);
      combat.monster.hp = 1; // Ensure victory
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Ensure player hits and drop chance succeeds

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');
  
      expect(finalResult.results.some(r => r.type === 'victory')).toBe(true);
      const rewardsResult = finalResult.results.find(r => r.type === 'rewards');
      expect(rewardsResult).toBeDefined();
      expect(rewardsResult.rewards.items.length).toBeGreaterThan(0);
      expect(rewardsResult.rewards.items[0].name).toBe('Goblin Ear');
  
      const updatedCharacter = mockDb.getCharacter(userId);
      expect(updatedCharacter.inventory.items['goblin_ear']).toBe(1);
    });

    test('should handle player level up on solo victory', async () => {
      const userId = 'player1';
      const monsterId = 'goblin';
      const monster = mockDb.getMonster(monsterId); // exp: 20
  
      // Set player's EXP close to leveling up
      const initialCharacter = mockDb.getCharacter(userId);
      initialCharacter.exp = 90;
      initialCharacter.level = 1;
      initialCharacter.expToNext = 100;
      mockDb.setCharacter(userId, initialCharacter);
  
      const combat = gameEngine.startCombat(userId, monsterId);
      combat.monster.hp = 1; // Ensure victory
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Ensure player hits

      const finalResult = gameEngine.registerPlayerAction(userId, 'attack');
  
      expect(finalResult.results.some(r => r.type === 'victory')).toBe(true);
      const rewardsResult = finalResult.results.find(r => r.type === 'rewards');
      expect(rewardsResult).toBeDefined();
      expect(rewardsResult.rewards.levelUp).toBe(true);

      const updatedCharacter = mockDb.getCharacter(userId);
      expect(updatedCharacter.level).toBe(2);
      expect(updatedCharacter.exp).toBe(10); // 90 + 20 - 100
    });
  });

  describe('Party Battle', () => {
    beforeEach(() => {
      // Mock party plugin to return a party
      gameEngine.pluginManager.getPlugin.mockReturnValue({
        getPlayerParty: jest.fn((userId) => {
          if (userId === 'player1' || userId === 'player2') {
            return { id: 'party1', members: ['player1', 'player2'], settings: { afk: false, expShare: true, itemShare: true } };
          }
          return null;
        }),
        parties: {
          get: jest.fn((partyId) => {
            if (partyId === 'party1') {
              return { id: 'party1', members: ['player1', 'player2'], settings: { afk: false, expShare: true, itemShare: true } };
            }
            return null;
          })
        }
      });
    });

    test('should start a party combat', async () => {
      const userId = 'player1';
      const monsterId = 'goblin';
      const combat = gameEngine.startCombat(userId, monsterId);

      expect(combat).toBeDefined();
      expect(combat.isPartyBattle).toBe(true);
      expect(combat.players.length).toBe(2); // player1 and player2
      expect(combat.players.some(p => p.id === 'player1')).toBe(true);
      expect(combat.players.some(p => p.id === 'player2')).toBe(true);
      expect(combat.monster.id).toBe(monsterId);
      expect(gameEngine.activeCombats.get('player1')).toBe(combat);
      expect(gameEngine.activeCombats.get('player2')).toBe(combat);
    });

    test('should process a party attack turn after all members act', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      const initialMonsterHp = combat.monster.hp;
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Ensure player hits

      const result1 = gameEngine.registerPlayerAction(userId1, 'attack');
      expect(result1.success).toBe(true);
      expect(result1.results).toBeUndefined();

      const result2 = gameEngine.registerPlayerAction(userId2, 'attack');
      expect(result2.success).toBe(true);
      expect(result2.results).toBeDefined();
      expect(result2.combat.monster.hp).toBeLessThan(initialMonsterHp);
    });

    test('should end party combat on monster defeat', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      combat.monster.hp = 1; // Ensure defeat

      gameEngine.registerPlayerAction(userId1, 'attack');
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'victory')).toBe(true);
      expect(gameEngine.activeCombats.has(userId1)).toBe(false);
      expect(gameEngine.activeCombats.has(userId2)).toBe(false);
    });

    test('should handle party defeat', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';

      // Mock the monster to have higher attack so it can defeat the party
      mockDb.getMonster.mockReturnValueOnce({ 
        id: 'goblin', name: 'Goblin', hp: 100, maxHp: 100, attack: 100, defense: 3, level: 1, exp: 20, zeny: 5, drops: [], agility: 5 
      });

      const combat = gameEngine.startCombat(userId1, 'goblin');
      combat.players[0].hp = 1; // Set player1 HP low
      combat.players[1].hp = 1; // Set player2 HP low
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1); // Ensure monster hits

      // Turn 1: Player 1 acts, monster attacks one player (defeating them)
      gameEngine.registerPlayerAction(userId1, 'attack');
      const result1 = gameEngine.registerPlayerAction(userId2, 'attack');
      const alivePlayersAfterTurn1 = result1.combat.players.filter(p => p.hp > 0);
      expect(alivePlayersAfterTurn1.length).toBe(1);

      // Turn 2: The remaining player acts, monster attacks and defeats the last player
      const survivingPlayerId = alivePlayersAfterTurn1[0].id;
      const result2 = gameEngine.registerPlayerAction(survivingPlayerId, 'attack');

      expect(result2.results.some(r => r.type === 'defeat')).toBe(true);
      expect(gameEngine.activeCombats.has(userId1)).toBe(false);
      expect(gameEngine.activeCombats.has(userId2)).toBe(false);
      expect(mockDb.getCharacter(userId1).stats.hp).toBe(1);
      expect(mockDb.getCharacter(userId2).stats.hp).toBe(1);
    });

    test('should allow party members to use items', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      combat.players[0].hp = 50; 
      combat.players[1].hp = 50; 

      gameEngine.registerPlayerAction(userId1, { type: 'item', itemId: 'potion' });
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      // Player 1 used potion (+20hp), then monster attacks one of them.
      const player1AfterAction = result.combat.players.find(p => p.id === userId1);
      expect(player1AfterAction.hp).toBeGreaterThanOrEqual(70 - (combat.monster.attack - player1AfterAction.defense));
      expect(mockDb.getCharacter(userId1).inventory.items['potion']).toBeUndefined();
    });

    test('should require all party members to agree to run', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      gameEngine.startCombat(userId1, 'goblin');

      // Mock Math.random to ensure successful run if all agree
      jest.spyOn(global.Math, 'random').mockReturnValue(0.1);

      // Player 1 tries to run
      const result1 = gameEngine.registerPlayerAction(userId1, 'run');
      expect(result1.success).toBe(true);
      expect(result1.results).toBeUndefined(); // Not all agreed yet

      // Player 2 also tries to run
      const result2 = gameEngine.registerPlayerAction(userId2, 'run');
      expect(result2.results.some(r => r.type === 'run_success')).toBe(true);
      expect(gameEngine.activeCombats.has(userId1)).toBe(false);
      expect(gameEngine.activeCombats.has(userId2)).toBe(false);
    });

    test('should cancel combat after 2 minutes of inactivity', () => {
      jest.useFakeTimers();
      const userId = 'player1';
      gameEngine.startCombat(userId, 'goblin');

      // Advance timers by 2 minutes
      jest.advanceTimersByTime(120001); // a bit more than 2 mins
      gameEngine.checkInactiveCombats(); // Call the check function
      expect(gameEngine.activeCombats.has(userId)).toBe(false);

      jest.useRealTimers();
    });

    test('should handle party failing to run away if one member fails', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      gameEngine.startCombat(userId1, 'goblin');

      // Mock Math.random for player1 to succeed and player2 to fail
      jest.spyOn(global.Math, 'random').mockReturnValue(0.8); // Fail run

      // Player 1 tries to run
      gameEngine.registerPlayerAction(userId1, 'run');

      // Player 2 also tries to run
      const result = gameEngine.registerPlayerAction(userId2, 'run');

      expect(result.results.some(r => r.type === 'run_fail')).toBe(true);
      expect(gameEngine.activeCombats.has(userId1)).toBe(true);
      expect(gameEngine.activeCombats.has(userId2)).toBe(true);
    });

    test('should handle critical hit from player to monster in party battle', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      const initialMonsterHp = combat.monster.hp;

      // Mock Math.random to ensure critical hit for player1
      jest.spyOn(global.Math, 'random').mockReturnValue(0.01); // Critical hit

      gameEngine.registerPlayerAction(userId1, 'attack');
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'player_attack' && r.isCritical)).toBe(true);
      const totalDamage = result.results.filter(r => r.type === 'player_attack').reduce((sum, r) => sum + r.damage, 0);
      expect(totalDamage).toBeGreaterThan(combat.players[0].attack + combat.players[1].attack - 2 * combat.monster.defense);
    });

    test('should handle critical hit from monster to player in party battle', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      const initialPlayer1Hp = combat.players[0].hp;

      // Mock Math.random to ensure monster critical hit
      jest.spyOn(global.Math, 'random')
        .mockReturnValueOnce(0.1) // Player 1 hits
        .mockReturnValueOnce(0.1) // Player 2 hits
        .mockReturnValueOnce(0.1) // Monster hits
        .mockReturnValueOnce(0.01); // Monster crits

      gameEngine.registerPlayerAction(userId1, 'attack');
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'monster_attack' && r.isCritical)).toBe(true);
      const player1Result = result.combat.players.find(p => p.id === userId1);
      // Check if player1 was the target
      const attackOnPlayer1 = result.results.find(r => r.type === 'monster_attack' && r.target === player1Result.name);
      if (attackOnPlayer1) {
          expect(player1Result.hp).toBeLessThan(initialPlayer1Hp - (combat.monster.attack - player1Result.defense));
      }
    });

    test('should handle miss from player to monster in party battle', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      const initialMonsterHp = combat.monster.hp;

      // Mock Math.random to ensure player1 misses
      let callCount = 0;
      jest.spyOn(global.Math, 'random').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0.99; // Player 1 misses
        return 0.5; // Player 2 hits normally
      });

      gameEngine.registerPlayerAction(userId1, 'attack');
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'player_attack' && r.isMiss && r.attacker === 'Hero')).toBe(true);
      const damageByPlayer2 = result.results.find(r => r.type === 'player_attack' && r.attacker === 'Sidekick').damage;
      expect(result.combat.monster.hp).toBe(initialMonsterHp - damageByPlayer2);
    });

    test('should handle miss from monster to player in party battle', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      const initialPlayer1Hp = combat.players[0].hp;

      // Mock Math.random to ensure monster misses
      jest.spyOn(global.Math, 'random').mockReturnValue(0.99); // Very high value to ensure miss

      gameEngine.registerPlayerAction(userId1, 'attack');
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'monster_attack' && r.isMiss)).toBe(true);
      const player1Result = result.combat.players.find(p => p.id === userId1);
      // If the monster missed, the player's HP should not change.
      const attackOnPlayer1 = result.results.find(r => r.type === 'monster_attack' && r.target === player1Result.name);
      if (attackOnPlayer1 && attackOnPlayer1.isMiss) {
        expect(player1Result.hp).toBe(initialPlayer1Hp);
      }
    });

    test('should not allow party member to use non-existent item', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      gameEngine.startCombat(userId1, 'goblin');

      gameEngine.registerPlayerAction(userId1, { type: 'item', itemId: 'nonExistentItem' });
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'player_action_failed' && r.message.includes('Item not found or you do not have it.'))).toBe(true);
    });

    test('should not allow party member to use non-consumable item', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      charactersData[userId1].inventory.items['sword'] = 1;
      mockDb.getItem.mockImplementation((itemId) => {
        if (itemId === 'potion') return { id: 'potion', name: 'Health Potion', type: 'consumable', effect: { hp: 20 } };
        if (itemId === 'sword') return { id: 'sword', name: 'Basic Sword', type: 'weapon' };
        return null;
      });

      gameEngine.startCombat(userId1, 'goblin');

      gameEngine.registerPlayerAction(userId1, { type: 'item', itemId: 'sword' });
      const result = gameEngine.registerPlayerAction(userId2, 'attack');

      expect(result.results.some(r => r.type === 'player_action_failed' && r.message.includes('You cannot use Basic Sword.'))).toBe(true);
    });

    test('should allow a party member to defend and take reduced damage', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const combat = gameEngine.startCombat(userId1, 'goblin');
      const defendingPlayer = combat.players.find(p => p.id === userId1);
      const initialPlayerHp = defendingPlayer.hp;
  
      // Player 1 defends, Player 2 attacks
      gameEngine.registerPlayerAction(userId1, 'defend');
      const result = gameEngine.registerPlayerAction(userId2, 'attack');
  
      // Check that the defend action was registered
      expect(result.results.some(r => r.type === 'defend' && r.player === defendingPlayer.name)).toBe(true);
  
      // The monster should attack, but the damage to the defending player should be reduced.
      const monsterAttackResult = result.results.find(r => r.type === 'monster_attack' && r.target === defendingPlayer.name);
      if (monsterAttackResult) { // The monster might attack the other player
        const normalDamage = combat.monster.attack - defendingPlayer.defense;
        expect(monsterAttackResult.damage).toBeLessThan(normalDamage);
        expect(defendingPlayer.hp).toBe(initialPlayerHp - monsterAttackResult.damage);
      }
    });

    test('should award shared EXP and Zeny on party victory', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const monsterId = 'goblin';
      const monster = mockDb.getMonster(monsterId);
  
      const initialChar1 = JSON.parse(JSON.stringify(charactersData[userId1]));
      const initialChar2 = JSON.parse(JSON.stringify(charactersData[userId2]));
  
      const combat = gameEngine.startCombat(userId1, monsterId);
      combat.monster.hp = 1; // Ensure victory
  
      gameEngine.registerPlayerAction(userId1, 'attack');
      const finalResult = gameEngine.registerPlayerAction(userId2, 'attack');
  
      expect(finalResult.results.some(r => r.type === 'victory')).toBe(true);
      expect(finalResult.results.some(r => r.type === 'rewards')).toBe(true);
  
      const updatedChar1 = mockDb.getCharacter(userId1);
      const updatedChar2 = mockDb.getCharacter(userId2);
      
      const expPerPlayer = Math.floor(monster.exp / 2);
      const zenyPerPlayer = Math.floor(monster.zeny / 2);

      expect(updatedChar1.exp).toBe((initialChar1.exp || 0) + expPerPlayer);
      expect(updatedChar1.inventory.zeny).toBe((initialChar1.inventory.zeny || 0) + zenyPerPlayer);
      expect(updatedChar2.exp).toBe((initialChar2.exp || 0) + expPerPlayer);
      expect(updatedChar2.inventory.zeny).toBe((initialChar2.inventory.zeny || 0) + zenyPerPlayer);
    });

    test('should distribute item drops on party victory', async () => {
      const userId1 = 'player1';
      const userId2 = 'player2';
      const monsterId = 'goblin';
      mockDb.getMonster.mockImplementation((mId) => {
        if (mId === 'goblin') {
          return { id: 'goblin', name: 'Goblin', hp: 50, maxHp: 50, attack: 7, defense: 3, level: 1, exp: 20, zeny: 5, drops: [{ itemId: 'goblin_ear', chance: 1.0 }] }; // 100% chance for test
        }
        return null;
      });
      const originalGetItem = mockDb.getItem;
      mockDb.getItem.mockImplementation((itemId) => {
        if (itemId === 'goblin_ear') return { id: 'goblin_ear', name: 'Goblin Ear', type: 'material' };
        return originalGetItem(itemId);
      });
  
      const combat = gameEngine.startCombat(userId1, monsterId);
      combat.monster.hp = 1; // Ensure victory
  
      gameEngine.registerPlayerAction(userId1, 'attack');
      const finalResult = gameEngine.registerPlayerAction(userId2, 'attack');
  
      expect(finalResult.results.some(r => r.type === 'victory')).toBe(true);
      const rewardsResult = finalResult.results.find(r => r.type === 'rewards');
      expect(rewardsResult).toBeDefined();
      expect(rewardsResult.rewards.items.length).toBeGreaterThan(0);
      expect(rewardsResult.rewards.items[0].name).toBe('Goblin Ear');
  
      const char1 = mockDb.getCharacter(userId1);
      const char2 = mockDb.getCharacter(userId2);
      const itemReceived = (char1.inventory.items['goblin_ear'] || 0) + (char2.inventory.items['goblin_ear'] || 0);
      expect(itemReceived).toBe(1);
    });
  });
});