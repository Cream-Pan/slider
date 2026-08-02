'use strict';

const DEFAULT_CONFIG = {
  appName: '温熱環境主観評価',
  checkpointSequence: [
    { label: '実験開始', segmentId: 'START', nextSegment: 'P1' },
    { label: 'P1終了', segmentId: 'P1_END', nextSegment: 'P2' },
    { label: 'P2終了', segmentId: 'P2_END', nextSegment: 'P3' },
    { label: 'P3終了', segmentId: 'P3_END', nextSegment: 'RETURN' },
    { label: 'ルート終了', segmentId: 'ROUTE_END', nextSegment: 'RECOVERY' },
    { label: '回復終了', segmentId: 'RECOVERY_END', nextSegment: 'COMPLETE' }
  ],
  gpsOptions: {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000
  },
  gpsAccuracyThresholds: {
    good: 20,
    warning: 50
  }
};

const DB_NAME = 'thermal-subjective-evaluation-db';
const DB_VERSION = 1;
const ACTIVE_SESSION_KEY = 'thermal-evaluation-active-session';

const SENSATION_LABELS = {
  '-3': '寒い',
  '-2': '涼しい',
  '-1': 'やや涼しい',
  '0': 'どちらでもない',
  '1': 'やや暖かい',
  '2': '暖かい',
  '3': '暑い'
};

const COMFORT_LABELS = {
  '-3': '非常に不快',
  '-2': '不快',
  '-1': 'やや不快',
  '0': 'どちらでもない',
  '1': 'やや快い',
  '2': '快い',
  '3': '非常に快い'
};

const PREFERENCE_LABELS = {
  cooler: 'もっと涼しく',
  no_change: 'このままでよい',
  warmer: 'もっと暖かく'
};

let config = DEFAULT_CONFIG;
let db = null;
let state = createInitialState();
let pendingEvaluation = null;
let gpsWatchId = null;
let elapsedTimerId = null;
let wakeLock = null;

const els = {};

window.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  cacheElements();
  bindEvents();

  config = await loadConfig();
  document.title = config.appName;

  try {
    db = await openDatabase();
  } catch (error) {
    console.error(error);
    showMessage('端末内データベースを初期化できませんでした．このブラウザでは記録できない可能性があります．', 'error');
  }

  updateOnlineStatus();
  await restoreActiveSessionIfNeeded();
  registerServiceWorker();
}

function createInitialState() {
  return {
    sessionId: null,
    participantId: '',
    createdAt: null,
    startedAt: null,
    startedEpochMs: null,
    endedAt: null,
    endedEpochMs: null,
    active: false,
    completed: false,
    checkpointIndex: 0,
    currentSegment: 'PRE_START',
    lastEvaluation: null,
    subjectiveCount: 0,
    gpsCount: 0
  };
}

function cacheElements() {
  const ids = [
    'offlineBadge', 'messageArea', 'startView', 'participantId', 'startExperimentBtn',
    'experimentView', 'activeParticipantId', 'elapsedTime', 'gpsStatus', 'currentSegment',
    'subjectiveCount', 'gpsCount', 'changeEvaluationBtn', 'checkpointEvaluationBtn',
    'checkpointButtonLabel', 'finishView', 'finishSummary',
    'downloadAllBtn', 'newExperimentBtn', 'evaluationModal',
    'evaluationTriggerLabel', 'evaluationTitle', 'closeEvaluationBtn', 'sensationSlider',
    'sensationOutput', 'comfortSlider', 'comfortOutput', 'preferenceButtons',
    'preferenceOutput', 'cancelEvaluationBtn', 'submitEvaluationBtn'
  ];

  for (const id of ids) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.participantId.addEventListener('input', () => {
    els.participantId.value = sanitizeParticipantId(els.participantId.value);
  });

  els.startExperimentBtn.addEventListener('click', startExperiment);
  els.changeEvaluationBtn.addEventListener('click', () => openEvaluation('self_change'));
  els.checkpointEvaluationBtn.addEventListener('click', () => openEvaluation('checkpoint'));
  els.closeEvaluationBtn.addEventListener('click', cancelEvaluation);
  els.cancelEvaluationBtn.addEventListener('click', cancelEvaluation);
  els.submitEvaluationBtn.addEventListener('click', submitEvaluation);

  for (const slider of [els.sensationSlider, els.comfortSlider]) {
    slider.addEventListener('pointerdown', () => markSliderTouched(slider));
    slider.addEventListener('input', () => {
      markSliderTouched(slider);
      updateEvaluationOutputs();
    });
    slider.addEventListener('change', updateEvaluationOutputs);
  }

  els.preferenceButtons.addEventListener('click', event => {
    const button = event.target.closest('.preference-button');
    if (!button) return;
    selectPreference(button.dataset.value);
  });

  els.downloadAllBtn.addEventListener('click', downloadAllCsvFiles);
  els.newExperimentBtn.addEventListener('click', resetForNewExperiment);

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('beforeunload', event => {
    if (!state.active) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.active) {
      await acquireWakeLock();
    }
  });
}

