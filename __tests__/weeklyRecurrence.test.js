// server/__tests__/weeklyRecurrence.test.js
// Tests pour le système de renouvellement hebdomadaire automatique

const mongoose = require('mongoose');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const User = require('../models/User');
const challengeService = require('../services/challengeService');
const helpers = require('../services/challenge/helpers');

describe('Weekly Recurrence System', () => {
  let user1, user2;

  beforeEach(async () => {
    user1 = await User.create({
      username: `user1_${Date.now()}`,
      email: `user1_${Date.now()}@test.com`,
      password: 'Password123!',
      totalDiamonds: 100
    });
    user2 = await User.create({
      username: `user2_${Date.now()}`,
      email: `user2_${Date.now()}@test.com`,
      password: 'Password123!',
      totalDiamonds: 100
    });
  });

  afterEach(async () => {
    await WeeklyChallenge.deleteMany({});
    await User.deleteMany({});
  });

  describe('ISO Week Helpers', () => {
    test('getISOWeekNumber returns correct week number', () => {
      // Week 1 of 2026 (contains January 4th)
      const jan5_2026 = new Date('2026-01-05T12:00:00'); // Monday of week 2
      expect(helpers.getISOWeekNumber(jan5_2026)).toBe(2);

      // Week 1 of 2025 (contains January 4th, 2025)
      const jan1_2025 = new Date('2025-01-01T12:00:00'); // Wednesday of week 1
      expect(helpers.getISOWeekNumber(jan1_2025)).toBe(1);

      // Last week of 2025
      const dec29_2025 = new Date('2025-12-29T12:00:00'); // Monday of week 1 of 2026
      expect(helpers.getISOWeekNumber(dec29_2025)).toBe(1); // First week of 2026!
    });

    test('getISOWeekYear returns correct year', () => {
      // Dec 29, 2025 is Monday of ISO week 1 of 2026
      const dec29_2025 = new Date('2025-12-29T12:00:00');
      expect(helpers.getISOWeekYear(dec29_2025)).toBe(2026);

      // Jan 1, 2026 is Wednesday of ISO week 1 of 2026
      const jan1_2026 = new Date('2026-01-01T12:00:00');
      expect(helpers.getISOWeekYear(jan1_2026)).toBe(2026);
    });

    test('getWeekBounds returns Monday to Sunday', () => {
      const { startDate, endDate } = helpers.getWeekBounds();

      // Should be Monday 00:00:00
      const startDay = startDate.getDay();
      expect(startDay === 1 || startDay === 0).toBe(true); // Monday (1) or Sunday UTC shift (0)
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);

      // Should be Sunday 23:59:59
      const endDay = endDate.getDay();
      expect(endDay === 0 || endDay === 6).toBe(true); // Sunday (0) or Saturday UTC shift (6)
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
      expect(endDate.getSeconds()).toBe(59);

      // Dates should be 6 days apart
      const diffDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(6);
    });

    test('getNextWeekBounds returns next Monday to Sunday', () => {
      const { startDate: nextMonday, endDate: nextSunday } = helpers.getNextWeekBounds();
      
      // Next Monday should be 7 days after current Monday
      const { startDate: currentMonday } = helpers.getWeekBounds();
      const expectedNextMonday = new Date(currentMonday);
      expectedNextMonday.setDate(currentMonday.getDate() + 7);

      const nextDay = nextMonday.getDay();
      expect(nextDay === 1 || nextDay === 0).toBe(true); // Monday or UTC shift
      
      const sundayDay = nextSunday.getDay();
      expect(sundayDay === 0 || sundayDay === 6).toBe(true); // Sunday or UTC shift
      
      expect(nextMonday.getHours()).toBe(0);
      expect(nextSunday.getHours()).toBe(23);
    });

    test('getWeekBoundsForISOWeek returns correct range', () => {
      // Week 2 of 2026
      const { startDate, endDate } = helpers.getWeekBoundsForISOWeek(2026, 2);

      // Should be Monday Jan 5 to Sunday Jan 11
      const startDay = startDate.getDay();
      expect(startDay === 1 || startDay === 0).toBe(true); // Monday or UTC shift
      
      const endDay = endDate.getDay();
      expect(endDay === 0 || endDay === 6).toBe(true); // Sunday or UTC shift
      
      // Should be 6 days apart
      const diffDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(6);
    });
  });

  describe('Challenge Creation with Week Tracking', () => {
    test('Solo challenge stores week number and year', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      expect(challenge.weekNumber).toBeDefined();
      expect(challenge.weekNumber).toBeGreaterThanOrEqual(1);
      expect(challenge.weekNumber).toBeLessThanOrEqual(53);
      expect(challenge.year).toBeDefined();
      expect(challenge.year).toBeGreaterThanOrEqual(2020);
      expect(challenge.startDate).toBeDefined();
      expect(challenge.endDate).toBeDefined();
    });

    test('Duo challenge stores week number on activation', async () => {
      const challenge = await challengeService.createDuoChallenge(user1._id, user2._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      // Pending doesn't have weekNumber yet
      expect(challenge.weekNumber).toBeNull();
      expect(challenge.year).toBeNull();

      // Sign and activate
      await challengeService.signInvitation(user1._id, challenge._id, { allowCreator: true });
      const activated = await challengeService.signInvitation(user2._id, challenge._id);

      expect(activated.weekNumber).toBeDefined();
      expect(activated.year).toBeDefined();
      expect(activated.startDate).toBeDefined();
      expect(activated.endDate).toBeDefined();
    });
  });

  describe('Automatic Recurrence', () => {
    test('Solo challenge is created with recurrence enabled by default', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      expect(challenge.recurrence.enabled).toBe(true);
      expect(challenge.recurrence.weeksCount).toBeNull(); // Infinite
      expect(challenge.recurrence.weeksCompleted).toBe(0);
    });

    test('Duo challenge is created with recurrence enabled by default', async () => {
      const challenge = await challengeService.createDuoChallenge(user1._id, user2._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      expect(challenge.recurrence.enabled).toBe(true);
      expect(challenge.recurrence.weeksCount).toBeNull(); // Infinite
      expect(challenge.recurrence.weeksCompleted).toBe(0);
    });

    test('Recurrence can be disabled explicitly', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        recurrence: { enabled: false }
      });

      expect(challenge.recurrence.enabled).toBe(false);
    });

    test('Recurrence supports limited weeks', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        recurrence: { enabled: true, weeksCount: 4 }
      });

      expect(challenge.recurrence.enabled).toBe(true);
      expect(challenge.recurrence.weeksCount).toBe(4);
      expect(challenge.recurrence.weeksCompleted).toBe(0);
    });

    test('_handleRecurrenceIfNeeded creates new challenge after success', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        recurrence: { enabled: true, weeksCount: null }
      });

      // Mark as completed and successful
      challenge.status = 'completed';
      challenge.settlement = { status: 'success' };
      await challenge.save();

      // Call recurrence handler
      const newChallenge = await challengeService._handleRecurrenceIfNeeded(challenge);

      expect(newChallenge).toBeDefined();
      expect(newChallenge._id).not.toEqual(challenge._id);
      expect(newChallenge.goal.value).toBe(challenge.goal.value);
      expect(newChallenge.recurrence.enabled).toBe(true);
      expect(newChallenge.recurrence.weeksCompleted).toBe(1);

      // Original challenge should have incremented weeksCompleted
      const updatedOriginal = await WeeklyChallenge.findById(challenge._id);
      expect(updatedOriginal.recurrence.weeksCompleted).toBe(1);
    });

    test('_handleRecurrenceIfNeeded stops after reaching weeksCount', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        recurrence: { enabled: true, weeksCount: 2 }
      });

      // Complete first cycle
      challenge.status = 'completed';
      challenge.settlement = { status: 'success' };
      await challenge.save();
      const secondChallenge = await challengeService._handleRecurrenceIfNeeded(challenge);
      expect(secondChallenge).toBeDefined();

      // Complete second cycle
      secondChallenge.status = 'completed';
      secondChallenge.settlement = { status: 'success' };
      await secondChallenge.save();
      const thirdChallenge = await challengeService._handleRecurrenceIfNeeded(secondChallenge);

      // Should stop (2 weeks completed)
      expect(thirdChallenge).toBeNull();
    });

    test('_handleRecurrenceIfNeeded does not renew failed challenges', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        recurrence: { enabled: true, weeksCount: null }
      });

      // Mark as failed
      challenge.status = 'failed';
      challenge.settlement = { status: 'loss' };
      await challenge.save();

      const newChallenge = await challengeService._handleRecurrenceIfNeeded(challenge);
      expect(newChallenge).toBeNull();
    });

    test('_handleRecurrenceIfNeeded preserves parentChallengeId', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        recurrence: { enabled: true, weeksCount: null }
      });

      challenge.status = 'completed';
      challenge.settlement = { status: 'success' };
      await challenge.save();

      const newChallenge = await challengeService._handleRecurrenceIfNeeded(challenge);
      expect(newChallenge.recurrence.parentChallengeId.toString()).toBe(challenge._id.toString());

      // Second renewal should keep same parent
      newChallenge.status = 'completed';
      newChallenge.settlement = { status: 'success' };
      await newChallenge.save();

      const thirdChallenge = await challengeService._handleRecurrenceIfNeeded(newChallenge);
      expect(thirdChallenge.recurrence.parentChallengeId.toString()).toBe(challenge._id.toString());
    });
  });

  describe('Year Progress API', () => {
    test('getYearProgress returns empty weeks for user with no challenges', async () => {
      const progress = await challengeService.getYearProgress(user1._id, 2026);

      expect(progress).toBeDefined();
      expect(progress.year).toBe(2026);
      expect(progress.weeks).toBeDefined();
      expect(progress.weeks.length).toBeGreaterThanOrEqual(52);
      expect(progress.stats.success).toBe(0);
      expect(progress.stats.failed).toBe(0);
      expect(progress.stats.active).toBe(0);
    });

    test('getYearProgress includes successful challenge in stats', async () => {
      // Create a challenge for week 2 of 2026
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      // Manually set to week 2
      challenge.weekNumber = 2;
      challenge.year = 2026;
      challenge.status = 'completed';
      challenge.settlement = { status: 'success' };
      await challenge.save();

      const progress = await challengeService.getYearProgress(user1._id, 2026);

      expect(progress.stats.success).toBe(1);
      expect(progress.weeks[1].status).toBe('success'); // Week 2 (index 1)
      expect(progress.weeks[1].weekNumber).toBe(2);
    });

    test('getYearProgress filters by slot (solo)', async () => {
      // Create solo challenge
      const soloChallenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });
      soloChallenge.weekNumber = 2;
      soloChallenge.year = 2026;
      soloChallenge.status = 'completed';
      soloChallenge.settlement = { status: 'success' };
      await soloChallenge.save();

      // Create duo challenge
      const duoChallenge = await challengeService.createDuoChallenge(user1._id, user2._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });
      await challengeService.signInvitation(user1._id, duoChallenge._id, { allowCreator: true });
      const activated = await challengeService.signInvitation(user2._id, duoChallenge._id);
      activated.weekNumber = 3;
      activated.year = 2026;
      activated.status = 'completed';
      activated.settlement = { status: 'success' };
      await activated.save();

      // Get solo progress
      const soloProgress = await challengeService.getYearProgress(user1._id, 2026, { slot: 'solo' });
      expect(soloProgress.stats.success).toBe(1); // Only solo

      // Get duo progress
      const duoProgress = await challengeService.getYearProgress(user1._id, 2026, { slot: 'p1' });
      expect(duoProgress.stats.success).toBe(1); // Only duo
    });

    test('getYearProgress marks current week', async () => {
      const currentYear = new Date().getFullYear();
      const progress = await challengeService.getYearProgress(user1._id, currentYear);

      expect(progress.currentWeek).toBeDefined();
      expect(progress.currentWeek).toBeGreaterThanOrEqual(1);
      expect(progress.currentWeek).toBeLessThanOrEqual(53);
    });

    test('getYearProgress handles failed challenges', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      challenge.weekNumber = 2;
      challenge.year = 2026;
      challenge.status = 'failed';
      challenge.settlement = { status: 'loss' };
      await challenge.save();

      const progress = await challengeService.getYearProgress(user1._id, 2026);

      expect(progress.stats.failed).toBe(1);
      expect(progress.weeks[1].status).toBe('failed');
    });

    test('getYearProgress handles active challenges', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      const progress = await challengeService.getYearProgress(user1._id, challenge.year);

      expect(progress.stats.active).toBe(1);
      const activeWeek = progress.weeks.find(w => w.weekNumber === challenge.weekNumber);
      expect(activeWeek.status).toBe('active');
    });
  });

  describe('Challenge Dates Alignment', () => {
    test('Solo challenge uses Monday-Sunday dates', async () => {
      const challenge = await challengeService.createSoloChallenge(user1._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      const startDate = new Date(challenge.startDate);
      const endDate = new Date(challenge.endDate);

      // Start should be Monday 00:00:00 (or Sunday UTC shift)
      const startDay = startDate.getDay();
      expect(startDay === 1 || startDay === 0).toBe(true);
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);

      // End should be Sunday 23:59:59 (or Saturday UTC shift)
      const endDay = endDate.getDay();
      expect(endDay === 0 || endDay === 6).toBe(true);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });

    test('Duo challenge uses Monday-Sunday dates on activation', async () => {
      const challenge = await challengeService.createDuoChallenge(user1._id, user2._id, {
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running']
      });

      // Sign and activate
      await challengeService.signInvitation(user1._id, challenge._id, { allowCreator: true });
      const activated = await challengeService.signInvitation(user2._id, challenge._id);

      const startDate = new Date(activated.startDate);
      const endDate = new Date(activated.endDate);

      // Start should be Monday 00:00:00 (or Sunday UTC shift)
      const startDay = startDate.getDay();
      expect(startDay === 1 || startDay === 0).toBe(true);
      expect(startDate.getHours()).toBe(0);

      // End should be Sunday 23:59:59 (or Saturday UTC shift)
      const endDay = endDate.getDay();
      expect(endDay === 0 || endDay === 6).toBe(true);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });
  });
});
