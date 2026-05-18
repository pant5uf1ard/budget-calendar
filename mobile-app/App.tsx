import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

type Tab = 'home' | 'calendar' | 'settings'
type Category = '식비' | '생활' | '교통' | '쇼핑' | '문화' | '기타'
type LifestyleType = 'balanced' | 'worker' | 'weekendSocial' | 'weekendHeavy' | 'weekdayOnly'

type IncomeItem = {
  id: string
  name: string
  day: number
  amount: number
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
  envelopeId: string
  createdAt: string
}

type BudgetEnvelope = {
  id: string
  name: string
  monthlyLimit: number
  spent: number
}

type BudgetState = {
  setupComplete: boolean
  currentBalance: number
  savingGoal: number
  savingDeadline: number
  lifestyleType: LifestyleType
  weekendMultiplier?: number
  incomes: IncomeItem[]
  fixedItems: FixedItem[]
  envelopes: BudgetEnvelope[]
  expenses: ExpenseRecord[]
  dailyNotes: Record<string, string>
  noSpendDates: string[]
}

const STORAGE_KEY = 'budget-calendar-mobile-v1'
const CATEGORIES: Category[] = ['식비', '생활', '교통', '쇼핑', '문화', '기타']
const DEFAULT_ENVELOPE_NAMES = ['식비', '교통', '개인소비', '예비비']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const LIFESTYLE_OPTIONS: { key: LifestyleType; title: string; description: string; weekdayWeight: number; weekendWeight: number }[] = [
  { key: 'balanced', title: '균등형', description: '요일 상관없이 비슷하게 써요', weekdayWeight: 1, weekendWeight: 1 },
  { key: 'worker', title: '직장인 기본형', description: '평일은 적게, 주말은 조금 더 써요', weekdayWeight: 0.8, weekendWeight: 1.6 },
  { key: 'weekendSocial', title: '주말 약속형', description: '평일은 아끼고, 주말 약속이 잦아요', weekdayWeight: 0.65, weekendWeight: 2 },
  { key: 'weekendHeavy', title: '주말 몰빵형', description: '평일은 거의 안 쓰고, 주말에 크게 써요', weekdayWeight: 0.45, weekendWeight: 2.8 },
  { key: 'weekdayOnly', title: '주말 제외형', description: '주말 예산은 따로 잡지 않고 평일에만 나눠요', weekdayWeight: 1, weekendWeight: 0 },
]

const initialState: BudgetState = {
  setupComplete: false,
  currentBalance: 0,
  savingGoal: 0,
  savingDeadline: 25,
  lifestyleType: 'worker',
  incomes: [],
  fixedItems: [],
  envelopes: makeDefaultEnvelopes(),
  expenses: [],
  dailyNotes: {},
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

function normalizeCategory(category: unknown): Category {
  return CATEGORIES.includes(category as Category) ? category as Category : '기타'
}

function sanitizeAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
}

function sanitizeText(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function isIsoDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sanitizeIncomeItem(item: Partial<IncomeItem>, index: number): IncomeItem {
  return {
    id: sanitizeText(item.id, `income-${index + 1}`),
    name: sanitizeText(item.name, `수입 ${index + 1}`),
    day: clampDay(Number(item.day) || 25),
    amount: sanitizeAmount(item.amount),
  }
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
    envelopeId: sanitizeText(item.envelopeId, ''),
    createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
  }
}

function makeDefaultEnvelopes(): BudgetEnvelope[] {
  return DEFAULT_ENVELOPE_NAMES.map((name, index) => ({
    id: `envelope-${index + 1}`,
    name,
    monthlyLimit: 0,
    spent: 0,
  }))
}

function sanitizeEnvelope(item: Partial<BudgetEnvelope>, index: number): BudgetEnvelope {
  return {
    id: sanitizeText(item.id, `envelope-${index + 1}`),
    name: sanitizeText(item.name, DEFAULT_ENVELOPE_NAMES[index] ?? `봉투 ${index + 1}`),
    monthlyLimit: sanitizeAmount(item.monthlyLimit),
    spent: sanitizeAmount(item.spent),
  }
}

function sanitizeDailyNotes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([dateKey, note]) => isIsoDateKey(dateKey) && typeof note === 'string')
      .map(([dateKey, note]) => [dateKey, note]),
  ) as Record<string, string>
}

