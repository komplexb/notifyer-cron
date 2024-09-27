const { initCache } = require('../handler');

// Mock dependencies
jest.mock('../lib/store');
jest.mock('../db/persist');
jest.mock('fs');

describe('Handler module', () => {
  describe('initCache', () => {
    it('should initialize cache and localStorage', async () => {
      const fs = require('fs').promises;
      const db = require('../db/persist');
      const localStorage = require('../lib/store');

      // Mock implementations
      db.getItem.mockImplementation((key, json = false) => {
        if (key === 'cache') return 'mocked cache data';
        if (key === 'onenote') return json ? { someData: 'value' } : '{"someData": "value"}';
        if (key.endsWith('_section_count')) return '5';
        if (key.endsWith('_last_page')) return 'lastPage';
        if (key.startsWith('recent_')) return json ? ['page1', 'page2'] : '["page1", "page2"]';
      });

      fs.writeFile.mockResolvedValue();
      localStorage.setItem.mockImplementation(() => {});

      await initCache('testSection');

      expect(fs.writeFile).toHaveBeenCalledWith(process.env.CACHE_PATH, 'mocked cache data');
      expect(localStorage.setItem).toHaveBeenCalledWith('onenote', { someData: 'value' });
      expect(localStorage.setItem).toHaveBeenCalledWith('testSection_section_count', '5');
      expect(localStorage.setItem).toHaveBeenCalledWith('testSection_last_page', 'lastPage');
      expect(localStorage.setItem).toHaveBeenCalledWith('recent_testSection', ['page1', 'page2']);
    });
  });
});