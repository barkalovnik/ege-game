// ==========================================================================
// КЕГЭ ТРЕНАЖЁР — ИНТЕРАКТИВНАЯ ЛОГИКА (app.js)
// ==========================================================================

(function () {
  'use strict';

  // Состояние приложения
  const state = {
    currentTaskId: 1,
    filter: 'all', // all, solved, wrong, flagged, or category
    userAnswers: {},
    taskStatus: {}, // 'solved' | 'wrong' | undefined
    flagged: {},
    notes: {},
    startTime: Date.now(),
    timerInterval: null
  };

  // Загрузка состояния из localStorage
  function loadState() {
    try {
      const saved = localStorage.getItem('kege_trainer_state_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.userAnswers) state.userAnswers = parsed.userAnswers;
        if (parsed.taskStatus) state.taskStatus = parsed.taskStatus;
        if (parsed.flagged) state.flagged = parsed.flagged;
        if (parsed.notes) state.notes = parsed.notes;
        if (parsed.currentTaskId) state.currentTaskId = parsed.currentTaskId;
      }
    } catch (e) {
      console.warn('Не удалось загрузить состояние из localStorage', e);
    }
  }

  // Сохранение состояния в localStorage
  function saveState() {
    try {
      localStorage.setItem('kege_trainer_state_v1', JSON.stringify({
        userAnswers: state.userAnswers,
        taskStatus: state.taskStatus,
        flagged: state.flagged,
        notes: state.notes,
        currentTaskId: state.currentTaskId
      }));
    } catch (e) {
      console.warn('Не удалось сохранить состояние', e);
    }
  }

  // Получить текущее задание
  function getCurrentTask() {
    return TASKS_DATA.find(t => t.id === state.currentTaskId) || TASKS_DATA[0];
  }

  // Нормализация ответа для гибкой проверки
  function normalizeAnswer(str) {
    if (!str) return '';
    return str
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[\s,;&]+/g, ' ')
      .trim();
  }

  // Проверка ответа пользователя
  function checkAnswer(taskId, inputStr) {
    const task = TASKS_DATA.find(t => t.id === taskId);
    if (!task) return false;

    const userNorm = normalizeAnswer(inputStr);
    if (!userNorm) return null;

    // Сравнение с основным ответом
    const exactNorm = normalizeAnswer(task.answer);
    if (userNorm === exactNorm) return true;

    // Сравнение с удалением внутренних пробелов (например, 1133522 vs 1133 522)
    const noSpacesUser = userNorm.replace(/\s+/g, '');
    const noSpacesExact = exactNorm.replace(/\s+/g, '');
    if (noSpacesUser === noSpacesExact) return true;

    // Проверка дополнительных допустимых вариантов
    if (task.acceptedAnswers && Array.isArray(task.acceptedAnswers)) {
      for (const alt of task.acceptedAnswers) {
        const altNorm = normalizeAnswer(alt);
        if (userNorm === altNorm || noSpacesUser === altNorm.replace(/\s+/g, '')) {
          return true;
        }
      }
    }

    return false;
  }

  // Инициализация таймера
  function initTimer() {
    const timerEl = document.getElementById('session-timer');
    if (!timerEl) return;

    let seconds = 0;
    state.timerInterval = setInterval(() => {
      seconds++;
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      timerEl.textContent = `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
  }

  // Обновление шапки со статистикой
  function updateHeaderStats() {
    const totalCount = TASKS_DATA.length;
    let solvedCount = 0;
    let totalScore = 0;

    TASKS_DATA.forEach(task => {
      if (state.taskStatus[task.id] === 'solved') {
        solvedCount++;
        totalScore += (task.points || 1);
      }
    });

    const solvedEl = document.getElementById('stat-solved-count');
    const scoreEl = document.getElementById('stat-primary-score');
    const percentEl = document.getElementById('stat-accuracy');

    if (solvedEl) solvedEl.textContent = `${solvedCount}/${totalCount}`;
    if (scoreEl) scoreEl.textContent = `${totalScore} б.`;
    if (percentEl) {
      const pct = Math.round((solvedCount / totalCount) * 100);
      percentEl.textContent = `${pct}%`;
    }
  }

  // Рендер навигационной полосы заданий (1-27)
  function renderStrip() {
    const stripEl = document.getElementById('tasks-strip');
    if (!stripEl) return;

    stripEl.innerHTML = '';

    TASKS_DATA.forEach(task => {
      const btn = document.createElement('button');
      btn.className = 'task-nav-item';
      btn.dataset.id = task.id;
      btn.title = `Тип ${task.type}: ${task.title}`;

      if (task.id === state.currentTaskId) {
        btn.classList.add('active');
      }

      const status = state.taskStatus[task.id];
      if (status === 'solved') btn.classList.add('solved');
      else if (status === 'wrong') btn.classList.add('wrong');

      if (state.flagged[task.id]) {
        btn.classList.add('flagged');
      }

      btn.textContent = task.type;

      btn.addEventListener('click', () => {
        selectTask(task.id);
      });

      stripEl.appendChild(btn);
    });
  }

  // Простое форматирование Markdown-разметки для текста
  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/### (.*?)\n/g, '<h3 style="margin: 16px 0 8px; font-size: 15px; font-weight: 600; color: var(--text-primary);">$1</h3>')
      .replace(/## (.*?)\n/g, '<h2 style="margin: 20px 0 10px; font-size: 16px; font-weight: 700; color: var(--text-primary);">$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```python([\s\S]*?)```/g, '<pre><code class="language-python">$1</code></pre>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\n\n/g, '<p style="margin-bottom: 12px;"></p>');
  }

  // Отрисовка текущего задания на рабочем столе
  function renderCurrentTask() {
    const task = getCurrentTask();
    if (!task) return;

    // Метаданные
    document.getElementById('task-header-type').textContent = `Задание ${task.type}`;
    document.getElementById('task-header-topic').textContent = task.category;
    document.getElementById('task-header-id').textContent = `№ ${task.num}`;
    document.getElementById('task-points').textContent = `${task.points} ${task.points === 1 ? 'балл' : 'балла'}`;

    // Кнопка флага
    const flagBtn = document.getElementById('task-flag-btn');
    if (flagBtn) {
      if (state.flagged[task.id]) {
        flagBtn.classList.add('active');
        flagBtn.textContent = '★ В избранном';
        flagBtn.style.color = 'var(--accent)';
      } else {
        flagBtn.classList.remove('active');
        flagBtn.textContent = '☆ Запомнить';
        flagBtn.style.color = '';
      }
    }

    // Текст условия
    const statementEl = document.getElementById('task-statement-text');
    if (statementEl) {
      statementEl.textContent = task.statement;
    }

    // Изображение
    const imgEl = document.getElementById('task-screenshot');
    if (imgEl) {
      imgEl.src = task.image;
      imgEl.alt = `Скриншот задания ${task.type} №${task.num}`;
    }

    // Поле ввода и сохранённый ответ
    const inputEl = document.getElementById('user-answer-input');
    const resultBox = document.getElementById('answer-result-box');
    const inputHint = document.getElementById('answer-format-hint');

    if (inputHint) {
      inputHint.textContent = task.answerNote ? `Формат: ${task.answerNote}` : 'Введите число или строку без пробелов';
    }

    if (inputEl) {
      inputEl.value = state.userAnswers[task.id] || '';
      inputEl.focus();
    }

    // Статус предыдущей проверки
    if (resultBox) {
      const status = state.taskStatus[task.id];
      if (status === 'solved') {
        resultBox.className = 'result-banner correct';
        resultBox.innerHTML = `<span>✓ Ответ верен! (+${task.points} б.)</span><span style="font-family: var(--font-mono); font-size: 13px;">${task.answer}</span>`;
        resultBox.classList.remove('hidden');
      } else if (status === 'wrong') {
        resultBox.className = 'result-banner incorrect';
        resultBox.innerHTML = `<span>✕ Ответ не сошёлся. Попробуйте еще раз или разверните разбор.</span>`;
        resultBox.classList.remove('hidden');
      } else {
        resultBox.className = 'result-banner hidden';
        resultBox.innerHTML = '';
      }
    }

    // Подсказка и Решение
    const hintEl = document.getElementById('task-hint-text');
    const solutionEl = document.getElementById('task-solution-text');
    const solutionWrapper = document.getElementById('solution-content-wrapper');

    if (hintEl) hintEl.textContent = task.hint;
    if (solutionEl) solutionEl.innerHTML = formatMarkdown(task.solution);
    if (solutionWrapper) solutionWrapper.classList.add('hidden');

    // Заметки к задаче
    const notesEl = document.getElementById('task-notes-input');
    if (notesEl) {
      notesEl.value = state.notes[task.id] || '';
    }

    // Обновление полосы и шапки
    renderStrip();
    updateHeaderStats();
    saveState();
  }

  // Переключение задания
  function selectTask(taskId) {
    state.currentTaskId = taskId;
    renderCurrentTask();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Переход к следующему заданию
  function nextTask() {
    const currentIndex = TASKS_DATA.findIndex(t => t.id === state.currentTaskId);
    if (currentIndex < TASKS_DATA.length - 1) {
      selectTask(TASKS_DATA[currentIndex + 1].id);
    }
  }

  // Переход к предыдущему заданию
  function prevTask() {
    const currentIndex = TASKS_DATA.findIndex(t => t.id === state.currentTaskId);
    if (currentIndex > 0) {
      selectTask(TASKS_DATA[currentIndex - 1].id);
    }
  }

  // Отправка ответа
  function submitAnswer() {
    const inputEl = document.getElementById('user-answer-input');
    if (!inputEl) return;

    const val = inputEl.value.trim();
    if (!val) {
      inputEl.focus();
      return;
    }

    state.userAnswers[state.currentTaskId] = val;
    const isCorrect = checkAnswer(state.currentTaskId, val);

    if (isCorrect) {
      state.taskStatus[state.currentTaskId] = 'solved';
    } else {
      state.taskStatus[state.currentTaskId] = 'wrong';
    }

    renderCurrentTask();
  }

  // Переключение флага
  function toggleFlag() {
    const currentId = state.currentTaskId;
    state.flagged[currentId] = !state.flagged[currentId];
    renderCurrentTask();
  }

  // Инициализация калькулятора / scratchpad
  function initCalculator() {
    const calcInput = document.getElementById('calc-input');
    const calcOutput = document.getElementById('calc-output');
    if (!calcInput || !calcOutput) return;

    calcInput.addEventListener('input', () => {
      const expr = calcInput.value.trim();
      if (!expr) {
        calcOutput.textContent = 'Результат...';
        return;
      }
      try {
        // Безопасное вычисление математических выражений (степени **, умножение, деление)
        // Заменяем Python-стиль // на Math.floor(a/b)
        let sanitized = expr.replace(/\^/g, '**');
        // Ограничиваем символы для безопасности
        if (!/^[0-9+\-*/%().\s*Math,a-z_]+$/i.test(sanitized)) {
          calcOutput.textContent = 'Недопустимые символы';
          return;
        }
        const fn = new Function('return ' + sanitized);
        const res = fn();
        calcOutput.textContent = `= ${res}`;
      } catch (err) {
        calcOutput.textContent = 'Ошибка выражения';
      }
    });
  }

  // Инициализация лайтбокса для скриншота
  function initLightbox() {
    const imgEl = document.getElementById('task-screenshot');
    const modalBackdrop = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-screenshot');
    const modalClose = document.getElementById('modal-close-btn');

    if (!imgEl || !modalBackdrop) return;

    imgEl.addEventListener('click', () => {
      modalImg.src = imgEl.src;
      modalBackdrop.classList.add('active');
    });

    modalClose.addEventListener('click', () => {
      modalBackdrop.classList.remove('active');
    });

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('active')) {
        modalBackdrop.classList.remove('active');
      }
    });
  }

  // Горячие клавиши
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Если фокус в текстовом поле или заметках, обрабатываем только специфичные клавиши
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = activeTag === 'input' || activeTag === 'textarea';

      if (e.key === 'Enter' && document.activeElement.id === 'user-answer-input') {
        e.preventDefault();
        submitAnswer();
        return;
      }

      if (isInput) return;

      if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        nextTask();
      } else if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        prevTask();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFlag();
      }
    });
  }

  // Инициализация событий
  function initEvents() {
    // Кнопка ответа
    const submitBtn = document.getElementById('submit-answer-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', submitAnswer);
    }

    // Навигация след/пред
    const nextBtn = document.getElementById('btn-next-task');
    const prevBtn = document.getElementById('btn-prev-task');
    if (nextBtn) nextBtn.addEventListener('click', nextTask);
    if (prevBtn) prevBtn.addEventListener('click', prevTask);

    // Флаг
    const flagBtn = document.getElementById('task-flag-btn');
    if (flagBtn) flagBtn.addEventListener('click', toggleFlag);

    // Переключатель решения
    const toggleSolBtn = document.getElementById('toggle-solution-btn');
    const solWrapper = document.getElementById('solution-content-wrapper');
    if (toggleSolBtn && solWrapper) {
      toggleSolBtn.addEventListener('click', () => {
        solWrapper.classList.toggle('hidden');
        toggleSolBtn.textContent = solWrapper.classList.contains('hidden') ? 'Показать разбор и Python код ↓' : 'Скрыть разбор ↑';
      });
    }

    // Сохранение заметок при вводе
    const notesEl = document.getElementById('task-notes-input');
    if (notesEl) {
      notesEl.addEventListener('input', () => {
        state.notes[state.currentTaskId] = notesEl.value;
        saveState();
      });
    }

    // Переключатель темы
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        themeBtn.textContent = nextTheme === 'light' ? 'Темная тема' : 'Светлая тема';
      });
    }

    // Сброс прогресса
    const resetBtn = document.getElementById('reset-progress-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Сбросить весь сохранённый прогресс ответов?')) {
          state.userAnswers = {};
          state.taskStatus = {};
          state.flagged = {};
          state.notes = {};
          saveState();
          renderCurrentTask();
        }
      });
    }
  }

  // Точка входа
  function init() {
    loadState();
    initTimer();
    renderStrip();
    renderCurrentTask();
    initCalculator();
    initLightbox();
    initKeyboardShortcuts();
    initEvents();
  }

  // Запуск после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
