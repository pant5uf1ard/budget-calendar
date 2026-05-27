import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('expo-font', () => ({
  useFonts: () => [true],
  loadAsync: vi.fn(),
}));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///stub/',
  writeAsStringAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  EncodingType: { UTF8: 'utf8' },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(() => Promise.resolve(false)),
  shareAsync: vi.fn(),
}));
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(() => Promise.resolve({ canceled: true })),
}));
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: unknown }) => children,
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children: unknown }) => children },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  LinearTransition: { springify: () => ({ damping: () => ({}) }) },
}));
vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@react-native-community/datetimepicker', () => ({ default: () => null }));
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
  Keyboard: { addListener: vi.fn(() => ({ remove: vi.fn() })), dismiss: vi.fn() },
  KeyboardAvoidingView: ({ children }: { children: unknown }) => children,
  Modal: ({ children }: { children: unknown }) => children,
  Platform: { OS: 'ios' },
  ScrollView: ({ children }: { children: unknown }) => children,
  StyleSheet: { create: <T>(styles: T) => styles },
  Switch: () => null,
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

let initialCoachProfile: typeof import('../App').initialCoachProfile;
let initializeSetupState: typeof import('../App').initializeSetupState;
let monthlyEnvelopeBudgets: typeof import('../App').monthlyEnvelopeBudgets;
let monthlyLivingBudget: typeof import('../App').monthlyLivingBudget;
let sanitizeBudgetState: typeof import('../App').sanitizeBudgetState;
let suggestEnvelopeBudgets: typeof import('../App').suggestEnvelopeBudgets;

beforeAll(async () => {
  ({
    initialCoachProfile,
    initializeSetupState,
    monthlyEnvelopeBudgets,
    monthlyLivingBudget,
    sanitizeBudgetState,
    suggestEnvelopeBudgets,
  } = await import('../App'));
});

function makeState(overrides: Parameters<typeof sanitizeBudgetState>[0] = {}) {
  return sanitizeBudgetState({
    currentBalance: 900000,
    currentPeriodStart: '2026-05-10',
    incomes: [{ id: 'income-1', name: '월급', cadence: 'monthly', anchorDate: '2026-06-10', amount: 560000 }] as never,
    fixedItems: [],
    savingEnabled: false,
    savingGoal: 0,
    ...overrides,
  });
}

describe('direct onboarding envelope calculation', () => {
  it('uses default direct budgets instead of weighted ratios', () => {
    const budgets = monthlyEnvelopeBudgets(makeState(), initialCoachProfile);

    expect(budgets.식비).toBe(230000);
    expect(budgets.문화).toBe(155000);
    expect(budgets.쇼핑).toBe(100000);
    expect(budgets.생활).toBe(70000);
    expect(budgets.교통).toBe(30000);
    expect(budgets.기타).toBe(-65000);
  });

  it('maps provided lunch and home dinner to 80000 food budget', () => {
    const budgets = monthlyEnvelopeBudgets(makeState(), {
      ...initialCoachProfile,
      lunch: 'provided',
      dinner: 'home',
    });

    expect(budgets.식비).toBe(80000);
  });

  it('adds social and content into culture budget', () => {
    const budgets = monthlyEnvelopeBudgets(makeState(), {
      ...initialCoachProfile,
      socialFrequency: 5,
      socialPerVisit: 30000,
      contentMonthly: 30000,
    });

    expect(budgets.문화).toBe(180000);
  });

  it('uses housing for living budget and moneyStyle for other adjustment', () => {
    const family = monthlyEnvelopeBudgets(makeState({ housing: 'family' }), initialCoachProfile);
    const loose = monthlyEnvelopeBudgets(makeState(), { ...initialCoachProfile, moneyStyle: 'loose' });

    expect(family.생활).toBe(30000);
    expect(loose.기타).toBeGreaterThan(monthlyEnvelopeBudgets(makeState(), initialCoachProfile).기타);
  });

  it('calculates monthly living budget with cadence and automatic deductions', () => {
    const state = makeState({
      incomes: [{ id: 'income-1', name: '격주', cadence: 'biweekly', anchorDate: '2026-05-23', amount: 500000 }] as never,
      fixedItems: [{ id: 'fixed-1', name: '고정', day: 1, amount: 234000 }],
      savingEnabled: true,
      savingGoal: 350000,
      datePoolMonthly: 200000,
      eventReserveMonthly: 40000,
    });

    expect(Math.round(monthlyLivingBudget(state))).toBe(259333);
  });

  it('splits the current balance across envelopes by category share', () => {
    const state = makeState({
      currentBalance: 900000,
      currentPeriodStart: '2026-05-01',
      incomes: [{ id: 'income-1', name: '월급', cadence: 'monthly', anchorDate: '2026-05-16', amount: 560000 }] as never,
    });
    const envelopes = suggestEnvelopeBudgets(state, { ...initialCoachProfile, lunch: 'provided', dinner: 'home' });
    const total = envelopes.reduce((sum, item) => sum + item.periodLimit, 0);

    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(900000);
    expect(envelopes.find(envelope => envelope.name === '식비')?.periodLimit).toBeGreaterThan(0);
  });
});

describe('onboarding migration', () => {
  it('maps old nine-key coach profile to the new seven-key profile', () => {
    const state = sanitizeBudgetState({
      coachProfile: {
        lunch: 'buy',
        soloDinner: 'rare',
        socialCount: 'fourPlus',
        personalSpend: 'overThirty',
        leak: 'shopping',
        kitchen: 'small',
        style: 'strict',
        split: 'half',
        socialType: 'meal',
      } as never,
    });

    expect(state.coachProfile).toEqual({
      lunch: 'buy',
      dinner: 'buy',
      socialFrequency: 10,
      socialPerVisit: 25000,
      shoppingMonthly: 350000,
      contentMonthly: 30000,
      moneyStyle: 'tight',
    });
  });

  it('sets new BudgetState defaults without forcing setup again', () => {
    const state = sanitizeBudgetState({ setupComplete: true });

    expect(state.setupComplete).toBe(true);
    expect(state.datePoolMonthly).toBe(0);
    expect(state.eventReserveMonthly).toBe(40000);
    expect(state.housing).toBe('solo');
  });
});

describe('onboarding setup completion', () => {
  it('sets period initialization fields when setup completes', () => {
    const state = makeState();
    const next = initializeSetupState(state, initialCoachProfile, new Date(2026, 4, 23));

    expect(next.setupComplete).toBe(true);
    expect(next.currentPeriodStart).toBe('2026-05-23');
    expect(next.currentPeriodStartingBalance).toBe(900000);
    expect(next.currentPeriodPlan).toHaveLength(6);
    expect(next.currentTransfers).toEqual([]);
    expect(next.coachProfile).toEqual(initialCoachProfile);
  });
});
