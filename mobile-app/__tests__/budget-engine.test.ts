import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('expo-font', () => ({
  useFonts: () => [true],
  loadAsync: vi.fn(),
}));
vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));
vi.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(() => Promise.resolve(false)),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  LayoutAnimation: {
    configureNext: vi.fn(),
    Presets: { easeInEaseOut: {} },
  },
  UIManager: { setLayoutAnimationEnabledExperimental: vi.fn() },
  Alert: { alert: vi.fn() },
  Animated: {
    Value: class { setValue() {} },
    View: ({ children }: { children: unknown }) => children,
    Text: ({ children }: { children: unknown }) => children,
    timing: vi.fn(() => ({ start: vi.fn() })),
    spring: vi.fn(() => ({ start: vi.fn() })),
    sequence: vi.fn(() => ({ start: vi.fn() })),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  },
  Easing: { inOut: () => () => 0, quad: () => 0 },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Keyboard: {
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    dismiss: vi.fn(),
  },
  KeyboardAvoidingView: ({ children }: { children: unknown }) => children,
  Modal: ({ children }: { children: unknown }) => children,
  Platform: { OS: 'ios' },
  ScrollView: ({ children }: { children: unknown }) => children,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: ({ children }: { children: unknown }) => children,
  TextInput: () => null,
  TouchableOpacity: ({ children }: { children: unknown }) => children,
  View: ({ children }: { children: unknown }) => children,
}));

const lucideStub = () => null;
vi.mock('lucide-react-native', () => ({
  Home: lucideStub, Calendar: lucideStub, Wallet: lucideStub, Settings: lucideStub,
  Utensils: lucideStub, ShoppingBag: lucideStub, Bus: lucideStub, Sparkles: lucideStub,
  Sofa: lucideStub, MoreHorizontal: lucideStub, ChevronLeft: lucideStub, ChevronRight: lucideStub,
  X: lucideStub, Check: lucideStub, Pencil: lucideStub, Trash2: lucideStub,
}));

let sanitizeBudgetState: typeof import('../App').sanitizeBudgetState;
let nextOccurrence: typeof import('../App').nextOccurrence;
let periodBounds: typeof import('../App').periodBounds;
let calculatePlan: typeof import('../App').calculatePlan;
let calculateEnvelopeStatus: typeof import('../App').calculateEnvelopeStatus;
let parseIso: typeof import('../App').parseIso;
let stateAfterAddExpense: typeof import('../App').stateAfterAddExpense;
let stateAfterDeleteExpense: typeof import('../App').stateAfterDeleteExpense;
let stateAfterUpdateExpense: typeof import('../App').stateAfterUpdateExpense;
let transferEnvelope: typeof import('../App').transferEnvelope;
let closePeriod: typeof import('../App').closePeriod;
let closePeriodNoIncome: typeof import('../App').closePeriodNoIncome;

beforeAll(async () => {
  ({
    sanitizeBudgetState,
    nextOccurrence,
    periodBounds,
    calculatePlan,
    calculateEnvelopeStatus,
    parseIso,
    stateAfterAddExpense,
    stateAfterDeleteExpense,
    stateAfterUpdateExpense,
    transferEnvelope,
    closePeriod,
    closePeriodNoIncome,
  } = await import('../App'));
});

function makeState(overrides: Parameters<typeof sanitizeBudgetState>[0] = {}) {
  return sanitizeBudgetState({
    currentBalance: 800000,
    lifestyleType: 'balanced',
    currentPeriodStart: '2026-05-10',
    incomes: [],
    fixedItems: [],
    expenses: [],
    envelopes: [
      { name: '식비', periodLimit: 100000 },
      { name: '생활', periodLimit: 100000 },
      { name: '교통', periodLimit: 100000 },
      { name: '쇼핑', periodLimit: 100000 },
      { name: '문화', periodLimit: 100000 },
      { name: '기타', periodLimit: 100000 },
    ] as never,
    ...overrides,
  });
}

