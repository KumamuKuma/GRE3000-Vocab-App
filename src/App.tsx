import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Database,
  Home,
  RefreshCw,
  Search,
  Shuffle,
  Volume2,
  XCircle,
} from 'lucide-react'
import './App.css'
import {
  GROUP_SIZE,
  TOTAL_GROUPS,
  VOCAB_TOTAL,
  vocab,
  type VocabWord,
} from './data/vocab'

type Progress = {
  passedIds: number[]
  errorCounts: Record<string, number>
  lastStageOneGroup: number
  updatedAt: string
}

type RevealState = {
  selected: string
  wordId: number
}

type StageOneState = {
  mode: 'stage1'
  groupIndex: number
  cardIndex: number
}

type StageTwoState = {
  mode: 'stage2'
  groupIndex: number
  queueIds: number[]
  currentIndex: number
  round: number
  missedIds: number[]
  previousId: number | null
  revealed: RevealState | null
}

type StageThreeState = {
  mode: 'stage3'
  label: string
  sourceIds: number[]
  groupIndex: number
  queueIds: number[]
  currentIndex: number
  round: number
  missedIds: number[]
  previousId: number | null
  revealed: RevealState | null
}

type DictionaryState = {
  mode: 'dictionary'
  query: string
  selectedId: number | null
}

type AppState =
  | { mode: 'home' }
  | StageOneState
  | StageTwoState
  | StageThreeState
  | DictionaryState

const STORAGE_KEY = 'gre3000-vocab-progress-v1'

const wordsById = new Map(vocab.map((word) => [word.id, word]))
const groupedWords = Array.from({ length: TOTAL_GROUPS }, (_, groupIndex) =>
  vocab.filter((word) => word.groupIndex === groupIndex),
)

function makeDefaultProgress(): Progress {
  return {
    passedIds: [],
    errorCounts: {},
    lastStageOneGroup: 0,
    updatedAt: new Date().toISOString(),
  }
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return makeDefaultProgress()
    const parsed = JSON.parse(raw) as Partial<Progress>
    return {
      passedIds: Array.isArray(parsed.passedIds) ? parsed.passedIds : [],
      errorCounts:
        parsed.errorCounts && typeof parsed.errorCounts === 'object'
          ? parsed.errorCounts
          : {},
      lastStageOneGroup:
        typeof parsed.lastStageOneGroup === 'number'
          ? parsed.lastStageOneGroup
          : 0,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
    }
  } catch {
    return makeDefaultProgress()
  }
}

