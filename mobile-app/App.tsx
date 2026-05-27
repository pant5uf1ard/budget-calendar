import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DateTimePicker from '@react-native-community/datetimepicker'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Reanimated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFonts } from 'expo-font'
import {
  Home as IconHome,
  Calendar as IconCalendar,
  Wallet as IconWallet,
  Settings as IconSettings,
  Utensils as IconFood,
  ShoppingBag as IconShopping,
  Bus as IconTransit,
  Sparkles as IconCulture,
  Sofa as IconLiving,
  MoreHorizontal as IconOther,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  X as IconClose,
  Check as IconCheck,
  Pencil as IconEdit,
  Trash2 as IconTrash,
} from 'lucide-react-native'
import {
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type Tab = 'home' | 'calendar' | 'envelopes' | 'settings'
type Category = '식비' | '생활' | '교통' | '쇼핑' | '문화' | '기타'
type LifestyleType = 'balanced' | 'worker' | 'weekendSocial' | 'weekendHeavy' | 'weekdayOnly'
type HousingType = 'solo' | 'family' | 'share'
type BudgetCoachProfile = {
  lunch: 'provided' | 'lunchbox' | 'buy' | 'delivery'
  dinner: 'home' | 'mixed' | 'buy'
  socialFrequency: number
  socialPerVisit: number
  shoppingMonthly: number
  contentMonthly: number
  moneyStyle: 'tight' | 'balanced' | 'loose'
}
type Cadence = 'monthly' | 'biweekly' | 'weekly' | 'irregular'
type IncomeSetupMode = 'regular' | 'irregular' | 'none'

type IncomeItem = {
  id: string
  name: string
  amount: number | null
  cadence: Cadence
  anchorDate: string
  estIntervalDays?: number
}

type FixedItem = {
  id: string
  name: string
  day: number
  amount: number
}

type ExpenseRecord = {
  id: string
  date: string
  amount: number
  memo: string
  category: Category
  createdAt: string
}

type BudgetEnvelope = {
  id: string
  name: Category
  periodLimit: number
}

type EnvelopeTransfer = {
  from: Category
  to: Category
  amount: number
  at: string
}

type PeriodSnapshot = {
  id: string
  startDate: string
  endDate: string
  startingBalance: number
  confirmedIncome: number
  envelopePlan: { category: Category; limit: number }[]
  transfers: EnvelopeTransfer[]
  actualByCategory: { category: Category; amount: number }[]
}

type BudgetState = {
  setupComplete: boolean
  currentBalance: number
  savingEnabled: boolean
  savingGoal: number
  lifestyleType: LifestyleType
  weekendMultiplier?: number
  incomes: IncomeItem[]
  noIncomeMode: 'targetDate' | 'openEnded'
  targetDate?: string
  fixedItems: FixedItem[]
  envelopes: BudgetEnvelope[]
  expenses: ExpenseRecord[]
  currentPeriodStart: string
  currentPeriodStartingBalance: number
  currentPeriodPlan: { category: Category; limit: number }[]
  currentTransfers: EnvelopeTransfer[]
  periods: PeriodSnapshot[]
  coachProfile: BudgetCoachProfile
  datePoolMonthly: number
  eventReserveMonthly: number
  housing: HousingType
  noSpendDates: string[]
}

const STORAGE_KEY = 'budget-calendar-mobile-v1'
const CATEGORIES: Category[] = ['식비', '생활', '교통', '쇼핑', '문화', '기타']

const CATEGORY_ICONS: Record<Category, typeof IconFood> = {
  식비: IconFood,
  생활: IconLiving,
  교통: IconTransit,
  쇼핑: IconShopping,
  문화: IconCulture,
  기타: IconOther,
}

const TAB_ICONS: Record<Tab, typeof IconHome> = {
  home: IconHome,
  calendar: IconCalendar,
  envelopes: IconWallet,
  settings: IconSettings,
}
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const LIFESTYLE_OPTIONS: { key: LifestyleType; title: string; description: string; weekdayWeight: number; weekendWeight: number }[] = [
  { key: 'balanced', title: '균등형', description: '요일 상관없이 비슷하게 써요', weekdayWeight: 1, weekendWeight: 1 },
  { key: 'worker', title: '직장인 기본형', description: '평일은 적게, 주말은 조금 더 써요', weekdayWeight: 0.8, weekendWeight: 1.6 },
  { key: 'weekendSocial', title: '주말 약속형', description: '평일은 아끼고, 주말 약속이 잦아요', weekdayWeight: 0.65, weekendWeight: 2 },
  { key: 'weekendHeavy', title: '주말 몰빵형', description: '평일은 거의 안 쓰고, 주말에 크게 써요', weekdayWeight: 0.45, weekendWeight: 2.8 },
  { key: 'weekdayOnly', title: '주말 제외형', description: '주말 예산은 따로 잡지 않고 평일에만 나눠요', weekdayWeight: 1, weekendWeight: 0 },
]
const CADENCE_OPTIONS: { key: Cadence; label: string }[] = [
  { key: 'monthly', label: '매달' },
  { key: 'biweekly', label: '격주' },
  { key: 'weekly', label: '매주' },
  { key: 'irregular', label: '들쭉날쭉' },
]
export const initialCoachProfile: BudgetCoachProfile = {
  lunch: 'buy',
  dinner: 'mixed',
  socialFrequency: 5,
  socialPerVisit: 25000,
  shoppingMonthly: 100000,
  contentMonthly: 30000,
  moneyStyle: 'balanced',
}

type SetupStep =
  | { kind: 'balance' }
  | { kind: 'incomeMode' }
  | { kind: 'incomeDetail' }
  | { kind: 'fixed' }
  | { kind: 'autoDeduct' }
  | { kind: 'lifestyle' }
  | { kind: 'coachMeal' }
  | { kind: 'coachSocial' }
  | { kind: 'coachShopping' }
  | { kind: 'coachContent' }
  | { kind: 'coachStyle' }
  | { kind: 'saving' }
  | { kind: 'result' }

const SETUP_STEPS: SetupStep[] = [
  { kind: 'balance' },
  { kind: 'incomeMode' },
  { kind: 'incomeDetail' },
  { kind: 'fixed' },
  { kind: 'autoDeduct' },
  { kind: 'lifestyle' },
  { kind: 'coachMeal' },
  { kind: 'coachSocial' },
  { kind: 'coachShopping' },
  { kind: 'coachContent' },
  { kind: 'coachStyle' },
  { kind: 'saving' },
  { kind: 'result' },
]
const TOTAL_SETUP_STEPS = SETUP_STEPS.length

const initialState: BudgetState = {
  setupComplete: false,
  currentBalance: 0,
  savingEnabled: false,
  savingGoal: 0,
  lifestyleType: 'worker',
  incomes: [],
  noIncomeMode: 'openEnded',
  fixedItems: [],
  envelopes: makeDefaultEnvelopes(),
  expenses: [],
  currentPeriodStart: isoDate(new Date()),
  currentPeriodStartingBalance: 0,
  currentPeriodPlan: makeDefaultEnvelopes().map(envelope => ({ category: envelope.name, limit: envelope.periodLimit })),
  currentTransfers: [],
  periods: [],
  coachProfile: initialCoachProfile,
  datePoolMonthly: 0,
  eventReserveMonthly: 40000,
  housing: 'solo',
  noSpendDates: [],
}

const colors = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  border: '#E8EAED',
  borderMd: '#D1D5DB',
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  teal: '#0D9488',
  tealDark: '#0F766E',
  tealLight: '#F0FDFA',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  success: '#16A34A',
  successBg: '#F0FDF4',
  overBg: '#FEF2F2',
  overBorder: '#FECACA',
  underBg: '#F0FDF4',
  underBorder: '#BBF7D0',
  warning: '#D97706',
  warningBg: '#FFFBEB',
}

const tokens = {
  color: {
    bg: colors.bg,
    surface: colors.surface,
    border: colors.border,
    borderStrong: colors.borderMd,
    textPrimary: colors.text,
    textSecondary: colors.muted,
    textTertiary: colors.subtle,
    accent: colors.teal,
    accentDark: colors.tealDark,
    accentSoft: colors.tealLight,
    success: colors.success,
    successBg: colors.successBg,
    danger: colors.danger,
    dangerBg: colors.dangerBg,
    warning: colors.warning,
    warningBg: colors.warningBg,
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 10, lg: 14, xl: 20, pill: 999 },
  type: { caption: 12, body: 14, bodyLg: 15, title: 17, titleLg: 20, hero: 28, display: 36 },
  weight: { regular: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const, extrabold: '800' as const, heavy: '900' as const },
} as const

function SkeletonHome() {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] })
  const Block = ({ h, w, mt = 0, br = 8 }: { h: number; w?: number | `${number}%`; mt?: number; br?: number }) => (
    <Animated.View style={{ height: h, width: w ?? '100%' as const, marginTop: mt, borderRadius: br, backgroundColor: colors.border, opacity }} />
  )
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
        <Block h={12} w={48} />
        <Block h={16} w={120} mt={4} />
        <Block h={40} w={200} mt={4} />
        <Block h={20} w={100} mt={8} br={999} />
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
        <Block h={16} w={120} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Block h={44} w={120} />
          <View style={{ flex: 1 }}><Block h={44} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[0,1,2,3,4,5].map(i => (
            <View key={i} style={{ flex: 1 }}><Block h={36} br={10} /></View>
          ))}
        </View>
        <Block h={48} br={10} mt={4} />
      </View>
    </View>
  )
}

const FocusInput = React.forwardRef<TextInput, React.ComponentProps<typeof TextInput>>(
  function FocusInput({ style, onFocus, onBlur, ...rest }, ref) {
    const [focused, setFocused] = useState(false)
    return (
      <TextInput
        ref={ref}
        style={[style, focused && styles.inputFocused]}
        onFocus={e => { setFocused(true); onFocus?.(e) }}
        onBlur={e => { setFocused(false); onBlur?.(e) }}
        selectionColor={colors.teal}
        {...rest}
      />
    )
  }
)

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function clampDay(value: number) {
  if (Number.isNaN(value)) return 1
  return Math.min(31, Math.max(1, Math.round(value)))
}

function money(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function calendarMoney(value: number) {
  return Math.round(value).toLocaleString('ko-KR')
}

function shortFixedLabel(name: string) {
  return name.trim().slice(0, 3) || '고정'
}

function numeric(value: string) {
  return Number(value.replace(/[^\d]/g, '') || 0)
}

function formatMoneyText(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number(digits).toLocaleString('ko-KR') : ''
}

function confirmDestructive(title: string, message: string, onConfirm: () => void) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ])
}

function hapticLight() {
  Haptics.selectionAsync().catch(() => {})
}

function hapticMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
}

function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

function normalizeCategory(category: unknown): Category {
  return CATEGORIES.includes(category as Category) ? category as Category : '기타'
}

function sanitizeAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

function sanitizeFinite(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount) : 0
}

function sanitizeText(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function isIsoDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidCadence(value: unknown): value is Cadence {
  return value === 'monthly' || value === 'biweekly' || value === 'weekly' || value === 'irregular'
}

function isNoIncomeMode(value: unknown): value is BudgetState['noIncomeMode'] {
  return value === 'targetDate' || value === 'openEnded'
}

function isHousingType(value: unknown): value is HousingType {
  return value === 'solo' || value === 'family' || value === 'share'
}

export function parseIso(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function daysBetween(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((end - start) / 86400000)
}

export function clampDayToMonth(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, Math.min(clampDay(day), daysInMonth(new Date(year, monthIndex, 1))))
}

function sanitizeIncomeItem(item: Partial<IncomeItem> & { day?: unknown }, index: number): IncomeItem {
  const today = new Date()
  const legacyDay = clampDay(Number(item.day) || 25)
  const anchorDate = isIsoDateKey(item.anchorDate)
    ? item.anchorDate
    : isoDate(clampDayToMonth(today.getFullYear(), today.getMonth(), legacyDay))
  const amount = item.amount === null ? null : sanitizeAmount(item.amount)
  const estIntervalDays = sanitizeAmount(item.estIntervalDays)
  return {
    id: sanitizeText(item.id, `income-${index + 1}`),
    name: sanitizeText(item.name, `수입 ${index + 1}`),
    amount,
    cadence: isValidCadence(item.cadence) ? item.cadence : 'monthly',
    anchorDate,
    ...(estIntervalDays > 0 ? { estIntervalDays } : {}),
  }
}

function sortByDayThenName<T extends { day: number; name: string; id: string }>(items: T[]) {
  return [...items].sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'ko-KR') || a.id.localeCompare(b.id))
}

function sortIncomes(items: IncomeItem[]) {
  return [...items].sort((a, b) => a.anchorDate.localeCompare(b.anchorDate) || a.name.localeCompare(b.name, 'ko-KR') || a.id.localeCompare(b.id))
}

function sanitizeFixedItem(item: Partial<FixedItem>, index: number): FixedItem {
  return {
    id: sanitizeText(item.id, `fixed-${index + 1}`),
    name: sanitizeText(item.name, `고정 ${index + 1}`),
    day: clampDay(Number(item.day) || 25),
    amount: sanitizeAmount(item.amount),
  }
}

function sanitizeExpenseRecord(item: Partial<ExpenseRecord>, index: number): ExpenseRecord | null {
  if (!isIsoDateKey(item.date)) return null
  const amount = sanitizeAmount(item.amount)
  if (!amount) return null
  return {
    id: sanitizeText(item.id, `expense-${index + 1}`),
    date: item.date,
    amount,
    memo: typeof item.memo === 'string' ? item.memo : '',
    category: normalizeCategory(item.category),
    createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
  }
}

function makeDefaultEnvelopes(): BudgetEnvelope[] {
  return CATEGORIES.map(name => ({
    id: name,
    name,
    periodLimit: 0,
  }))
}

function normalizeEnvelopes(value: unknown): BudgetEnvelope[] {
  const saved = Array.isArray(value) ? value as (Partial<BudgetEnvelope> & { monthlyLimit?: unknown })[] : []
  const byCategory = new Map<Category, number>(CATEGORIES.map(category => [category, 0]))
  saved.forEach(item => {
    const limit = sanitizeAmount(item.periodLimit ?? item.monthlyLimit)
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (CATEGORIES.includes(name as Category)) {
      byCategory.set(name as Category, (byCategory.get(name as Category) ?? 0) + limit)
    } else if (name === '개인소비') {
      byCategory.set('문화', (byCategory.get('문화') ?? 0) + limit)
    } else if (name !== '예비비') {
      byCategory.set('기타', (byCategory.get('기타') ?? 0) + limit)
    }
  })
  return CATEGORIES.map(category => ({
    id: category,
    name: category,
    periodLimit: byCategory.get(category) ?? 0,
  }))
}

function sanitizeCoachProfile(value: unknown): BudgetCoachProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initialCoachProfile
  const saved = value as Record<string, unknown>
  const hasOldKeys = 'soloDinner' in saved
    || 'socialCount' in saved
    || 'personalSpend' in saved
    || 'kitchen' in saved
    || 'split' in saved
    || 'style' in saved
  const hasNewKeys = !hasOldKeys && (typeof saved.lunch === 'string'
    || typeof saved.dinner === 'string'
    || typeof saved.socialFrequency === 'number'
    || typeof saved.socialPerVisit === 'number'
    || typeof saved.shoppingMonthly === 'number'
    || typeof saved.contentMonthly === 'number')

  if (!hasNewKeys) {
    return {
      lunch: saved.lunch === 'provided'
        ? 'provided'
        : saved.lunch === 'home'
          ? 'lunchbox'
          : saved.lunch === 'buy'
            ? 'buy'
            : 'buy',
      dinner: saved.leak === 'delivery'
        ? 'buy'
        : saved.kitchen === 'small' || saved.kitchen === 'hard'
          ? 'buy'
          : saved.soloDinner === 'rare'
            ? 'home'
            : saved.soloDinner === 'fourPlus'
              ? 'mixed'
              : 'mixed',
      socialFrequency: saved.socialCount === 'rare'
        ? 2
        : saved.socialCount === 'twoThree'
          ? 5
          : saved.socialCount === 'fourPlus'
            ? 10
            : 5,
      socialPerVisit: saved.split === 'mostlyMe' ? 35000 : 25000,
      shoppingMonthly: saved.personalSpend === 'under10'
        ? 50000
        : saved.personalSpend === 'tenTwenty'
          ? 150000
          : saved.personalSpend === 'twentyThirty'
            ? 250000
            : saved.personalSpend === 'overThirty'
              ? 350000
              : 100000,
      contentMonthly: saved.leak === 'hobby' ? 50000 : saved.leak === 'snack' ? 20000 : 30000,
      moneyStyle: saved.style === 'strict'
        ? 'tight'
        : saved.style === 'safe'
          ? 'loose'
          : saved.style === 'balanced'
            ? 'balanced'
            : 'balanced',
    }
  }

  return {
    lunch: saved.lunch === 'provided' || saved.lunch === 'lunchbox' || saved.lunch === 'buy' || saved.lunch === 'delivery'
      ? saved.lunch
      : initialCoachProfile.lunch,
    dinner: saved.dinner === 'home' || saved.dinner === 'mixed' || saved.dinner === 'buy'
      ? saved.dinner
      : initialCoachProfile.dinner,
    socialFrequency: Math.min(30, Math.max(0, sanitizeFinite(saved.socialFrequency))),
    socialPerVisit: sanitizeAmount(saved.socialPerVisit) || initialCoachProfile.socialPerVisit,
    shoppingMonthly: sanitizeAmount(saved.shoppingMonthly) || initialCoachProfile.shoppingMonthly,
    contentMonthly: sanitizeAmount(saved.contentMonthly) || initialCoachProfile.contentMonthly,
    moneyStyle: saved.moneyStyle === 'tight' || saved.moneyStyle === 'balanced' || saved.moneyStyle === 'loose'
      ? saved.moneyStyle
      : initialCoachProfile.moneyStyle,
  }
}