function sanitizeBudgetState(saved: Partial<BudgetState>): BudgetState {
  const incomes = Array.isArray(saved.incomes)
    ? saved.incomes.map(sanitizeIncomeItem).filter(item => item.amount > 0)
    : []
  const fixedItems = Array.isArray(saved.fixedItems)
    ? saved.fixedItems.map(sanitizeFixedItem).filter(item => item.amount > 0)
    : []
  const expenses = Array.isArray(saved.expenses)
    ? saved.expenses.map(sanitizeExpenseRecord).filter((item): item is ExpenseRecord => Boolean(item))
    : []
  const envelopes = Array.isArray(saved.envelopes) && saved.envelopes.length > 0
    ? saved.envelopes.map(sanitizeEnvelope)
    : makeDefaultEnvelopes()
  const fallbackEnvelopeId = envelopes[0]?.id ?? ''
  const migratedExpenses = expenses.map(item => ({
    ...item,
    envelopeId: item.envelopeId || fallbackEnvelopeId,
  }))

  return {
    ...initialState,
    ...saved,
    setupComplete: Boolean(saved.setupComplete),
    currentBalance: sanitizeAmount(saved.currentBalance),
    savingGoal: sanitizeAmount(saved.savingGoal),
    savingDeadline: clampDay(Number(saved.savingDeadline) || initialState.savingDeadline),
    lifestyleType: LIFESTYLE_OPTIONS.some(option => option.key === saved.lifestyleType)
      ? saved.lifestyleType as LifestyleType
      : initialState.lifestyleType,
    incomes,
    fixedItems,
    envelopes,
    expenses: migratedExpenses,
    dailyNotes: sanitizeDailyNotes(saved.dailyNotes),
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

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
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

function monthPrefix(date: Date) {
  return isoDate(date).slice(0, 7)
}

function monthExpenseTotal(state: BudgetState, date: Date) {
  const prefix = monthPrefix(date)
  return state.expenses
    .filter(item => item.date.startsWith(prefix))
    .reduce((sum, item) => sum + item.amount, 0)
}

function calculateEnvelopeStatus(state: BudgetState, date: Date) {
  const prefix = monthPrefix(date)
  const spentByEnvelope = state.expenses
    .filter(item => item.date.startsWith(prefix))
    .reduce<Record<string, number>>((totals, item) => {
      totals[item.envelopeId] = (totals[item.envelopeId] ?? 0) + item.amount
      return totals
    }, {})

  return state.envelopes.map(envelope => {
    const spent = spentByEnvelope[envelope.id] ?? 0
    const remaining = envelope.monthlyLimit - spent
    const usageRatio = envelope.monthlyLimit > 0 ? spent / envelope.monthlyLimit : 0
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

function expenseUntilDay(state: BudgetState, date: Date, deadlineDay: number) {
  const prefix = monthPrefix(date)
  const today = date.getDate()
  return state.expenses
    .filter(item => item.date.startsWith(prefix))
    .filter(item => {
      const day = Number(item.date.slice(8, 10))
      return day >= today && day <= deadlineDay
    })
    .reduce((sum, item) => sum + item.amount, 0)
}

function nextIncomeDay(state: BudgetState, date: Date) {
  const today = date.getDate()
  const upcoming = state.incomes
    .filter(item => item.day >= today)
    .sort((a, b) => a.day - b.day)
  return upcoming[0]?.day ?? daysInMonth(date) + 1
}

function incomeUntilDay(state: BudgetState, date: Date, endDay: number, includeEndDay: boolean) {
  const today = date.getDate()
  return state.incomes
    .filter(item => item.day >= today && (includeEndDay ? item.day <= endDay : item.day < endDay))
    .reduce((sum, item) => sum + item.amount, 0)
}

function fixedUntilDay(state: BudgetState, date: Date, endDay: number, includeEndDay: boolean) {
  const today = date.getDate()
  return state.fixedItems
    .filter(item => item.day >= today && (includeEndDay ? item.day <= endDay : item.day < endDay))
    .reduce((sum, item) => sum + item.amount, 0)
}

function recurringAmountBetween(
  items: { day: number; amount: number }[],
  startDate: Date,
  endDate: Date,
  includeEndDate = true,
) {
  if (isBeforeDate(endDate, startDate)) return 0
  let sum = 0
  for (let monthOffset = 0; monthOffset <= 2; monthOffset += 1) {
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

function expenseBetweenDates(state: BudgetState, startDate: Date, endDate: Date) {
  const startKey = isoDate(startDate)
  const endKey = isoDate(endDate)
  return state.expenses
    .filter(item => item.date >= startKey && item.date <= endKey)
    .reduce((sum, item) => sum + item.amount, 0)
}

function remainingWeightBetween(state: BudgetState, startDate: Date, endDate: Date) {
  if (isBeforeDate(endDate, startDate)) return 1
  const recordedDates = new Set([
    ...state.expenses.map(item => item.date),
    ...state.noSpendDates,
  ])
  let weight = 0
  for (let cursor = new Date(startDate); isBeforeOrSameDate(cursor, endDate); cursor = addDays(cursor, 1)) {
    if (recordedDates.has(isoDate(cursor))) continue
    weight += weightForDate(cursor, state.lifestyleType)
  }
  return Math.max(weight, 1)
}

function nextSavingDeadlineDate(state: BudgetState, afterDate: Date) {
  for (let monthOffset = 0; monthOffset <= 2; monthOffset += 1) {
    const cursor = new Date(afterDate.getFullYear(), afterDate.getMonth() + monthOffset, 1)
    const deadline = dateWithMonthDay(cursor.getFullYear(), cursor.getMonth(), state.savingDeadline)
    if (isBeforeDate(afterDate, deadline)) return deadline
  }
  return dateWithMonthDay(afterDate.getFullYear(), afterDate.getMonth() + 1, state.savingDeadline)
}

function lifestyleOption(type: LifestyleType) {
  return LIFESTYLE_OPTIONS.find(option => option.key === type) ?? LIFESTYLE_OPTIONS[1]
}

function weightForDate(date: Date, lifestyleType: LifestyleType) {
  const option = lifestyleOption(lifestyleType)
  return isWeekend(date) ? option.weekendWeight : option.weekdayWeight
}

function allowanceForDate(date: Date, plan: ReturnType<typeof calculatePlan>, lifestyleType: LifestyleType) {
  const day = date.getDate()
  return day <= plan.deadline
    ? (isWeekend(date) ? plan.weekend : plan.weekday)
    : plan.afterDeadlineUnit * weightForDate(date, lifestyleType)
}

function spendingTone(spent: number, allowance: number) {
  if (spent <= 0) return 'none'
  return spent > allowance ? 'over' : 'under'
}

function dayTone(state: BudgetState, dateKey: string, spent: number, allowance: number) {
  if (isNoSpendDate(state, dateKey)) return 'under'
  return spendingTone(spent, allowance)
}

function remainingWeightRaw(state: BudgetState, date: Date, endDay: number) {
  const prefix = monthPrefix(date)
  const recordedDays = new Set(
    [
      ...state.expenses
      .filter(item => item.date.startsWith(prefix))
      .map(item => Number(item.date.slice(8, 10))),
      ...state.noSpendDates
        .filter(dateKey => dateKey.startsWith(prefix))
        .map(dateKey => Number(dateKey.slice(8, 10))),
    ],
  )
  let weight = 0
  for (let day = date.getDate(); day <= endDay; day += 1) {
    if (recordedDays.has(day)) continue
    weight += weightForDate(new Date(date.getFullYear(), date.getMonth(), day), state.lifestyleType)
  }
  return weight
}

function remainingWeight(state: BudgetState, date: Date, endDay: number) {
  return Math.max(remainingWeightRaw(state, date, endDay), 1)
}

function calculatePlan(state: BudgetState, today: Date) {
  const monthEnd = daysInMonth(today)
  const nextPayDay = nextIncomeDay(state, today)
  const savingDeadline = Math.min(monthEnd, Math.max(today.getDate(), state.savingDeadline))
  const canReserveSavingNow = state.savingGoal > 0 && state.currentBalance >= state.savingGoal
  const paydayEnd = Math.min(monthEnd, nextPayDay - 1)
  const activeEnd = canReserveSavingNow
    ? savingDeadline
    : Math.max(today.getDate(), paydayEnd)
  const intervalIncome = incomeUntilDay(state, today, activeEnd, !canReserveSavingNow)
  const intervalFixed = fixedUntilDay(state, today, activeEnd, true)
  const intervalSpent = expenseUntilDay(state, today, activeEnd)
  const intervalSaving = canReserveSavingNow ? state.savingGoal : 0
  const budget = state.currentBalance + intervalIncome - intervalFixed - intervalSaving
  const spent = monthExpenseTotal(state, today)
  const remainingBudget = budget - intervalSpent
  const unit = remainingBudget / remainingWeight(state, today, activeEnd)
  const afterDeadlineStart = new Date(today.getFullYear(), today.getMonth(), activeEnd + 1)
  const currentDeadlineDate = new Date(today.getFullYear(), today.getMonth(), activeEnd)
  const afterDeadlineEnd = nextSavingDeadlineDate(state, currentDeadlineDate)
  const afterDeadlineIncome = canReserveSavingNow
    ? recurringAmountBetween(state.incomes, currentDeadlineDate, afterDeadlineEnd, false)
    : 0
  const afterDeadlineFixed = recurringAmountBetween(state.fixedItems, afterDeadlineStart, afterDeadlineEnd)
  const afterDeadlineSpent = expenseBetweenDates(state, afterDeadlineStart, afterDeadlineEnd)
  const afterDeadlineSaving = canReserveSavingNow && afterDeadlineIncome > 0 ? state.savingGoal : 0
  const afterDeadlineBudget = afterDeadlineIncome - afterDeadlineFixed - afterDeadlineSaving - afterDeadlineSpent
  const afterDeadlineUnit = afterDeadlineBudget / remainingWeightBetween(state, afterDeadlineStart, afterDeadlineEnd)
  const option = lifestyleOption(state.lifestyleType)
  const todaySpent = sumForDate(state, isoDate(today))
  const todayWeight = weightForDate(today, state.lifestyleType)
  const todayIsRecorded = todaySpent > 0 || isNoSpendDate(state, isoDate(today))
  const todayBaseBudget = remainingBudget + todaySpent
  const todayBaseWeight = remainingWeightRaw(state, today, activeEnd) + (todayIsRecorded ? todayWeight : 0)
  const todayAllowance = todayBaseBudget / Math.max(todayBaseWeight, 1) * todayWeight

  return {
    deadline: activeEnd,
    nextPayDay: nextPayDay <= monthEnd ? nextPayDay : null,
    mode: canReserveSavingNow ? 'saving' : 'survive',
    modeLabel: canReserveSavingNow ? '저축일까지 관리 중' : '입금일까지 버티기',
    futureIncome: intervalIncome,
    remainingFixed: intervalFixed,
    reservedSaving: intervalSaving,
    recordedSpending: intervalSpent,
    budget,
    spent,
    remainingBudget,
    weekday: unit * option.weekdayWeight,
    weekend: unit * option.weekendWeight,
    afterDeadlineUnit,
    todayAllowance,
    todaySpent,
    todayRemaining: todayAllowance - todaySpent,
  }
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
      onFocus={() => setText('')}
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

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <View style={[styles.metric, tone === 'good' && styles.metricGood, tone === 'warn' && styles.metricWarn, tone === 'bad' && styles.metricBad]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

function ExpenseRow({ item, onEdit, onDelete }: { item: ExpenseRecord; onEdit?: () => void; onDelete: () => void }) {
  return (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseMemo}>{item.memo || item.category}</Text>
        <Text style={styles.expenseSub}>{item.category} · {new Date(item.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Text style={styles.expenseAmount}>{money(item.amount)}</Text>
      {onEdit && (
        <TouchableOpacity style={styles.deleteButton} onPress={onEdit}>
          <Text style={styles.editText}>수정</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
        <Text style={styles.deleteText}>삭제</Text>
      </TouchableOpacity>
    </View>
  )
}

function EnvelopePicker({
  envelopes,
  value,
  onChange,
}: {
  envelopes: BudgetEnvelope[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <View style={styles.envelopeGrid}>
      {envelopes.map(envelope => (
        <TouchableOpacity
          key={envelope.id}
          style={[styles.envelopeChip, value === envelope.id && styles.envelopeChipActive]}
          onPress={() => onChange(envelope.id)}
        >
          <Text style={[styles.envelopeChipText, value === envelope.id && styles.envelopeChipTextActive]}>
            {envelope.name}
          </Text>
        </TouchableOpacity>
      ))}
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

export default function App() {
  const [state, setState] = useState<BudgetState>(initialState)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [quickAmount, setQuickAmount] = useState('')
  const [quickMemo, setQuickMemo] = useState('')
  const [quickCategory, setQuickCategory] = useState<Category>('식비')
  const [quickEnvelopeId, setQuickEnvelopeId] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalAmount, setModalAmount] = useState('')
  const [modalMemo, setModalMemo] = useState('')
  const [modalCategory, setModalCategory] = useState<Category>('식비')
  const [modalEnvelopeId, setModalEnvelopeId] = useState('')
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const today = useMemo(() => new Date(), [])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const todayKey = isoDate(today)
  const plan = calculatePlan(state, today)
  const envelopeStatuses = calculateEnvelopeStatus(state, today)

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
    const fallbackEnvelopeId = state.envelopes[0]?.id ?? ''
    if (!quickEnvelopeId && fallbackEnvelopeId) setQuickEnvelopeId(fallbackEnvelopeId)
    if (!modalEnvelopeId && fallbackEnvelopeId) setModalEnvelopeId(fallbackEnvelopeId)
  }, [modalEnvelopeId, quickEnvelopeId, state.envelopes])

  function patch(next: Partial<BudgetState>) {
    setState(prev => ({ ...prev, ...next }))
  }

  function hasEnvelope(envelopeId: string) {
    return state.envelopes.some(item => item.id === envelopeId)
  }

  function addExpense(date: string, amountText: string, memo: string, category: Category, envelopeId: string) {
    const amount = numeric(amountText)
    if (!amount) {
      Alert.alert('금액 입력', '쓴 금액을 입력해주세요.')
      return false
    }
    if (!hasEnvelope(envelopeId)) {
      Alert.alert('봉투 선택', '어느 봉투에서 쓸 돈인지 골라주세요.')
      return false
    }
    setState(prev => ({
      ...prev,
      noSpendDates: prev.noSpendDates.filter(item => item !== date),
      expenses: [
        ...prev.expenses,
        {
          id: makeId(),
          date,
          amount,
          memo: memo.trim(),
          category,
          envelopeId,
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    return true
  }

  function deleteExpense(id: string) {
    setState(prev => ({ ...prev, expenses: prev.expenses.filter(item => item.id !== id) }))
  }

  function toggleNoSpend(dateKey: string) {
    setState(prev => {
      const enabled = prev.noSpendDates.includes(dateKey)
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
    setModalEnvelopeId(item.envelopeId)
  }

  function saveModalExpense() {
    if (!selectedDate) return
    const amount = numeric(modalAmount)
    if (!amount) {
      Alert.alert('금액 입력', '쓴 금액을 입력해주세요.')
      return
    }
    if (!hasEnvelope(modalEnvelopeId)) {
      Alert.alert('봉투 선택', '어느 봉투에서 쓸 돈인지 골라주세요.')
      return
    }
    if (editingExpenseId) {
      setState(prev => ({
        ...prev,
        noSpendDates: prev.noSpendDates.filter(item => item !== selectedDate),
        expenses: prev.expenses.map(item => item.id === editingExpenseId
          ? { ...item, amount, memo: modalMemo.trim(), category: modalCategory, envelopeId: modalEnvelopeId }
          : item),
      }))
      setEditingExpenseId(null)
    } else {
      const saved = addExpense(selectedDate, modalAmount, modalMemo, modalCategory, modalEnvelopeId)
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
    patch({ incomes: [...state.incomes, { id: makeId(), name: '', day: 25, amount: 0 }] })
  }

  function updateIncome(id: string, updates: Partial<IncomeItem>) {
    patch({ incomes: state.incomes.map(item => item.id === id ? { ...item, ...updates } : item) })
  }

  function addFixed() {
    patch({ fixedItems: [...state.fixedItems, { id: makeId(), name: '', day: 25, amount: 0 }] })
  }

  function updateEnvelope(id: string, updates: Partial<BudgetEnvelope>) {
    patch({ envelopes: state.envelopes.map(item => item.id === id ? { ...item, ...updates } : item) })
  }

  function updateFixed(id: string, updates: Partial<FixedItem>) {
    patch({ fixedItems: state.fixedItems.map(item => item.id === id ? { ...item, ...updates } : item) })
  }

  function updateDailyNote(dateKey: string, note: string) {
    setState(prev => ({
      ...prev,
      dailyNotes: {
        ...prev.dailyNotes,
        [dateKey]: note,
      },
    }))
  }

  function renderSetup() {
    const canStartSetup = state.currentBalance > 0 || state.incomes.some(item => item.amount > 0)
    function finishSetup() {
      if (!canStartSetup) {
        Alert.alert('생활비 기준 필요', '현재 생활비 잔액이나 앞으로 들어올 돈 중 하나는 입력해주세요.')
        return
      }
      patch({ setupComplete: true })
    }

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, styles.setupContent]}
      >
        <View style={styles.setupHero}>
          <Text style={styles.eyebrow}>시작 설정</Text>
          <Text style={styles.setupTitle}>몇 가지만 물어볼게요</Text>
          <Text style={styles.setupCopy}>
            계좌 전체 금액 말고, 지금 당장 생활비로 써도 되는 돈부터 잡으면 계산이 훨씬 덜 헷갈립니다.
          </Text>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>1</Text>
          <Text style={styles.sectionTitle}>지금 생활비로 쓸 수 있는 돈이 얼마예요?</Text>
          <Text style={styles.helperText}>계좌 전체 잔액이 아니라, 저축/카드값을 빼고 실제로 써도 되는 돈입니다.</Text>
          <MoneyInput label="자유 생활비 잔액" value={state.currentBalance} onChange={value => patch({ currentBalance: value })} />
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>2</Text>
          <Text style={styles.sectionTitle}>다음 돈은 언제 얼마 들어와요?</Text>
          <Text style={styles.helperText}>월급이 두 번 들어오면 10일, 25일처럼 각각 추가하면 됩니다.</Text>
          {state.incomes.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>월급이나 용돈처럼 앞으로 들어올 돈이 있으면 추가해주세요.</Text>
            </View>
          )}
          {state.incomes.map(item => (
            <View key={item.id} style={styles.setupEditRow}>
              <View style={styles.setupNameField}>
                <Text style={styles.miniLabel}>용도</Text>
                <TextInput
                  style={styles.input}
                  value={item.name}
                  onChangeText={name => updateIncome(item.id, { name })}
                  placeholder="월급"
                  placeholderTextColor={colors.subtle}
                  selectTextOnFocus
                  autoCorrect={false}
                  spellCheck={false}
                />
              </View>
              <View style={styles.setupDayField}>
                <Text style={styles.miniLabel}>날짜 (일)</Text>
                <DayInput value={item.day} onChange={day => updateIncome(item.id, { day })} />
              </View>
              <View style={styles.setupMoneyField}>
                <Text style={styles.miniLabel}>금액</Text>
                <TextInput style={styles.input} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateIncome(item.id, { amount: numeric(amount) })} />
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={addIncome}>
            <Text style={styles.secondaryButtonText}>수입일 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>3</Text>
          <Text style={styles.sectionTitle}>언제까지 얼마를 남기고 싶어요?</Text>
          <Text style={styles.helperText}>목표가 없으면 0원으로 두고, 다음 입금일까지 버티는 계산만 볼 수 있습니다.</Text>
          <View style={styles.savingRow}>
            <View style={styles.savingDayField}>
              <DayField label="저축 마감일" value={state.savingDeadline} onChange={value => patch({ savingDeadline: value })} />
            </View>
            <View style={{ flex: 1 }}>
              <MoneyInput label="저축 목표 금액" value={state.savingGoal} onChange={value => patch({ savingGoal: value })} />
            </View>
          </View>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>4</Text>
          <Text style={styles.sectionTitle}>이번 달에 꼭 빠질 돈이 뭐예요?</Text>
          <Text style={styles.helperText}>데이트통장에 넣는 돈도 매달 빠지는 돈이면 고정 지출로 넣는 게 좋습니다.</Text>
          {state.fixedItems.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>관리비, 통신비, 데이트통장처럼 정해진 지출을 넣으면 더 정확해집니다.</Text>
            </View>
          )}
          {state.fixedItems.map(item => (
            <View key={item.id} style={styles.setupEditRow}>
              <View style={styles.setupNameField}>
                <Text style={styles.miniLabel}>용도</Text>
                <TextInput
                  style={styles.input}
                  value={item.name}
                  onChangeText={name => updateFixed(item.id, { name })}
                  placeholder="가스비"
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
              <TouchableOpacity style={styles.setupRemoveButton} onPress={() => patch({ fixedItems: state.fixedItems.filter(row => row.id !== item.id) })}><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={addFixed}>
            <Text style={styles.secondaryButtonText}>고정 지출 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>5</Text>
          <Text style={styles.sectionTitle}>생활 패턴을 골라주세요</Text>
          <Text style={styles.helperText}>주말에 돈을 더 쓰는 편인지, 모든 날을 비슷하게 볼지만 고르면 됩니다.</Text>
          <LifestylePicker value={state.lifestyleType} onChange={value => patch({ lifestyleType: value })} />
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>6</Text>
          <Text style={styles.sectionTitle}>이번 달 봉투예산을 정해볼까요?</Text>
          <Text style={styles.helperText}>하루한도는 그대로 계산하고, 봉투는 어디에 얼마 남았는지 같이 보여줍니다.</Text>
          {state.envelopes.map(envelope => (
            <View key={envelope.id} style={styles.setupEnvelopeRow}>
              <View style={styles.setupEnvelopeNameField}>
                <Text style={styles.miniLabel}>봉투</Text>
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
                <Text style={styles.miniLabel}>월 한도</Text>
                <TextInput
                  style={styles.input}
                  value={envelope.monthlyLimit ? envelope.monthlyLimit.toLocaleString('ko-KR') : ''}
                  keyboardType="numeric"
                  onChangeText={amount => updateEnvelope(envelope.id, { monthlyLimit: numeric(amount) })}
                  placeholder="0"
                  placeholderTextColor={colors.subtle}
                />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[styles.primaryButton, !canStartSetup && styles.primaryButtonMuted]} onPress={finishSetup}>
          <Text style={styles.primaryButtonText}>계산 시작하기</Text>
        </TouchableOpacity>
      </ScrollView>
    )
  }

  function renderHome() {
    const todayRecords = recordsForDate(state, todayKey)

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>오늘</Text>
          <Text style={styles.heroTitle}>오늘 남은 돈</Text>
          <Text style={[styles.heroMoney, plan.todayRemaining < 0 && styles.dangerText]}>{money(plan.todayRemaining)}</Text>
          <Text style={styles.modePill}>{plan.modeLabel}</Text>
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.sectionTitle}>지출 빠른 입력</Text>
          <View style={styles.quickRow}>
            <TextInput
              style={[styles.input, styles.quickAmount]}
              value={quickAmount}
              onChangeText={text => setQuickAmount(formatMoneyText(text))}
              placeholder="금액"
              keyboardType="numeric"
              autoCorrect={false}
              spellCheck={false}
              placeholderTextColor={colors.subtle}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={quickMemo}
              onChangeText={setQuickMemo}
              placeholder="메모 예: 점심"
              autoCorrect={false}
              spellCheck={false}
              placeholderTextColor={colors.subtle}
            />
          </View>
          <View style={styles.chipGrid}>
            {CATEGORIES.map(category => (
              <View key={category} style={styles.chipSlot}>
                <TouchableOpacity
                  style={[styles.chip, quickCategory === category && styles.chipActive]}
                  onPress={() => setQuickCategory(category)}
                >
                  <Text style={[styles.chipText, quickCategory === category && styles.chipTextActive]}>{category}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>어느 봉투에서 쓸까요?</Text>
            <EnvelopePicker envelopes={state.envelopes} value={quickEnvelopeId} onChange={setQuickEnvelopeId} />
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              const saved = addExpense(todayKey, quickAmount, quickMemo, quickCategory, quickEnvelopeId)
              if (!saved) return
              setQuickAmount('')
              setQuickMemo('')
            }}
          >
            <Text style={styles.primaryButtonText}>오늘 지출 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>이번 달 봉투</Text>
          <Text style={styles.helperText}>오늘 한도와 별개로, 용도별로 어디가 먼저 줄고 있는지 봅니다.</Text>
          {envelopeStatuses.map(envelope => (
            <View
              key={envelope.id}
              style={[
                styles.envelopeStatusCard,
                envelope.warning === 'watch' && styles.envelopeStatusWatch,
                envelope.warning === 'over' && styles.envelopeStatusOver,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.envelopeStatusName}>{envelope.name}</Text>
                <Text style={styles.envelopeStatusMeta}>
                  {money(envelope.spent)} 사용 · {money(envelope.monthlyLimit)} 한도
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
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 기록</Text>
          {todayRecords.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>아직 기록한 지출이 없습니다.</Text>
            </View>
          ) : todayRecords.map(item => (
            <ExpenseRow
              key={item.id}
              item={item}
              onEdit={() => {
                setSelectedDate(item.date)
                startEditingExpense(item)
              }}
              onDelete={() => deleteExpense(item.id)}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 메모</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={state.dailyNotes[todayKey] ?? ''}
            onChangeText={note => updateDailyNote(todayKey, note)}
            placeholder="예: 저녁 약속 있음"
            placeholderTextColor={colors.subtle}
            autoCorrect={false}
            spellCheck={false}
            multiline
          />
        </View>

      </ScrollView>
    )
  }

  function renderCalendar() {
    const totalDays = daysInMonth(calendarMonth)
    const calendarPlan = sameMonth(calendarMonth, today)
      ? plan
      : calculatePlan(state, calendarMonth)
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
            <TouchableOpacity style={styles.monthButton} onPress={() => setCalendarMonth(prev => addMonths(prev, -1))}>
              <Text style={styles.monthButtonText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.todayButton} onPress={() => setCalendarMonth(startOfMonth(today))}>
              <Text style={styles.todayButtonText}>오늘</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.monthButton} onPress={() => setCalendarMonth(prev => addMonths(prev, 1))}>
              <Text style={styles.monthButtonText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS.map(day => <Text key={day} style={styles.weekLabel}>{day}</Text>)}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendUnder]} /><Text style={styles.legendText}>적게 씀</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendOver]} /><Text style={styles.legendText}>초과</Text></View>
          <View style={styles.legendItem}><View style={styles.legendToday} /><Text style={styles.legendText}>오늘</Text></View>
          <View style={styles.legendItem}><View style={styles.legendFixed} /><Text style={styles.legendText}>고정</Text></View>
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
            const allowance = allowanceForDate(date, calendarPlan, state.lifestyleType)
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
              >
                <View style={[styles.dayNumberBadge, isToday && styles.dayNumberBadgeToday]}>
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day}</Text>
                </View>
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

  function renderSettings() {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>설정</Text>
          <View style={styles.autoSaveNotice}>
            <Text style={styles.autoSaveText}>변경사항은 자동으로 저장됩니다.</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>생활비 기준</Text>
          <MoneyInput label="지금 당장 생활비로 써도 되는 돈" value={state.currentBalance} onChange={value => patch({ currentBalance: value })} />
          <View style={styles.savingRow}>
            <View style={styles.savingDayField}>
              <DayField label="저축 마감일" value={state.savingDeadline} onChange={value => patch({ savingDeadline: value })} />
            </View>
            <View style={{ flex: 1 }}>
              <MoneyInput label="저축 목표 금액" value={state.savingGoal} onChange={value => patch({ savingGoal: value })} />
            </View>
          </View>
          <LifestylePicker value={state.lifestyleType} onChange={value => patch({ lifestyleType: value })} />
        </View>

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
            <View key={item.id} style={styles.editRow}>
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
              <DayInput value={item.day} onChange={day => updateIncome(item.id, { day })} />
              <TextInput style={[styles.input, styles.moneySmall]} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateIncome(item.id, { amount: numeric(amount) })} />
              <TouchableOpacity onPress={() => patch({ incomes: state.incomes.filter(row => row.id !== item.id) })}><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
            </View>
          ))}
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
              <TouchableOpacity onPress={() => patch({ fixedItems: state.fixedItems.filter(row => row.id !== item.id) })}><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>이번 달 봉투예산</Text>
          <Text style={styles.helperText}>이름과 월 한도를 바꾸면 다음 지출부터 바로 반영됩니다.</Text>
          {state.envelopes.map(envelope => (
            <View key={envelope.id} style={styles.envelopeEditRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={envelope.name}
                onChangeText={name => updateEnvelope(envelope.id, { name })}
                placeholder="봉투 이름"
                placeholderTextColor={colors.subtle}
                selectTextOnFocus
                autoCorrect={false}
                spellCheck={false}
              />
              <TextInput
                style={[styles.input, styles.moneySmall]}
                value={envelope.monthlyLimit ? envelope.monthlyLimit.toLocaleString('ko-KR') : ''}
                keyboardType="numeric"
                onChangeText={amount => updateEnvelope(envelope.id, { monthlyLimit: numeric(amount) })}
                placeholder="월 한도"
                placeholderTextColor={colors.subtle}
              />
            </View>
          ))}
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
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          {!loaded && (
            <View style={styles.loading}>
              <Text style={styles.emptyText}>불러오는 중입니다.</Text>
            </View>
          )}
          {loaded && !state.setupComplete && renderSetup()}
          {loaded && state.setupComplete && tab === 'home' && renderHome()}
          {loaded && state.setupComplete && tab === 'calendar' && renderCalendar()}
          {loaded && state.setupComplete && tab === 'settings' && renderSettings()}
        </KeyboardAvoidingView>

        {loaded && state.setupComplete && (
          <View style={styles.tabBar}>
            {([
              ['home', '홈'],
              ['calendar', '캘린더'],
              ['settings', '설정'],
            ] as [Tab, string][]).map(([key, label]) => (
              <TouchableOpacity key={key} style={styles.tabButton} onPress={() => setTab(key)}>
                <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Modal visible={!!selectedDate} animationType="none" transparent onRequestClose={closeExpenseModal}>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalDimissZone} activeOpacity={1} onPress={closeExpenseModal} />
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
                <TouchableOpacity onPress={closeExpenseModal}>
                  <Text style={styles.addText}>닫기</Text>
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
                  onPress={() => toggleNoSpend(selectedDate)}
                >
                  <Text style={[styles.noSpendText, modalNoSpend && styles.noSpendTextActive]}>
                    {modalNoSpend ? '무지출 체크됨' : '오늘은 무지출'}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.quickRow}>
                <TextInput
                  style={[styles.input, styles.quickAmount]}
                  value={modalAmount}
                  onChangeText={text => setModalAmount(formatMoneyText(text))}
                  placeholder="금액"
                  keyboardType="numeric"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholderTextColor={colors.subtle}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={modalMemo}
                  onChangeText={setModalMemo}
                  placeholder="메모 예: 점심"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholderTextColor={colors.subtle}
                />
              </View>
              <View style={styles.chipGrid}>
                {CATEGORIES.map(category => (
                  <View key={category} style={styles.chipSlot}>
                    <TouchableOpacity
                      style={[styles.chip, modalCategory === category && styles.chipActive]}
                      onPress={() => setModalCategory(category)}
                    >
                      <Text style={[styles.chipText, modalCategory === category && styles.chipTextActive]}>{category}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>어느 봉투에서 쓸까요?</Text>
                <EnvelopePicker envelopes={state.envelopes} value={modalEnvelopeId} onChange={setModalEnvelopeId} />
              </View>
              <TouchableOpacity
                style={styles.primaryButton}
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
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appName: { fontSize: 19, fontWeight: '900', color: colors.text },
  dateText: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '700' },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, gap: 12, paddingBottom: 28 },
  setupContent: { paddingBottom: 48 },
  calendarScreen: { flex: 1, paddingHorizontal: 10, paddingTop: 16, paddingBottom: 8 },
  setupHero: {
    backgroundColor: colors.text,
    borderRadius: 8,
    padding: 18,
  },
  setupTitle: { marginTop: 10, color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  setupCopy: { marginTop: 8, color: '#CBD5E1', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  questionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 10,
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
    fontWeight: '900',
  },
  savingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  savingDayField: { width: 86 },
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 18,
  },
  eyebrow: { fontSize: 11, color: colors.tealDark, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 10, fontSize: 14, color: colors.muted, fontWeight: '800' },
  heroMoney: { marginTop: 4, fontSize: 36, color: colors.text, fontWeight: '900' },
  modePill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.tealDark,
    backgroundColor: colors.tealLight,
    fontSize: 12,
    fontWeight: '900',
  },
  dangerText: { color: colors.danger },
  heroSub: { marginTop: 6, fontSize: 13, color: colors.muted, fontWeight: '700' },
  quickCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  helperText: { marginTop: -4, color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  breakdownBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
    backgroundColor: '#F8FAFC',
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  breakdownLabel: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '800' },
  breakdownValue: { color: colors.text, fontSize: 12, fontWeight: '900' },
  breakdownPlus: { color: colors.tealDark },
  breakdownMinus: { color: colors.danger },
  breakdownDivider: { height: 1, backgroundColor: colors.border, marginVertical: 1 },
  quickRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  quickAmount: { width: 112 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMd,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
    backgroundColor: colors.surface,
  },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.muted, fontWeight: '800' },
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 1,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.tealLight, borderColor: colors.teal },
  chipText: { fontSize: 12, color: colors.muted, fontWeight: '800' },
  chipTextActive: { color: colors.tealDark },
  envelopeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  envelopeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  envelopeChipActive: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  envelopeChipText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  envelopeChipTextActive: { color: colors.tealDark },
  lifestyleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 11,
    backgroundColor: colors.surface,
  },
  lifestyleOptionActive: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  lifestyleTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  lifestyleTitleActive: { color: colors.tealDark },
  lifestyleDescription: { marginTop: 2, color: colors.muted, fontSize: 12, fontWeight: '700' },
  lifestyleWeight: { color: colors.subtle, fontSize: 11, fontWeight: '900' },
  primaryButton: {
    backgroundColor: colors.text,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryButtonMuted: { backgroundColor: colors.muted },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderMd,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  envelopeStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  envelopeStatusWatch: {
    borderColor: '#FDE68A',
    backgroundColor: colors.warningBg,
  },
  envelopeStatusOver: {
    borderColor: colors.overBorder,
    backgroundColor: colors.overBg,
  },
  envelopeStatusName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  envelopeStatusMeta: { marginTop: 3, color: colors.muted, fontSize: 12, fontWeight: '700' },
  envelopeStatusRight: { alignItems: 'flex-end' },
  envelopeStatusRemaining: { color: colors.text, fontSize: 15, fontWeight: '900' },
  envelopeWarningText: { marginTop: 3, color: colors.warning, fontSize: 11, fontWeight: '900' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    width: '48.8%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  metricGood: { backgroundColor: colors.successBg, borderColor: '#BBF7D0' },
  metricWarn: { backgroundColor: colors.warningBg, borderColor: '#FDE68A' },
  metricBad: { backgroundColor: colors.dangerBg, borderColor: '#FECACA' },
  metricLabel: { fontSize: 11, color: colors.muted, fontWeight: '900' },
  metricValue: { marginTop: 6, fontSize: 17, color: colors.text, fontWeight: '900' },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.surface,
  },
  expenseMemo: { fontSize: 14, fontWeight: '900', color: colors.text },
  expenseSub: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '700' },
  expenseAmount: { fontSize: 14, fontWeight: '900', color: colors.text },
  deleteButton: { paddingHorizontal: 8, paddingVertical: 6 },
  editText: { fontSize: 12, color: colors.tealDark, fontWeight: '900' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '900' },
  inlinePill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: colors.tealDark,
    backgroundColor: colors.tealLight,
    fontSize: 12,
    fontWeight: '900',
  },
  overText: { color: colors.danger },
  underText: { color: colors.success },
  noteInput: {
    minHeight: 86,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  weekBudgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
  },
  weekBudgetDate: { fontSize: 14, fontWeight: '900', color: colors.text },
  weekBudgetSub: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '700' },
  weekBudgetRight: { alignItems: 'flex-end' },
  weekBudgetLabel: { fontSize: 11, fontWeight: '900', color: colors.subtle },
  weekBudgetMoney: { marginTop: 2, fontSize: 15, fontWeight: '900', color: colors.text },
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  emptyText: { color: colors.subtle, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 16,
  },
  title: { marginTop: 6, fontSize: 28, fontWeight: '900', color: colors.text },
  autoSaveNotice: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  autoSaveText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthButtonText: { color: colors.text, fontSize: 24, fontWeight: '900', lineHeight: 26 },
  todayButton: {
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.text,
  },
  todayButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  note: { marginTop: 6, color: colors.muted, fontSize: 13, fontWeight: '800' },
  weekRow: { flexDirection: 'row', paddingBottom: 12 },
  weekLabel: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 13, fontWeight: '800' },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 12,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendUnder: { backgroundColor: colors.underBorder },
  legendOver: { backgroundColor: colors.overBorder },
  legendToday: { width: 12, height: 12, borderRadius: 999, backgroundColor: colors.text },
  legendFixed: { width: 16, height: 8, borderRadius: 999, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: '#FDE68A' },
  legendText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
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
    backgroundColor: '#F8FAFC',
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
    minWidth: 21,
    height: 21,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberBadgeToday: { backgroundColor: colors.text },
  dayNumber: { fontSize: 13, color: colors.subtle, fontWeight: '800' },
  dayNumberToday: { color: '#FFFFFF', fontWeight: '900' },
  dayMoney: {
    alignSelf: 'center',
    minWidth: 42,
    marginTop: 9,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  dayBudgetMoney: { color: colors.text },
  daySpentMoney: { color: colors.text },
  fixedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 2,
    marginTop: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  fixedBadgeText: {
    color: colors.warning,
    fontSize: 9,
    fontWeight: '900',
  },
  fixedBadgeCount: { color: colors.warning, fontSize: 9, fontWeight: '900' },
  fixedList: {
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    backgroundColor: colors.warningBg,
    padding: 10,
    gap: 7,
  },
  fixedListTitle: { color: colors.warning, fontSize: 12, fontWeight: '900' },
  fixedListRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  fixedListName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '900' },
  fixedListAmount: { color: colors.warning, fontSize: 13, fontWeight: '900' },
  noSpendButton: {
    borderWidth: 1,
    borderColor: colors.borderMd,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  noSpendButtonActive: { backgroundColor: colors.successBg, borderColor: colors.underBorder },
  noSpendText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  noSpendTextActive: { color: colors.success },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabText: { fontSize: 13, color: colors.subtle, fontWeight: '900' },
  tabTextActive: { color: colors.tealDark },
  addText: { color: colors.tealDark, fontWeight: '900', fontSize: 13 },
  removeText: { color: colors.danger, fontWeight: '900', fontSize: 12 },
  editRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  envelopeEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  setupEnvelopeRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-end' },
  setupEnvelopeNameField: { flex: 1, gap: 5 },
  setupEnvelopeMoneyField: { width: 112, gap: 5 },
  setupEditRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-end' },
  setupNameField: { flex: 1, gap: 5 },
  setupDayField: { width: 58, gap: 5 },
  setupMoneyField: { width: 104, gap: 5 },
  setupRemoveButton: { paddingBottom: 12, paddingLeft: 1 },
  miniLabel: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  dayInput: { width: 48, textAlign: 'center' },
  moneySmall: { width: 112 },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalSheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDimissZone: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 18,
    gap: 12,
    maxHeight: '78%',
    zIndex: 1,
  },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { marginTop: 6, fontSize: 18, fontWeight: '900', color: colors.text },
})