function saveProgress(progress: Progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

function clampGroup(groupIndex: number) {
  return Math.max(0, Math.min(TOTAL_GROUPS - 1, groupIndex))
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function getWord(id: number) {
  const word = wordsById.get(id)
  if (!word) {
    throw new Error(`Unknown word id: ${id}`)
  }
  return word
}

function getAudioUrl(word: VocabWord) {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}audio/${encodeURIComponent(word.audio)}`
}

function playWordAudio(word: VocabWord) {
  const audio = new Audio(getAudioUrl(word))
  void audio.play().catch(() => undefined)
}

function makeRng(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let mixed = value
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], seed: number) {
  const rng = makeRng(seed)
  const copy = items.slice()
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function buildOptions(word: VocabWord, seed: number) {
  const options = [word.chinese]
  const seen = new Set(options)
  const start = Math.abs(seed) % vocab.length

  for (let index = 0; options.length < 4 && index < vocab.length * 2; index += 1) {
    const candidate = vocab[(start + index * 47) % vocab.length]
    if (
      candidate.id !== word.id &&
      candidate.chinese &&
      !seen.has(candidate.chinese)
    ) {
      seen.add(candidate.chinese)
      options.push(candidate.chinese)
    }
  }

  return shuffled(options, seed + 17)
}

function formatGroupLabel(groupIndex: number) {
  const words = groupedWords[groupIndex]
  const first = words[0]?.word ?? ''
  const last = words[words.length - 1]?.word ?? ''
  return `第 ${groupIndex + 1} 组 (${words.length}词) ${first} - ${last}`
}

function getSearchScore(word: VocabWord, normalizedQuery: string) {
  const normalizedWord = word.word.toLowerCase()
  const chinese = `${word.chinese} ${word.chineseWithPos}`.toLowerCase()
  const english = word.english.toLowerCase()

  if (!normalizedQuery) return word.id
  if (normalizedWord === normalizedQuery) return 0
  if (normalizedWord.startsWith(normalizedQuery)) return 1
  if (normalizedWord.includes(normalizedQuery)) return 2
  if (chinese.includes(normalizedQuery)) return 3
  if (english.includes(normalizedQuery)) return 4
  return Number.POSITIVE_INFINITY
}

function searchWords(query: string, limit: number) {
  const normalizedQuery = query.trim().toLowerCase()
  return vocab
    .map((word) => ({
      word,
      score: getSearchScore(word, normalizedQuery),
    }))
    .filter((item) => item.score !== Number.POSITIVE_INFINITY)
    .sort((a, b) => a.score - b.score || a.word.word.localeCompare(b.word.word))
    .slice(0, limit)
    .map((item) => item.word)
}

function App() {
  const [progress, setProgressState] = useState<Progress>(() => loadProgress())
  const [appState, setAppState] = useState<AppState>({ mode: 'home' })
  const [selectedGroup, setSelectedGroup] = useState(() =>
    clampGroup(loadProgress().lastStageOneGroup),
  )
  const [stageThreeErrorCount, setStageThreeErrorCount] = useState(1)
  const [homeSearchQuery, setHomeSearchQuery] = useState('')
  const [notice, setNotice] = useState('')

  const passedSet = useMemo(
    () => new Set(progress.passedIds),
    [progress.passedIds],
  )

  const groupStats = useMemo(() => {
    const stats = groupedWords.map((words, groupIndex) => ({
      groupIndex,
      total: words.length,
      passed: 0,
    }))
    for (const word of vocab) {
      if (passedSet.has(word.id)) {
        stats[word.groupIndex].passed += 1
      }
    }
    return stats
  }, [passedSet])

  const passedWords = useMemo(
    () => vocab.filter((word) => passedSet.has(word.id)),
    [passedSet],
  )

  const completedGroups = groupStats.filter((group) => group.passed === group.total)
  const nextIncompleteGroup =
    groupStats.find((group) => group.passed < group.total)?.groupIndex ?? 0
  const exactStageThreeCount = passedWords.filter(
    (word) => (progress.errorCounts[String(word.id)] ?? 0) === stageThreeErrorCount,
  ).length
  const homeSearchResults = useMemo(
    () => searchWords(homeSearchQuery, 8),
    [homeSearchQuery],
  )

  function setProgress(updater: (current: Progress) => Progress) {
    setProgressState((current) => {
      const next = updater(current)
      saveProgress(next)
      return next
    })
  }

  function updateLastStageOneGroup(groupIndex: number) {
    setProgress((current) => ({
      ...current,
      lastStageOneGroup: clampGroup(groupIndex),
      updatedAt: new Date().toISOString(),
    }))
  }

  function incrementError(wordId: number) {
    setProgress((current) => ({
      ...current,
      errorCounts: {
        ...current.errorCounts,
        [wordId]: (current.errorCounts[String(wordId)] ?? 0) + 1,
      },
      updatedAt: new Date().toISOString(),
    }))
  }

  function markWordsPassed(wordIds: number[]) {
    setProgress((current) => ({
      ...current,
      passedIds: uniqueNumbers([...current.passedIds, ...wordIds]),
      updatedAt: new Date().toISOString(),
    }))
  }

  function startStageOne(groupIndex: number) {
    const nextGroup = clampGroup(groupIndex)
    const firstWord = groupedWords[nextGroup][0]
    setSelectedGroup(nextGroup)
    updateLastStageOneGroup(nextGroup)
    setAppState({ mode: 'stage1', groupIndex: nextGroup, cardIndex: 0 })
    if (firstWord) playWordAudio(firstWord)
  }

  function startStageTwo(groupIndex: number) {
    const groupIds = groupedWords[groupIndex].map((word) => word.id)
    const firstWord = groupedWords[groupIndex][0]
    setAppState({
      mode: 'stage2',
      groupIndex,
      queueIds: groupIds,
      currentIndex: 0,
      round: 1,
      missedIds: [],
      previousId: null,
      revealed: null,
    })
    if (firstWord) playWordAudio(firstWord)
  }

  function startStageThree(label: string, sourceIds: number[], groupIndex = 0) {
    const groupStart = groupIndex * GROUP_SIZE
    const queueIds = sourceIds.slice(groupStart, groupStart + GROUP_SIZE)

    if (queueIds.length === 0) {
      setNotice('当前阶段三列表没有可背诵的词。')
      setAppState({ mode: 'home' })
      return
    }

    setNotice('')
    setAppState({
      mode: 'stage3',
      label,
      sourceIds,
      groupIndex,
      queueIds,
      currentIndex: 0,
      round: 1,
      missedIds: [],
      previousId: null,
      revealed: null,
    })
    playWordAudio(getWord(queueIds[0]))
  }

  function openDictionary(query = homeSearchQuery, selectedId: number | null = null) {
    const trimmedQuery = query.trim()
    const nextSelectedId =
      selectedId ?? searchWords(trimmedQuery, 1)[0]?.id ?? vocab[0].id
    setHomeSearchQuery(trimmedQuery)
    setAppState({
      mode: 'dictionary',
      query: trimmedQuery,
      selectedId: nextSelectedId,
    })
  }

  function handleStageOneNext() {
    if (appState.mode !== 'stage1') return
    const groupWords = groupedWords[appState.groupIndex]
    if (appState.cardIndex < groupWords.length - 1) {
      const nextCardIndex = appState.cardIndex + 1
      setAppState({ ...appState, cardIndex: nextCardIndex })
      playWordAudio(groupWords[nextCardIndex])
      return
    }
    startStageTwo(appState.groupIndex)
  }

  function handleStageOnePrevious() {
    if (appState.mode !== 'stage1' || appState.cardIndex === 0) return
    setAppState({ ...appState, cardIndex: appState.cardIndex - 1 })
  }

  function handleStageTwoChoose(option: string) {
    if (appState.mode !== 'stage2' || appState.revealed) return
    const word = getWord(appState.queueIds[appState.currentIndex])
    if (option === word.chinese) {
      advanceStageTwo(word.id, appState)
      return
    }

    incrementError(word.id)
    setAppState({
      ...appState,
      missedIds: uniqueNumbers([...appState.missedIds, word.id]),
      revealed: { selected: option, wordId: word.id },
    })
  }

  function advanceStageTwo(currentWordId: number, state: StageTwoState) {
    if (state.currentIndex < state.queueIds.length - 1) {
      const nextIndex = state.currentIndex + 1
      setAppState({
        ...state,
        currentIndex: nextIndex,
        previousId: currentWordId,
        revealed: null,
      })
      playWordAudio(getWord(state.queueIds[nextIndex]))
      return
    }

    if (state.missedIds.length > 0) {
      const nextQueueIds = state.missedIds
      setAppState({
        ...state,
        queueIds: nextQueueIds,
        currentIndex: 0,
        round: state.round + 1,
        missedIds: [],
        previousId: currentWordId,
        revealed: null,
      })
      playWordAudio(getWord(nextQueueIds[0]))
      return
    }

    const passedIds = groupedWords[state.groupIndex].map((word) => word.id)
    markWordsPassed(passedIds)

    if (state.groupIndex + 1 < TOTAL_GROUPS) {
      setNotice(`第 ${state.groupIndex + 1} 组已通过，已进入下一组阶段一。`)
      startStageOne(state.groupIndex + 1)
      return
    }

    setNotice('全部词组已经通过阶段二。')
    setAppState({ mode: 'home' })
  }

  function handleStageThreeChoose(option: string) {
    if (appState.mode !== 'stage3' || appState.revealed) return
    const word = getWord(appState.queueIds[appState.currentIndex])
    if (option === word.chinese) {
      advanceStageThree(word.id, appState)
      return
    }

    incrementError(word.id)
    setAppState({
      ...appState,
      missedIds: uniqueNumbers([...appState.missedIds, word.id]),
      revealed: { selected: option, wordId: word.id },
    })
  }

  function advanceStageThree(currentWordId: number, state: StageThreeState) {
    if (state.currentIndex < state.queueIds.length - 1) {
      const nextIndex = state.currentIndex + 1
      setAppState({
        ...state,
        currentIndex: nextIndex,
        previousId: currentWordId,
        revealed: null,
      })
      playWordAudio(getWord(state.queueIds[nextIndex]))
      return
    }

    if (state.missedIds.length > 0) {
      const nextQueueIds = state.missedIds
      setAppState({
        ...state,
        queueIds: nextQueueIds,
        currentIndex: 0,
        round: state.round + 1,
        missedIds: [],
        previousId: currentWordId,
        revealed: null,
      })
      playWordAudio(getWord(nextQueueIds[0]))
      return
    }

    const nextGroup = state.groupIndex + 1
    const totalStageThreeGroups = Math.ceil(state.sourceIds.length / GROUP_SIZE)
    if (nextGroup < totalStageThreeGroups) {
      startStageThree(state.label, state.sourceIds, nextGroup)
      return
    }

    setNotice(`阶段三「${state.label}」本次列表已完成。`)
    setAppState({ mode: 'home' })
  }

  function resetProgress() {
    const confirmed = window.confirm('确定清空本地背诵进度和错误计数吗？')
    if (!confirmed) return
    const next = makeDefaultProgress()
    saveProgress(next)
    setProgressState(next)
    setNotice('本地进度已清空。')
    setAppState({ mode: 'home' })
  }

  const chrome = (
    <header className="topbar">
      <button
        className="icon-button"
        type="button"
        title="返回主页"
        onClick={() => setAppState({ mode: 'home' })}
      >
        <Home size={20} />
      </button>
      <div>
        <p className="eyebrow">GRE 3000</p>
        <h1>本地背单词</h1>
      </div>
      <button
        className="icon-button"
        type="button"
        title="清空本地进度"
        onClick={resetProgress}
      >
        <RefreshCw size={20} />
      </button>
    </header>
  )

  return (
    <main className="app-shell">
      {chrome}

      {appState.mode === 'home' && (
        <HomeScreen
          completedGroups={completedGroups.length}
          exactStageThreeCount={exactStageThreeCount}
          groupStats={groupStats}
          homeSearchQuery={homeSearchQuery}
          homeSearchResults={homeSearchResults}
          nextIncompleteGroup={nextIncompleteGroup}
          notice={notice}
          onErrorCountChange={setStageThreeErrorCount}
          onOpenDictionary={() => openDictionary()}
          onSelectedGroupChange={setSelectedGroup}
          onSearchQueryChange={setHomeSearchQuery}
          onSelectDictionaryWord={(wordId) =>
            openDictionary(homeSearchQuery, wordId)
          }
          onStartExactStageThree={() => {
            const ids = passedWords
              .filter(
                (word) =>
                  (progress.errorCounts[String(word.id)] ?? 0) ===
                  stageThreeErrorCount,
              )
              .map((word) => word.id)
            startStageThree(`错误数 = ${stageThreeErrorCount}`, ids)
          }}
          onStartStageOne={startStageOne}
          onStartStageThreeAll={() =>
            startStageThree(
              '已通过词',
              passedWords.map((word) => word.id),
            )
          }
          onStartStageThreeByErrors={() => {
            const ids = passedWords
              .slice()
              .sort(
                (a, b) =>
                  (progress.errorCounts[String(b.id)] ?? 0) -
                    (progress.errorCounts[String(a.id)] ?? 0) ||
                  a.word.localeCompare(b.word),
              )
              .map((word) => word.id)
            startStageThree('错误数倒序', ids)
          }}
          passedCount={passedWords.length}
          selectedGroup={selectedGroup}
          stageThreeErrorCount={stageThreeErrorCount}
        />
      )}

      {appState.mode === 'dictionary' && (
        <DictionaryScreen
          errorCounts={progress.errorCounts}
          onAudio={playWordAudio}
          onQueryChange={(query) =>
            setAppState({
              ...appState,
              query,
              selectedId:
                appState.selectedId ?? searchWords(query, 1)[0]?.id ?? vocab[0].id,
            })
          }
          onSelectWord={(wordId) =>
            setAppState({ ...appState, selectedId: wordId })
          }
          query={appState.query}
          selectedId={appState.selectedId}
        />
      )}

      {appState.mode === 'stage1' && (
        <StageOneScreen
          groupIndex={appState.groupIndex}
          cardIndex={appState.cardIndex}
          onAudio={playWordAudio}
          onGroupChange={startStageOne}
          onNext={handleStageOneNext}
          onPrevious={handleStageOnePrevious}
          onRestart={() => {
            const firstWord = groupedWords[appState.groupIndex][0]
            setAppState({
              mode: 'stage1',
              groupIndex: appState.groupIndex,
              cardIndex: 0,
            })
            if (firstWord) playWordAudio(firstWord)
          }}
        />
      )}

      {appState.mode === 'stage2' && (
        <QuizScreen
          heading={`阶段二 · 第 ${appState.groupIndex + 1} 组`}
          modeLabel="中文释义选择"
          onAudio={playWordAudio}
          onChoose={handleStageTwoChoose}
          onContinueWrong={() => {
            if (appState.mode !== 'stage2') return
            const currentWord = getWord(appState.queueIds[appState.currentIndex])
            advanceStageTwo(currentWord.id, appState)
          }}
          previousWord={
            appState.previousId === null ? null : getWord(appState.previousId)
          }
          state={appState}
          totalGroups={TOTAL_GROUPS}
        />
      )}

      {appState.mode === 'stage3' && (
        <QuizScreen
          heading={`阶段三 · ${appState.label}`}
          modeLabel="复习通过词"
          onAudio={playWordAudio}
          onChoose={handleStageThreeChoose}
          onContinueWrong={() => {
            if (appState.mode !== 'stage3') return
            const currentWord = getWord(appState.queueIds[appState.currentIndex])
            advanceStageThree(currentWord.id, appState)
          }}
          previousWord={
            appState.previousId === null ? null : getWord(appState.previousId)
          }
          state={appState}
          totalGroups={Math.ceil(appState.sourceIds.length / GROUP_SIZE)}
        />
      )}
    </main>
  )
}

type HomeScreenProps = {
  completedGroups: number
  exactStageThreeCount: number
  groupStats: { groupIndex: number; total: number; passed: number }[]
  homeSearchQuery: string
  homeSearchResults: VocabWord[]
  nextIncompleteGroup: number
  notice: string
  onErrorCountChange: (value: number) => void
  onOpenDictionary: () => void
  onSelectedGroupChange: (value: number) => void
  onSearchQueryChange: (value: string) => void
  onSelectDictionaryWord: (wordId: number) => void
  onStartExactStageThree: () => void
  onStartStageOne: (groupIndex: number) => void
  onStartStageThreeAll: () => void
  onStartStageThreeByErrors: () => void
  passedCount: number
  selectedGroup: number
  stageThreeErrorCount: number
}

function HomeScreen({
  completedGroups,
  exactStageThreeCount,
  groupStats,
  homeSearchQuery,
  homeSearchResults,
  nextIncompleteGroup,
  notice,
  onErrorCountChange,
  onOpenDictionary,
  onSelectedGroupChange,
  onSearchQueryChange,
  onSelectDictionaryWord,
  onStartExactStageThree,
  onStartStageOne,
  onStartStageThreeAll,
  onStartStageThreeByErrors,
  passedCount,
  selectedGroup,
  stageThreeErrorCount,
}: HomeScreenProps) {
  return (
    <section className="home-grid" aria-label="主页">
      {notice && <div className="notice">{notice}</div>}

      <section className="panel progress-panel">
        <div className="panel-title">
          <Database size={20} />
          <h2>总进度</h2>
        </div>
        <div className="stat-grid">
          <div>
            <strong>{VOCAB_TOTAL}</strong>
            <span>全部词</span>
          </div>
          <div>
            <strong>{passedCount}</strong>
            <span>已通过阶段二</span>
          </div>
          <div>
            <strong>
              {completedGroups}/{TOTAL_GROUPS}
            </strong>
            <span>已完成组</span>
          </div>
        </div>
        <div className="progress-track" aria-label="阶段二通过进度">
          <div
            style={{ width: `${(passedCount / VOCAB_TOTAL) * 100}%` }}
            className="progress-fill"
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <BookOpen size={20} />
          <h2>阶段一 / 阶段二</h2>
        </div>
        <p className="muted">
          阶段一看词义，背完一组自动进入阶段二选择题。
        </p>
        <div className="control-row">
          <label htmlFor="group-select">选择组</label>
          <select
            id="group-select"
            value={selectedGroup}
            onChange={(event) => onSelectedGroupChange(Number(event.target.value))}
          >
            {groupStats.map((group) => (
              <option key={group.groupIndex} value={group.groupIndex}>
                {formatGroupLabel(group.groupIndex)}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => onStartStageOne(nextIncompleteGroup)}
          >
            <ArrowRight size={18} />
            继续下一组
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onStartStageOne(selectedGroup)}
          >
            <RefreshCw size={18} />
            重背所选组
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Brain size={20} />
          <h2>阶段三</h2>
        </div>
        <p className="muted">
          只使用已通过阶段二的词，按 20 个一组复习。
        </p>
        <div className="button-stack">
          <button
            className="secondary-button"
            type="button"
            onClick={onStartStageThreeAll}
            disabled={passedCount === 0}
          >
            <CheckCircle2 size={18} />
            背诵全部已通过词
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onStartStageThreeByErrors}
            disabled={passedCount === 0}
          >
            <Shuffle size={18} />
            按错误数倒序
          </button>
        </div>
        <div className="control-row split-control">
          <label htmlFor="error-count">错误数等于</label>
          <input
            id="error-count"
            min="0"
            type="number"
            value={stageThreeErrorCount}
            onChange={(event) =>
              onErrorCountChange(Math.max(0, Number(event.target.value)))
            }
          />
          <button
            className="secondary-button compact"
            type="button"
            onClick={onStartExactStageThree}
            disabled={exactStageThreeCount === 0}
          >
            开始 {exactStageThreeCount} 词
          </button>
        </div>
      </section>

      <section className="panel dictionary-panel">
        <div className="panel-title">
          <Search size={20} />
          <h2>词典 / 搜索</h2>
        </div>
        <p className="muted">直接查任意单词的释义、发音和所在组。</p>
        <div className="control-row">
          <label htmlFor="home-word-search">搜索</label>
          <input
            id="home-word-search"
            type="search"
            value={homeSearchQuery}
            placeholder="输入单词、中文或英文释义"
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>
        <div className="mini-word-list">
          {homeSearchResults.map((word) => (
            <button
              className="mini-word-button"
              key={word.id}
              type="button"
              onClick={() => onSelectDictionaryWord(word.id)}
            >
              <strong>{word.word}</strong>
              <span>{word.chinese}</span>
            </button>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={onOpenDictionary}>
          <BookOpen size={18} />
          打开完整词典
        </button>
      </section>
    </section>
  )
}

type StageOneScreenProps = {
  groupIndex: number
  cardIndex: number
  onAudio: (word: VocabWord) => void
  onGroupChange: (groupIndex: number) => void
  onNext: () => void
  onPrevious: () => void
  onRestart: () => void
}

function StageOneScreen({
  groupIndex,
  cardIndex,
  onAudio,
  onGroupChange,
  onNext,
  onPrevious,
  onRestart,
}: StageOneScreenProps) {
  const groupWords = groupedWords[groupIndex]
  const word = groupWords[cardIndex]
  const isLast = cardIndex === groupWords.length - 1

  return (
    <section className="study-view" aria-label="阶段一">
      <div className="stage-header">
        <div>
          <p className="eyebrow">阶段一</p>
          <h2>单词释义</h2>
        </div>
        <div className="counter-strip" aria-label="当前位置">
          <span>当前词 {word.id + 1}/{VOCAB_TOTAL}</span>
          <span>
            组内 {cardIndex + 1}/{groupWords.length}
          </span>
        </div>
      </div>

      <div className="control-row">
        <label htmlFor="stage-one-group">重背指定组</label>
        <select
          id="stage-one-group"
          value={groupIndex}
          onChange={(event) => onGroupChange(Number(event.target.value))}
        >
          {groupedWords.map((_, index) => (
            <option key={index} value={index}>
              {formatGroupLabel(index)}
            </option>
          ))}
        </select>
      </div>

      <article className="flash-card stage-one-card">
        <div className="association-row">
          <div className="association-word">
            <div className="word-line">
              <h2>{word.word}</h2>
              <button
                className="audio-button"
                type="button"
                title="播放发音"
                onClick={() => onAudio(word)}
              >
                <Volume2 size={22} />
              </button>
            </div>
            <div className="phonetics">
              <span>UK {word.ukPhonetics || '-'}</span>
              <span>US {word.usPhonetics || '-'}</span>
            </div>
          </div>
          <div className="association-meaning">
            <span>中文释义</span>
            <p>{word.chineseWithPos || word.chinese}</p>
          </div>
        </div>
        <dl className="definition-list stage-one-extra">
          <div>
            <dt>英文释义</dt>
            <dd>{word.english}</dd>
          </div>
        </dl>
      </article>

      <div className="nav-row">
        <button
          className="secondary-button"
          type="button"
          onClick={onPrevious}
          disabled={cardIndex === 0}
        >
          <ArrowLeft size={18} />
          上一个
        </button>
        <button className="secondary-button" type="button" onClick={onRestart}>
          <RefreshCw size={18} />
          本组重来
        </button>
        <button className="primary-button" type="button" onClick={onNext}>
          {isLast ? '进入阶段二' : '下一个'}
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}

type QuizScreenProps = {
  heading: string
  modeLabel: string
  onAudio: (word: VocabWord) => void
  onChoose: (option: string) => void
  onContinueWrong: () => void
  previousWord: VocabWord | null
  state: StageTwoState | StageThreeState
  totalGroups: number
}

function QuizScreen({
  heading,
  modeLabel,
  onAudio,
  onChoose,
  onContinueWrong,
  previousWord,
  state,
  totalGroups,
}: QuizScreenProps) {
  const word = getWord(state.queueIds[state.currentIndex])
  const options = buildOptions(
    word,
    word.id * 101 + state.round * 4099 + state.currentIndex * 131,
  )
  const isRevealed = state.revealed?.wordId === word.id

  return (
    <section className="study-view" aria-label={heading}>
      <div className="stage-header">
        <div>
          <p className="eyebrow">{modeLabel}</p>
          <h2>{heading}</h2>
        </div>
        <div className="counter-strip">
          <span>
            第 {state.groupIndex + 1}/{totalGroups} 组
          </span>
          <span>
            第 {state.currentIndex + 1}/{state.queueIds.length} 题
          </span>
          <span>第 {state.round} 轮</span>
        </div>
      </div>

      <section className="previous-panel" aria-label="上一个单词">
        <p className="eyebrow">上一个单词</p>
        {previousWord ? (
          <div>
            <span className="previous-word-title">
              <strong>{previousWord.word}</strong>
              <button
                className="mini-audio-button"
                type="button"
                title="播放上一个单词"
                onClick={() => onAudio(previousWord)}
              >
                <Volume2 size={16} />
              </button>
            </span>
            <span>{previousWord.chinese}</span>
            <span>{previousWord.english}</span>
          </div>
        ) : (
          <span className="muted">本轮还没有上一个单词。</span>
        )}
      </section>

      <article className="quiz-card">
        <div className="word-line">
          <h2>{word.word}</h2>
          <button
            className="audio-button"
            type="button"
            title="播放发音"
            onClick={() => onAudio(word)}
          >
            <Volume2 size={22} />
          </button>
        </div>
        <div className="phonetics">
          <span>UK {word.ukPhonetics || '-'}</span>
          <span>US {word.usPhonetics || '-'}</span>
        </div>
      </article>

      <div className="option-grid">
        {options.map((option) => {
          const isCorrect = option === word.chinese
          const isSelectedWrong =
            isRevealed && option === state.revealed?.selected && !isCorrect
          const className = [
            'option-button',
            isRevealed && isCorrect ? 'correct' : '',
            isSelectedWrong ? 'wrong' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              className={className}
              disabled={isRevealed}
              key={option}
              onClick={() => onChoose(option)}
              type="button"
            >
              {option}
            </button>
          )
        })}
      </div>

      {isRevealed && (
        <section className="feedback-panel">
          <div className="feedback-title">
            <XCircle size={20} />
            <strong>答错了</strong>
          </div>
          <dl className="definition-list compact-list">
            <div>
              <dt>正确中文释义</dt>
              <dd>{word.chineseWithPos || word.chinese}</dd>
            </div>
            <div>
              <dt>英文释义</dt>
              <dd>{word.english}</dd>
            </div>
          </dl>
          <button className="primary-button" type="button" onClick={onContinueWrong}>
            继续
            <ArrowRight size={18} />
          </button>
        </section>
      )}
    </section>
  )
}

type DictionaryScreenProps = {
  errorCounts: Record<string, number>
  onAudio: (word: VocabWord) => void
  onQueryChange: (query: string) => void
  onSelectWord: (wordId: number) => void
  query: string
  selectedId: number | null
}

function DictionaryScreen({
  errorCounts,
  onAudio,
  onQueryChange,
  onSelectWord,
  query,
  selectedId,
}: DictionaryScreenProps) {
  const results = searchWords(query, 80)
  const selectedWord = selectedId === null ? (results[0] ?? vocab[0]) : getWord(selectedId)

  return (
    <section className="dictionary-view" aria-label="单词词典">
      <div className="stage-header">
        <div>
          <p className="eyebrow">词典</p>
          <h2>单词查询</h2>
        </div>
        <div className="counter-strip">
          <span>{results.length} 个结果</span>
          <span>共 {VOCAB_TOTAL} 词</span>
        </div>
      </div>

      <div className="dictionary-layout">
        <section className="panel dictionary-search-panel">
          <div className="panel-title">
            <Search size={20} />
            <h2>搜索</h2>
          </div>
          <div className="control-row dictionary-search-row">
            <label htmlFor="dictionary-search">关键词</label>
            <input
              id="dictionary-search"
              type="search"
              value={query}
              placeholder="输入单词、中文或英文释义"
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
          <div className="dictionary-result-list">
            {results.map((word) => (
              <button
                className={
                  word.id === selectedWord.id
                    ? 'dictionary-result active'
                    : 'dictionary-result'
                }
                key={word.id}
                type="button"
                onClick={() => onSelectWord(word.id)}
              >
                <strong>{word.word}</strong>
                <span>{word.chinese}</span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="muted">没有找到匹配的单词。</p>
            )}
          </div>
        </section>

        <article className="flash-card dictionary-detail">
          <div className="word-line">
            <h2>{selectedWord.word}</h2>
            <button
              className="audio-button"
              type="button"
              title="播放发音"
              onClick={() => onAudio(selectedWord)}
            >
              <Volume2 size={22} />
            </button>
          </div>
          <div className="phonetics">
            <span>UK {selectedWord.ukPhonetics || '-'}</span>
            <span>US {selectedWord.usPhonetics || '-'}</span>
          </div>
          <div className="word-meta-strip">
            <span>第 {selectedWord.groupIndex + 1} 组</span>
            <span>全局 {selectedWord.id + 1}/{VOCAB_TOTAL}</span>
            <span>错误数 {errorCounts[String(selectedWord.id)] ?? 0}</span>
            <span>
              音频 {String(selectedWord.list).padStart(2, '0')}_{selectedWord.unit}
            </span>
          </div>
          <dl className="definition-list">
            <div>
              <dt>中文释义</dt>
              <dd>{selectedWord.chineseWithPos || selectedWord.chinese}</dd>
            </div>
            <div>
              <dt>英文释义</dt>
              <dd>{selectedWord.english}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  )
}

export default App
