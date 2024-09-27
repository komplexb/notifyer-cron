const localStorage = require('../lib/store');

describe('Store module', () => {
  beforeEach(() => {
    localStorage.initStore();
  });

  afterEach(() => {
    localStorage.clearStore();
  });

  describe('setItem', () => {
    it('should set an item in the store', () => {
      localStorage.setItem('testKey', 'testValue');
      expect(localStorage.getItem('testKey')).toBe('testValue');
    });

    it('should stringify objects when setting items', () => {
      const testObject = { foo: 'bar' };
      localStorage.setItem('testObject', testObject);
      expect(localStorage.getItem('testObject')).toEqual(JSON.stringify(testObject));
    });
  });

  describe('getItem', () => {
    it('should return null for non-existent keys', () => {
      expect(localStorage.getItem('nonExistentKey')).toBeNull();
    });

    it('should return the correct value for existing keys', () => {
      localStorage.setItem('existingKey', 'existingValue');
      expect(localStorage.getItem('existingKey')).toBe('existingValue');
    });
  });

  describe('removeItem', () => {
    it('should remove an item from the store', () => {
      localStorage.setItem('keyToRemove', 'valueToRemove');
      localStorage.removeItem('keyToRemove');
      expect(localStorage.getItem('keyToRemove')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all items from the store', () => {
      localStorage.setItem('key1', 'value1');
      localStorage.setItem('key2', 'value2');
      localStorage.clear();
      expect(localStorage.getItem('key1')).toBeNull();
      expect(localStorage.getItem('key2')).toBeNull();
    });
  });
});