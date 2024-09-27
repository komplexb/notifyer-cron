const { getNote } = require('../lib/onenote');
const superagent = require('superagent');

jest.mock('superagent');

describe('OneNote module', () => {
  describe('getNote', () => {
    it('should fetch a note successfully', async () => {
      const mockResponse = {
        body: {
          id: 'noteId',
          title: 'Test Note',
          createdDateTime: '2023-01-01T00:00:00Z',
          lastModifiedDateTime: '2023-01-02T00:00:00Z',
          contentUrl: 'https://example.com/note-content'
        }
      };
      superagent.get.mockResolvedValue(mockResponse);

      const result = await getNote('testNoteId');
      expect(result).toEqual({
        id: 'noteId',
        title: 'Test Note',
        created: '2023-01-01T00:00:00Z',
        modified: '2023-01-02T00:00:00Z',
        contentUrl: 'https://example.com/note-content'
      });
      expect(superagent.get).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me/onenote/pages/testNoteId');
    });

    it('should handle errors when fetching a note', async () => {
      superagent.get.mockRejectedValue(new Error('API error'));

      await expect(getNote('testNoteId')).rejects.toThrow('API error');
    });
  });
});