function iso(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

describe('budget state migration', () => {
  it('keeps legacy zero-amount income dates as monthly income items', () => {
    const state = sanitizeBudgetState({
      incomes: [{ id: 'legacy-income', name: '월급', day: 10, amount: 0 } as never],
    });

    expect(state.incomes).toHaveLength(1);
    expect(state.incomes[0]).toMatchObject({
      id: 'legacy-income',
      name: '월급',
      amount: 0,
      cadence: 'monthly',
    });
    expect(state.incomes[0].anchorDate.endsWith('-10')).toBe(true);
  });

  it('normalizes legacy envelopes into the six fixed categories', () => {
    const state = sanitizeBudgetState({
      envelopes: [
        { name: '식비', monthlyLimit: 10000 },
        { name: '개인소비', monthlyLimit: 20000 },
        { name: '예비비', monthlyLimit: 30000 },
        { name: '알수없음', monthlyLimit: 40000 },
      ] as never,
    });

    expect(state.envelopes.map(envelope => envelope.name)).toEqual(['식비', '생활', '교통', '쇼핑', '문화', '기타']);
    expect(state.envelopes.find(envelope => envelope.name === '식비')?.periodLimit).toBe(10000);
    expect(state.envelopes.find(envelope => envelope.name === '문화')?.periodLimit).toBe(20000);
    expect(state.envelopes.find(envelope => envelope.name === '기타')?.periodLimit).toBe(40000);
  });

  it('drops legacy expense envelopeId and preserves category', () => {
    const state = sanitizeBudgetState({
      expenses: [{
        id: 'expense-1',
        date: '2026-05-23',
        amount: 12000,
        memo: '점심',
        category: '식비',
        envelopeId: 'old-envelope',
        createdAt: '2026-05-23T00:00:00.000Z',
      } as never],
    });

    expect(state.expenses[0]).toMatchObject({
      id: 'expense-1',
      date: '2026-05-23',
      amount: 12000,
      category: '식비',
    });
    expect('envelopeId' in state.expenses[0]).toBe(false);
  });

  it('sets new period defaults and respects explicit savingEnabled false', () => {
    const state = sanitizeBudgetState({
      currentBalance: 500000,
      savingGoal: 100000,
      savingEnabled: false,
    });

    expect(state.savingEnabled).toBe(false);
    expect(state.currentPeriodStartingBalance).toBe(500000);
    expect(state.currentPeriodPlan).toHaveLength(6);
    expect(state.currentTransfers).toEqual([]);
    expect(state.periods).toEqual([]);
    expect(state.noIncomeMode).toBe('openEnded');
  });
});

describe('live wallet expense updates', () => {
  it('subtracts expense amount when adding', () => {
    const state = makeState({ currentBalance: 100000, noSpendDates: ['2026-05-20'] });
    const next = stateAfterAddExpense(state, {
      id: 'expense-1',
      date: '2026-05-20',
      amount: 30000,
      memo: '점심',
      category: '식비',
      createdAt: '2026-05-20T00:00:00.000Z',
    });

    expect(next.currentBalance).toBe(70000);
    expect(next.expenses).toHaveLength(1);
    expect(next.noSpendDates).toEqual([]);
  });

  it('restores expense amount when deleting', () => {
    const state = makeState({
      currentBalance: 70000,
      expenses: [{ id: 'expense-1', date: '2026-05-20', amount: 30000, memo: '', category: '식비', createdAt: '2026-05-20T00:00:00.000Z' } as never],
    });
    const next = stateAfterDeleteExpense(state, 'expense-1');

    expect(next.currentBalance).toBe(100000);
    expect(next.expenses).toHaveLength(0);
  });

  it('applies only the amount delta when editing', () => {
    const state = makeState({
      currentBalance: 70000,
      expenses: [{ id: 'expense-1', date: '2026-05-20', amount: 30000, memo: '', category: '식비', createdAt: '2026-05-20T00:00:00.000Z' } as never],
    });
    const next = stateAfterUpdateExpense(state, 'expense-1', {
      amount: 50000,
      memo: '저녁',
      category: '문화',
    });

    expect(next.currentBalance).toBe(50000);
    expect(next.expenses[0]).toMatchObject({ amount: 50000, memo: '저녁', category: '문화' });
  });
});

describe('period closing and envelope transfer', () => {
  it('moves envelope limits while preserving the total budget', () => {
    const state = makeState();
    const beforeTotal = state.envelopes.reduce((sum, envelope) => sum + envelope.periodLimit, 0);
    const next = transferEnvelope(state, '쇼핑', '식비', 20000);
    const afterTotal = next.envelopes.reduce((sum, envelope) => sum + envelope.periodLimit, 0);

    expect(afterTotal).toBe(beforeTotal);
    expect(next.envelopes.find(envelope => envelope.name === '쇼핑')?.periodLimit).toBe(80000);
    expect(next.envelopes.find(envelope => envelope.name === '식비')?.periodLimit).toBe(120000);
    expect(next.currentTransfers).toHaveLength(1);
  });

  it('closes a period by setting the new balance and saving a snapshot', () => {
    const state = makeState({
      currentBalance: 100000,
      currentPeriodStartingBalance: 300000,
      currentPeriodPlan: [{ category: '식비', limit: 100000 }],
      currentTransfers: [{ from: '쇼핑', to: '식비', amount: 20000, at: '2026-05-20T00:00:00.000Z' }],
      expenses: [{ id: 'expense-1', date: '2026-05-12', amount: 40000, memo: '', category: '식비', createdAt: '2026-05-12T00:00:00.000Z' } as never],
    });
    const next = closePeriod(state, parseIso('2026-05-25'), 500000);

    expect(next.currentBalance).toBe(500000);
    expect(next.currentPeriodStart).toBe('2026-05-25');
    expect(next.currentPeriodStartingBalance).toBe(500000);
    expect(next.currentTransfers).toEqual([]);
    expect(next.periods).toHaveLength(1);
    expect(next.periods[0]).toMatchObject({
      startingBalance: 300000,
      confirmedIncome: 400000,
      envelopePlan: [{ category: '식비', limit: 100000 }],
      transfers: [{ from: '쇼핑', to: '식비', amount: 20000, at: '2026-05-20T00:00:00.000Z' }],
    });
    expect(next.periods[0].actualByCategory.find(item => item.category === '식비')?.amount).toBe(40000);
  });

  it('rolls no-income periods without changing balance', () => {
    const state = makeState({ currentBalance: 123000, incomes: [], noIncomeMode: 'openEnded' });
    const next = closePeriodNoIncome(state, parseIso('2026-06-10'));

    expect(next.currentBalance).toBe(123000);
    expect(next.periods[0].confirmedIncome).toBe(0);
    expect(next.currentPeriodStart).toBe('2026-06-10');
  });
});

describe('period budget engine', () => {
  it('finds next monthly occurrence across month boundaries', () => {
    const income = makeState({
      incomes: [{ name: '월급', cadence: 'monthly', anchorDate: '2026-05-15', amount: 0 } as never],
    }).incomes[0];

    expect(iso(nextOccurrence(income, parseIso('2026-05-10')))).toBe('2026-05-15');
    expect(iso(nextOccurrence(income, parseIso('2026-05-20')))).toBe('2026-06-15');
  });

  it('clamps monthly occurrence to the last day of short months', () => {
    const income = makeState({
      incomes: [{ name: '월급', cadence: 'monthly', anchorDate: '2026-01-31', amount: 0 } as never],
    }).incomes[0];

    expect(iso(nextOccurrence(income, parseIso('2026-02-01')))).toBe('2026-02-28');
  });

  it('finds weekly and biweekly occurrences from anchor dates', () => {
    const weekly = makeState({
      incomes: [{ name: '주급', cadence: 'weekly', anchorDate: '2026-05-01', amount: 0 } as never],
    }).incomes[0];
    const biweekly = makeState({
      incomes: [{ name: '격주', cadence: 'biweekly', anchorDate: '2026-05-01', amount: 0 } as never],
    }).incomes[0];

    expect(iso(nextOccurrence(weekly, parseIso('2026-05-01')))).toBe('2026-05-01');
    expect(iso(nextOccurrence(weekly, parseIso('2026-05-09')))).toBe('2026-05-15');
    expect(iso(nextOccurrence(biweekly, parseIso('2026-05-16')))).toBe('2026-05-29');
  });

  it('finds irregular occurrence using estimated intervals', () => {
    const income = makeState({
      incomes: [{ name: '프리랜스', cadence: 'irregular', anchorDate: '2026-05-01', amount: 0, estIntervalDays: 20 } as never],
    }).incomes[0];

    expect(iso(nextOccurrence(income, parseIso('2026-05-25')))).toBe('2026-06-10');
  });

  it('uses first occurrence after period start as period end', () => {
    const state = makeState({
      currentPeriodStart: '2026-05-10',
      incomes: [{ name: '월급', cadence: 'monthly', anchorDate: '2026-05-10', amount: 0 } as never],
    });
    const bounds = periodBounds(state, parseIso('2026-05-25'));

    expect(iso(bounds.end)).toBe('2026-06-10');
    expect(bounds.overdue).toBe(false);
  });

  it('keeps overdue income date in the past instead of jumping ahead', () => {
    const state = makeState({
      currentPeriodStart: '2026-04-10',
      incomes: [{ name: '월급', cadence: 'monthly', anchorDate: '2026-04-10', amount: 0 } as never],
    });
    const bounds = periodBounds(state, parseIso('2026-05-15'));

    expect(iso(bounds.end)).toBe('2026-05-10');
    expect(bounds.overdue).toBe(true);
  });

  it('supports target-date and open-ended no-income bounds', () => {
    const target = periodBounds(makeState({
      incomes: [],
      noIncomeMode: 'targetDate',
      targetDate: '2026-06-30',
    }), parseIso('2026-05-21'));
    const openEnded = periodBounds(makeState({
      incomes: [],
      currentPeriodStart: '2026-05-21',
      noIncomeMode: 'openEnded',
    }), parseIso('2026-05-21'));

    expect(iso(target.end)).toBe('2026-06-30');
    expect(target.overdue).toBe(false);
    expect(iso(openEnded.end)).toBe('2026-06-20');
  });

  it('calculates daily unit from live wallet, fixed costs, and savings overlay', () => {
    const state = makeState({
      currentBalance: 800000,
      currentPeriodStart: '2026-05-20',
      incomes: [{ name: '월급', cadence: 'monthly', anchorDate: '2026-05-25', amount: 1000000 } as never],
      fixedItems: [{ id: 'fixed-1', name: '통신비', day: 23, amount: 50000 }],
      savingEnabled: true,
      savingGoal: 100000,
    });
    const plan = calculatePlan(state, parseIso('2026-05-20'));

    expect(plan.dailyUnit).toBe(130000);
    expect(plan.todayAllowance).toBe(130000);
    expect(plan.fixedRemaining).toBe(50000);
    expect(plan.savingReserved).toBe(100000);
  });

  it('adds today spending back to the pool then subtracts it from today remaining', () => {
    const state = makeState({
      currentBalance: 770000,
      currentPeriodStart: '2026-05-20',
      incomes: [{ name: '월급', cadence: 'monthly', anchorDate: '2026-05-25', amount: 1000000 } as never],
      expenses: [{ id: 'expense-1', date: '2026-05-20', amount: 30000, memo: '', category: '식비', createdAt: '2026-05-20T00:00:00.000Z' } as never],
    });
    const plan = calculatePlan(state, parseIso('2026-05-20'));

    expect(plan.todayAllowance).toBe(160000);
    expect(plan.todayRemaining).toBe(130000);
  });

  it('calculates open-ended runway from recent spending', () => {
    const state = makeState({
      currentBalance: 140000,
      incomes: [],
      noIncomeMode: 'openEnded',
      expenses: [{ id: 'expense-1', date: '2026-05-20', amount: 70000, memo: '', category: '식비', createdAt: '2026-05-20T00:00:00.000Z' } as never],
    });
    const plan = calculatePlan(state, parseIso('2026-05-21'));

    expect(plan.runwayDays).toBe(14);
  });

  it('calculates envelope status only within the current period', () => {
    const state = makeState({
      currentPeriodStart: '2026-05-10',
      expenses: [
        { id: 'old', date: '2026-05-09', amount: 90000, memo: '', category: '식비', createdAt: '2026-05-09T00:00:00.000Z' },
        { id: 'food', date: '2026-05-11', amount: 120000, memo: '', category: '식비', createdAt: '2026-05-11T00:00:00.000Z' },
        { id: 'culture', date: '2026-05-12', amount: 30000, memo: '', category: '문화', createdAt: '2026-05-12T00:00:00.000Z' },
      ] as never,
    });
    const statuses = calculateEnvelopeStatus(state, parseIso('2026-05-20'));

    expect(statuses.find(envelope => envelope.name === '식비')).toMatchObject({
      spent: 120000,
      remaining: -20000,
      warning: 'over',
    });
    expect(statuses.find(envelope => envelope.name === '문화')?.spent).toBe(30000);
  });
});