async function loadConfig() {
  try {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`config.json: ${response.status}`);
    const loaded = await response.json();
    return {
      ...DEFAULT_CONFIG,
      ...loaded,
      gpsOptions: { ...DEFAULT_CONFIG.gpsOptions, ...(loaded.gpsOptions || {}) },
      gpsAccuracyThresholds: {
        ...DEFAULT_CONFIG.gpsAccuracyThresholds,
        ...(loaded.gpsAccuracyThresholds || {})
      }
    };
  } catch (error) {
    console.warn('config.jsonを読み込めなかったため，既定値を使用します．', error);
    return DEFAULT_CONFIG;
  }
}

function sanitizeParticipantId(value) {
  return value
    .replace(/＿/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '');
}

async function startExperiment() {
  const participantId = sanitizeParticipantId(els.participantId.value.trim());

  if (!participantId) {
    showMessage('参加者IDを入力してください．', 'warning');
    els.participantId.focus();
    return;
  }

  const confirmed = window.confirm(`参加者ID：${participantId}\n\nこの設定で実験を開始しますか．`);
  if (!confirmed) return;

  const now = new Date();
  const nowEpochMs = now.getTime();
  state = {
    ...createInitialState(),
    sessionId: `${participantId}_${toCompactLocalTimestamp(now)}`,
    participantId,
    createdAt: formatLocalTimeWithMs(nowEpochMs),
    active: true
  };

  await saveSessionState();
  localStorage.setItem(ACTIVE_SESSION_KEY, state.sessionId);

  showExperimentView();
  els.elapsedTime.textContent = '未開始';
  await acquireWakeLock();
  // 「実験を開始する」を押した時点からGPS記録を開始する
  startGpsLogging();
  showMessage(  'GPS記録を開始しました．「定期地点評価：実験開始」を回答し，送信した時点から測定時間を開始します．');
}

function showExperimentView() {
  els.startView.classList.add('hidden');
  els.finishView.classList.add('hidden');
  els.experimentView.classList.remove('hidden');
  renderExperimentState();
}

function renderExperimentState() {
  els.activeParticipantId.textContent = state.participantId || '―';
  els.currentSegment.textContent = segmentDisplayName(state.currentSegment);
  els.subjectiveCount.textContent = String(state.subjectiveCount || 0);
  els.gpsCount.textContent = String(state.gpsCount || 0);

  const checkpoint = config.checkpointSequence[state.checkpointIndex];
  if (checkpoint) {
    els.checkpointButtonLabel.textContent = `定期地点評価：${checkpoint.label}`;
    els.checkpointEvaluationBtn.disabled = false;
  } else {
    els.checkpointButtonLabel.textContent = '定期地点評価：完了';
    els.checkpointEvaluationBtn.disabled = true;
  }

  els.changeEvaluationBtn.disabled = !state.startedAt || state.currentSegment === 'COMPLETE';

  if (!state.startedAt) {
    els.elapsedTime.textContent = '未開始';
    els.gpsStatus.textContent = '開始待ち';
  }
}

