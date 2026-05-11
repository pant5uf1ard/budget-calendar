import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  InputAccessoryView,
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
type Category = '식비' | '카페' | '교통' | '술/약속' | '데이트' | '쇼핑' | '생활' | '기타'
type LifestyleType = 'balanced' | 'worker' | 'weekendSocial' | 'weekendHeavy'

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
  createdAt: string
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
  expenses: ExpenseRecord[]
  dailyNotes: Record<string, string>
  noSpendDates: string[]
}

const STORAGE_KEY = 'budget-calendar-mobile-v1'
const CATEGORIES: Category[] = ['식비', '카페', '교통', '술/약속', '데이트', '쇼핑', '생활', '기타']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const LIFESTYLE_OPTIONS: { key: LifestyleType; title: string; description: string; weekdayWeight: number; weekendWeight: number }[] = [
  { key: 'balanced', title: '균등형', description: '요일 상관없이 비슷하게 써요', weekdayWeight: 1, weekendWeight: 1 },
  { key: 'worker', title: '직장인 기본형', description: '평일은 적게, 주말은 조금 더 써요', weekdayWeight: 0.8, weekendWeight: 1.6 },
  { key: 'weekendSocial', title: '주말 약속형', description: '평일은 아끼고, 주말 약속이 잦아요', weekdayWeight: 0.65, weekendWeight: 2 },
  { key: 'weekendHeavy', title: '주말 몰빵형', description: '평일은 거의 안 쓰고, 주말에 크게 써요', weekdayWeight: 0.45, weekendWeight: 2.8 },
]

const initialState: BudgetState = {
  setupComplete: false,
  currentBalance: 300000,
  savingGoal: 300000,
  savingDeadline: 25,
  lifestyleType: 'worker',
  incomes: [
    { id: 'income-1', name: '1차 급여', day: 10, amount: 1250000 },
    { id: 'income-2', name: '2차 급여', day: 25, amount: 1250000 },
  ],
  fixedItems: [
    { id: 'fixed-1', name: '관리비', day: 28, amount: 180000 },
    { id: 'fixed-2', name: '통신비', day: 12, amount: 90000 },
    { id: 'fixed-3', name: '구독/보험', day: 20, amount: 150000 },
  ],
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
  return name.trim().slice(0, 2) || '고정'
}

