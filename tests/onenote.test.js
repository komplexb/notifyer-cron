const Chance = require('chance');

// Import the getDayOfYear function from the actual module
const { getDayOfYear } = require('../lib/onenote');

describe('getDayOfYear function', () => {
  // Test regular year
  test('calculates correct day of year for a non-leap year', () => {
    const testDate = new Date(2023, 0, 15); // January 15, 2023
    expect(getDayOfYear(testDate)).toBe(15);
  });

  // Test leap year
  test('calculates correct day of year for a leap year', () => {
    const testDate = new Date(2024, 1, 29); // February 29, 2024 (leap year)
    expect(getDayOfYear(testDate)).toBe(60);
  });

  // Test edge cases
  test('first day of the year returns 1', () => {
    const testDate = new Date(2023, 0, 1);
    expect(getDayOfYear(testDate)).toBe(1);
  });

  test('last day of a non-leap year returns 365', () => {
    const testDate = new Date(2023, 11, 31);
    expect(getDayOfYear(testDate)).toBe(365);
  });

  test('last day of a leap year returns 366', () => {
    const testDate = new Date(2024, 11, 31);
    expect(getDayOfYear(testDate)).toBe(366);
  });
});

describe('Seeded Chance Randomness', () => {
  test('same seed produces same random results', () => {
    const seed = getDayOfYear(new Date('2023-01-15'));
    const chance1 = new Chance(seed);
    const chance2 = new Chance(seed);

    // Test multiple random generations
    for (let i = 0; i < 10; i++) {
      expect(chance1.natural()).toBe(chance2.natural());
      expect(chance1.pickone([1, 2, 3])).toBe(chance2.pickone([1, 2, 3]));
    }
  });

  test('different dates produce different seeds', () => {
    const chance1 = new Chance(getDayOfYear(new Date('2023-01-15')));
    const chance2 = new Chance(getDayOfYear(new Date('2023-02-15')));

    // While not guaranteed, the probability of these being exactly the same 
    // for multiple generations is extremely low
    const results1 = new Set();
    const results2 = new Set();

    for (let i = 0; i < 100; i++) {
      results1.add(chance1.natural());
      results2.add(chance2.natural());
    }

    expect(results1.size).toBeGreaterThan(1);
    expect(results2.size).toBeGreaterThan(1);
    
    // Ensure they're different sets
    expect(Array.from(results1)).not.toEqual(Array.from(results2));
  });
});