function sanitizeEnvelopePlan(value: unknown, envelopes: BudgetEnvelope[]) {
  if (!Array.isArray(value)) {
    return envelopes.map(envelope => ({ category: envelope.name, limit: envelope.periodLimit }))
  }
  const plan = value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const row = item as { category?: unknown; limit?: unknown }
      const category = normalizeCategory(row.category)
      return { category, limit: sanitizeAmount(row.limit) }
    })
    .filter((item): item is { category: Category; limit: number } => Boolean(item))
  return plan.length > 0 ? plan : envelopes.map(envelope => ({ category: envelope.name, limit: envelope.periodLimit }))
}

function sanitizeTransfers(value: unknown): EnvelopeTransfer[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<EnvelopeTransfer>
      const amount = sanitizeAmount(row.amount)
      if (!amount) return null
      return {
        from: normalizeCategory(row.from),
        to: normalizeCategory(row.to),
        amount,
        at: typeof row.at === 'string' && row.at ? row.at : new Date().toISOString(),
      }
    })
    .filter((item): item is EnvelopeTransfer => Boolean(item))
}

function sanitizePeriods(value: unknown): PeriodSnapshot[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<PeriodSnapshot>
      if (!isIsoDateKey(row.startDate) || !isIsoDateKey(row.endDate)) return null
      return {
        id: sanitizeText(row.id, `period-${index + 1}`),
        startDate: row.startDate,
        endDate: row.endDate,
        startingBalance: sanitizeAmount(row.startingBalance),
        confirmedIncome: sanitizeFinite(row.confirmedIncome),
        envelopePlan: sanitizeEnvelopePlan(row.envelopePlan, makeDefaultEnvelopes()),
        transfers: sanitizeTransfers(row.transfers),
        actualByCategory: sanitizeEnvelopePlan(row.actualByCategory, makeDefaultEnvelopes()).map(item => ({
          category: item.category,
          amount: item.limit,
        })),
      }
    })
    .filter((item): item is PeriodSnapshot => Boolean(item))
}

export function sanitizeBudgetState(saved: Partial<BudgetState>): BudgetState {
  const incomes = Array.isArray(saved.incomes)
    ? sortIncomes(saved.incomes.map(sanitizeIncomeItem).filter(item => isIsoDateKey(item.anchorDate)))
    : []
  const fixedItems = Array.isArray(saved.fixedItems)
    ? sortByDayThenName(saved.fixedItems.map(sanitizeFixedItem).filter(item => item.amount > 0))
    : []
  const expenses = Array.isArray(saved.expenses)
    ? saved.expenses.map(sanitizeExpenseRecord).filter((item): item is ExpenseRecord => Boolean(item))
    : []
  const envelopes = normalizeEnvelopes(saved.envelopes)
  const currentBalance = sanitizeAmount(saved.currentBalance)
  const currentPeriodPlan = sanitizeEnvelopePlan(saved.currentPeriodPlan, envelopes)

  return {
    ...initialState,
    ...saved,
    setupComplete: Boolean(saved.setupComplete),
    currentBalance,
    savingEnabled: saved.savingEnabled === undefined
      ? sanitizeAmount(saved.savingGoal) > 0
      : Boolean(saved.savingEnabled),
    savingGoal: sanitizeAmount(saved.savingGoal),
    lifestyleType: LIFESTYLE_OPTIONS.some(option => option.key === saved.lifestyleType)
      ? saved.lifestyleType as LifestyleType
      : initialState.lifestyleType,
    incomes,
    noIncomeMode: isNoIncomeMode(saved.noIncomeMode) ? saved.noIncomeMode : 'openEnded',
    targetDate: isIsoDateKey(saved.targetDate) ? saved.targetDate : undefined,
    fixedItems,
    envelopes,
    expenses,
    currentPeriodStart: isIsoDateKey(saved.currentPeriodStart) ? saved.currentPeriodStart : isoDate(new Date()),
    currentPeriodStartingBalance: Number.isFinite(Number(saved.currentPeriodStartingBalance))
      ? sanitizeFinite(saved.currentPeriodStartingBalance)
      : currentBalance,
    currentPeriodPlan,
    currentTransfers: sanitizeTransfers(saved.currentTransfers),
    periods: sanitizePeriods(saved.periods),
    coachProfile: sanitizeCoachProfile(saved.coachProfile),
    datePoolMonthly: sanitizeAmount(saved.datePoolMonthly),
    eventReserveMonthly: saved.eventReserveMonthly === undefined ? 40000 : sanitizeAmount(saved.eventReserveMonthly),
    housing: isHousingType(saved.housing) ? saved.housing : 'solo',
    noSpendDates: Array.isArray(saved.noSpendDates) ? saved.noSpendDates.filter(isIsoDateKey) : [],
  }
}

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function dateForDay(date: Date, day: number) {
  return isoDate(new Date(date.getFullYear(), date.getMonth(), day))
}

function incomeDay(item: IncomeItem) {
  return clampDay(parseIso(item.anchorDate).getDate())
}

function incomeWithDay(item: IncomeItem, day: number, baseDate = new Date()): IncomeItem {
  return {
    ...item,
    anchorDate: isoDate(clampDayToMonth(baseDate.getFullYear(), baseDate.getMonth(), day)),
  }
}

function incomeWithCadence(item: IncomeItem, cadence: Cadence): IncomeItem {
  return {
    ...item,
    cadence,
    anchorDate: cadence === 'monthly'
      ? isoDate(clampDayToMonth(parseIso(item.anchorDate).getFullYear(), parseIso(item.anchorDate).getMonth(), incomeDay(item)))
      : item.anchorDate,
  }
}

function incomePlanningAmount(item: IncomeItem) {
  return item.amount ?? 0
}

function monthlyIncomeAmount(item: IncomeItem) {
  const amount = incomePlanningAmount(item)
  if (item.cadence === 'biweekly') return amount * 26 / 12
  if (item.cadence === 'weekly') return amount * 52 / 12
  if (item.cadence === 'irregular') {
    const interval = Math.max(1, item.estIntervalDays ?? 30)
    return amount * (30 / interval)
  }
  return amount
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(date.getDate() + amount)
  return next
}

function dateWithMonthDay(year: number, month: number, day: number) {
  const monthEnd = daysInMonth(new Date(year, month, 1))
  return new Date(year, month, Math.min(day, monthEnd))
}

function isBeforeDate(a: Date, b: Date) {
  return isoDate(a) < isoDate(b)
}

function isAfterOrSameDate(a: Date, b: Date) {
  return isoDate(a) >= isoDate(b)
}

function isBeforeOrSameDate(a: Date, b: Date) {
  return isoDate(a) <= isoDate(b)
}

function isWeekend(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

function startOffset(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  return firstDay.getDay()
}

function recordsForDate(state: BudgetState, dateKey: string) {
  return state.expenses
    .filter(item => item.date === dateKey)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function isNoSpendDate(state: BudgetState, dateKey: string) {
  return state.noSpendDates.includes(dateKey)
}

function sumForDate(state: BudgetState, dateKey: string) {
  return recordsForDate(state, dateKey).reduce((sum, item) => sum + item.amount, 0)
}

function derivedMonthlySaving(state: BudgetState) {
  if (!state.savingEnabled) return 0
  return suggestSavingBreakdown(state, state.coachProfile).monthly
}

export function monthlyLivingBudget(state: BudgetState) {
  const incomeTotal = state.incomes.reduce((sum, item) => sum + monthlyIncomeAmount(item), 0)
  const fixedTotal = state.fixedItems.reduce((sum, item) => sum + item.amount, 0)
  return Math.max(
    incomeTotal
    - fixedTotal
    - derivedMonthlySaving(state)
    - state.datePoolMonthly
    - state.eventReserveMonthly,
    0,
  )
}

function monthPlannedLivingBudget(state: BudgetState) {
  const monthlyBudget = monthlyLivingBudget(state)
  return monthlyBudget > 0 ? monthlyBudget : Math.max(state.currentBalance - derivedMonthlySaving(state), 0)
}

function roundToThousand(value: number) {
  return Math.round(value / 1000) * 1000
}

function floorToThousand(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value / 1000) * 1000
}

export function coachSpendingMonthly(state: BudgetState, profile: BudgetCoachProfile): number {
  const lunchCost = { provided: 0, lunchbox: 20000, buy: 100000, delivery: 140000 }[profile.lunch]
  const dinnerCost = { home: 80000, mixed: 130000, buy: 180000 }[profile.dinner]
  const socialBudget = Math.min(30, Math.max(0, profile.socialFrequency)) * profile.socialPerVisit
  const livingItemsBudget = { solo: 70000, family: 30000, share: 50000 }[state.housing]
  return lunchCost + dinnerCost + livingItemsBudget + 30000 + profile.shoppingMonthly + socialBudget + profile.contentMonthly
}

export function suggestSavingBreakdown(state: BudgetState, profile: BudgetCoachProfile, today: Date = new Date()) {
  const monthlySpending = coachSpendingMonthly(state, profile)
  const monthlyIncome = state.incomes.reduce((sum, item) => sum + monthlyIncomeAmount(item), 0)
  const monthlyFixed = state.fixedItems.reduce((sum, item) => sum + item.amount, 0)
  const monthlyReserves = (state.datePoolMonthly || 0) + (state.eventReserveMonthly || 0)

  const { end, overdue } = periodBounds(state, today)
  if (overdue) {
    return { firstPeriod: 0, perCycle: 0, monthly: 0, monthlySpending, periodDays: 0 }
  }
  const periodDays = Math.max(1, daysBetween(today, end))
  const fixedForPeriod = recurringAmountBetween(state.fixedItems, today, end, false)

  const dailySpending = monthlySpending / 30
  const expectedSpend = dailySpending * periodDays + fixedForPeriod

  const monthlyRaw = Math.max(0, monthlyIncome - monthlyFixed - monthlySpending - monthlyReserves)
  const firstPeriod = floorToThousand(Math.max(0, state.currentBalance - expectedSpend))
  const perCycle = floorToThousand(Math.max(0, monthlyRaw * (periodDays / 30)))
  const monthly = floorToThousand(monthlyRaw)

  return { firstPeriod, perCycle, monthly, monthlySpending, periodDays }
}

export function suggestSavingAmount(state: BudgetState, profile: BudgetCoachProfile, today: Date = new Date()) {
  const breakdown = suggestSavingBreakdown(state, profile, today)
  return state.periods.length === 0 ? breakdown.firstPeriod : breakdown.perCycle
}

export function derivedSavingForPeriod(state: BudgetState, profile: BudgetCoachProfile, today: Date = new Date()) {
  if (!state.savingEnabled) return 0
  return suggestSavingAmount(state, profile, today)
}

export function monthlyEnvelopeBudgets(state: BudgetState, profile: BudgetCoachProfile) {
  const lunchCost = { provided: 0, lunchbox: 20000, buy: 100000, delivery: 140000 }[profile.lunch]
  const dinnerCost = { home: 80000, mixed: 130000, buy: 180000 }[profile.dinner]
  const socialBudget = Math.min(30, Math.max(0, profile.socialFrequency)) * profile.socialPerVisit
  const livingItemsBudget = { solo: 70000, family: 30000, share: 50000 }[state.housing]
  const otherAdjust = { tight: -10000, balanced: 0, loose: 20000 }[profile.moneyStyle]
  const fixedBudgets = {
    식비: lunchCost + dinnerCost,
    생활: livingItemsBudget,
    교통: 30000,
    쇼핑: profile.shoppingMonthly,
    문화: socialBudget + profile.contentMonthly,
  }
  const fixedSum = fixedBudgets.식비 + fixedBudgets.생활 + fixedBudgets.교통 + fixedBudgets.쇼핑 + fixedBudgets.문화
  return {
    ...fixedBudgets,
    기타: monthlyLivingBudget(state) - fixedSum + otherAdjust,
  }
}

export function suggestEnvelopeBudgets(state: BudgetState, profile: BudgetCoachProfile) {
  const monthlyBudgets = monthlyEnvelopeBudgets(state, profile)
  const monthlyTotal = Object.values(monthlyBudgets).reduce((sum, value) => sum + value, 0)
  const today = new Date()
  const { end } = periodBounds(state, today)
  const fixedForPeriod = recurringAmountBetween(state.fixedItems, today, end, false)
  const savingForPeriod = derivedSavingForPeriod(state, profile, today)
  const livingPool = Math.max(state.currentBalance - fixedForPeriod - savingForPeriod, 0)
  return state.envelopes.map(envelope => {
    const share = monthlyTotal > 0
      ? (monthlyBudgets[envelope.name] / monthlyTotal) * livingPool
      : livingPool / Math.max(state.envelopes.length, 1)
    return { ...envelope, periodLimit: roundToThousand(share) }
  })
}

export function initializeSetupState(state: BudgetState, profile: BudgetCoachProfile, today: Date): BudgetState {
  const savingGoal = state.savingEnabled ? state.savingGoal || suggestSavingAmount(state, profile) : 0
  const envelopes = state.envelopes.some(envelope => envelope.periodLimit > 0)
    ? state.envelopes
    : suggestEnvelopeBudgets({ ...state, savingGoal }, profile)
  return {
    ...state,
    savingGoal,
    envelopes,
    currentPeriodStart: isoDate(today),
    currentPeriodStartingBalance: state.currentBalance,
    currentPeriodPlan: envelopes.map(envelope => ({ category: envelope.name, limit: envelope.periodLimit })),
    currentTransfers: [],
    coachProfile: profile,
    setupComplete: true,
  }
}

export function nextOccurrence(item: IncomeItem, from: Date, fallbackInterval?: number): Date {
  const anchor = parseIso(item.anchorDate)
  if (item.cadence === 'monthly') {
    for (let offset = 0; offset <= 2; offset += 1) {
      const candidate = clampDayToMonth(from.getFullYear(), from.getMonth() + offset, anchor.getDate())
      if (!isBeforeDate(candidate, from)) return candidate
    }
    return clampDayToMonth(from.getFullYear(), from.getMonth() + 3, anchor.getDate())
  }

  if (item.cadence === 'weekly' || item.cadence === 'biweekly') {
    const step = item.cadence === 'weekly' ? 7 : 14
    const n = Math.max(0, Math.ceil(daysBetween(anchor, from) / step))
    return addDays(anchor, n * step)
  }

  const interval = Math.max(1, item.estIntervalDays ?? fallbackInterval ?? 30)
  let candidate = anchor
  while (isBeforeDate(candidate, from)) {
    candidate = addDays(candidate, interval)
  }
  return candidate
}

export function estimateInterval(state: BudgetState) {
  const dates = state.periods
    .map(period => parseIso(period.endDate))
    .sort((a, b) => a.getTime() - b.getTime())
  if (dates.length < 2) return undefined
  const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date))
  return Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length)
}