function numeric(value: string) {
  return Number(value.replace(/[^\d]/g, '') || 0)
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

function remainingWeight(state: BudgetState, date: Date, endDay: number) {
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
  return Math.max(weight, 1)
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
  const intervalIncome = incomeUntilDay(state, today, activeEnd, canReserveSavingNow)
  const intervalFixed = fixedUntilDay(state, today, activeEnd, true)
  const intervalSpent = expenseUntilDay(state, today, activeEnd)
  const intervalSaving = canReserveSavingNow ? state.savingGoal : 0
  const budget = state.currentBalance + intervalIncome - intervalFixed - intervalSaving
  const spent = monthExpenseTotal(state, today)
  const remainingBudget = budget - intervalSpent
  const unit = remainingBudget / remainingWeight(state, today, activeEnd)
  const monthIncome = incomeUntilDay(state, today, monthEnd, true)
  const monthFixed = fixedUntilDay(state, today, monthEnd, true)
  const monthBudget = state.currentBalance + monthIncome - monthFixed - state.savingGoal
  const monthUnit = (monthBudget - spent) / remainingWeight(state, today, monthEnd)
  const todayAllowance = unit * weightForDate(today, state.lifestyleType)
  const option = lifestyleOption(state.lifestyleType)
  const todaySpent = sumForDate(state, isoDate(today))

  return {
    deadline: activeEnd,
    nextPayDay: nextPayDay <= monthEnd ? nextPayDay : null,
    mode: canReserveSavingNow ? 'saving' : 'survive',
    modeLabel: canReserveSavingNow ? '저축일까지 관리 중' : '입금일까지 버티기',
    futureIncome: intervalIncome,
    remainingFixed: intervalFixed,
    budget,
    spent,
    remainingBudget,
    weekday: unit * option.weekdayWeight,
    weekend: unit * option.weekendWeight,
    afterDeadlineUnit: monthUnit,
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

  useEffect(() => {
    setText(`${value}`)
  }, [value])

  function commit(nextText = text) {
    const nextValue = numeric(nextText)
    const clamped = nextValue ? clampDay(nextValue) : 1
    setText(`${clamped}`)
    onChange(clamped)
  }

  return (
    <TextInput
      style={[styles.input, styles.dayInput]}
      value={text}
      keyboardType="numeric"
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

export default function App() {
  const accessoryId = 'budget-calendar-keyboard-actions'
  const [state, setState] = useState<BudgetState>(initialState)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [quickAmount, setQuickAmount] = useState('')
  const [quickMemo, setQuickMemo] = useState('')
  const [quickCategory, setQuickCategory] = useState<Category>('식비')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalAmount, setModalAmount] = useState('')
  const [modalMemo, setModalMemo] = useState('')
  const [modalCategory, setModalCategory] = useState<Category>('식비')
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const today = useMemo(() => new Date(), [])
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const todayKey = isoDate(today)
  const plan = calculatePlan(state, today)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (value) {
          const saved = JSON.parse(value)
          setState({ ...initialState, ...saved, lifestyleType: saved.lifestyleType ?? initialState.lifestyleType })
        }
      })
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [loaded, state])

  function patch(next: Partial<BudgetState>) {
    setState(prev => ({ ...prev, ...next }))
  }

  function addExpense(date: string, amountText: string, memo: string, category: Category) {
    const amount = numeric(amountText)
    if (!amount) {
      Alert.alert('금액 입력', '쓴 금액을 입력해주세요.')
      return
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
          createdAt: new Date().toISOString(),
        },
      ],
    }))
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
  }

  function saveModalExpense() {
    if (!selectedDate) return
    const amount = numeric(modalAmount)
    if (!amount) {
      Alert.alert('금액 입력', '쓴 금액을 입력해주세요.')
      return
    }
    if (editingExpenseId) {
      setState(prev => ({
        ...prev,
        noSpendDates: prev.noSpendDates.filter(item => item !== selectedDate),
        expenses: prev.expenses.map(item => item.id === editingExpenseId
          ? { ...item, amount, memo: modalMemo.trim(), category: modalCategory }
          : item),
      }))
      setEditingExpenseId(null)
    } else {
      addExpense(selectedDate, modalAmount, modalMemo, modalCategory)
    }
    setModalAmount('')
    setModalMemo('')
    Keyboard.dismiss()
  }

  function closeExpenseModal() {
    Keyboard.dismiss()
    setSelectedDate(null)
    setEditingExpenseId(null)
    setModalAmount('')
    setModalMemo('')
  }

  function addIncome() {
    patch({ incomes: [...state.incomes, { id: makeId(), name: '새 수입', day: 25, amount: 0 }] })
  }

  function updateIncome(id: string, updates: Partial<IncomeItem>) {
    patch({ incomes: state.incomes.map(item => item.id === id ? { ...item, ...updates } : item) })
  }

  function addFixed() {
    patch({ fixedItems: [...state.fixedItems, { id: makeId(), name: '새 고정 지출', day: 25, amount: 0 }] })
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
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, styles.setupContent]}
      >
        <View style={styles.setupHero}>
          <Text style={styles.eyebrow}>Initial setup</Text>
          <Text style={styles.setupTitle}>몇 가지만 물어볼게요</Text>
          <Text style={styles.setupCopy}>
            계좌 전체 금액 말고, 지금 당장 생활비로 써도 되는 돈부터 잡으면 계산이 훨씬 덜 헷갈립니다.
          </Text>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>1</Text>
          <Text style={styles.sectionTitle}>지금 생활비로 쓸 수 있는 돈이 얼마예요?</Text>
          <MoneyInput label="자유 생활비 잔액" value={state.currentBalance} onChange={value => patch({ currentBalance: value })} />
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>2</Text>
          <Text style={styles.sectionTitle}>다음 돈은 언제 얼마 들어와요?</Text>
          {state.incomes.map(item => (
            <View key={item.id} style={styles.editRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={item.name} onChangeText={name => updateIncome(item.id, { name })} />
              <DayInput value={item.day} onChange={day => updateIncome(item.id, { day })} />
              <TextInput style={[styles.input, styles.moneySmall]} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateIncome(item.id, { amount: numeric(amount) })} />
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={addIncome}>
            <Text style={styles.secondaryButtonText}>수입일 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>3</Text>
          <Text style={styles.sectionTitle}>언제까지 얼마를 남기고 싶어요?</Text>
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
          {state.fixedItems.map(item => (
            <View key={item.id} style={styles.editRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={item.name} onChangeText={name => updateFixed(item.id, { name })} />
              <DayInput value={item.day} onChange={day => updateFixed(item.id, { day })} />
              <TextInput style={[styles.input, styles.moneySmall]} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateFixed(item.id, { amount: numeric(amount) })} />
              <TouchableOpacity onPress={() => patch({ fixedItems: state.fixedItems.filter(row => row.id !== item.id) })}><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={addFixed}>
            <Text style={styles.secondaryButtonText}>고정 지출 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>5</Text>
          <Text style={styles.sectionTitle}>생활 패턴을 골라주세요</Text>
          <LifestylePicker value={state.lifestyleType} onChange={value => patch({ lifestyleType: value })} />
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={() => patch({ setupComplete: true })}>
          <Text style={styles.primaryButtonText}>계산 시작하기</Text>
        </TouchableOpacity>
      </ScrollView>
    )
  }

  function renderHome() {
    const todayRecords = recordsForDate(state, todayKey)
    const recentDays = [0, -1, -2].map(offset => {
      const date = addDays(today, offset)
      return {
        date,
        key: isoDate(date),
        label: offset === 0 ? '오늘' : offset === -1 ? '어제' : '그제',
      }
    })
    const daysUntilPayday = plan.nextPayDay ? Math.max(0, plan.nextPayDay - today.getDate()) : null

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Today</Text>
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
              onChangeText={text => setQuickAmount(numeric(text).toLocaleString('ko-KR'))}
              placeholder="금액"
              keyboardType="numeric"
              placeholderTextColor={colors.subtle}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={quickMemo}
              onChangeText={setQuickMemo}
              placeholder="메모 예: 카페"
              placeholderTextColor={colors.subtle}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CATEGORIES.map(category => (
              <TouchableOpacity
                key={category}
                style={[styles.chip, quickCategory === category && styles.chipActive]}
                onPress={() => setQuickCategory(category)}
              >
                <Text style={[styles.chipText, quickCategory === category && styles.chipTextActive]}>{category}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              addExpense(todayKey, quickAmount, quickMemo, quickCategory)
              setQuickAmount('')
              setQuickMemo('')
            }}
          >
            <Text style={styles.primaryButtonText}>오늘 지출 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>최근 3일</Text>
            {daysUntilPayday !== null && (
              <Text style={styles.inlinePill}>다음 입금까지 {daysUntilPayday}일</Text>
            )}
          </View>
          {recentDays.map(day => {
            const spent = sumForDate(state, day.key)
            const allowance = allowanceForDate(day.date, plan, state.lifestyleType)
            const tone = dayTone(state, day.key, spent, allowance)
            return (
              <View
                key={day.key}
                style={[
                  styles.dailySummaryRow,
                  tone === 'over' && styles.dailySummaryOver,
                  tone === 'under' && styles.dailySummaryUnder,
                ]}
              >
                <View>
                  <Text style={styles.dailySummaryLabel}>{day.label}</Text>
                  <Text style={styles.dailySummaryDate}>{day.date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })}</Text>
                </View>
                <Text
                  style={[
                    styles.dailySummaryMoney,
                    tone === 'over' && styles.overText,
                    tone === 'under' && styles.underText,
                  ]}
                >
                  {money(spent)}
                </Text>
              </View>
            )
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 메모</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={state.dailyNotes[todayKey] ?? ''}
            onChangeText={note => updateDailyNote(todayKey, note)}
            placeholder="예: 저녁 약속 있음"
            placeholderTextColor={colors.subtle}
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 기록</Text>
          {todayRecords.length === 0 ? (
            <Text style={styles.emptyText}>오늘 기록한 지출이 없습니다.</Text>
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
            <Text style={styles.eyebrow}>Calendar</Text>
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
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayCell,
                  isToday && styles.dayToday,
                  tone === 'over' && styles.dayOver,
                  tone === 'under' && styles.dayUnder,
                ]}
                onPress={() => setSelectedDate(dateKey)}
              >
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day}</Text>
                <Text
                  style={[
                    styles.dayMoney,
                    total > 0 ? styles.daySpentMoney : styles.dayBudgetMoney,
                    tone === 'over' && styles.overText,
                    tone === 'under' && styles.underText,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {total > 0 ? calendarMoney(total) : calendarMoney(allowance)}
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
        <Text style={styles.title}>설정</Text>
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
          {state.incomes.map(item => (
            <View key={item.id} style={styles.editRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={item.name} onChangeText={name => updateIncome(item.id, { name })} />
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
          {state.fixedItems.map(item => (
            <View key={item.id} style={styles.editRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={item.name} onChangeText={name => updateFixed(item.id, { name })} />
              <DayInput value={item.day} onChange={day => updateFixed(item.id, { day })} />
              <TextInput style={[styles.input, styles.moneySmall]} value={item.amount ? item.amount.toLocaleString('ko-KR') : ''} keyboardType="numeric" onChangeText={amount => updateFixed(item.id, { amount: numeric(amount) })} />
              <TouchableOpacity onPress={() => patch({ fixedItems: state.fixedItems.filter(row => row.id !== item.id) })}><Text style={styles.removeText}>삭제</Text></TouchableOpacity>
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

        <Modal visible={!!selectedDate} animationType="slide" transparent>
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={12}
          >
            <TouchableOpacity style={styles.modalDimissZone} activeOpacity={1} onPress={Keyboard.dismiss} />
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
                  onChangeText={text => setModalAmount(numeric(text).toLocaleString('ko-KR'))}
                  placeholder="금액"
                  keyboardType="numeric"
                  inputAccessoryViewID={accessoryId}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  placeholderTextColor={colors.subtle}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={modalMemo}
                  onChangeText={setModalMemo}
                  placeholder="메모"
                  inputAccessoryViewID={accessoryId}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  placeholderTextColor={colors.subtle}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {CATEGORIES.map(category => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.chip, modalCategory === category && styles.chipActive]}
                    onPress={() => setModalCategory(category)}
                  >
                    <Text style={[styles.chipText, modalCategory === category && styles.chipTextActive]}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
              <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
                {modalRecords.length === 0 ? (
                  <Text style={styles.emptyText}>이 날짜의 기록이 없습니다.</Text>
                ) : modalRecords.map(item => (
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
            </View>
            {Platform.OS === 'ios' && (
              <InputAccessoryView nativeID={accessoryId}>
                <View style={styles.keyboardAccessory}>
                  <TouchableOpacity onPress={Keyboard.dismiss}>
                    <Text style={styles.keyboardAccessoryText}>닫기</Text>
                  </TouchableOpacity>
                </View>
              </InputAccessoryView>
            )}
          </KeyboardAvoidingView>
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
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.tealLight, borderColor: colors.teal },
  chipText: { fontSize: 12, color: colors.muted, fontWeight: '800' },
  chipTextActive: { color: colors.tealDark },
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
  dailySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  dailySummaryOver: { backgroundColor: colors.overBg, borderColor: colors.overBorder },
  dailySummaryUnder: { backgroundColor: colors.underBg, borderColor: colors.underBorder },
  dailySummaryLabel: { fontSize: 14, fontWeight: '900', color: colors.text },
  dailySummaryDate: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.muted },
  dailySummaryMoney: { fontSize: 16, fontWeight: '900', color: colors.text },
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
  emptyText: { color: colors.subtle, fontSize: 13, fontWeight: '700' },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 16,
  },
  title: { marginTop: 6, fontSize: 28, fontWeight: '900', color: colors.text },
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
  weekRow: { flexDirection: 'row', paddingBottom: 8 },
  weekLabel: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 13, fontWeight: '900' },
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
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  dayToday: { backgroundColor: colors.tealLight },
  dayOver: { backgroundColor: colors.overBg },
  dayUnder: { backgroundColor: colors.underBg },
  dayNumber: { fontSize: 13, color: colors.subtle, fontWeight: '800' },
  dayNumberToday: { color: colors.tealDark, fontWeight: '900' },
  dayMoney: { marginTop: 13, fontSize: 16, fontWeight: '900' },
  dayBudgetMoney: { color: colors.text },
  daySpentMoney: { color: colors.text },
  fixedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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
  dayInput: { width: 48, textAlign: 'center' },
  moneySmall: { width: 112 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDimissZone: { flex: 1 },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 18,
    gap: 12,
    maxHeight: '78%',
  },
  keyboardAccessory: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.borderMd,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  keyboardAccessoryText: { color: colors.tealDark, fontSize: 15, fontWeight: '900' },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { marginTop: 6, fontSize: 18, fontWeight: '900', color: colors.text },
})