function segmentDisplayName(segment) {
  const labels = {
    PRE_START: '開始前',
    P1: 'P1',
    P2: 'P2',
    P3: 'P3',
    RETURN: '帰路',
    RECOVERY: '回復',
    COMPLETE: '完了'
  };
  return labels[segment] || segment || '―';
}

function openEvaluation(type) {
  if (!state.active) return;

  let segmentId;
  let title;
  let triggerLabel;

  if (type === 'checkpoint') {
    const checkpoint = config.checkpointSequence[state.checkpointIndex];
    if (!checkpoint) return;
    segmentId = checkpoint.segmentId;
    title = `定期地点評価：${checkpoint.label}`;
    triggerLabel = '定期地点評価';
  } else {
    segmentId = state.currentSegment;
    title = '変動による評価';
    triggerLabel = `現在区間：${segmentDisplayName(state.currentSegment)}`;
  }

  pendingEvaluation = {
    type,
    triggerType: type === 'checkpoint' ? 'checkpoint' : 'self_change',
    segmentId,
    startedAt: formatLocalTimeWithMs(Date.now()),
    startedEpochMs: Date.now()
  };

  els.evaluationTitle.textContent = title;
  els.evaluationTriggerLabel.textContent = triggerLabel;
  prepareEvaluationForm();
  els.evaluationModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function prepareEvaluationForm() {
  const previous = state.lastEvaluation;

  if (previous) {
    setSliderState(els.sensationSlider, previous.thermal_sensation, true);
    setSliderState(els.comfortSlider, previous.thermal_comfort, true);
    selectPreference(previous.thermal_preference, false);
  } else {
    setSliderState(els.sensationSlider, 0, false);
    setSliderState(els.comfortSlider, 0, false);
    selectPreference(null, false);
  }

  updateEvaluationOutputs();
}

function setSliderState(slider, value, touched) {
  slider.value = String(value);
  slider.dataset.touched = touched ? 'true' : 'false';
  slider.classList.toggle('untouched', !touched);
}

function markSliderTouched(slider) {
  slider.dataset.touched = 'true';
  slider.classList.remove('untouched');
}

function selectPreference(value, update = true) {
  for (const button of els.preferenceButtons.querySelectorAll('.preference-button')) {
    button.classList.toggle('selected', button.dataset.value === value);
  }
  els.preferenceButtons.dataset.selectedValue = value || '';
  if (update) updateEvaluationOutputs();
}

function updateEvaluationOutputs() {
  const sensationTouched = els.sensationSlider.dataset.touched === 'true';
  const comfortTouched = els.comfortSlider.dataset.touched === 'true';
  const preference = els.preferenceButtons.dataset.selectedValue;

  els.sensationOutput.textContent = sensationTouched
    ? `${formatSignedNumber(els.sensationSlider.value)}：${SENSATION_LABELS[els.sensationSlider.value]}`
    : '未選択';

  els.comfortOutput.textContent = comfortTouched
    ? `${formatSignedNumber(els.comfortSlider.value)}：${COMFORT_LABELS[els.comfortSlider.value]}`
    : '未選択';

  els.preferenceOutput.textContent = preference ? PREFERENCE_LABELS[preference] : '未選択';
  els.submitEvaluationBtn.disabled = !(sensationTouched && comfortTouched && preference);
}

function formatSignedNumber(value) {
  const number = Number(value);
  if (number > 0) return `＋${number}`;
  if (number < 0) return `−${Math.abs(number)}`;
  return '0';
}

function cancelEvaluation() {
  pendingEvaluation = null;
  els.evaluationModal.classList.add('hidden');
  document.body.style.overflow = '';
}

async function submitEvaluation() {
  if (!pendingEvaluation || els.submitEvaluationBtn.disabled) return;

  els.submitEvaluationBtn.disabled = true;

  const submittedEpochMs = Date.now();
  const csvRecord = {
    trigger_type: pendingEvaluation.triggerType,
    segment_id: pendingEvaluation.segmentId,
    evaluation_started_at: pendingEvaluation.startedAt,
    evaluation_submitted_at: formatLocalTimeWithMs(submittedEpochMs),
    response_duration_ms: submittedEpochMs - pendingEvaluation.startedEpochMs,
    thermal_sensation: Number(els.sensationSlider.value),
    thermal_comfort: Number(els.comfortSlider.value),
    thermal_preference: els.preferenceButtons.dataset.selectedValue
  };

  try {
    await addStoreRecord('subjective', {
      sessionId: state.sessionId,
      ...csvRecord
    });

    state.lastEvaluation = {
      thermal_sensation: csvRecord.thermal_sensation,
      thermal_comfort: csvRecord.thermal_comfort,
      thermal_preference: csvRecord.thermal_preference
    };
    state.subjectiveCount += 1;

    let measurementStarted = false;
    let measurementCompleted = false;

    if (pendingEvaluation.type === 'checkpoint') {
      const checkpoint = config.checkpointSequence[state.checkpointIndex];

      if (!checkpoint) {
        throw new Error('定期地点評価の進行状態が不正です．');
      }

      if (state.checkpointIndex === 0 && !state.startedAt) {
        state.startedAt = csvRecord.evaluation_submitted_at;
        state.startedEpochMs = submittedEpochMs;
        measurementStarted = true;
      }

      state.currentSegment = checkpoint.nextSegment;
      state.checkpointIndex += 1;

      if (state.checkpointIndex >= config.checkpointSequence.length) {
        state.active = false;
        state.completed = true;
        state.endedAt = csvRecord.evaluation_submitted_at;
        state.endedEpochMs = submittedEpochMs;
        state.currentSegment = 'COMPLETE';
        measurementCompleted = true;
      }
    }

    await saveSessionState();
    cancelEvaluation();

    if (measurementCompleted) {
      stopGpsLogging();
      stopElapsedTimer();
      updateElapsedTime();
      await releaseWakeLock();
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      showFinishView();
      return;
    }

    renderExperimentState();

    if (measurementStarted) {
      startElapsedTimer();
      showMessage('実験開始時の評価を保存しました．測定を開始します．');
    } else {
      showMessage('主観評価を保存しました．');
    }
  } catch (error) {
    console.error(error);
    els.submitEvaluationBtn.disabled = false;
    showMessage('主観評価を保存できませんでした．もう一度試してください．', 'error');
  }
}

function startGpsLogging() {
  if (!('geolocation' in navigator)) {
    els.gpsStatus.textContent = '非対応';
    showMessage('このブラウザはGPS取得に対応していません．', 'error');
    return;
  }

  stopGpsLogging();
  els.gpsStatus.textContent = '取得待ち';

  gpsWatchId = navigator.geolocation.watchPosition(
    handleGpsSuccess,
    handleGpsError,
    config.gpsOptions
  );
}

async function handleGpsSuccess(position) {
  if (!state.active) return;

  const coordinates = position.coords;
  const gpsRecord = {
    sessionId: state.sessionId,
    timestamp: formatLocalTimeWithMs(position.timestamp || Date.now()),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    accuracy: nullableNumber(coordinates.accuracy),
    heading: nullableNumber(coordinates.heading),
    speed: nullableNumber(coordinates.speed)
  };

  try {
    await addStoreRecord('gps', gpsRecord);
    state.gpsCount += 1;
    els.gpsCount.textContent = String(state.gpsCount);
    updateGpsStatus(gpsRecord.accuracy);

    if (state.gpsCount % 10 === 0) {
      await saveSessionState();
    }
  } catch (error) {
    console.error(error);
    showMessage('GPSデータを端末へ保存できませんでした．', 'error');
  }
}

function handleGpsError(error) {
  const messages = {
    1: '位置情報の使用が許可されていません',
    2: '位置情報を取得できません',
    3: '位置情報の取得がタイムアウトしました'
  };
  els.gpsStatus.textContent = messages[error.code] || 'GPSエラー';
  showMessage(`${els.gpsStatus.textContent}．端末の位置情報設定を確認してください．`, 'warning');
}

function updateGpsStatus(accuracy) {
  if (accuracy === null || accuracy === '') {
    els.gpsStatus.textContent = '取得中';
    return;
  }

  const value = Number(accuracy);
  const thresholds = config.gpsAccuracyThresholds;

  if (value <= thresholds.good) {
    els.gpsStatus.textContent = `良好（±${value.toFixed(0)} m）`;
  } else if (value <= thresholds.warning) {
    els.gpsStatus.textContent = `注意（±${value.toFixed(0)} m）`;
  } else {
    els.gpsStatus.textContent = `精度低下（±${value.toFixed(0)} m）`;
  }
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : '';
}

function stopGpsLogging() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

function showFinishView() {
  els.experimentView.classList.add('hidden');
  els.startView.classList.add('hidden');
  els.finishView.classList.remove('hidden');

  const durationText = formatElapsedDuration(getMeasurementDurationMs());
  els.finishSummary.textContent = `測定時間 ${durationText}，主観評価 ${state.subjectiveCount} 件，GPS ${state.gpsCount} 件を記録しました．`;
  showMessage('最後の定期地点評価を保存し，測定を終了しました．CSV保存ボタンから2つのファイルを保存してください．');
}

async function downloadAllCsvFiles() {
  els.downloadAllBtn.disabled = true;

  try {
    const [subjectiveRecords, gpsRecords] = await Promise.all([
      getRecordsBySession('subjective', state.sessionId),
      getRecordsBySession('gps', state.sessionId)
    ]);

    subjectiveRecords.sort((a, b) => a.evaluation_started_at.localeCompare(b.evaluation_started_at));
    gpsRecords.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const subjectiveColumns = [
      'trigger_type',
      'segment_id',
      'evaluation_started_at',
      'evaluation_submitted_at',
      'response_duration_ms',
      'thermal_sensation',
      'thermal_comfort',
      'thermal_preference'
    ];

    const gpsColumns = [
      'timestamp',
      'latitude',
      'longitude',
      'accuracy',
      'heading',
      'speed'
    ];

    const subjectiveBlob = createCsvBlob(subjectiveColumns, subjectiveRecords);
    const gpsBlob = createCsvBlob(gpsColumns, gpsRecords);

    triggerBlobDownload(`${state.sessionId}_subjective.csv`, subjectiveBlob);
    window.setTimeout(() => {
      triggerBlobDownload(`${state.sessionId}_gps.csv`, gpsBlob);
    }, 150);

    showMessage('主観評価CSVとGPS CSVのダウンロードを開始しました．ブラウザから複数ファイルの許可を求められた場合は許可してください．');
  } catch (error) {
    console.error(error);
    showMessage('CSVを生成できませんでした．もう一度試してください．', 'error');
  } finally {
    window.setTimeout(() => {
      els.downloadAllBtn.disabled = false;
    }, 500);
  }
}

function createCsvBlob(columns, records) {
  const lines = [columns.join(',')];

  for (const record of records) {
    lines.push(columns.map(column => escapeCsv(record[column])).join(','));
  }

  const content = `\uFEFF${lines.join('\r\n')}`;
  return new Blob([content], { type: 'text/csv;charset=utf-8' });
}

function triggerBlobDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function resetForNewExperiment() {
  state = createInitialState();
  pendingEvaluation = null;
  els.participantId.value = '';
  els.finishView.classList.add('hidden');
  els.experimentView.classList.add('hidden');
  els.startView.classList.remove('hidden');
  els.elapsedTime.textContent = '未開始';
  els.gpsStatus.textContent = '未取得';
  showMessage('新しい参加者IDを入力してください．');
}

function startElapsedTimer() {
  if (!state.startedEpochMs) return;
  stopElapsedTimer();
  updateElapsedTime();
  elapsedTimerId = window.setInterval(updateElapsedTime, 250);
}

function updateElapsedTime() {
  if (!state.startedEpochMs) {
    els.elapsedTime.textContent = '未開始';
    return;
  }

  const endEpochMs = state.endedEpochMs || Date.now();
  const elapsedMs = Math.max(0, endEpochMs - state.startedEpochMs);
  els.elapsedTime.textContent = formatElapsedDuration(elapsedMs);
}

function getMeasurementDurationMs() {
  if (!state.startedEpochMs) return 0;
  const endEpochMs = state.endedEpochMs || Date.now();
  return Math.max(0, endEpochMs - state.startedEpochMs);
}

function formatElapsedDuration(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function stopElapsedTimer() {
  if (elapsedTimerId !== null) {
    window.clearInterval(elapsedTimerId);
    elapsedTimerId = null;
  }
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || !state.active) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (error) {
    console.warn('Wake Lockを取得できませんでした．', error);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch (error) {
    console.warn(error);
  } finally {
    wakeLock = null;
  }
}

function updateOnlineStatus() {
  const online = navigator.onLine;
  els.offlineBadge.textContent = online ? 'オンライン' : 'オフライン';
  els.offlineBadge.className = `status-badge ${online ? 'good' : 'warning'}`;
}

function showMessage(message, type = 'normal') {
  els.messageArea.textContent = message;
  els.messageArea.className = `message-area${type === 'normal' ? '' : ` ${type}`}`;
}

function toCompactLocalTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function formatLocalTimeWithMs(epochMs) {
  const d = new Date(epochMs);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function parseLocalTimeWithMs(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) {
    const fallback = Date.parse(value);
    return Number.isFinite(fallback) ? fallback : null;
  }

  const [, year, month, day, hour, minute, second, millisecond] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  ).getTime();
}

async function restoreActiveSessionIfNeeded() {
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!activeSessionId || !db) return;

  const session = await getStoreRecord('sessions', activeSessionId);
  if (!session || !session.active) {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    return;
  }

  const resume = window.confirm(
    `未終了の実験があります．\n\n参加者ID：${session.participantId}\n準備時刻：${session.createdAt || session.startedAt || '不明'}\n\n実験を再開しますか．`
  );

  if (!resume) {
    session.active = false;
    session.completed = false;
    session.endedAt = formatLocalTimeWithMs(Date.now());
    await putStoreRecord('sessions', session);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    return;
  }

  state = session;
  state.startedEpochMs = state.startedEpochMs || parseLocalTimeWithMs(state.startedAt);
  state.endedEpochMs = state.endedEpochMs || parseLocalTimeWithMs(state.endedAt);
  const subjectiveRecords = await getRecordsBySession('subjective', state.sessionId);
  const gpsRecords = await getRecordsBySession('gps', state.sessionId);
  state.subjectiveCount = subjectiveRecords.length;
  state.gpsCount = gpsRecords.length;

  showExperimentView();
  startGpsLogging();
  if (state.startedAt) {
    startElapsedTimer();
    showMessage('未終了の測定を再開しました．');
  } else {
    els.elapsedTime.textContent = '未開始';
    showMessage('GPS記録を再開しました．実験開始時の定期地点評価を送信すると測定時間を開始します．');
  }
  await acquireWakeLock();
}

async function saveSessionState() {
  if (!db || !state.sessionId) return;
  await putStoreRecord('sessions', { ...state });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains('sessions')) {
        database.createObjectStore('sessions', { keyPath: 'sessionId' });
      }

      if (!database.objectStoreNames.contains('subjective')) {
        const store = database.createObjectStore('subjective', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }

      if (!database.objectStoreNames.contains('gps')) {
        const store = database.createObjectStore('gps', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function addStoreRecord(storeName, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putStoreRecord(storeName, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).put(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStoreRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getRecordsBySession(storeName, sessionId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const index = transaction.objectStore(storeName).index('sessionId');
    const request = index.getAll(IDBKeyRange.only(sessionId));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(error => {
      console.warn('Service Workerを登録できませんでした．', error);
    });
  });
}
