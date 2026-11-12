const STORAGE_KEY = 'teleprompter-state-v1';
const CHANNEL_NAME = 'teleprompter-sync';

const defaults = {
  text: `Hola. Este es tu nuevo teleprompter.\n\nPega aquí el texto que quieras presentar y ajusta la velocidad, el tamaño de la letra, los colores y el ancho de lectura.\n\nUsa una ventana estrecha para que tus ojos recorran menos distancia y tu lectura se vea más natural.`,
  wpm: 130,
  fontSize: 52,
  readerWidth: 620,
  lineHeight: 1.45,
  fontFamily: 'Inter, Arial, sans-serif',
  textColor: '#f7f3ea',
  backgroundColor: '#080b12',
  focusGuide: true,
  mirror: false
};

const sampleText = `Buenos días. Gracias por acompañarme.\n\nHoy quiero presentar una idea de manera clara, tranquila y cercana.\n\nEste teleprompter me permite mantener un ritmo constante y reducir el movimiento de los ojos gracias a un área de lectura más estrecha.\n\nPuedo pausar en cualquier momento, ajustar la velocidad y continuar desde el mismo lugar.`;

const $ = (selector) => document.querySelector(selector);
const elements = {
  appShell: $('#appShell'),
  scriptInput: $('#scriptInput'),
  promptText: $('#promptText'),
  wordCount: $('#wordCount'),
  stage: $('#teleprompterStage'),
  focusGuide: $('#focusGuide'),
  playButton: $('#playButton'),
  resetButton: $('#resetButton'),
  compactButton: $('#compactButton'),
  compactExitButton: $('#compactExitButton'),
  popoutButton: $('#popoutButton'),
  fullscreenButton: $('#fullscreenButton'),
  sampleButton: $('#sampleButton'),
  clearButton: $('#clearButton'),
  statusDot: $('#statusDot'),
  statusText: $('#statusText'),
  progressLabel: $('#progressLabel'),
  wpmInput: $('#wpmInput'),
  fontSizeInput: $('#fontSizeInput'),
  widthInput: $('#widthInput'),
  lineHeightInput: $('#lineHeightInput'),
  fontFamilyInput: $('#fontFamilyInput'),
  textColorInput: $('#textColorInput'),
  backgroundColorInput: $('#backgroundColorInput'),
  focusGuideInput: $('#focusGuideInput'),
  mirrorInput: $('#mirrorInput'),
  wpmOutput: $('#wpmOutput'),
  fontSizeOutput: $('#fontSizeOutput'),
  widthOutput: $('#widthOutput'),
  lineHeightOutput: $('#lineHeightOutput')
};

let state = loadState();
let isRunning = false;
let playbackTimer = null;
let lastTimestamp = 0;
let channel = null;

try { channel = new BroadcastChannel(CHANNEL_NAME); } catch (_) {}

function loadState() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch (_) { return { ...defaults }; }
}

