import { DisplayManager } from '@/lib/display-manager';
import { queueDb } from '@/lib/sqlite';

describe('DisplayManager', () => {
  const testDisplayId = 'TEST123';

  beforeEach(() => {
    // Clean up test data before each test
    try {
      queueDb.prepare('DELETE FROM displays WHERE id = ?').run(testDisplayId);
    } catch (e) {
      // Ignore errors if display doesn't exist
    }
  });

  afterEach(() => {
    // Clean up after each test
    try {
      queueDb.prepare('DELETE FROM displays WHERE id = ?').run(testDisplayId);
    } catch (e) {
      // Ignore errors if display doesn't exist
    }
  });

  describe('createDisplay', () => {
    it('should create a new display with auto-generated code', () => {
      const display = DisplayManager.createDisplay('Test Display');
      
      expect(display).toBeDefined();
      expect(display.id.length).toBe(6);
      expect(display.name).toBe('Test Display');
      
      // Verify it's in the database
      const retrievedDisplay = DisplayManager.getDisplay(display.id);
      expect(retrievedDisplay).toBeDefined();
      expect(retrievedDisplay?.name).toBe('Test Display');
    });

    it('should create a display with specified code', () => {
      const display = DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      expect(display.id).toBe(testDisplayId);
      
      const retrievedDisplay = DisplayManager.getDisplay(testDisplayId);
      expect(retrievedDisplay).toBeDefined();
      expect(retrievedDisplay?.name).toBe('Test Display');
    });
  });

  describe('getDisplay', () => {
    it('should return display by ID', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      const display = DisplayManager.getDisplay(testDisplayId);
      expect(display).toBeDefined();
      expect(display?.id).toBe(testDisplayId);
      expect(display?.name).toBe('Test Display');
    });

    it('should return null for non-existent display', () => {
      const display = DisplayManager.getDisplay('NONEXIST');
      expect(display).toBeNull();
    });
  });

  describe('getAllDisplays', () => {
    it('should return all displays', () => {
      DisplayManager.createDisplayWithCode('Display 1', 'TEST1');
      DisplayManager.createDisplayWithCode('Display 2', 'TEST2');
      
      const displays = DisplayManager.getAllDisplays();
      expect(displays.length).toBeGreaterThanOrEqual(2);
      
      // Clean up
      queueDb.prepare('DELETE FROM displays WHERE id IN (?, ?)').run('TEST1', 'TEST2');
    });
  });

  describe('updateDisplayStatus', () => {
    it('should update display status', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      DisplayManager.updateDisplayStatus(testDisplayId, {
        current_video_id: 'video123',
        current_position: 10
      });
      
      const display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.current_video_id).toBe('video123');
      expect(display?.current_position).toBe(10);
    });
  });

  describe('playDisplay', () => {
    it('should set display to playing state', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      DisplayManager.playDisplay(testDisplayId);
      
      const display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.playback_state).toBe('playing');
      expect(display?.is_playing).toBe(true);
    });
  });

  describe('pauseDisplay', () => {
    it('should set display to paused state', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      DisplayManager.playDisplay(testDisplayId);
      
      DisplayManager.pauseDisplay(testDisplayId);
      
      const display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.playback_state).toBe('paused');
      expect(display?.is_playing).toBe(false);
    });
  });

  describe('stopDisplay', () => {
    it('should reset display to idle state', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      DisplayManager.playDisplay(testDisplayId);
      DisplayManager.updateDisplayStatus(testDisplayId, {
        current_video_id: 'video123',
        timeline_position: 5
      });
      
      DisplayManager.stopDisplay(testDisplayId);
      
      const display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.playback_state).toBe('idle');
      expect(display?.is_playing).toBe(false);
      expect(display?.current_video_id).toBeNull();
      expect(display?.timeline_position).toBe(0);
      expect(display?.current_position).toBe(0);
    });
  });

  describe('muteDisplay / unmuteDisplay', () => {
    it('should mute and unmute display', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      DisplayManager.muteDisplay(testDisplayId);
      let display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.is_muted).toBe(true);
      
      DisplayManager.unmuteDisplay(testDisplayId);
      display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.is_muted).toBe(false);
    });
  });

  describe('seekDisplay', () => {
    it('should update video position', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      DisplayManager.seekDisplay(testDisplayId, 50);
      
      const display = DisplayManager.getDisplay(testDisplayId);
      expect(display?.video_position).toBe(50);
    });
  });

  describe('isDisplayOnline', () => {
    it('should return false for no ping', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      const isOnline = DisplayManager.isDisplayOnline(DisplayManager.getDisplay(testDisplayId)!);
      expect(isOnline).toBe(false); // No ping yet, should be offline
    });

    it('should return true for recent ping', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      // Set recent ping
      const recentTime = new Date(Date.now() - 1000).toISOString();
      queueDb.prepare('UPDATE displays SET last_ping = ? WHERE id = ?').run(recentTime, testDisplayId);
      
      const isOnline = DisplayManager.isDisplayOnline(DisplayManager.getDisplay(testDisplayId)!);
      expect(isOnline).toBe(true);
    });

    it('should return false for old ping', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      // Set last_ping to 15 seconds ago (should be offline)
      const oldTime = new Date(Date.now() - 15000).toISOString();
      queueDb.prepare('UPDATE displays SET last_ping = ? WHERE id = ?').run(oldTime, testDisplayId);
      
      const isOnline = DisplayManager.isDisplayOnline(DisplayManager.getDisplay(testDisplayId)!);
      expect(isOnline).toBe(false);
    });
  });

  describe('addCommand / getAndClearCommands', () => {
    it('should add and retrieve commands', () => {
      DisplayManager.createDisplayWithCode('Test Display', testDisplayId);
      
      DisplayManager.addCommand(testDisplayId, { type: 'next', timestamp: Date.now() });
      DisplayManager.addCommand(testDisplayId, { type: 'previous', timestamp: Date.now() });
      
      const commands = DisplayManager.getAndClearCommands(testDisplayId);
      expect(commands.length).toBe(2);
      expect(commands[0].type).toBe('next');
      expect(commands[1].type).toBe('previous');
      
      // Commands should be cleared after retrieval
      const clearedCommands = DisplayManager.getAndClearCommands(testDisplayId);
      expect(clearedCommands.length).toBe(0);
    });
  });
});
