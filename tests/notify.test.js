const notify = require('../lib/notify');
const { htmlToMarkdown } = require('../lib/markdown');

jest.mock('../lib/markdown');
jest.mock('superagent');

describe('Notify module', () => {
  describe('formatNoteBody', () => {
    it('should format note body correctly', async () => {
      const mockResponse = {
        text: '<html><body><h1>Test Note</h1><p>This is a test note</p></body></html>'
      };
      const superagent = require('superagent');
      superagent.get.mockResolvedValue(mockResponse);
      
      htmlToMarkdown.mockReturnValue('# Test Note\n\nThis is a test note');

      const result = await notify.formatNoteBody('https://example.com/note');
      expect(result).toBe('# Test Note\n\nThis is a test note');
      expect(superagent.get).toHaveBeenCalledWith('https://example.com/note');
      expect(htmlToMarkdown).toHaveBeenCalledWith('<html><body><h1>Test Note</h1><p>This is a test note</p></body></html>');
    });
  });

  describe('structureMessage', () => {
    it('should structure message correctly', async () => {
      const args = {
        title: 'Test Title',
        body: 'Test Body',
        url: 'https://example.com/note'
      };
      
      const result = await notify.structureMessage(args);
      expect(result).toEqual({
        title: 'Test Title',
        body: 'Test Body',
        url: 'https://example.com/note'
      });
    });
  });

  describe('push', () => {
    it('should push notification correctly', async () => {
      const note = {
        title: 'Test Title',
        body: 'Test Body',
        url: 'https://example.com/note'
      };
      
      notify.withTelegram = jest.fn().mockResolvedValue('Notification sent');

      const result = await notify.push(note);
      expect(result).toBe('Notification sent');
      expect(notify.withTelegram).toHaveBeenCalledWith(note, { icon: '🔒' }, false);
    });
  });
});