function saveState(announce = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (announce) channel?.postMessage({ type: 'state', state });
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function applyState({ preserveInput = false } = {}) {
  if (!preserveInput) elements.scriptInput.value = state.text;
  elements.promptText.textContent = state.text || 'Escribe o pega un texto para comenzar.';
  elements.wpmInput.value = state.wpm;
  elements.fontSizeInput.value = state.fontSize;
  elements.widthInput.value = state.readerWidth;
  elements.lineHeightInput.value = state.lineHeight;
  elements.fontFamilyInput.value = state.fontFamily;
  elements.textColorInput.value = state.textColor;
  elements.backgroundColorInput.value = state.backgroundColor;
  elements.focusGuideInput.checked = state.focusGuide;
  elements.mirrorInput.checked = state.mirror;

  elements.stage.style.backgroundColor = state.backgroundColor;
  elements.stage.style.setProperty('--reader-width', `${state.readerWidth}px`);
  elements.stage.style.setProperty('--reader-size', `${state.fontSize}px`);
  elements.stage.style.setProperty('--reader-color', state.textColor);
  elements.stage.style.setProperty('--reader-line-height', state.lineHeight);
  elements.stage.style.setProperty('--reader-font', state.fontFamily);
  elements.promptText.classList.toggle('mirrored', state.mirror);
  elements.focusGuide.classList.toggle('hidden', !state.focusGuide);

  elements.wpmOutput.textContent = `${state.wpm} PPM`;
  elements.fontSizeOutput.textContent = `${state.fontSize} px`;
  elements.widthOutput.textContent = `${state.readerWidth} px`;
  elements.lineHeightOutput.textContent = Number(state.lineHeight).toFixed(2);
  elements.wordCount.textContent = `${countWords(state.text)} palabras`;
  updateProgress();
}

function updateStateFromControls() {
  state = {
    ...state,
    text: elements.scriptInput.value,
    wpm: Number(elements.wpmInput.value),
    fontSize: Number(elements.fontSizeInput.value),
    readerWidth: Number(elements.widthInput.value),
    lineHeight: Number(elements.lineHeightInput.value),
    fontFamily: elements.fontFamilyInput.value,
    textColor: elements.textColorInput.value,
    backgroundColor: elements.backgroundColorInput.value,
    focusGuide: elements.focusGuideInput.checked,
    mirror: elements.mirrorInput.checked
  };
  applyState({ preserveInput: true });
  saveState();
}

function pixelsPerSecond() {
  const averageWordWidth = state.fontSize * 2.8;
  const wordsPerLine = Math.max(3, state.readerWidth / averageWordWidth);
  const linesPerMinute = state.wpm / wordsPerLine;
  const lineHeightInPixels = state.fontSize * state.lineHeight;
  return Math.min(220, Math.max(12, (linesPerMinute * lineHeightInPixels) / 60));
}

function tick(timestamp) {
  if (!isRunning) return;
  if (!lastTimestamp) lastTimestamp = timestamp;
  const delta = Math.min(250, timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  elements.stage.scrollTop += pixelsPerSecond() * delta;
  updateProgress();

  if (elements.stage.scrollTop >= elements.stage.scrollHeight - elements.stage.clientHeight - 1) {
    pause('Finalizado');
    return;
  }
}

function play() {
  if (!state.text.trim()) return;
  const maxScroll = elements.stage.scrollHeight - elements.stage.clientHeight;
  if (maxScroll > 0 && elements.stage.scrollTop >= maxScroll - 2) {
    elements.stage.scrollTop = 0;
  }
  isRunning = true;
  lastTimestamp = 0;
  elements.playButton.textContent = '❚❚ Pausar';
  elements.statusText.textContent = 'En reproducción';
  elements.statusDot.classList.add('running');
  channel?.postMessage({ type: 'playback', action: 'play' });
  clearInterval(playbackTimer);
  lastTimestamp = performance.now();
  playbackTimer = setInterval(() => tick(performance.now()), 30);
}

function pause(label = 'En pausa', broadcast = true) {
  isRunning = false;
  clearInterval(playbackTimer);
  playbackTimer = null;
  elements.playButton.textContent = '▶ Continuar';
  elements.statusText.textContent = label;
  elements.statusDot.classList.remove('running');
  if (broadcast) channel?.postMessage({ type: 'playback', action: 'pause' });
}

function togglePlayback() { isRunning ? pause() : play(); }

function reset(broadcast = true) {
  pause('Preparado', false);
  elements.stage.scrollTo({ top: 0, behavior: 'auto' });
  elements.playButton.textContent = '▶ Iniciar';
  updateProgress();
  if (broadcast) channel?.postMessage({ type: 'playback', action: 'reset' });
}

function updateProgress() {
  const max = elements.stage.scrollHeight - elements.stage.clientHeight;
  const progress = max > 0 ? Math.round((elements.stage.scrollTop / max) * 100) : 0;
  elements.progressLabel.textContent = `${Math.min(100, Math.max(0, progress))}%`;
}

function openPopout() {
  saveState();
  const url = `${location.href.split('?')[0]}?reader=1`;
  window.open(url, 'teleprompterReader', 'popup=yes,width=560,height=760,resizable=yes,scrollbars=no');
}

function changeWpm(delta) {
  state.wpm = Math.min(350, Math.max(40, state.wpm + delta));
  applyState({ preserveInput: true });
  saveState();
}

function setCompactMode(enabled) {
  elements.appShell.classList.toggle('compact', enabled);
  elements.compactButton.textContent = enabled ? 'Mostrar controles' : 'Modo compacto';
  elements.compactExitButton.setAttribute('aria-hidden', String(!enabled));
  if (enabled) elements.stage.focus();
}

elements.playButton.addEventListener('click', togglePlayback);
elements.resetButton.addEventListener('click', () => reset());
elements.stage.addEventListener('click', togglePlayback);
elements.stage.addEventListener('scroll', updateProgress);
elements.popoutButton.addEventListener('click', openPopout);
elements.compactButton.addEventListener('click', () => setCompactMode(!elements.appShell.classList.contains('compact')));
elements.compactExitButton.addEventListener('click', () => setCompactMode(false));
elements.fullscreenButton.addEventListener('click', () => {
  if (!document.fullscreenElement) elements.stage.requestFullscreen?.();
  else document.exitFullscreen?.();
});
elements.sampleButton.addEventListener('click', () => { elements.scriptInput.value = sampleText; updateStateFromControls(); reset(); });
elements.clearButton.addEventListener('click', () => { elements.scriptInput.value = ''; updateStateFromControls(); reset(); elements.scriptInput.focus(); });

[
  elements.scriptInput, elements.wpmInput, elements.fontSizeInput, elements.widthInput,
  elements.lineHeightInput, elements.fontFamilyInput, elements.textColorInput,
  elements.backgroundColorInput, elements.focusGuideInput, elements.mirrorInput
].forEach((control) => control.addEventListener('input', updateStateFromControls));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (elements.appShell.classList.contains('compact')) setCompactMode(false);
    if (document.fullscreenElement) document.exitFullscreen?.();
    return;
  }
  if (event.target.matches('textarea, input, select')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  if (event.key.toLowerCase() === 'r') reset();
  if (event.key === 'ArrowUp') { event.preventDefault(); changeWpm(5); }
  if (event.key === 'ArrowDown') { event.preventDefault(); changeWpm(-5); }
  if (event.key.toLowerCase() === 'f') elements.fullscreenButton.click();
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  state = loadState();
  applyState();
});

channel?.addEventListener('message', ({ data }) => {
  if (data.type === 'state') { state = { ...state, ...data.state }; applyState(); }
  if (data.type === 'playback' && data.action === 'play' && !isRunning) play();
  if (data.type === 'playback' && data.action === 'pause' && isRunning) pause('En pausa', false);
  if (data.type === 'playback' && data.action === 'reset') reset(false);
});

if (new URLSearchParams(location.search).has('reader')) {
  document.body.classList.add('reader-mode');
}

applyState();