export function periodBounds(state: BudgetState, today: Date) {
  const start = parseIso(state.currentPeriodStart)
  const fallbackInterval = estimateInterval(state)

  if (state.incomes.length > 0) {
    const candidates = state.incomes.map(item => nextOccurrence(item, addDays(start, 1), fallbackInterval))
    const end = candidates.reduce((min, date) => isBeforeDate(date, min) ? date : min, candidates[0])
    return { start, end, overdue: isBeforeOrSameDate(end, today) }
  }

  if (state.noIncomeMode === 'targetDate' && state.targetDate) {
    const end = parseIso(state.targetDate)
    return { start, end, overdue: isBeforeOrSameDate(end, today) }
  }

  const end = addDays(start, 30)
  return { start, end, overdue: isBeforeOrSameDate(end, today) }
}

function deriveMode(state: BudgetState) {
  if (state.incomes.length > 0) return 'income'
  return state.noIncomeMode
}

function deriveModeLabel(state: BudgetState) {
  const mode = deriveMode(state)
  if (mode === 'income') return '다음 입금일까지'
  if (mode === 'targetDate') return '목표일까지'
  return '페이스 관리 중'
}

export function projectRunway(state: BudgetState, today: Date) {
  const startKey = isoDate(addDays(today, -14))
  const endKey = isoDate(today)
  const recentExpenses = state.expenses.filter(item => item.date >= startKey && item.date <= endKey)
  const recentTotal = recentExpenses.reduce((sum, item) => sum + item.amount, 0)
  if (recentTotal <= 0) return null
  const earliestKey = recentExpenses.reduce((min, item) => item.date < min ? item.date : min, endKey)
  const rawDays = daysBetween(parseIso(earliestKey), today) + 1
  const daysOfHistory = Math.min(14, Math.max(7, rawDays))
  const avgDaily = recentTotal / daysOfHistory
  if (avgDaily <= 0) return null
  return Math.floor(state.currentBalance / avgDaily)
}

export function calculateEnvelopeStatus(state: BudgetState, date: Date) {
  const { start } = periodBounds(state, date)
  const startKey = isoDate(start)
  const todayKey = isoDate(date)
  const spentByEnvelope = state.expenses
    .filter(item => item.date >= startKey && item.date <= todayKey)
    .reduce<Record<string, number>>((totals, item) => {
      totals[item.category] = (totals[item.category] ?? 0) + item.amount
      return totals
    }, {})

  return state.envelopes.map(envelope => {
    const spent = spentByEnvelope[envelope.name] ?? 0
    const remaining = envelope.periodLimit - spent
    const usageRatio = envelope.periodLimit > 0 ? spent / envelope.periodLimit : 0
    const warning = remaining < 0
      ? 'over'
      : usageRatio >= 0.8
        ? 'watch'
        : 'safe'
    return {
      ...envelope,
      spent,
      remaining,
      usageRatio,
      warning,
    }
  })
}

function recurringAmountBetween(
  items: { day: number; amount: number }[],
  startDate: Date,
  endDate: Date,
  includeEndDate = true,
) {
  if (isBeforeDate(endDate, startDate)) return 0
  const monthSpan = Math.max(
    2,
    (endDate.getFullYear() - startDate.getFullYear()) * 12
    + (endDate.getMonth() - startDate.getMonth()),
  )
  let sum = 0
  for (let monthOffset = 0; monthOffset <= monthSpan; monthOffset += 1) {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth() + monthOffset, 1)
    items.forEach(item => {
      const itemDate = dateWithMonthDay(cursor.getFullYear(), cursor.getMonth(), item.day)
      const afterStart = isAfterOrSameDate(itemDate, startDate)
      const beforeEnd = includeEndDate ? isBeforeOrSameDate(itemDate, endDate) : isBeforeDate(itemDate, endDate)
      if (afterStart && beforeEnd) sum += item.amount
    })
  }
  return sum
}

function lifestyleOption(type: LifestyleType) {
  return LIFESTYLE_OPTIONS.find(option => option.key === type) ?? LIFESTYLE_OPTIONS[1]
}

function weightForDate(date: Date, lifestyleType: LifestyleType) {
  const option = lifestyleOption(lifestyleType)
  return isWeekend(date) ? option.weekendWeight : option.weekdayWeight
}

function allowanceForDate(date: Date, plan: ReturnType<typeof calculatePlan>, lifestyleType: LifestyleType, today: Date) {
  const dateKey = isoDate(date)
  const todayKey = isoDate(today)
  if (dateKey > todayKey) {
    return plan.futureDailyUnit * weightForDate(date, lifestyleType)
  }
  return plan.dailyUnit * weightForDate(date, lifestyleType)
}

function spendingTone(spent: number, allowance: number) {
  if (spent <= 0) return 'none'
  return spent > allowance ? 'over' : 'under'
}

function dayTone(state: BudgetState, dateKey: string, spent: number, allowance: number) {
  if (isNoSpendDate(state, dateKey)) return 'under'
  if (allowance <= 0) return 'none'
  return spendingTone(spent, allowance)
}

export function calculatePlan(state: BudgetState, today: Date) {
  const { start, end, overdue } = periodBounds(state, today)
  const endForCalc = end
  const todaySpent = sumForDate(state, isoDate(today))
  const savingReserved = derivedSavingForPeriod(state, state.coachProfile, today)
  const fixedRemaining = recurringAmountBetween(state.fixedItems, today, endForCalc, false)

  if (overdue) {
    return {
      periodStart: start,
      periodEnd: end,
      daysUntilEnd: 0,
      overdue,
      dailyUnit: 0,
      futureDailyUnit: 0,
      todayAllowance: 0,
      todaySpent,
      todayRemaining: -todaySpent,
      fixedRemaining,
      savingReserved,
      mode: deriveMode(state),
      modeLabel: deriveModeLabel(state),
      runwayDays: projectRunway(state, today),
    }
  }

  let remainingWeightedDays = 0
  for (let cursor = new Date(today); isBeforeDate(cursor, endForCalc); cursor = addDays(cursor, 1)) {
    remainingWeightedDays += weightForDate(cursor, state.lifestyleType)
  }

  const basePool = Math.max(0, state.currentBalance + todaySpent - fixedRemaining - savingReserved)
  const dailyUnit = remainingWeightedDays > 0 ? basePool / remainingWeightedDays : 0
  const todayWeight = weightForDate(today, state.lifestyleType)
  const todayAllowance = dailyUnit * todayWeight
  const futureWeightedDays = Math.max(0, remainingWeightedDays - todayWeight)
  const futureBasePool = Math.max(0, state.currentBalance - fixedRemaining - savingReserved)
  const futureDailyUnit = futureWeightedDays > 0 ? futureBasePool / futureWeightedDays : 0

  return {
    periodStart: start,
    periodEnd: end,
    daysUntilEnd: Math.max(0, daysBetween(today, end)),
    overdue,
    dailyUnit,
    futureDailyUnit,
    todayAllowance,
    todaySpent,
    todayRemaining: todayAllowance - todaySpent,
    fixedRemaining,
    savingReserved,
    mode: deriveMode(state),
    modeLabel: deriveModeLabel(state),
    runwayDays: projectRunway(state, today),
  }
}

export function stateAfterAddExpense(state: BudgetState, record: ExpenseRecord): BudgetState {
  return {
    ...state,
    currentBalance: state.currentBalance - record.amount,
    noSpendDates: state.noSpendDates.filter(item => item !== record.date),
    expenses: [...state.expenses, record],
  }
}

export function stateAfterDeleteExpense(state: BudgetState, id: string): BudgetState {
  const target = state.expenses.find(item => item.id === id)
  if (!target) return state
  return {
    ...state,
    currentBalance: state.currentBalance + target.amount,
    expenses: state.expenses.filter(item => item.id !== id),
  }
}

export function stateAfterUpdateExpense(state: BudgetState, id: string, updates: Pick<ExpenseRecord, 'amount' | 'memo' | 'category'>): BudgetState {
  const target = state.expenses.find(item => item.id === id)
  if (!target) return state
  return {
    ...state,
    currentBalance: state.currentBalance + target.amount - updates.amount,
    expenses: state.expenses.map(item => item.id === id ? { ...item, ...updates } : item),
  }
}

export function transferEnvelope(state: BudgetState, from: Category, to: Category, amount: number): BudgetState {
  return {
    ...state,
    envelopes: state.envelopes.map(envelope => {
      if (envelope.name === from) return { ...envelope, periodLimit: envelope.periodLimit - amount }
      if (envelope.name === to) return { ...envelope, periodLimit: envelope.periodLimit + amount }
      return envelope
    }),
    currentTransfers: [...state.currentTransfers, { from, to, amount, at: new Date().toISOString() }],
  }
}

export function closePeriod(state: BudgetState, today: Date, newBalance: number): BudgetState {
  const endKey = isoDate(today)
  const actualByCategory = calculateEnvelopeStatus(state, today)
    .map(envelope => ({ category: envelope.name, amount: envelope.spent }))
  const snapshot: PeriodSnapshot = {
    id: makeId(),
    startDate: state.currentPeriodStart,
    endDate: endKey,
    startingBalance: state.currentPeriodStartingBalance,
    confirmedIncome: newBalance - state.currentBalance,
    envelopePlan: state.currentPeriodPlan,
    transfers: state.currentTransfers,
    actualByCategory,
  }
  const periodsAfter = [...state.periods, snapshot]
  const nextStateForRecalc = { ...state, currentBalance: newBalance, currentPeriodStart: endKey, periods: periodsAfter }
  const savingBreakdown = suggestSavingBreakdown(nextStateForRecalc, state.coachProfile, today)
  const newSavingGoal = state.savingEnabled ? savingBreakdown.perCycle : 0
  const stateAfterSaving = { ...nextStateForRecalc, savingGoal: newSavingGoal }
  const newEnvelopes = suggestEnvelopeBudgets(stateAfterSaving, state.coachProfile)
  return {
    ...state,
    currentBalance: newBalance,
    currentPeriodStart: endKey,
    currentPeriodStartingBalance: newBalance,
    currentPeriodPlan: newEnvelopes.map(envelope => ({ category: envelope.name, limit: envelope.periodLimit })),
    currentTransfers: [],
    periods: periodsAfter,
    envelopes: newEnvelopes,
    savingGoal: newSavingGoal,
  }
}

export function closePeriodNoIncome(state: BudgetState, today: Date): BudgetState {
  return closePeriod(state, today, state.currentBalance)
}

function Field({
  label,
  value,
  onChange,
  keyboardType = 'numeric',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={colors.subtle}
      />
    </View>
  )
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field
      label={label}
      value={value ? value.toLocaleString('ko-KR') : ''}
      onChange={text => onChange(numeric(text))}
      keyboardType="numeric"
    />
  )
}

function DayInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(`${value}`)
  const previousText = useRef(`${value}`)

  useEffect(() => {
    const nextText = `${value}`
    previousText.current = nextText
    setText(nextText)
  }, [value])

  function commit(nextText = text) {
    const nextValue = numeric(nextText)
    if (!nextValue) {
      setText(previousText.current)
      return
    }
    const clamped = nextValue ? clampDay(nextValue) : 1
    const committedText = `${clamped}`
    previousText.current = committedText
    setText(committedText)
    onChange(clamped)
  }

  return (
    <TextInput
      style={[styles.input, styles.dayInput]}
      value={text}
      keyboardType="numeric"
      selectTextOnFocus
      onChangeText={nextText => {
        const digits = nextText.replace(/[^\d]/g, '')
        setText(digits)
      }}
      onEndEditing={() => commit()}
      onBlur={() => commit()}
      maxLength={2}
      placeholder="일"
      placeholderTextColor={colors.subtle}
    />
  )
}

function DayField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <DayInput value={value} onChange={onChange} />
    </View>
  )
}

function DateField({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.field} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateButton}>
        <Text style={styles.dateButtonText}>{value ?? '날짜 선택'}</Text>
      </View>
    </TouchableOpacity>
  )
}

