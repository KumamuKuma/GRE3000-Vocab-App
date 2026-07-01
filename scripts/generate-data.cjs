const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOURCE_XLSX =
  process.env.GRE_XLSX ||
  'D:\\\u684c\u9762\\LGU\\GRE\\3000-dev\\3000.xlsx';
const SOURCE_WAV_DIR =
  process.env.GRE_WAV_DIR ||
  'D:\\\u684c\u9762\\LGU\\GRE\\3000-dev\\3000_wav';

const ROOT_DIR = path.resolve(__dirname, '..');
const AUDIO_OUT_DIR = path.join(ROOT_DIR, 'public', 'audio');
const DATA_OUT_DIR = path.join(ROOT_DIR, 'src', 'data');
const DATA_OUT_FILE = path.join(DATA_OUT_DIR, 'vocab.ts');
const GROUP_SIZE = 20;

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function copyIfChanged(source, target) {
  const sourceStat = fs.statSync(source);
  if (fs.existsSync(target)) {
    const targetStat = fs.statSync(target);
    if (targetStat.size === sourceStat.size) {
      return false;
    }
  }
  fs.copyFileSync(source, target);
  return true;
}

assertExists(SOURCE_XLSX, 'Excel source');
assertExists(SOURCE_WAV_DIR, 'WAV directory');

const workbook = XLSX.readFile(SOURCE_XLSX);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
const wavFiles = new Set(
  fs
    .readdirSync(SOURCE_WAV_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith('.wav')),
);

const items = rows
  .map((row, sourceRowIndex) => {
    const word = cleanText(row.Word);
    if (!word) return null;

    const list = toNumber(row.L);
    const unit = toNumber(row.U);
    const audio = `${String(list).padStart(2, '0')}_${unit}_${word}.wav`;

    return {
      word,
      chinese: cleanText(row.Paraphrase),
      chineseWithPos: cleanText(row['Paraphrase (w/ POS)']),
      english: cleanText(row['Paraphrase (English)']),
      ukPhonetics: cleanText(row['UK Phonetics']),
      usPhonetics: cleanText(row['US Phonetics']),
      list,
      unit,
      random: toNumber(row.R),
      sourceIndex: toNumber(row.I, sourceRowIndex),
      audio,
    };
  })
  .filter(Boolean);

const missingAudio = items.filter((item) => !wavFiles.has(item.audio));
if (missingAudio.length > 0) {
  throw new Error(
    `Missing ${missingAudio.length} audio files. First missing: ${JSON.stringify(
      missingAudio.slice(0, 5),
    )}`,
  );
}

const sortedItems = items
  .slice()
  .sort((a, b) => a.random - b.random || a.word.localeCompare(b.word))
  .map((item, index) => ({
    id: index,
    groupIndex: Math.floor(index / GROUP_SIZE),
    positionInGroup: index % GROUP_SIZE,
    ...item,
  }));

fs.mkdirSync(AUDIO_OUT_DIR, { recursive: true });
fs.mkdirSync(DATA_OUT_DIR, { recursive: true });

let copied = 0;
for (const item of sortedItems) {
  const source = path.join(SOURCE_WAV_DIR, item.audio);
  const target = path.join(AUDIO_OUT_DIR, item.audio);
  if (copyIfChanged(source, target)) copied += 1;
}

const header = `export type VocabWord = {
  id: number
  groupIndex: number
  positionInGroup: number
  word: string
  chinese: string
  chineseWithPos: string
  english: string
  ukPhonetics: string
  usPhonetics: string
  list: number
  unit: number
  random: number
  sourceIndex: number
  audio: string
}

export const GROUP_SIZE = ${GROUP_SIZE}
export const VOCAB_TOTAL = ${sortedItems.length}
export const TOTAL_GROUPS = ${Math.ceil(sortedItems.length / GROUP_SIZE)}

export const vocab: VocabWord[] = `;

fs.writeFileSync(
  DATA_OUT_FILE,
  `${header}${JSON.stringify(sortedItems, null, 2)}\n`,
  'utf8',
);

console.log(
  JSON.stringify(
    {
      words: sortedItems.length,
      groups: Math.ceil(sortedItems.length / GROUP_SIZE),
      wavsAvailable: wavFiles.size,
      wavsCopied: copied,
      dataFile: DATA_OUT_FILE,
      audioDir: AUDIO_OUT_DIR,
    },
    null,
    2,
  ),
);