function LifestylePicker({ value, onChange }: { value: LifestyleType; onChange: (value: LifestyleType) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>생활 패턴</Text>
      {LIFESTYLE_OPTIONS.map(option => (
        <TouchableOpacity
          key={option.key}
          style={[styles.lifestyleOption, value === option.key && styles.lifestyleOptionActive]}
          onPress={() => onChange(option.key)}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.lifestyleTitle, value === option.key && styles.lifestyleTitleActive]}>{option.title}</Text>
            <Text style={styles.lifestyleDescription}>{option.description}</Text>
          </View>
          <Text style={styles.lifestyleWeight}>
            평 {option.weekdayWeight} / 주 {option.weekendWeight}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function ExpenseRow({ item, onEdit, onDelete }: { item: ExpenseRecord; onEdit?: () => void; onDelete: () => void }) {
  const hasMemo = item.memo.trim().length > 0
  const time = new Date(item.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseMemo}>{hasMemo ? item.memo : item.category}</Text>
        <Text style={styles.expenseSub}>{hasMemo ? `${item.category} · ${time}` : time}</Text>
      </View>
      <Text style={styles.expenseAmount}>{money(item.amount)}</Text>
      {onEdit && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${money(item.amount)} 지출 수정`}
        >
          <IconEdit size={18} color={colors.muted} strokeWidth={2} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`${money(item.amount)} 지출 삭제`}
      >
        <IconTrash size={18} color={colors.danger} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}

function CoachQuestionCard({
  question,
  description,
  options,
  value,
  onChange,
}: {
  question: string
  description: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <View style={styles.coachQuestionCard}>
      <Text style={styles.coachEyebrow}>예산 코치</Text>
      <Text style={styles.coachQuestion}>{question}</Text>
      <Text style={styles.coachDescription}>{description}</Text>
      <View style={styles.coachOptionGrid}>
        {options.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[styles.coachOption, value === option.value && styles.coachOptionActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.coachOptionText, value === option.value && styles.coachOptionTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function BreakdownRow({ label, value, tone }: { label: string; value: string; tone?: 'plus' | 'minus' }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[
        styles.breakdownValue,
        tone === 'plus' && styles.breakdownPlus,
        tone === 'minus' && styles.breakdownMinus,
      ]}>
        {value}
      </Text>
    </View>
  )
}

function fontFamilyForWeight(weight?: string): string {
  switch (weight) {
    case '900': return 'Pretendard-Black'
    case '800': return 'Pretendard-ExtraBold'
    case '700': return 'Pretendard-Bold'
    case '500': return 'Pretendard-Medium'
    default: return 'Pretendard-Regular'
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('./assets/fonts/Pretendard-ExtraBold.otf'),
    'Pretendard-Black': require('./assets/fonts/Pretendard-Black.otf'),
  })
  useEffect(() => {
    if (!fontsLoaded) return
    const TextAny = Text as unknown as { defaultProps?: { style?: unknown } }
    TextAny.defaultProps = TextAny.defaultProps ?? {}
    TextAny.defaultProps.style = [{ fontFamily: 'Pretendard-Regular' }, TextAny.defaultProps.style]
    const InputAny = TextInput as unknown as { defaultProps?: { style?: unknown } }
    InputAny.defaultProps = InputAny.defaultProps ?? {}
    InputAny.defaultProps.style = [{ fontFamily: 'Pretendard-Regular' }, InputAny.defaultProps.style]
  }, [fontsLoaded])

  const [state, setState] = useState<BudgetState>(initialState)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [quickAmount, setQuickAmount] = useState('')
  const [quickMemo, setQuickMemo] = useState('')
  const [quickCategory, setQuickCategory] = useState<Category>('식비')
  const [coachProfile, setCoachProfile] = useState<BudgetCoachProfile>(initialCoachProfile)
  const [setupStep, setSetupStep] = useState(0)
  const [incomeSetupMode, setIncomeSetupMode] = useState<IncomeSetupMode>('regular')
  const [setupReturnStep, setSetupReturnStep] = useState<number | null>(null)
  const [balanceHelperOpen, setBalanceHelperOpen] = useState(false)
  const [helperAccountBalance, setHelperAccountBalance] = useState(0)
  const [helperCommitted, setHelperCommitted] = useState(0)
  const resultSeededRef = useRef(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalAmount, setModalAmount] = useState('')
  const [modalMemo, setModalMemo] = useState('')
  const [modalCategory, setModalCategory] = useState<Category>('식비')
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [datePickerTarget, setDatePickerTarget] = useState<{ kind: 'income'; id: string } | { kind: 'targetDate' } | null>(null)
  const [incomeConfirmOpen, setIncomeConfirmOpen] = useState(false)
  const [incomeConfirmBalance, setIncomeConfirmBalance] = useState(0)
  const [incomePromptDismissed, setIncomePromptDismissed] = useState(false)
  const [reportSnapshot, setReportSnapshot] = useState<PeriodSnapshot | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferFrom, setTransferFrom] = useState<Category>('쇼핑')
  const [transferTo, setTransferTo] = useState<Category>('식비')
  const [transferAmount, setTransferAmount] = useState(0)
  const quickMemoRef = useRef<TextInput>(null)
  const modalMemoRef = useRef<TextInput>(null)
  const today = useMemo(() => new Date(), [])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const todayKey = isoDate(today)
  const plan = calculatePlan(state, today)
  const envelopeStatuses = calculateEnvelopeStatus(state, today)
  const atSetupResult = SETUP_STEPS[setupStep]?.kind === 'result'

  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub.remove()
  }, [])

  const fadeIn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!loaded) return
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [loaded, fadeIn, reduceMotion])

  const heroPulse = useRef(new Animated.Value(1)).current
  const isOverBudget = plan.todayRemaining < 0
  useEffect(() => {
    if (!isOverBudget || reduceMotion) {
      heroPulse.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, { toValue: 1.04, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(heroPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      { iterations: 3 },
    )
    loop.start()
    return () => loop.stop()
  }, [isOverBudget, heroPulse, reduceMotion])

  const expenseCount = state.expenses.length
  const expenseBounce = useRef(new Animated.Value(1)).current
  const lastExpenseCountRef = useRef(expenseCount)
  useEffect(() => {
    if (expenseCount > lastExpenseCountRef.current && !reduceMotion) {
      Animated.sequence([
        Animated.spring(expenseBounce, { toValue: 1.06, useNativeDriver: true, friction: 4, tension: 200 }),
        Animated.spring(expenseBounce, { toValue: 1, useNativeDriver: true, friction: 5, tension: 180 }),
      ]).start()
    }
    lastExpenseCountRef.current = expenseCount
  }, [expenseCount, expenseBounce, reduceMotion])

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (value) {
          try {
            const saved = JSON.parse(value)
            setState(sanitizeBudgetState(saved))
          } catch {
            AsyncStorage.removeItem(STORAGE_KEY)
          }
        }
      })
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [loaded, state])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        Keyboard.dismiss()
      }
      setKeyboardVisible(false)
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!loaded || !state.setupComplete || state.incomes.length > 0) return
    if (!periodBounds(state, today).overdue) return
    setState(prev => closePeriodNoIncome(prev, today))
  }, [loaded, state.setupComplete, state.incomes.length, state.currentPeriodStart, state.noIncomeMode, state.targetDate, today])

  // 결과 스텝에 처음 들어올 때 한 번, 제안 저축액·예산을 실제 state에 시드한다.
  // 이후 입력칸은 state에 직접 바인딩되므로 사용자가 손본 값이 유지된다.
  // 스텝을 벗어나면 가드를 풀어, 답변을 바꾸고 다시 들어오면 새 제안으로 다시 시드한다.
  useEffect(() => {
    if (!atSetupResult) {
      resultSeededRef.current = false
      return
    }
    if (resultSeededRef.current) return
    resultSeededRef.current = true
    setState(prev => {
      const saving = prev.savingEnabled ? suggestSavingAmount(prev, coachProfile) : 0
      return {
        ...prev,
        savingGoal: saving,
        envelopes: suggestEnvelopeBudgets({ ...prev, savingGoal: saving }, coachProfile),
      }
    })
  }, [atSetupResult, coachProfile])

  async function exportBackup() {
    try {
      const json = JSON.stringify(state, null, 2)
      const stamp = isoDate(new Date())
      const uri = `${FileSystem.documentDirectory}budget-backup-${stamp}.json`
      await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 })
      const available = await Sharing.isAvailableAsync()
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: '예산 데이터 백업' })
        hapticSuccess()
      } else {
        Alert.alert('내보내기', `파일을 ${uri} 에 저장했습니다.`)
      }
    } catch (e) {
      Alert.alert('내보내기 실패', String(e))
    }
  }

  async function importBackup() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true })
      if (result.canceled || !result.assets?.[0]) return
      const file = result.assets[0]
      const text = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 })
      const parsed = JSON.parse(text)
      const next = sanitizeBudgetState(parsed)
      Alert.alert('불러오기', '현재 데이터를 덮어씁니다. 진행할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '덮어쓰기',
          style: 'destructive',
          onPress: () => {
            setState(next)
            hapticSuccess()
          },
        },
      ])
    } catch (e) {
      Alert.alert('불러오기 실패', String(e))
    }
  }

  function patch(next: Partial<BudgetState>) {
    setState(prev => ({ ...prev, ...next }))
  }

  function addExpense(date: string, amountText: string, memo: string, category: Category) {
    const amount = numeric(amountText)
    if (!amount) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      Alert.alert('금액 입력', '쓴 금액을 입력해주세요.')
      return false
    }
    const record: ExpenseRecord = {
      id: makeId(),
      date,
      amount,
      memo: memo.trim(),
      category,
      createdAt: new Date().toISOString(),
    }
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setState(prev => stateAfterAddExpense(prev, record))
    hapticSuccess()
    return true
  }

  function deleteExpense(id: string) {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setState(prev => stateAfterDeleteExpense(prev, id))
  }

  function toggleNoSpend(dateKey: string) {
    setState(prev => {
      const enabled = prev.noSpendDates.includes(dateKey)
      if (!enabled) {
        hapticSuccess()
        const total = prev.noSpendDates.length + 1
        const message = total >= 5 ? `벌써 ${total}일 무지출! 멋져요 🌱` : '오늘 무지출! 한 걸음 더 가까워졌어요'
        Alert.alert('무지출 달성', message)
      }
      return {
        ...prev,
        noSpendDates: enabled
          ? prev.noSpendDates.filter(item => item !== dateKey)
          : [...prev.noSpendDates, dateKey],
      }
    })
  }

  function startEditingExpense(item: ExpenseRecord) {
    setEditingExpenseId(item.id)
    setModalAmount(item.amount.toLocaleString('ko-KR'))
    setModalMemo(item.memo)
    setModalCategory(item.category)
  }

  function saveModalExpense() {
    if (!selectedDate) return
    const amount = numeric(modalAmount)
    if (!amount) {
      Alert.alert('금액 입력', '쓴 금액을 입력해주세요.')
      return
    }
    if (editingExpenseId) {
      setState(prev => stateAfterUpdateExpense(prev, editingExpenseId, { amount, memo: modalMemo.trim(), category: modalCategory }))
      setEditingExpenseId(null)
    } else {
      const saved = addExpense(selectedDate, modalAmount, modalMemo, modalCategory)
      if (!saved) return
    }
    setModalAmount('')
    setModalMemo('')
    Keyboard.dismiss()
  }

  function closeExpenseModal() {
    setSelectedDate(null)
    setEditingExpenseId(null)
    setModalAmount('')
    setModalMemo('')
    Keyboard.dismiss()
  }

  function addIncome() {
    const cadence: Cadence = incomeSetupMode === 'irregular' ? 'irregular' : 'monthly'
    patch({
      incomes: [
        ...state.incomes,
        {
          id: makeId(),
          name: cadence === 'irregular' ? '' : '월급',
          amount: null,
          cadence,
          anchorDate: isoDate(clampDayToMonth(today.getFullYear(), today.getMonth(), cadence === 'monthly' ? 25 : today.getDate())),
          ...(cadence === 'irregular' ? { estIntervalDays: 30 } : {}),
        },
      ],
    })
  }

  function chooseNoIncome() {
    patch({ incomes: [], noIncomeMode: state.noIncomeMode ?? 'openEnded' })
  }

  function updateIncome(id: string, updates: Partial<IncomeItem>) {
    const next = state.incomes.map(item => item.id === id ? { ...item, ...updates } : item)
    patch({ incomes: next })
  }

  function addFixed() {
    patch({ fixedItems: [...state.fixedItems, { id: makeId(), name: '', day: 25, amount: 0 }] })
  }

  function updateEnvelope(id: string, updates: Omit<Partial<BudgetEnvelope>, 'name'> & { name?: string }) {
    const { name, ...rest } = updates
    const normalizedUpdates: Partial<BudgetEnvelope> = {
      ...rest,
      ...(typeof name === 'string' ? { name: normalizeCategory(name) } : {}),
    }
    patch({ envelopes: state.envelopes.map(item => item.id === id ? { ...item, ...normalizedUpdates } : item) })
  }

  function updateSetupEnvelopeLimit(id: string, periodLimit: number) {
    const target = state.envelopes.find(envelope => envelope.id === id)
    if (!target) return
    if (target.name === '기타') {
      patch({ envelopes: state.envelopes.map(envelope => envelope.id === id ? { ...envelope, periodLimit } : envelope) })
      return
    }
    const delta = periodLimit - target.periodLimit
    patch({
      envelopes: state.envelopes.map(envelope => {
        if (envelope.id === id) return { ...envelope, periodLimit }
        if (envelope.name === '기타') return { ...envelope, periodLimit: envelope.periodLimit - delta }
        return envelope
      }),
    })
  }

  function updateFixed(id: string, updates: Partial<FixedItem>) {
    const next = state.fixedItems.map(item => item.id === id ? { ...item, ...updates } : item)
    patch({ fixedItems: next })
  }

  function handleDatePicked(date?: Date) {
    if (!datePickerTarget || !date) {
      setDatePickerTarget(null)
      return
    }
    const dateKey = isoDate(date)
    if (datePickerTarget.kind === 'income') {
      updateIncome(datePickerTarget.id, { anchorDate: dateKey })
    } else {
      patch({ targetDate: dateKey })
    }
    setDatePickerTarget(null)
  }

  function openIncomeConfirm() {
    const expectedIncome = state.incomes[0]?.amount ?? 0
    setIncomeConfirmBalance(state.currentBalance + expectedIncome)
    setIncomeConfirmOpen(true)
  }

  function confirmIncomeBalance() {
    Alert.alert('입금 확인', '이 잔액으로 다음 입금까지의 예산을 다시 잡을까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '확정',
        onPress: () => {
          const next = closePeriod(state, today, incomeConfirmBalance)
          setState(next)
          setReportSnapshot(next.periods[next.periods.length - 1] ?? null)
          setIncomeConfirmOpen(false)
          setIncomePromptDismissed(false)
        },
      },
    ])
  }

  function closeIncomeConfirm() {
    setIncomeConfirmOpen(false)
    setIncomeConfirmBalance(0)
  }

  function closeTransferModal() {
    setTransferOpen(false)
    setTransferAmount(0)
    setTransferFrom('쇼핑')
    setTransferTo('식비')
  }

  function closeReportModal() {
    setReportSnapshot(null)
  }

  function submitEnvelopeTransfer() {
    const invalid = !transferAmount || transferFrom === transferTo
    if (invalid && transferFrom === transferTo) {
      Alert.alert('예산 선택', '서로 다른 예산을 선택해주세요.')
      return
    }
    if (!transferAmount) {
      Alert.alert('금액 입력', '옮길 금액을 입력해주세요.')
      return
    }
    setState(prev => transferEnvelope(prev, transferFrom, transferTo, transferAmount))
    Alert.alert('예산 이동 완료', `${transferFrom} → ${transferTo} ${money(transferAmount)} 옮겼어요. 총 예산은 그대로입니다.`)
    closeTransferModal()
  }

  function applyEnvelopeSuggestion() {
    const saving = state.savingEnabled ? suggestSavingAmount(state, coachProfile) : 0
    const livingBudget = monthPlannedLivingBudget({ ...state, savingGoal: saving })
    if (!livingBudget) {
      Alert.alert('먼저 기준을 입력해주세요', '생활비 잔액이나 들어올 돈을 입력하면 예산을 제안할 수 있어요.')
      return
    }
    patch({ savingGoal: saving, envelopes: suggestEnvelopeBudgets({ ...state, savingGoal: saving }, coachProfile) })
  }

  function renderSetup() {
    const savingStep = 11
    const resultStep = 12
    const totalSetupSteps = TOTAL_SETUP_STEPS
    const savingBreakdown = suggestSavingBreakdown(state, coachProfile, today)
    const suggestedSaving = state.savingEnabled ? savingBreakdown.firstPeriod : 0
    const fixedTotal = state.fixedItems.reduce((sum, item) => sum + item.amount, 0)
    const envelopeTotal = state.envelopes.reduce((sum, envelope) => sum + envelope.periodLimit, 0)
    const helperFreeBalance = Math.max(helperAccountBalance - helperCommitted, 0)
    const monthlyBudgets = monthlyEnvelopeBudgets(state, coachProfile)
    const monthlyBudgetTotal = CATEGORIES.reduce((sum, category) => sum + monthlyBudgets[category], 0)
    const monthlyBudgetPool = monthlyLivingBudget(state)
    const canStartSetup = state.currentBalance > 0 && (state.incomes.length > 0 || incomeSetupMode === 'none')

    function advanceSetup() {
      if (setupReturnStep !== null && setupStep !== resultStep) {
        setSetupStep(setupReturnStep)
        setSetupReturnStep(null)
        return
      }
      setSetupStep(prev => Math.min(prev + 1, resultStep))
    }

    function goBack() {
      setSetupStep(prev => Math.max(prev - 1, 0))
    }

    function makeIncome(cadence: Cadence): IncomeItem {
      return {
        id: makeId(),
        name: cadence === 'weekly' ? '주급' : cadence === 'irregular' ? '수입' : '월급',
        amount: null,
        cadence,
        anchorDate: isoDate(clampDayToMonth(today.getFullYear(), today.getMonth(), cadence === 'monthly' ? 25 : today.getDate())),
        ...(cadence === 'irregular' ? { estIntervalDays: 30 } : {}),
      }
    }

    function chooseIncomeMode(mode: IncomeSetupMode) {
      setIncomeSetupMode(mode)
      if (mode === 'none') {
        patch({ incomes: [], noIncomeMode: 'targetDate', targetDate: state.targetDate ?? isoDate(addDays(today, 30)) })
      } else {
        const cadence: Cadence = mode === 'irregular' ? 'irregular' : 'monthly'
        patch({ incomes: [makeIncome(cadence)] })
      }
      setSetupStep(2)
    }

    function goNext() {
      if (setupStep === 0 && state.currentBalance <= 0) {
        Alert.alert('잔액을 입력해주세요')
        return
      }
      if (setupStep === 2) {
        if (incomeSetupMode === 'none') {
          if (state.noIncomeMode === 'targetDate' && !state.targetDate) {
            Alert.alert('날짜를 선택해주세요', '이 돈으로 언제까지 써야 하는지 선택해주세요.')
            return
          }
        } else if (state.incomes.length === 0) {
          Alert.alert('수입을 입력해주세요', '수입 구조를 하나 이상 추가해주세요.')
          return
        }
      }
      advanceSetup()
    }

    function jumpToSetupStep(step: number) {
      setSetupReturnStep(resultStep)
      setSetupStep(step)
    }

    function finishSetup() {
      if (!canStartSetup) {
        Alert.alert('필수 정보 필요', '잔액과 수입 구조를 입력해주세요.')
        return
      }
      setState(prev => initializeSetupState(prev, coachProfile, today))
    }

    function renderIncomeFields(item: IncomeItem) {
      return (
        <View key={item.id} style={styles.incomeSetupCard}>
          <View style={styles.setupEditRow}>
            <View style={styles.setupNameField}>
              <Text style={styles.miniLabel}>이름</Text>
              <TextInput
                style={styles.input}
                value={item.name}
                onChangeText={name => updateIncome(item.id, { name })}
                placeholder="수입명"
                placeholderTextColor={colors.subtle}
                selectTextOnFocus
                autoCorrect={false}
                spellCheck={false}
              />
            </View>
            <View style={styles.setupMoneyField}>
              <Text style={styles.miniLabel}>금액 선택</Text>
              <TextInput
                style={styles.input}
                value={item.amount ? item.amount.toLocaleString('ko-KR') : ''}
                keyboardType="numeric"
                onChangeText={amount => updateIncome(item.id, { amount: amount.trim() ? numeric(amount) : null })}
                placeholder="미정"
                placeholderTextColor={colors.subtle}
              />
            </View>
            <TouchableOpacity
              style={styles.setupRemoveButton}
              onPress={() => confirmDestructive('수입 삭제', `${item.name || '이 수입'}을(를) 삭제할까요?`, () => patch({ incomes: state.incomes.filter(row => row.id !== item.id) }))}
              accessibilityRole="button"
              accessibilityLabel={`${item.name || '수입'} 삭제`}
            >
              <Text style={styles.removeText}>삭제</Text>
            </TouchableOpacity>
          </View>

          {incomeSetupMode === 'regular' && renderIncomeTimingRow(item)}
          {incomeSetupMode !== 'regular' && (
            <DateField
              label={item.cadence === 'irregular' ? '최근에 마지막으로 입금받은 날?' : '기준 입금일'}
              value={item.anchorDate}
              onPress={() => setDatePickerTarget({ kind: 'income', id: item.id })}
            />
          )}
          {item.cadence === 'irregular' && (
            <Field
              label="보통 며칠 간격으로 들어와요?"
              value={item.estIntervalDays ? `${item.estIntervalDays}` : ''}
              onChange={value => updateIncome(item.id, { estIntervalDays: numeric(value) || undefined })}
              keyboardType="numeric"
            />
          )}
        </View>
      )
    }

    function renderIncomeTimingRow(item: IncomeItem) {
      return (
        <View style={styles.incomeTimingRow}>
          <View style={styles.incomeCadenceChips}>
            {CADENCE_OPTIONS.filter(option => option.key !== 'irregular').map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.incomeCadenceChip, item.cadence === option.key && styles.chipActive]}
                onPress={() => updateIncome(item.id, incomeWithCadence(item, option.key))}
              >
                <Text style={[styles.chipText, item.cadence === option.key && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {item.cadence === 'monthly' ? (
            <View style={styles.inlineDayField}>
              <Text style={styles.miniLabel}>매달 며칠?</Text>
              <DayInput value={incomeDay(item)} onChange={day => updateIncome(item.id, incomeWithDay(item, day, today))} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <DateField label="기준 입금일" value={item.anchorDate} onPress={() => setDatePickerTarget({ kind: 'income', id: item.id })} />
            </View>
          )}
        </View>
      )
    }

    function renderSetupBody() {
      if (setupStep === 0) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>지금 통장에 있는 돈이{"\n"}얼마예요?</Text>
            <Text style={styles.setupQuestionCopy}>생활비로 쓸 통장 잔액 그대로 적어주세요. 저축은 마지막 단계에서 코치가 자동으로 떼어드려요.</Text>
            <MoneyInput label="통장 잔액" value={state.currentBalance} onChange={value => patch({ currentBalance: value })} />
            <TouchableOpacity style={styles.backButton} onPress={() => setBalanceHelperOpen(prev => !prev)}>
              <Text style={styles.addText}>카드값·약속된 돈이 있다면</Text>
            </TouchableOpacity>
            {balanceHelperOpen && (
              <View style={styles.suggestionCard}>
                <MoneyInput label="통장 전체 잔액" value={helperAccountBalance} onChange={setHelperAccountBalance} />
                <MoneyInput label="카드값·약속" value={helperCommitted} onChange={setHelperCommitted} />
                <BreakdownRow label="이번 입금까지 쓸 돈" value={money(helperFreeBalance)} tone="plus" />
                <TouchableOpacity
                  style={styles.setupPrimaryButton}
                  onPress={() => {
                    patch({ currentBalance: helperFreeBalance })
                    setBalanceHelperOpen(false)
                  }}
                >
                  <Text style={styles.setupPrimaryButtonText}>이 값으로 채우기</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )
      }

      if (setupStep === 1) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>돈은 어떻게 들어와요?</Text>
            <Text style={styles.setupQuestionCopy}>정기적이면 자동으로 다음 입금일을 계산해드려요. 들쭉날쭉이거나 지금 수입이 없어도 괜찮아요.</Text>
            {([
              ['regular', '정기적으로 들어와요', '월급·용돈·주급 등'],
              ['irregular', '들쭉날쭉이에요', '프리랜서·자영업'],
              ['none', '지금은 수입이 없어요', '취준·휴직·학생'],
            ] as [IncomeSetupMode, string, string][]).map(([mode, title, description]) => (
              <TouchableOpacity
                key={mode}
                style={[styles.lifestyleOption, incomeSetupMode === mode && styles.lifestyleOptionActive]}
                onPress={() => chooseIncomeMode(mode)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lifestyleTitle, incomeSetupMode === mode && styles.lifestyleTitleActive]}>{title}</Text>
                  <Text style={styles.lifestyleDescription}>{description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )
      }

      if (setupStep === 2) {
        return (
          <View style={styles.setupSingleQuestion}>
            {incomeSetupMode === 'none' ? (
              <View style={styles.setupSingleQuestion}>
                <Text style={styles.setupQuestionTitle}>이 돈으로 언제까지 써야 해요?</Text>
                <Text style={styles.setupQuestionCopy}>날짜가 있으면 목표일까지 나눠 쓰고, 없으면 30일 페이스로 관리해요.</Text>
                <View style={styles.chipGrid}>
                  <View style={styles.chipSlot}>
                    <TouchableOpacity
                      style={[styles.chip, state.noIncomeMode === 'targetDate' && styles.chipActive]}
                      onPress={() => patch({ noIncomeMode: 'targetDate', targetDate: state.targetDate ?? isoDate(addDays(today, 30)) })}
                    >
                      <Text style={[styles.chipText, state.noIncomeMode === 'targetDate' && styles.chipTextActive]}>특정 날짜까지</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chipSlot}>
                    <TouchableOpacity
                      style={[styles.chip, state.noIncomeMode === 'openEnded' && styles.chipActive]}
                      onPress={() => patch({ noIncomeMode: 'openEnded' })}
                    >
                      <Text style={[styles.chipText, state.noIncomeMode === 'openEnded' && styles.chipTextActive]}>정해진 날 없음</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {state.noIncomeMode === 'targetDate' && (
                  <DateField label="목표 날짜" value={state.targetDate} onPress={() => setDatePickerTarget({ kind: 'targetDate' })} />
                )}
              </View>
            ) : (
              <>
                <Text style={styles.setupQuestionTitle}>{incomeSetupMode === 'regular' ? '돈은 언제, 얼마씩 들어와요?' : '최근 수입 패턴을 알려주세요'}</Text>
                <Text style={styles.setupQuestionCopy}>금액은 비워도 됩니다. 다음 입금까지 며칠인지 계산할 때만 써요.</Text>
                {state.incomes.map(renderIncomeFields)}
                {state.incomes.length === 0 && (
                  <View style={styles.emptyBox}><Text style={styles.emptyText}>수입 구조를 하나 이상 추가해주세요.</Text></View>
                )}
                <TouchableOpacity style={styles.secondaryButton} onPress={addIncome}>
                  <Text style={styles.secondaryButtonText}>수입 추가</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )
      }

      if (setupStep === 3) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>매달 거의 고정으로 빠지는 돈이 있어요?</Text>
            <Text style={styles.setupQuestionCopy}>월세, 통신비, 구독, 보험, 헬스 같은 것들. 없으면 그냥 다음.</Text>
            <View style={styles.chipGrid}>
              {([
                ['solo', '자취'],
                ['family', '본가'],
                ['share', '룸쉐어'],
              ] as [HousingType, string][]).map(([housing, label]) => (
                <View key={housing} style={styles.chipSlot}>
                  <TouchableOpacity style={[styles.chip, state.housing === housing && styles.chipActive]} onPress={() => patch({ housing })}>
                    <Text style={[styles.chipText, state.housing === housing && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            {state.fixedItems.length === 0 && (
              <View style={styles.emptyBox}><Text style={styles.emptyText}>없으면 건너뛰어도 됩니다.</Text></View>
            )}
            {state.fixedItems.map(item => (
              <View key={item.id} style={styles.setupEditRow}>
                <View style={styles.setupNameField}>
                  <Text style={styles.miniLabel}>용도</Text>
                  <TextInput
                    style={styles.input}
                    value={item.name}
                    onChangeText={name => updateFixed(item.id, { name })}
                    placeholder="통신비"
                    placeholderTextColor={colors.subtle}
                    selectTextOnFocus
                    autoCorrect={false}
                    spellCheck={false}
                  />
                </View>
                <View style={styles.setupDayField}>
                  <Text style={styles.miniLabel}>날짜 (일)</Text>
                  <DayInput value={item.day} onChange={day => updateFixed(item.id, { day })} />
                </View>
                <View style={styles.setupMoneyField}>
                  <Text style={styles.miniLabel}>금액</Text>
                  <TextInput style={styles.input} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateFixed(item.id, { amount: numeric(amount) })} />
                </View>
                <TouchableOpacity
                  style={styles.setupRemoveButton}
                  onPress={() => confirmDestructive('고정 지출 삭제', `${item.name || '이 항목'}을(를) 삭제할까요?`, () => patch({ fixedItems: state.fixedItems.filter(row => row.id !== item.id) }))}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name || '고정 지출'} 삭제`}
                ><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.secondaryButton} onPress={addFixed}>
              <Text style={styles.secondaryButtonText}>고정 지출 추가</Text>
            </TouchableOpacity>
            <Text style={styles.helperText}>가스비처럼 겨울에 크게 늘어나는 항목은 연 평균값으로 잡으세요. 예: 여름 2만 / 겨울 7만이면 4만으로.</Text>
          </View>
        )
      }

      if (setupStep === 4) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>매달 자동으로 떼둘 돈이 있어요?</Text>
            <Text style={styles.setupQuestionCopy}>데이트 통장, 경조사처럼 매달 따로 묶어둘 돈이 있으면 적어요. 비워두면 모두 일일 예산에 포함돼요.</Text>
            <View style={styles.suggestionCard}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle}>데이트 통장</Text>
                  <Text style={styles.suggestionCopy}>공동 계좌를 굴리고 있으면 월 본인 부담액을 넣으세요.</Text>
                </View>
                <Switch
                  value={state.datePoolMonthly > 0}
                  onValueChange={enabled => patch({ datePoolMonthly: enabled ? state.datePoolMonthly || 100000 : 0 })}
                  trackColor={{ false: colors.borderMd, true: colors.teal }}
                  thumbColor={colors.surface}
                  ios_backgroundColor={colors.borderMd}
                />
              </View>
              {state.datePoolMonthly > 0 && (
                <MoneyInput label="월 본인 부담액" value={state.datePoolMonthly} onChange={value => patch({ datePoolMonthly: value })} />
              )}
            </View>
            <View style={styles.suggestionCard}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle}>이벤트 적립</Text>
                  <Text style={styles.suggestionCopy}>명절·생일·기념일 같은 갑작스러운 지출 대비. 권장 3-5만.</Text>
                </View>
                <Switch
                  value={state.eventReserveMonthly > 0}
                  onValueChange={enabled => patch({ eventReserveMonthly: enabled ? state.eventReserveMonthly || 40000 : 0 })}
                  trackColor={{ false: colors.borderMd, true: colors.teal }}
                  thumbColor={colors.surface}
                  ios_backgroundColor={colors.borderMd}
                />
              </View>
              {state.eventReserveMonthly > 0 && (
                <MoneyInput label="월 적립액" value={state.eventReserveMonthly} onChange={value => patch({ eventReserveMonthly: value })} />
              )}
            </View>
          </View>
        )
      }

      if (setupStep === 5) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>평일이랑 주말 소비 리듬은{"\n"}어때요?</Text>
            <Text style={styles.setupQuestionCopy}>하루한도가 요일마다 다르게 분배돼요. 모르면 균등형.</Text>
            <LifestylePicker value={state.lifestyleType} onChange={value => patch({ lifestyleType: value })} />
          </View>
        )
      }

      if (setupStep === 6) {
        return (
          <View style={styles.setupSingleQuestion}>
            <CoachQuestionCard
              question="평일 점심은 어떻게 해결해요?"
              description="점심과 저녁 답으로 식비 예산을 직접 계산해요."
              options={[
                { value: 'provided', label: '회사·학교에서 나와요' },
                { value: 'lunchbox', label: '도시락 싸 가요' },
                { value: 'buy', label: '사 먹어요' },
                { value: 'delivery', label: '배달도 자주' },
              ]}
              value={coachProfile.lunch}
              onChange={value => setCoachProfile(prev => ({ ...prev, lunch: value as BudgetCoachProfile['lunch'] }))}
            />
            <CoachQuestionCard
              question="저녁은 보통 어떻게?"
              description="저녁 패턴까지 합쳐 식비 월 예산을 잡아요."
              options={[
                { value: 'home', label: '거의 해먹어요' },
                { value: 'mixed', label: '반반 정도' },
                { value: 'buy', label: '거의 사 먹어요' },
              ]}
              value={coachProfile.dinner}
              onChange={value => setCoachProfile(prev => ({ ...prev, dinner: value as BudgetCoachProfile['dinner'] }))}
            />
          </View>
        )
      }

      if (setupStep === 7) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>친구 약속은 한 달에 어느 정도예요?</Text>
            <Field label="한 달 약속 횟수" value={`${coachProfile.socialFrequency}`} onChange={value => setCoachProfile(prev => ({ ...prev, socialFrequency: Math.min(30, numeric(value)) }))} keyboardType="numeric" />
            <MoneyInput label="한 번 평균 금액" value={coachProfile.socialPerVisit} onChange={value => setCoachProfile(prev => ({ ...prev, socialPerVisit: value }))} />
          </View>
        )
      }

      if (setupStep === 8) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>옷·물건 등 한 달에 평균 얼마 써요?</Text>
            <Text style={styles.setupQuestionCopy}>고정 구독 빼고. 옷·신발·가방·잡화 등.</Text>
            <MoneyInput label="쇼핑 월 평균" value={coachProfile.shoppingMonthly} onChange={value => setCoachProfile(prev => ({ ...prev, shoppingMonthly: value }))} />
          </View>
        )
      }

      if (setupStep === 9) {
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>콘텐츠에 한 달 얼마 써요?</Text>
            <Text style={styles.setupQuestionCopy}>고정 구독은 제외하고, 게임·영화·공연 같은 일회성 결제만.</Text>
            <MoneyInput label="콘텐츠 월 평균" value={coachProfile.contentMonthly} onChange={value => setCoachProfile(prev => ({ ...prev, contentMonthly: value }))} />
          </View>
        )
      }

      if (setupStep === 10) {
        return (
          <View style={styles.setupSingleQuestion}>
            <CoachQuestionCard
              question="평소 돈 관리 스타일은?"
              description="기타 예산 여유와 저축 기본 상태를 정해요."
              options={[
                { value: 'tight', label: '빡빡하게, 한 푼이라도 아끼는 편' },
                { value: 'balanced', label: '적당히 균형' },
                { value: 'loose', label: '넉넉하게 쓰는 편' },
              ]}
              value={coachProfile.moneyStyle}
              onChange={value => {
                const moneyStyle = value as BudgetCoachProfile['moneyStyle']
                const nextProfile = { ...coachProfile, moneyStyle }
                setCoachProfile(nextProfile)
                const nextBreakdown = suggestSavingBreakdown(state, nextProfile, today)
                patch({ savingEnabled: moneyStyle === 'tight', savingGoal: moneyStyle === 'tight' ? nextBreakdown.firstPeriod : 0 })
              }}
            />
          </View>
        )
      }

      if (setupStep === savingStep) {
        const breakdown = suggestSavingBreakdown(state, coachProfile, today)
        return (
          <View style={styles.setupSingleQuestion}>
            <Text style={styles.setupQuestionTitle}>코치가 잡은 저축액</Text>
            <Text style={styles.setupQuestionCopy}>지금까지 답한 내용으로 자동 계산했어요. 토글로 적용 여부만 정해주세요. 금액을 바꾸려면 코치를 다시 실행해요.</Text>
            <View style={styles.suggestionCard}>
              <View style={styles.switchRow}>
                <Text style={styles.suggestionTitle}>저축 적용</Text>
                <Switch
                  value={state.savingEnabled}
                  onValueChange={enabled => patch({
                    savingEnabled: enabled,
                    savingGoal: enabled ? breakdown.firstPeriod : 0,
                  })}
                  trackColor={{ false: colors.borderMd, true: colors.teal }}
                  thumbColor={colors.surface}
                  ios_backgroundColor={colors.borderMd}
                />
              </View>
              {state.savingEnabled ? (
                <View style={{ gap: 8 }}>
                  <BreakdownRow label="이번 입금까지" value={money(breakdown.firstPeriod)} tone="plus" />
                  <BreakdownRow label="다음 입금부터 매번" value={money(breakdown.perCycle)} tone="plus" />
                  <BreakdownRow label="월 환산" value={money(breakdown.monthly)} />
                  <Text style={styles.suggestionCopy}>
                    이번 입금까지는 지금 통장 잔액에서 생활비를 빼고 남는 만큼 저축해요.{"\n"}
                    다음 입금부터는 매 입금마다 같은 금액을 자동으로 떼둡니다.
                  </Text>
                </View>
              ) : (
                <Text style={styles.suggestionCopy}>저축을 끄면 모든 금액을 일일 예산으로 굴려요. 언제든 다시 켤 수 있어요.</Text>
              )}
            </View>
          </View>
        )
      }

      return (
        <View style={styles.setupSingleQuestion}>
          <Text style={styles.setupQuestionTitle}>이렇게 시작할게요</Text>
          <Text style={styles.setupQuestionCopy}>입력한 값으로 이번 입금까지의 예산을 만들어요. 봉투는 바로 수정할 수 있어요.</Text>
          <View style={styles.suggestionCard}>
            <BreakdownRow label="한 달 가용" value={money(monthlyBudgetPool)} tone="plus" />
            <BreakdownRow label="이번 입금까지 예산 합" value={money(envelopeTotal)} tone="plus" />
            {monthlyBudgets.기타 < 10000 && (
              <Text style={styles.dangerText}>이 라이프엔 가용이 부족해요. 저축·데통 양보하거나 예산을 조정하세요.</Text>
            )}
            {monthlyBudgetTotal > monthlyBudgetPool && (
              <Text style={styles.dangerText}>가용보다 {money(monthlyBudgetTotal - monthlyBudgetPool)} 초과. 다른 예산을 줄이거나 자동 차감을 조정하세요.</Text>
            )}
          </View>
          <View style={styles.suggestionCard}>
            <BreakdownRow label="현재 잔액" value={money(state.currentBalance)} />
            <BreakdownRow label="다음 보충 시점" value={deriveModeLabel(state)} />
            <BreakdownRow label="이번 입금까지 고정지출" value={money(fixedTotal)} />
            {state.savingEnabled ? (
              <>
                <BreakdownRow label="저축 (이번 입금까지)" value={money(savingBreakdown.firstPeriod)} tone="plus" />
                <BreakdownRow label="저축 (다음부터 매 입금)" value={money(savingBreakdown.perCycle)} tone="plus" />
                <BreakdownRow label="저축 (월 환산)" value={money(savingBreakdown.monthly)} />
              </>
            ) : (
              <BreakdownRow label="저축" value="OFF" />
            )}
            <BreakdownRow label="데이트 통장" value={money(state.datePoolMonthly)} />
            <BreakdownRow label="이벤트 적립" value={money(state.eventReserveMonthly)} />
            <View style={styles.breakdownDivider} />
            <BreakdownRow label="6개 예산 합" value={money(envelopeTotal)} tone="plus" />
          </View>
          {state.envelopes.map(envelope => (
            <View key={envelope.id} style={styles.setupEnvelopeRow}>
              <View style={styles.setupEnvelopeNameField}>
                <Text style={styles.miniLabel}>예산</Text>
                <TextInput
                  style={styles.input}
                  value={envelope.name}
                  onChangeText={name => updateEnvelope(envelope.id, { name })}
                  placeholder="식비"
                  placeholderTextColor={colors.subtle}
                  selectTextOnFocus
                  autoCorrect={false}
                  spellCheck={false}
                />
              </View>
              <View style={styles.setupEnvelopeMoneyField}>
                <Text style={styles.miniLabel}>이번 입금까지</Text>
                <TextInput
                  style={styles.input}
                  value={envelope.periodLimit ? envelope.periodLimit.toLocaleString('ko-KR') : ''}
                  keyboardType="numeric"
                  onChangeText={amount => updateSetupEnvelopeLimit(envelope.id, numeric(amount))}
                  placeholder="0"
                  placeholderTextColor={colors.subtle}
                />
              </View>
              <Text style={styles.emptyText}>월 환산 {money(monthlyBudgets[envelope.name])}</Text>
            </View>
          ))}
        </View>
      )
    }

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={false}
        style={styles.setupScreen}
        contentContainerStyle={[styles.setupContent, keyboardVisible && styles.setupContentKeyboard]}
      >
        <View style={styles.setupMain}>
          <View style={styles.setupIntro}>
            <Text style={styles.setupIntroTitle}>처음엔 몇 가지만 물어볼게요</Text>
            <Text style={styles.setupIntroCopy}>
              수입일, 고정 지출, 평소 소비 리듬을 바탕으로{"\n"}오늘 얼마까지 써도 되는지 계산해드릴게요.
            </Text>
          </View>
          <View style={styles.setupQuestionShell}>
            <View style={styles.setupProgressRow}>
              <Text style={styles.setupProgress}>{Math.min(setupStep + 1, totalSetupSteps)} / {totalSetupSteps}</Text>
              <View style={styles.setupProgressTrack}>
                <View
                  style={[
                    styles.setupProgressFill,
                    { width: `${Math.min(((setupStep + 1) / totalSetupSteps) * 100, 100)}%` },
                  ]}
                />
              </View>
            </View>
            {renderSetupBody()}
          </View>

          <View style={styles.setupNavRow}>
            {setupStep > 0 ? (
              <TouchableOpacity style={[styles.secondaryButton, styles.setupNavButton]} onPress={goBack}>
                <Text style={styles.secondaryButtonText}>이전</Text>
              </TouchableOpacity>
            ) : <View style={styles.setupNavButton} />}
            {setupStep === resultStep && (
              <TouchableOpacity style={[styles.secondaryButton, styles.setupNavButton]} onPress={() => jumpToSetupStep(6)}>
                <Text style={styles.secondaryButtonText}>코치 다시풀기</Text>
              </TouchableOpacity>
            )}
            {setupStep < resultStep ? (
              <View style={[styles.setupNavButton, styles.setupNavSplit]}>
                {setupStep >= 3 && setupStep <= savingStep && (
                  <TouchableOpacity style={[styles.secondaryButton, styles.setupNavButton]} onPress={advanceSetup}>
                    <Text style={styles.secondaryButtonText}>건너뛰기</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.setupPrimaryButton, styles.setupNavButton, setupStep === 0 && state.currentBalance <= 0 && styles.primaryButtonMuted]}
                  onPress={goNext}
                >
                  <Text style={[styles.setupPrimaryButtonText, setupStep === 0 && state.currentBalance <= 0 && styles.primaryButtonMutedText]}>다음</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.setupPrimaryButton, styles.setupNavButton, !canStartSetup && styles.primaryButtonMuted]} onPress={finishSetup}>
                <Text style={[styles.setupPrimaryButtonText, !canStartSetup && styles.primaryButtonMutedText]}>이대로 시작하기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    )
  }

  function renderHome() {
    const todayRecords = recordsForDate(state, todayKey)

    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {plan.overdue && state.incomes.length > 0 && !incomePromptDismissed && (
          <View style={styles.incomePrompt}>
            <View style={{ flex: 1 }}>
              <Text style={styles.incomePromptTitle}>{state.incomes[0]?.name || '수입'} 입금 들어왔어요?</Text>
            </View>
            <TouchableOpacity style={styles.incomePromptButton} onPress={openIncomeConfirm}>
              <Text style={styles.incomePromptButtonText}>확정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => setIncomePromptDismissed(true)}
              accessibilityRole="button"
              accessibilityLabel="입금 확인 미루기"
            >
              <Text style={styles.removeText}>나중에</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>오늘</Text>
          <Text style={styles.heroTitle}>오늘 남은 돈</Text>
          <Animated.Text style={[styles.heroMoney, plan.todayRemaining < 0 && styles.dangerText, { transform: [{ scale: heroPulse }] }]}>
            {money(plan.todayRemaining)}
          </Animated.Text>
          <Text style={styles.modePill}>{plan.modeLabel}</Text>
          {plan.mode === 'income' && (
            <Text style={styles.heroSub}>{plan.overdue ? '입금 확인 필요' : `다음 입금까지 D-${plan.daysUntilEnd}`}</Text>
          )}
          {plan.mode === 'targetDate' && (
            <Text style={styles.heroSub}>목표일까지 D-{plan.daysUntilEnd}</Text>
          )}
          {plan.mode === 'openEnded' && plan.runwayDays !== null && (
            <Text style={styles.heroSub}>이 페이스면 약 {plan.runwayDays}일</Text>
          )}
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.sectionTitle}>지출 빠른 입력</Text>
          <View style={styles.quickRow}>
            <View style={styles.quickField}>
              <Text style={styles.fieldLabel}>금액</Text>
              <FocusInput
                style={[styles.input, styles.quickAmount]}
                value={quickAmount}
                onChangeText={text => setQuickAmount(formatMoneyText(text))}
                placeholder="0"
                keyboardType="numeric"
                returnKeyType="next"
                onSubmitEditing={() => quickMemoRef.current?.focus()}
                blurOnSubmit={false}
                autoCorrect={false}
                spellCheck={false}
                placeholderTextColor={colors.subtle}
                accessibilityLabel="지출 금액"
              />
            </View>
            <View style={[styles.quickField, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>메모</Text>
              <FocusInput
                ref={quickMemoRef}
                style={styles.input}
                value={quickMemo}
                onChangeText={setQuickMemo}
                placeholder="예: 점심"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const saved = addExpense(todayKey, quickAmount, quickMemo, quickCategory)
                  if (saved) { setQuickAmount(''); setQuickMemo('') }
                }}
                autoCorrect={false}
                spellCheck={false}
                placeholderTextColor={colors.subtle}
                accessibilityLabel="지출 메모"
              />
            </View>
          </View>
          <View style={styles.chipGrid}>
            {CATEGORIES.map(category => {
              const Icon = CATEGORY_ICONS[category]
              const active = quickCategory === category
              return (
                <View key={category} style={styles.chipSlot}>
                  <TouchableOpacity
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => { hapticLight(); setQuickCategory(category) }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${category} 카테고리`}
                  >
                    <Icon size={14} color={active ? colors.surface : colors.muted} strokeWidth={2.2} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{category}</Text>
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, !numeric(quickAmount) && styles.primaryButtonMuted]}
            onPress={() => {
              const saved = addExpense(todayKey, quickAmount, quickMemo, quickCategory)
              if (!saved) return
              setQuickAmount('')
              setQuickMemo('')
            }}
          >
            <Text style={styles.primaryButtonText}>오늘 지출 추가</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.section, { transform: [{ scale: expenseBounce }] }]}>
          <Text style={styles.sectionTitle}>오늘 기록</Text>
          {todayRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <IconCheck size={28} color={colors.tealDark} strokeWidth={2.5} />
              </View>
              <Text style={styles.emptyTitle}>오늘 지출 없음</Text>
              <Text style={styles.emptyHint}>위 입력창에 금액만 적어도 바로 기록돼요</Text>
            </View>
          ) : todayRecords.map(item => (
            <Reanimated.View
              key={item.id}
              entering={reduceMotion ? undefined : FadeIn.duration(220)}
              exiting={reduceMotion ? undefined : FadeOut.duration(160)}
              layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
            >
              <ExpenseRow
                item={item}
                onEdit={() => {
                  setSelectedDate(item.date)
                  startEditingExpense(item)
                }}
                onDelete={() => confirmDestructive('지출 삭제', `${money(item.amount)} 기록을 삭제할까요?`, () => deleteExpense(item.id))}
              />
            </Reanimated.View>
          ))}
        </Animated.View>

      </ScrollView>
    )
  }

  function renderCalendar() {
    const totalDays = daysInMonth(calendarMonth)
    const calendarPlan = plan
    const slots = Array.from({ length: 42 }, (_, index) => {
      const day = index - startOffset(calendarMonth) + 1
      return day >= 1 && day <= totalDays ? day : null
    })

    return (
      <View style={styles.calendarScreen}>
        <View style={styles.calendarHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>월간 캘린더</Text>
            <Text style={styles.title}>{calendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</Text>
          </View>
          <View style={styles.monthControls}>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => setCalendarMonth(prev => addMonths(prev, -1))}
              accessibilityRole="button"
              accessibilityLabel="이전 달"
            >
              <IconChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.todayButton}
              onPress={() => setCalendarMonth(startOfMonth(today))}
              accessibilityRole="button"
              accessibilityLabel="이번 달로 이동"
            >
              <Text style={styles.todayButtonText}>오늘</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => setCalendarMonth(prev => addMonths(prev, 1))}
              accessibilityRole="button"
              accessibilityLabel="다음 달"
            >
              <IconChevronRight size={22} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendUnder]} /><Text style={styles.legendText}>적게 씀</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendOver]} /><Text style={styles.legendText}>초과</Text></View>
          <View style={styles.legendItem}><View style={styles.legendToday} /><Text style={styles.legendText}>오늘</Text></View>
          <View style={styles.legendItem}><View style={styles.legendFixed} /><Text style={styles.legendText}>고정</Text></View>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS.map(day => <Text key={day} style={styles.weekLabel}>{day}</Text>)}
        </View>
        <View style={styles.calendarGrid}>
          {slots.map((day, index) => {
            if (!day) {
              return <View key={`blank-${index}`} style={styles.dayCellBlank} />
            }
            const dateKey = dateForDay(calendarMonth, day)
            const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
            const total = sumForDate(state, dateKey)
            const fixedDue = state.fixedItems.filter(item => item.day === day && item.amount > 0)
            const allowance = allowanceForDate(date, calendarPlan, state.lifestyleType, today)
            const tone = dayTone(state, dateKey, total, allowance)
            const isToday = dateKey === todayKey
            const isPast = dateKey < todayKey
            const hasNoSpend = isNoSpendDate(state, dateKey)
            const calendarValue = total > 0
              ? calendarMoney(total)
              : isPast && !hasNoSpend
                ? '-'
                : allowance <= 0
                  ? '-'
                  : calendarMoney(allowance)
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayCell,
                  tone === 'over' && styles.dayOver,
                  tone === 'under' && styles.dayUnder,
                ]}
                onPress={() => setSelectedDate(dateKey)}
                accessibilityRole="button"
                accessibilityLabel={`${day}일${isToday ? ', 오늘' : ''}${total > 0 ? `, 지출 ${money(total)}` : ''}${tone === 'over' ? ', 한도 초과' : ''}${hasNoSpend ? ', 무지출 체크' : ''}`}
              >
                <View style={[styles.dayNumberBadge, isToday && styles.dayNumberBadgeToday]}>
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day}</Text>
                </View>
                <View style={styles.dayMoneyRow}>
                  {tone === 'over' && <Text style={[styles.dayToneGlyph, styles.overText]}>▲</Text>}
                  {tone === 'under' && total > 0 && <Text style={[styles.dayToneGlyph, styles.underText]}>▼</Text>}
                  <Text
                    style={[
                      styles.dayMoney,
                      total > 0 ? styles.daySpentMoney : styles.dayBudgetMoney,
                      tone === 'over' && styles.overText,
                      tone === 'under' && styles.underText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.9}
                  >
                    {calendarValue}
                  </Text>
                </View>
                {fixedDue.length > 0 && (
                  <View style={styles.fixedBadge}>
                    <Text style={styles.fixedBadgeText} numberOfLines={1}>{shortFixedLabel(fixedDue[0].name)}</Text>
                    {fixedDue.length > 1 && (
                      <Text style={styles.fixedBadgeCount}>+{fixedDue.length - 1}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  function renderEnvelopes() {
    const totalLimit = envelopeStatuses.reduce((sum, envelope) => sum + envelope.periodLimit, 0)

    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View>
          <Text style={styles.title}>예산</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>이번 입금까지</Text>
          <BreakdownRow label="총 예산" value={money(totalLimit)} tone="plus" />
          <Text style={styles.emptyText}>입금 중엔 잠겨요. 옮기기로 조정하세요.</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setTransferOpen(true)}>
          <Text style={styles.primaryButtonText}>예산끼리 금액 옮기기</Text>
        </TouchableOpacity>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>이번 입금까지 예산</Text>
          {envelopeStatuses.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>예산이 아직 없습니다.</Text>
            </View>
          ) : envelopeStatuses.map(envelope => (
            <Reanimated.View
              key={envelope.id}
              layout={reduceMotion ? undefined : LinearTransition.springify().damping(20)}
              style={[
                styles.envelopeStatusCard,
                envelope.warning === 'watch' && styles.envelopeStatusWatch,
                envelope.warning === 'over' && styles.envelopeStatusOver,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.envelopeStatusName}>{envelope.name}</Text>
                <Text style={styles.envelopeStatusMeta}>
                  {money(envelope.spent)} 사용 · {money(envelope.periodLimit)} 한도
                </Text>
              </View>
              <View style={styles.envelopeStatusRight}>
                <Text style={[
                  styles.envelopeStatusRemaining,
                  envelope.warning === 'over' && styles.dangerText,
                ]}>
                  {money(envelope.remaining)}
                </Text>
                {envelope.warning !== 'safe' && (
                  <Text style={[
                    styles.envelopeWarningText,
                    envelope.warning === 'over' && styles.dangerText,
                  ]}>
                    {envelope.warning === 'over' ? '한도 초과' : '빠르게 줄고 있어요'}
                  </Text>
                )}
              </View>
            </Reanimated.View>
          ))}
        </View>
      </ScrollView>
    )
  }

  function renderSettings() {
    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View>
          <Text style={styles.title}>설정</Text>
          <View style={styles.autoSaveNotice}>
            <Text style={styles.autoSaveText}>변경사항은 자동으로 저장됩니다.</Text>
          </View>
        </View>
        {(() => {
          const settingsBreakdown = suggestSavingBreakdown(state, coachProfile, today)
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>생활비 기준</Text>
              <MoneyInput label="지금 당장 생활비로 써도 되는 돈" value={state.currentBalance} onChange={value => patch({ currentBalance: value })} />
              <View style={styles.suggestionCard}>
                <View style={styles.switchRow}>
                  <Text style={styles.suggestionTitle}>저축 자동 적용</Text>
                  <Switch
                    value={state.savingEnabled}
                    onValueChange={enabled => patch({
                      savingEnabled: enabled,
                      savingGoal: enabled
                        ? (state.periods.length === 0 ? settingsBreakdown.firstPeriod : settingsBreakdown.perCycle)
                        : 0,
                    })}
                    trackColor={{ false: colors.borderMd, true: colors.teal }}
                    thumbColor={colors.surface}
                    ios_backgroundColor={colors.borderMd}
                  />
                </View>
                {state.savingEnabled ? (
                  <View style={{ gap: 8 }}>
                    <BreakdownRow label="이번 입금까지" value={money(settingsBreakdown.firstPeriod)} tone="plus" />
                    <BreakdownRow label="다음 입금부터 매번" value={money(settingsBreakdown.perCycle)} tone="plus" />
                    <BreakdownRow label="월 환산" value={money(settingsBreakdown.monthly)} />
                    <Text style={styles.suggestionCopy}>코치 답변을 바탕으로 자동 계산해요. 금액을 바꾸려면 "온보딩 다시 시작"을 눌러 답을 새로 해주세요.</Text>
                  </View>
                ) : (
                  <Text style={styles.suggestionCopy}>저축 OFF — 모든 금액이 일일 예산으로 굴러갑니다.</Text>
                )}
              </View>
              <LifestylePicker value={state.lifestyleType} onChange={value => patch({ lifestyleType: value })} />
            </View>
          )
        })()}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>돈 들어오는 날</Text>
            <TouchableOpacity onPress={addIncome}><Text style={styles.addText}>추가</Text></TouchableOpacity>
          </View>
          {state.incomes.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>예정된 수입이 없으면 현재 잔액만으로 계산합니다.</Text>
            </View>
          )}
          {state.incomes.map(item => (
            <View key={item.id} style={styles.incomeSetupCard}>
              <View style={styles.editRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={item.name}
                  onChangeText={name => updateIncome(item.id, { name })}
                  placeholder="수입 이름"
                  placeholderTextColor={colors.subtle}
                  selectTextOnFocus
                  autoCorrect={false}
                  spellCheck={false}
                />
                <TextInput
                  style={[styles.input, styles.moneySmall]}
                  value={item.amount ? item.amount.toLocaleString('ko-KR') : ''}
                  keyboardType="numeric"
                  onChangeText={amount => updateIncome(item.id, { amount: amount.trim() ? numeric(amount) : null })}
                  placeholder="미정"
                  placeholderTextColor={colors.subtle}
                />
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => confirmDestructive('수입 삭제', `${item.name || '이 수입'}을(를) 삭제할까요?`, () => patch({ incomes: state.incomes.filter(row => row.id !== item.id) }))}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name || '수입'} 삭제`}
                ><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
              </View>
              <View style={styles.incomeTimingRow}>
                <View style={styles.incomeCadenceChips}>
                  {CADENCE_OPTIONS.map(option => (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.incomeCadenceChip, item.cadence === option.key && styles.chipActive]}
                      onPress={() => updateIncome(item.id, incomeWithCadence(item, option.key))}
                    >
                      <Text style={[styles.chipText, styles.cadenceChipText, item.cadence === option.key && styles.chipTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {item.cadence === 'monthly' ? (
                  <View style={styles.inlineDayField}>
                    <Text style={styles.miniLabel}>매달 며칠?</Text>
                    <DayInput value={incomeDay(item)} onChange={day => updateIncome(item.id, incomeWithDay(item, day, today))} />
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <DateField label="기준 날짜" value={item.anchorDate} onPress={() => setDatePickerTarget({ kind: 'income', id: item.id })} />
                  </View>
                )}
              </View>
              {item.cadence === 'irregular' && (
                <Field
                  label="보통 며칠 간격"
                  value={item.estIntervalDays ? `${item.estIntervalDays}` : ''}
                  onChange={value => updateIncome(item.id, { estIntervalDays: numeric(value) || undefined })}
                  keyboardType="numeric"
                />
              )}
            </View>
          ))}
          {state.incomes.length === 0 && (
            <View style={styles.setupSingleQuestion}>
              <View style={styles.chipGrid}>
                <View style={styles.chipSlot}>
                  <TouchableOpacity
                    style={[styles.chip, state.noIncomeMode === 'targetDate' && styles.chipActive]}
                    onPress={() => patch({ noIncomeMode: 'targetDate', targetDate: state.targetDate ?? isoDate(addDays(today, 30)) })}
                  >
                    <Text style={[styles.chipText, state.noIncomeMode === 'targetDate' && styles.chipTextActive]}>특정 날짜까지</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chipSlot}>
                  <TouchableOpacity
                    style={[styles.chip, state.noIncomeMode === 'openEnded' && styles.chipActive]}
                    onPress={() => patch({ noIncomeMode: 'openEnded' })}
                  >
                    <Text style={[styles.chipText, state.noIncomeMode === 'openEnded' && styles.chipTextActive]}>정해진 날 없음</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {state.noIncomeMode === 'targetDate' && (
                <DateField label="목표 날짜" value={state.targetDate} onPress={() => setDatePickerTarget({ kind: 'targetDate' })} />
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>고정 지출</Text>
            <TouchableOpacity onPress={addFixed}><Text style={styles.addText}>추가</Text></TouchableOpacity>
          </View>
          {state.fixedItems.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>매달 빠지는 돈이 있으면 추가해두면 계산에 반영됩니다.</Text>
            </View>
          )}
          {state.fixedItems.map(item => (
            <View key={item.id} style={styles.editRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={item.name}
                onChangeText={name => updateFixed(item.id, { name })}
                placeholder="지출 이름"
                placeholderTextColor={colors.subtle}
                selectTextOnFocus
                autoCorrect={false}
                spellCheck={false}
              />
              <DayInput value={item.day} onChange={day => updateFixed(item.id, { day })} />
              <TextInput style={[styles.input, styles.moneySmall]} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateFixed(item.id, { amount: numeric(amount) })} />
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDestructive('고정 지출 삭제', `${item.name || '이 항목'}을(를) 삭제할까요?`, () => patch({ fixedItems: state.fixedItems.filter(row => row.id !== item.id) }))}
                accessibilityRole="button"
                accessibilityLabel={`${item.name || '고정 지출'} 삭제`}
              ><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>데이터 관리</Text>
          <Text style={styles.helperText}>JSON 파일로 백업하거나 다른 기기에서 가져올 수 있어요.</Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={exportBackup}
            accessibilityRole="button"
            accessibilityLabel="데이터 내보내기"
          >
            <Text style={styles.secondaryButtonText}>백업 내보내기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={importBackup}
            accessibilityRole="button"
            accessibilityLabel="데이터 가져오기"
          >
            <Text style={styles.secondaryButtonText}>백업 불러오기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => confirmDestructive('온보딩 다시', '모든 데이터가 지워지고 코치 질문부터 다시 시작됩니다.', () => {
              AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
              setState(initialState)
              setCoachProfile(initialCoachProfile)
              setSetupStep(0)
              setTab('home')
            })}
            accessibilityRole="button"
            accessibilityLabel="온보딩 다시 시작"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.danger }]}>온보딩 다시 시작</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  const modalRecords = selectedDate ? recordsForDate(state, selectedDate) : []
  const modalTotal = selectedDate ? sumForDate(state, selectedDate) : 0
  const modalFixedItems = selectedDate
    ? state.fixedItems.filter(item => item.day === Number(selectedDate.slice(8, 10)) && item.amount > 0)
    : []
  const modalNoSpend = selectedDate ? isNoSpendDate(state, selectedDate) : false

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, loaded && !state.setupComplete && styles.setupSafe]}>
        <StatusBar style="dark" />

        <KeyboardAvoidingView
          style={[styles.body, loaded && !state.setupComplete && styles.setupSafe]}
          behavior={Platform.OS === 'ios' ? loaded && !state.setupComplete ? 'height' : 'padding' : undefined}
          keyboardVerticalOffset={loaded && !state.setupComplete ? 0 : 8}
        >
          {!loaded && <SkeletonHome />}
          {loaded && (
            <Animated.View style={{ flex: 1, opacity: fadeIn }}>
              {!state.setupComplete && renderSetup()}
              {state.setupComplete && tab === 'home' && renderHome()}
              {state.setupComplete && tab === 'calendar' && renderCalendar()}
              {state.setupComplete && tab === 'envelopes' && renderEnvelopes()}
              {state.setupComplete && tab === 'settings' && renderSettings()}
            </Animated.View>
          )}
        </KeyboardAvoidingView>

        {loaded && state.setupComplete && (
          <View style={styles.tabBar}>
            {([
              ['home', '홈'],
              ['calendar', '캘린더'],
              ['envelopes', '예산'],
              ['settings', '설정'],
            ] as [Tab, string][]).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={styles.tabButton}
                onPress={() => { hapticLight(); setTab(key) }}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                accessibilityLabel={`${label} 탭`}
              >
                {(() => {
                  const Icon = TAB_ICONS[key]
                  const active = tab === key
                  return (
                    <Icon
                      size={22}
                      color={active ? colors.tealDark : colors.muted}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  )
                })()}
                <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Modal visible={!!selectedDate} animationType="slide" transparent onRequestClose={closeExpenseModal}>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalDismissZone} activeOpacity={1} onPress={closeExpenseModal} accessibilityElementsHidden accessibilityRole="button" accessibilityLabel="모달 닫기" />
          <KeyboardAvoidingView
            style={styles.modalSheet}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            pointerEvents="box-none"
          >
            <View style={styles.modalCard}>
              <View style={styles.modalTop}>
                <View>
                  <Text style={styles.eyebrow}>Daily expenses</Text>
                  <Text style={styles.modalTitle}>{selectedDate} · 합계 {money(modalTotal)}</Text>
                </View>
                <TouchableOpacity
                  onPress={closeExpenseModal}
                  style={styles.modalCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="지출 입력 닫기"
                >
                  <IconClose size={22} color={colors.muted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              {modalFixedItems.length > 0 && (
                <View style={styles.fixedList}>
                  <Text style={styles.fixedListTitle}>예정된 고정 지출</Text>
                  {modalFixedItems.map(item => (
                    <View key={item.id} style={styles.fixedListRow}>
                      <Text style={styles.fixedListName}>{item.name}</Text>
                      <Text style={styles.fixedListAmount}>{money(item.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {selectedDate && modalRecords.length === 0 && (
                <TouchableOpacity
                  style={[styles.noSpendButton, modalNoSpend && styles.noSpendButtonActive]}
                  onPress={() => { hapticMedium(); toggleNoSpend(selectedDate) }}
                >
                  <Text style={[styles.noSpendText, modalNoSpend && styles.noSpendTextActive]}>
                    {modalNoSpend ? '무지출 체크됨' : '오늘은 무지출'}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.quickRow}>
                <View style={styles.quickField}>
                  <Text style={styles.fieldLabel}>금액</Text>
                  <FocusInput
                    style={[styles.input, styles.quickAmount]}
                    value={modalAmount}
                    onChangeText={text => setModalAmount(formatMoneyText(text))}
                    placeholder="0"
                    keyboardType="numeric"
                    returnKeyType="next"
                    onSubmitEditing={() => modalMemoRef.current?.focus()}
                    blurOnSubmit={false}
                    autoCorrect={false}
                    spellCheck={false}
                    placeholderTextColor={colors.subtle}
                    accessibilityLabel="지출 금액"
                  />
                </View>
                <View style={[styles.quickField, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>메모</Text>
                  <FocusInput
                    ref={modalMemoRef}
                    style={styles.input}
                    value={modalMemo}
                    onChangeText={setModalMemo}
                    placeholder="예: 점심"
                    returnKeyType="done"
                    onSubmitEditing={saveModalExpense}
                    autoCorrect={false}
                    spellCheck={false}
                    placeholderTextColor={colors.subtle}
                    accessibilityLabel="지출 메모"
                  />
                </View>
              </View>
              <View style={styles.chipGrid}>
                {CATEGORIES.map(category => {
                  const Icon = CATEGORY_ICONS[category]
                  const active = modalCategory === category
                  return (
                    <View key={category} style={styles.chipSlot}>
                      <TouchableOpacity
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { hapticLight(); setModalCategory(category) }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${category} 카테고리`}
                      >
                        <Icon size={14} color={active ? colors.surface : colors.muted} strokeWidth={2.2} />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{category}</Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, !numeric(modalAmount) && styles.primaryButtonMuted]}
                onPress={saveModalExpense}
              >
                <Text style={styles.primaryButtonText}>{editingExpenseId ? '수정 완료' : '이 날짜에 추가'}</Text>
              </TouchableOpacity>
              {editingExpenseId && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setEditingExpenseId(null)
                    setModalAmount('')
                    setModalMemo('')
                  }}
                >
                  <Text style={styles.secondaryButtonText}>수정 취소</Text>
                </TouchableOpacity>
              )}
              {modalRecords.length > 0 && (
                <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
                  {modalRecords.map(item => (
                  <ExpenseRow
                    key={item.id}
                    item={item}
                    onEdit={() => startEditingExpense(item)}
                    onDelete={() => {
                      if (editingExpenseId === item.id) {
                        setEditingExpenseId(null)
                        setModalAmount('')
                        setModalMemo('')
                      }
                      deleteExpense(item.id)
                    }}
                  />
                  ))}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
          </View>
        </Modal>
        <Modal visible={incomeConfirmOpen} animationType="slide" transparent onRequestClose={closeIncomeConfirm}>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalDismissZone} activeOpacity={1} onPress={closeIncomeConfirm} />
            <KeyboardAvoidingView style={styles.modalSheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} pointerEvents="box-none">
              <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
                <View style={styles.modalTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>Income check</Text>
                    <Text style={styles.modalTitle}>입금 포함 지금 잔액</Text>
                    <Text style={styles.helperText}>
                      통장에 들어온 월급/수입을 포함한 현재 잔액이에요.{"\n"}
                      저축이나 고정 지출을 빼기 전 금액으로 입력해주세요.{"\n"}
                      여러 통장을 쓰면 생활비로 쓸 통장 합계만 적으면 됩니다.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeIncomeConfirm}
                    style={styles.modalCloseButton}
                    accessibilityRole="button"
                    accessibilityLabel="입금 확인 닫기"
                  >
                    <IconClose size={22} color={colors.muted} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <MoneyInput label="지금 잔액" value={incomeConfirmBalance} onChange={setIncomeConfirmBalance} />
                <TouchableOpacity style={styles.primaryButton} onPress={confirmIncomeBalance}>
                  <Text style={styles.primaryButtonText}>이 금액으로 새 구간 시작</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        <Modal visible={transferOpen} animationType="slide" transparent onRequestClose={closeTransferModal}>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalDismissZone} activeOpacity={1} onPress={closeTransferModal} />
            <KeyboardAvoidingView style={styles.modalSheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} pointerEvents="box-none">
              <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
                <View style={styles.modalTop}>
                  <View>
                    <Text style={styles.eyebrow}>예산 이동</Text>
                    <Text style={styles.modalTitle}>예산 간 옮기기</Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeTransferModal}
                    style={styles.modalCloseButton}
                    accessibilityRole="button"
                    accessibilityLabel="예산 이동 닫기"
                  >
                    <IconClose size={22} color={colors.muted} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.label}>보낼 예산</Text>
                <View style={styles.chipGrid}>
                  {CATEGORIES.map(category => (
                    <View key={category} style={styles.chipSlot}>
                      <TouchableOpacity style={[styles.chip, transferFrom === category && styles.chipActive]} onPress={() => setTransferFrom(category)}>
                        <Text style={[styles.chipText, transferFrom === category && styles.chipTextActive]}>{category}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <Text style={styles.label}>받을 예산</Text>
                <View style={styles.chipGrid}>
                  {CATEGORIES.map(category => (
                    <View key={category} style={styles.chipSlot}>
                      <TouchableOpacity style={[styles.chip, transferTo === category && styles.chipActive]} onPress={() => setTransferTo(category)}>
                        <Text style={[styles.chipText, transferTo === category && styles.chipTextActive]}>{category}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <MoneyInput label="옮길 금액" value={transferAmount} onChange={setTransferAmount} />
                <TouchableOpacity style={[styles.primaryButton, (!transferAmount || transferFrom === transferTo) && styles.primaryButtonMuted]} onPress={submitEnvelopeTransfer}>
                  <Text style={styles.primaryButtonText}>옮기기</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        <Modal visible={!!reportSnapshot} animationType="slide" transparent onRequestClose={closeReportModal}>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalDismissZone} activeOpacity={1} onPress={closeReportModal} />
            <KeyboardAvoidingView style={styles.modalSheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} pointerEvents="box-none">
              <ScrollView style={styles.modalCard} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
                <View style={styles.modalTop}>
                  <View>
                    <Text style={styles.eyebrow}>Period report</Text>
                    <Text style={styles.modalTitle}>지난 입금 정리</Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeReportModal}
                    style={styles.modalCloseButton}
                    accessibilityRole="button"
                    accessibilityLabel="입금 정리 닫기"
                  >
                    <IconClose size={22} color={colors.muted} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                {reportSnapshot && (() => {
                  const totalPlanned = reportSnapshot.envelopePlan.reduce((sum, item) => sum + item.limit, 0)
                  const totalActual = reportSnapshot.actualByCategory.reduce((sum, item) => sum + item.amount, 0)
                  const saved = totalPlanned - totalActual
                  const underBudget = saved > 0
                  return (
                    <>
                      <View style={[styles.reportHero, underBudget ? styles.reportHeroSuccess : styles.reportHeroOver]}>
                        <Text style={styles.reportHeroLabel}>
                          {underBudget ? '계획보다 아껴 썼어요' : '계획보다 더 썼어요'}
                        </Text>
                        <Text style={[styles.reportHeroValue, underBudget ? styles.reportHeroValueSuccess : styles.reportHeroValueOver]}>
                          {underBudget ? `+${money(saved)} 절약` : `-${money(-saved)} 초과`}
                        </Text>
                      </View>
                      <Text style={styles.helperText}>{reportSnapshot.startDate} ~ {reportSnapshot.endDate}</Text>
                      {(() => {
                        const rows = CATEGORIES.map(category => {
                          const planned = reportSnapshot.envelopePlan.find(item => item.category === category)?.limit ?? 0
                          const actual = reportSnapshot.actualByCategory.find(item => item.category === category)?.amount ?? 0
                          return { category, planned, actual }
                        })
                        const maxValue = Math.max(1, ...rows.map(r => Math.max(r.planned, r.actual)))
                        return rows.map(({ category, planned, actual }) => {
                          const over = actual > planned
                          const plannedPct = (planned / maxValue) * 100
                          const actualPct = (actual / maxValue) * 100
                          const Icon = CATEGORY_ICONS[category]
                          return (
                            <View key={category} style={styles.reportChartRow}>
                              <View style={styles.reportChartHeader}>
                                <View style={styles.reportChartLabelRow}>
                                  <Icon size={14} color={colors.muted} strokeWidth={2} />
                                  <Text style={styles.reportChartLabel}>{category}</Text>
                                </View>
                                <Text style={[styles.reportChartValue, over && styles.dangerText]}>
                                  {money(actual)} / {money(planned)}
                                </Text>
                              </View>
                              <View style={styles.reportChartTrack}>
                                <View style={[styles.reportChartPlannedBar, { width: `${plannedPct}%` }]} />
                                <View style={[styles.reportChartActualBar, { width: `${actualPct}%`, backgroundColor: over ? colors.danger : colors.teal }]} />
                              </View>
                            </View>
                          )
                        })
                      })()}
                    <Text style={styles.sectionTitle}>다음 입금까지 예산</Text>
                    {state.envelopes.map(envelope => (
                      <View key={envelope.id} style={styles.envelopeEditRow}>
                        <Text style={[styles.envelopeStatusName, { flex: 1 }]}>{envelope.name}</Text>
                        <TextInput
                          style={[styles.input, styles.moneySmall]}
                          value={envelope.periodLimit ? envelope.periodLimit.toLocaleString('ko-KR') : ''}
                          keyboardType="numeric"
                          onChangeText={amount => updateEnvelope(envelope.id, { periodLimit: numeric(amount) })}
                          placeholder="0"
                          placeholderTextColor={colors.subtle}
                        />
                      </View>
                      ))}
                    </>
                  )
                })()}
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        {datePickerTarget && (
          <DateTimePicker
            value={datePickerTarget.kind === 'income'
              ? parseIso(state.incomes.find(item => item.id === datePickerTarget.id)?.anchorDate ?? todayKey)
              : parseIso(state.targetDate ?? isoDate(addDays(today, 30)))}
            mode="date"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            onChange={(_, selectedDateValue) => {
              if (Platform.OS !== 'ios' || selectedDateValue) {
                handleDatePicked(selectedDateValue)
              }
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  setupSafe: { backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appName: { fontSize: 20, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold', color: colors.text },
  dateText: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '700' },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  setupScreen: { flex: 1, backgroundColor: colors.bg },
  setupContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 16 },
  setupContentKeyboard: { paddingBottom: 28 },
  calendarScreen: { flex: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8 },
  setupHero: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
  },
  setupTitle: { marginTop: 10, color: colors.text, fontSize: 24, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold' },
  setupCopy: { marginTop: 8, color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  setupMain: { flex: 1, justifyContent: 'center', gap: 20, paddingBottom: 28 },
  setupIntro: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.surface,
    gap: 8,
  },
  setupIntroTitle: { color: colors.teal, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  setupIntroCopy: { color: colors.muted, fontSize: 13, lineHeight: 20, fontWeight: '500' },
  setupQuestionShell: { gap: 18 },
  setupProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setupProgress: { color: colors.muted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 40 },
  setupProgressTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  setupProgressFill: { height: '100%', borderRadius: 999, backgroundColor: colors.teal },
  setupSingleQuestion: { gap: 12 },
  setupQuestionTitle: { color: colors.text, fontSize: 28, lineHeight: 36, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold' },
  setupQuestionCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  setupExampleText: { color: colors.muted, fontSize: 13, lineHeight: 20, fontWeight: '600', fontStyle: 'italic' },
  setupNavRow: { flexDirection: 'row', gap: 10 },
  setupNavButton: { flex: 1 },
  setupNavSplit: { flexDirection: 'row', gap: 8 },
  setupPrimaryButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 14,
    backgroundColor: colors.teal,
  },
  setupPrimaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold' },
  questionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  questionNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.tealLight,
    color: colors.tealDark,
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 13,
    fontWeight: '700',
  },
  savingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  savingDayField: { width: 86 },
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
  },
  eyebrow: { fontSize: 12, color: colors.tealDark, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { marginTop: 8, fontSize: 14, color: colors.muted, fontWeight: '700' },
  heroMoney: { marginTop: 4, fontSize: 36, color: colors.text, fontWeight: '900', fontFamily: 'Pretendard-Black', fontVariant: ['tabular-nums'] },
  modePill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    color: colors.tealDark,
    backgroundColor: colors.tealLight,
    fontSize: 12,
    fontWeight: '700',
  },
  dangerText: { color: colors.danger },
  heroSub: { marginTop: 6, fontSize: 13, color: colors.muted, fontWeight: '700' },
  incomePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.warningBg,
  },
  incomePromptTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  incomePromptCopy: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  incomePromptButton: { borderRadius: 10, backgroundColor: colors.text, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  incomePromptButtonText: { color: colors.surface, fontSize: 13, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold' },
  quickCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold', color: colors.text },
  helperText: { marginTop: -4, color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  breakdownBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: colors.bg,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  breakdownLabel: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '600' },
  breakdownValue: { color: colors.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  breakdownPlus: { color: colors.tealDark },
  breakdownMinus: { color: colors.danger },
  breakdownDivider: { height: 1, backgroundColor: colors.border, marginVertical: 1 },
  quickRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  quickField: { gap: 4 },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: '700', marginBottom: 2 },
  quickAmount: { width: 120 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMd,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  inputFocused: {
    borderColor: colors.teal,
    borderWidth: 2,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.muted, fontWeight: '800' },
  dateButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dateButtonText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  chipGrid: {
    flexDirection: 'row',
    width: '100%',
    paddingVertical: 2,
  },
  chipSlot: {
    width: `${100 / 6}%`,
    paddingHorizontal: 2,
  },
  chip: {
    flexDirection: 'row',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealLight,
    minHeight: 36,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontSize: 12, color: colors.tealDark, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  lifestyleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  lifestyleOptionActive: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  lifestyleTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  lifestyleTitleActive: { color: colors.tealDark },
  lifestyleDescription: { marginTop: 4, color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  lifestyleWeight: { color: colors.muted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  primaryButton: {
    backgroundColor: colors.text,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButtonMuted: { backgroundColor: colors.muted },
  primaryButtonMutedText: { color: colors.subtle },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderMd,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  secondaryButtonMuted: { opacity: 0.45 },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'center' },
  backButtonText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  coachProgress: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  suggestionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: colors.surface,
  },
  suggestionTitle: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  suggestionMoney: { color: colors.text, fontSize: 28, fontWeight: '900', fontFamily: 'Pretendard-Black', fontVariant: ['tabular-nums'] },
  suggestionCopy: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultEditRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  coachQuestionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  coachEyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  coachQuestion: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold' },
  coachDescription: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  coachOptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coachOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  coachOptionActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  coachOptionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  coachOptionTextActive: { color: colors.surface, fontWeight: '700' },
  envelopeStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    minHeight: 64,
  },
  envelopeStatusWatch: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  envelopeStatusOver: {
    borderColor: colors.overBorder,
    backgroundColor: colors.overBg,
  },
  envelopeStatusName: { color: colors.text, fontSize: 15, fontWeight: '700', fontFamily: 'Pretendard-Bold' },
  envelopeStatusMeta: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: '500' },
  envelopeStatusRight: { alignItems: 'flex-end' },
  envelopeStatusRemaining: { color: colors.text, fontSize: 16, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold', fontVariant: ['tabular-nums'] },
  envelopeWarningText: { marginTop: 4, color: colors.warning, fontSize: 12, fontWeight: '700' },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  expenseMemo: { fontSize: 15, fontWeight: '700', color: colors.text },
  expenseSub: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '500' },
  expenseAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Pretendard-Bold', color: colors.text, fontVariant: ['tabular-nums'] },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  modalCloseButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  editText: { fontSize: 12, color: colors.tealDark, fontWeight: '700' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
  overText: { color: colors.danger },
  underText: { color: colors.success },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 8,
  },
  reportHero: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 8,
    marginVertical: 8,
  },
  reportHeroSuccess: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.underBorder },
  reportHeroOver: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.overBorder },
  reportHeroLabel: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  reportHeroValue: { fontSize: 28, fontWeight: '900', fontFamily: 'Pretendard-Black', fontVariant: ['tabular-nums'] },
  reportHeroValueSuccess: { color: colors.success },
  reportHeroValueOver: { color: colors.danger },
  reportChartRow: { gap: 6, marginVertical: 4 },
  reportChartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  reportChartLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportChartLabel: { fontSize: 13, color: colors.text, fontWeight: '600' },
  reportChartValue: { fontSize: 12, color: colors.muted, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reportChartTrack: { height: 12, borderRadius: 999, backgroundColor: colors.bg, overflow: 'hidden', position: 'relative' },
  reportChartPlannedBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.border, borderRadius: 999 },
  reportChartActualBar: { position: 'absolute', left: 0, top: 2, bottom: 2, borderRadius: 999 },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, color: colors.text, fontWeight: '800' },
  emptyHint: { fontSize: 13, color: colors.muted, fontWeight: '600', textAlign: 'center' },
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 16,
  },
  title: { marginTop: 8, fontSize: 24, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold', color: colors.text },
  autoSaveNotice: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  autoSaveText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthButtonText: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  todayButton: {
    height: 44,
    minWidth: 56,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.text,
  },
  todayButtonText: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  note: { marginTop: 8, color: colors.muted, fontSize: 13, fontWeight: '500' },
  weekRow: { flexDirection: 'row', paddingBottom: 12 },
  weekLabel: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 13, fontWeight: '700' },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendUnder: { backgroundColor: colors.underBorder },
  legendOver: { backgroundColor: colors.overBorder },
  legendToday: { width: 12, height: 12, borderRadius: 999, backgroundColor: colors.text },
  legendFixed: { width: 16, height: 8, borderRadius: 999, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning },
  legendText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  calendarGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayCellBlank: {
    width: `${100 / 7}%`,
    height: `${100 / 6}%`,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: `${100 / 6}%`,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  dayOver: { backgroundColor: colors.overBg },
  dayUnder: { backgroundColor: colors.underBg },
  dayNumberBadge: {
    alignSelf: 'flex-start',
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberBadgeToday: { backgroundColor: colors.text },
  dayNumber: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  dayNumberToday: { color: colors.surface, fontWeight: '800' },
  dayMoneyRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 2,
  },
  dayToneGlyph: {
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  dayMoney: {
    minWidth: 42,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  dayBudgetMoney: { color: colors.text },
  daySpentMoney: { color: colors.text },
  fixedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 2,
    marginTop: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fixedBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  fixedBadgeCount: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  fixedList: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    backgroundColor: colors.warningBg,
    padding: 12,
    gap: 8,
  },
  fixedListTitle: { color: colors.warning, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fixedListRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  fixedListName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  fixedListAmount: { color: colors.warning, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  noSpendButton: {
    borderWidth: 1,
    borderColor: colors.borderMd,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  noSpendButtonActive: { backgroundColor: colors.successBg, borderColor: colors.underBorder },
  noSpendText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  noSpendTextActive: { color: colors.success },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 12,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, paddingVertical: 8, gap: 4 },
  tabText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.tealDark, fontWeight: '700' },
  addText: { color: colors.tealDark, fontWeight: '700', fontSize: 13 },
  removeText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  editRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  envelopeEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  setupEnvelopeRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  setupEnvelopeNameField: { flex: 1, gap: 4 },
  setupEnvelopeMoneyField: { width: 120, gap: 4 },
  incomeSetupCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
  },
  incomeTimingRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  incomeCadenceChips: { flex: 1, flexDirection: 'row', gap: 4 },
  cadenceChipText: { fontSize: 11 },
  incomeCadenceChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 2,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    backgroundColor: colors.tealLight,
  },
  inlineDayField: { width: 92, gap: 4 },
  setupEditHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  setupIncomeHeaderNameField: { width: 88, textAlign: 'center' },
  setupHeaderNameField: { flex: 1, textAlign: 'center' },
  setupHeaderDayField: { width: 58, textAlign: 'center' },
  setupHeaderMoneyField: { width: 112, textAlign: 'center' },
  setupEditRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  setupIncomeNameField: { width: 88, gap: 4 },
  setupNameField: { flex: 1, gap: 4 },
  setupDayField: { width: 58, gap: 4 },
  setupMoneyField: { width: 112, gap: 4 },
  setupRemoveButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  miniLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  dayInput: { width: 48, height: 44, paddingVertical: 0, textAlign: 'center' },
  moneySmall: { width: 120 },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalSheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDismissZone: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
    maxHeight: '82%',
    zIndex: 1,
  },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { marginTop: 6, fontSize: 17, fontWeight: '800', fontFamily: 'Pretendard-ExtraBold', color: colors.text },
})
