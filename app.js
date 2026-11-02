// State Management
let currentSectionId = 1;
let currentChapterNum = 1;
let currentFontSize = 19; // Default px
let activeTheme = 'dark'; // 'dark' | 'light' | 'sepia'
let parsedChapters = []; // Parsed list of chapters for current section
let currentSpeakingElement = null; // Verse item currently being read aloud
let speechSynth = window.speechSynthesis || null;
let speechAvailable = 'speechSynthesis' in window;
let speechRate = 0.92; // Default speech speed rate (0.5 to 1.5)
let selectedVoiceURI = ''; // User chosen voice identifier

// Generalized parser for any section markdown
function parseSectionMarkdown(rawText) {
  const lines = rawText.split('\n');
  const chapters = [];
  let currentChapter = null;
  let currentPartBanner = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for Part headers / Group headings
    if (line.startsWith('PART ONE:') || line.startsWith('PART TWO:') || line.startsWith('PART THREE:')) {
      currentPartBanner = {
        title: line,
        range: lines[i + 1] && lines[i + 1].startsWith('Chapters') ? lines[i + 1].trim() : ''
      };
      continue;
    }

    if (line.startsWith('Chapters 7-10 - The Fall and The Judgment')) {
      currentPartBanner = {
        title: 'PART TWO: THE FALL AND THE JUDGMENT',
        range: 'Chapters 7–16'
      };
      continue;
    }

    // Check for Chapter header e.g. "Chapter 37, XXXVII" or "Chapter 38, XXXVIII - The First Parable"
    const chapMatch = line.match(/^Chapter\s+(\d+)(?:,\s*([IVXLCDM]+))?(?:\s*-\s*(.+))?$/i);
    if (chapMatch) {
      const num = parseInt(chapMatch[1], 10);
      const roman = chapMatch[2] || '';
      const subtitle = chapMatch[3] || '';

      currentChapter = {
        number: num,
        roman: roman,
        subtitle: subtitle,
        partBanner: currentPartBanner,
        verses: []
      };
      chapters.push(currentChapter);
      currentPartBanner = null; // Reset once consumed
      continue;
    }

    // Check for Verses e.g. "1. The second vision..." or grouped verses "4-5. And first..."
    const verseMatch = line.match(/^(\d+(?:-\d+)?)\.\s+(.+)$/);
    if (verseMatch && currentChapter) {
      currentChapter.verses.push({
        num: verseMatch[1],
        text: verseMatch[2]
      });
      continue;
    }

    // Continuations of multi-line verse text
    if (currentChapter && currentChapter.verses.length > 0) {
      const lastVerse = currentChapter.verses[currentChapter.verses.length - 1];
      lastVerse.text += ' ' + line;
    }
  }

  return chapters;
}

// Render Section Sidebar List
function renderSectionsSidebar() {
  const container = document.getElementById('sections-accordion');
  if (!container) return;
  container.innerHTML = '';

  ENOCH_SECTIONS.forEach(sec => {
    const item = document.createElement('div');
    item.className = `section-item ${sec.id === currentSectionId ? 'active' : ''} ${sec.status === 'planned' ? 'disabled' : ''}`;
    item.innerHTML = `
      <div class="sec-title">Section ${sec.id}: ${sec.title}</div>
      <div class="sec-desc">${sec.range} ${sec.status === 'planned' ? '• (Coming Soon)' : '• Ready to read'}</div>
    `;

    if (sec.status === 'available') {
      item.addEventListener('click', () => {
        selectSection(sec.id);
      });
    } else {
      item.title = "This section is in progress and will be available once translated.";
    }

    container.appendChild(item);
  });
}

// Render Quick Chapter Grid in Sidebar
function renderChapterChips() {
  const grid = document.getElementById('chapter-chips-grid');
  const label = document.getElementById('current-section-chips-label');
  if (label) {
    label.textContent = `SECTION ${currentSectionId} CHAPTERS`;
  }
  if (!grid) return;
  grid.innerHTML = '';

  parsedChapters.forEach(chap => {
    const chip = document.createElement('button');
    chip.className = `chip-btn ${chap.number === currentChapterNum ? 'active' : ''}`;
    chip.textContent = chap.number;
    chip.title = `Chapter ${chap.number}${chap.subtitle ? ': ' + chap.subtitle : ''}`;
    chip.addEventListener('click', () => {
      goToChapter(chap.number);
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
    grid.appendChild(chip);
  });
}

// Render the Content
function renderCurrentContent(searchFilter = '') {
  const container = document.getElementById('book-text-area');
  if (!container) return;

  container.innerHTML = '';

  // Filter or show all chapters in current section
  const chaptersToDisplay = parsedChapters;

  chaptersToDisplay.forEach(chap => {
    const chapBlock = document.createElement('section');
    chapBlock.className = 'chapter-block';
    chapBlock.id = `chapter-${chap.number}`;

    let html = '';

    if (chap.partBanner) {
      html += `
        <div class="part-header-banner">
          <div class="part-title">${chap.partBanner.title}</div>
          ${chap.partBanner.range ? `<div class="part-range">${chap.partBanner.range}</div>` : ''}
        </div>
      `;
    }

    html += `
      <div class="chapter-header">
        <h3 class="chapter-title">Chapter ${chap.number} ${chap.roman ? `<span style="font-size:0.85em; opacity:0.75;">[${chap.roman}]</span>` : ''}</h3>
        ${chap.subtitle ? `<div class="chapter-subtitle">${chap.subtitle}</div>` : ''}
      </div>
      <div class="verses-container">
    `;

    html += `</div>`;
    chapBlock.innerHTML = html;

    const versesContainer = chapBlock.querySelector('.verses-container');

    chap.verses.forEach(v => {
      let verseText = v.text;
      if (searchFilter && searchFilter.trim() !== '') {
        const regex = new RegExp(`(${escapeRegExp(searchFilter)})`, 'gi');
        verseText = verseText.replace(regex, '<mark>$1</mark>');
      }

      const verseItem = document.createElement('div');
      verseItem.className = 'verse-item';
      verseItem.id = `c${chap.number}-v${v.num}`;
      verseItem.title = `Click to listen to Chapter ${chap.number}:${v.num}`;
      verseItem.innerHTML = `
        <span class="verse-num">
          <span class="verse-speak-icon">🔊</span>
          ${v.num}
        </span>
        <span class="verse-text">${verseText}</span>
      `;

      // Click to read aloud
      verseItem.addEventListener('click', () => {
        // Prevent if user is just highlighting/selecting text
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;
        speakVerse(v.text, verseItem);
      });

      versesContainer.appendChild(verseItem);
    });

    container.appendChild(chapBlock);
  });

  updateStatusDisplay();
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Text-to-Speech Engine
function populateVoiceList() {
  if (!speechAvailable) return;
  const select = document.getElementById('voice-select');
  if (!select) return;

  const voices = speechSynth.getVoices();
  // Filter for English voices for best reading experience of Enoch translation
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const listToRender = englishVoices.length > 0 ? englishVoices : voices;

  select.innerHTML = '';

  // Natural / premium voices prioritization
  listToRender.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    // Mark natural/online voices so user easily picks good ones
    const isNatural = voice.name.includes('Natural') || voice.name.includes('Online') || voice.name.includes('Google') || voice.name.includes('Neural');
    option.textContent = `${voice.name} (${voice.lang})${isNatural ? ' ★' : ''}`;
    if (voice.voiceURI === selectedVoiceURI) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  // If none selected yet, choose first natural voice or default
  if (!selectedVoiceURI && listToRender.length > 0) {
    const preferred = listToRender.find(v => v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Daniel') || v.name.includes('Google')) || listToRender[0];
    if (preferred) {
      selectedVoiceURI = preferred.voiceURI;
      select.value = preferred.voiceURI;
    }
  }
}

function stopSpeech() {
  if (speechSynth) {
    speechSynth.cancel();
  }
  if (currentSpeakingElement) {
    currentSpeakingElement.classList.remove('speaking');
    currentSpeakingElement = null;
  }
  const speechBtn = document.getElementById('speech-toggle-btn');
  if (speechBtn) {
    speechBtn.querySelector('.speech-icon').textContent = '🔊';
  }
}

function speakVerse(text, element) {
  if (!speechAvailable) {
    alert('Text-to-speech is not supported in this browser.');
    return;
  }

  // If clicking the verse that is currently playing, toggle stop
  if (currentSpeakingElement === element && speechSynth.speaking) {
    stopSpeech();
    return;
  }

  // Stop any active utterance first
  stopSpeech();

  // Create new utterance
  const cleanText = text.replace(/\[.*?\]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);

  // Speed and Pitch settings
  utterance.rate = speechRate;
  utterance.pitch = 0.98;

  // Use selected voice
  const voices = speechSynth.getVoices();
  if (selectedVoiceURI) {
    const matchedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (matchedVoice) utterance.voice = matchedVoice;
  } else {
    const naturalVoice = voices.find(v => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Daniel') || v.name.includes('Arthur')) && v.lang.startsWith('en')) ||
      voices.find(v => v.lang.startsWith('en'));
    if (naturalVoice) utterance.voice = naturalVoice;
  }

  // Visual cues
  currentSpeakingElement = element;
  element.classList.add('speaking');
  const speechBtn = document.getElementById('speech-toggle-btn');
  if (speechBtn) {
    speechBtn.querySelector('.speech-icon').textContent = '⏹️';
  }

  utterance.onend = () => {
    if (currentSpeakingElement === element) {
      element.classList.remove('speaking');
      currentSpeakingElement = null;
      if (speechBtn) speechBtn.querySelector('.speech-icon').textContent = '🔊';
    }
  };

  utterance.onerror = () => {
    if (currentSpeakingElement === element) {
      element.classList.remove('speaking');
      currentSpeakingElement = null;
      if (speechBtn) speechBtn.querySelector('.speech-icon').textContent = '🔊';
    }
  };

  speechSynth.speak(utterance);
}

// Chapter Navigation
function goToChapter(num) {
  if (parsedChapters.length === 0) return;
  const minNum = parsedChapters[0].number;
  const maxNum = parsedChapters[parsedChapters.length - 1].number;

  if (num < minNum) num = minNum;
  if (num > maxNum) num = maxNum;
  currentChapterNum = num;

  renderChapterChips();
  updateStatusDisplay();

  const targetEl = document.getElementById(`chapter-${num}`);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateStatusDisplay() {
  const display = document.getElementById('curr-status-display');
  if (display && parsedChapters.length > 0) {
    const minNum = parsedChapters[0].number;
    const maxNum = parsedChapters[parsedChapters.length - 1].number;
    display.textContent = `Chapter ${currentChapterNum} (${minNum}–${maxNum})`;
  }
}

// Section Selector
function selectSection(secId) {
  if (!RAW_SECTIONS[secId]) return;
  stopSpeech();
  currentSectionId = secId;
  localStorage.setItem('enoch_current_section', secId);

  // Parse new section
  parsedChapters = parseSectionMarkdown(RAW_SECTIONS[secId]);
  currentChapterNum = parsedChapters[0] ? parsedChapters[0].number : 1;

  renderSectionsSidebar();
  renderChapterChips();
  renderCurrentContent();

  // Scroll to top of content
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Font Size Controls
function setFontSize(size) {
  currentFontSize = Math.min(32, Math.max(14, size));
  document.documentElement.style.setProperty('--user-font-size', `${currentFontSize}px`);
  localStorage.setItem('enoch_fontsize', currentFontSize);
}

// Theme Controls
function setTheme(theme) {
  activeTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('enoch_theme', theme);

  const iconEl = document.querySelector('.theme-icon');
  if (iconEl) {
    if (theme === 'dark') iconEl.textContent = '🌙';
    else if (theme === 'light') iconEl.textContent = '☀️';
    else iconEl.textContent = '📜'; // sepia
  }
}

function cycleTheme() {
  if (activeTheme === 'dark') setTheme('light');
  else if (activeTheme === 'light') setTheme('sepia');
  else setTheme('dark');
}

// Sidebar Drawer
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('active');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

// Reading Progress Bar & Scroll Spy
function handleScroll() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

  const bar = document.getElementById('reading-progress');
  if (bar) bar.style.width = `${progress}%`;

  // Back to top button visibility
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    if (scrollTop > 400) {
      backToTop.classList.add('show');
    } else {
      backToTop.classList.remove('show');
    }
  }

  // Active chapter tracking based on viewport
  const chapterElements = document.querySelectorAll('.chapter-block');
  for (let el of chapterElements) {
    const rect = el.getBoundingClientRect();
    if (rect.top <= 160 && rect.bottom >= 160) {
      const match = el.id.match(/^chapter-(\d+)$/);
      if (match) {
        const activeNum = parseInt(match[1], 10);
        if (activeNum !== currentChapterNum) {
          currentChapterNum = activeNum;
          updateStatusDisplay();
          // Update active chip highlight without re-rendering everything
          document.querySelectorAll('.chip-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.textContent, 10) === activeNum);
          });
        }
      }
      break;
    }
  }
}

// Search
function handleSearch(query) {
  const trimmed = query.trim().toLowerCase();
  const countEl = document.getElementById('search-count');

  if (!trimmed) {
    if (countEl) countEl.textContent = '';
    renderCurrentContent();
    return;
  }

  // Count matches
  let matchCount = 0;
  parsedChapters.forEach(c => {
    c.verses.forEach(v => {
      const occurrences = (v.text.toLowerCase().match(new RegExp(escapeRegExp(trimmed), 'g')) || []).length;
      matchCount += occurrences;
    });
  });

  if (countEl) {
    countEl.textContent = matchCount > 0 ? `${matchCount} found` : '0 found';
  }

  renderCurrentContent(trimmed);

  // Scroll to first mark if any
  const firstMark = document.querySelector('mark');
  if (firstMark) {
    firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved section preference or default to 1
  const savedSec = parseInt(localStorage.getItem('enoch_current_section'), 10);
  if (savedSec && RAW_SECTIONS[savedSec]) {
    currentSectionId = savedSec;
  }

  // Parse Initial Section Data
  parsedChapters = parseSectionMarkdown(RAW_SECTIONS[currentSectionId] || RAW_SECTIONS[1]);
  currentChapterNum = parsedChapters[0] ? parsedChapters[0].number : 1;

  // Restore saved preferences
  const savedTheme = localStorage.getItem('enoch_theme') || 'dark';
  setTheme(savedTheme);

  const savedSize = parseInt(localStorage.getItem('enoch_fontsize'), 10);
  if (savedSize && !isNaN(savedSize)) {
    setFontSize(savedSize);
  }

  // Restore saved voice settings
  const savedRate = localStorage.getItem('enoch_speech_rate');
  if (savedRate) {
    speechRate = parseFloat(savedRate);
    const slider = document.getElementById('speed-slider');
    const valDisplay = document.getElementById('speed-val');
    if (slider) slider.value = speechRate;
    if (valDisplay) valDisplay.textContent = `${speechRate.toFixed(2)}x`;
  }

  const savedVoice = localStorage.getItem('enoch_speech_voice');
  if (savedVoice) {
    selectedVoiceURI = savedVoice;
  }

  // Populate Voices when ready
  if (speechSynth) {
    populateVoiceList();
    if (speechSynth.onvoiceschanged !== undefined) {
      speechSynth.onvoiceschanged = populateVoiceList;
    }
  }

  // Render components
  renderSectionsSidebar();
  renderChapterChips();
  renderCurrentContent();

  // Event Listeners
  document.getElementById('toggle-sidebar-btn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) closeSidebar();
    else openSidebar();
  });

  document.getElementById('close-sidebar-btn')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  document.getElementById('theme-toggle-btn')?.addEventListener('click', cycleTheme);
  document.getElementById('speech-toggle-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const popover = document.getElementById('speech-settings-popover');
    if (popover) {
      popover.classList.toggle('open');
    }
  });

  // Close speech popover when clicking outside
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('speech-settings-popover');
    const btn = document.getElementById('speech-toggle-btn');
    if (popover && popover.classList.contains('open')) {
      if (!popover.contains(e.target) && !btn.contains(e.target)) {
        popover.classList.remove('open');
      }
    }
  });

  // Voice Selection Dropdown
  document.getElementById('voice-select')?.addEventListener('change', (e) => {
    selectedVoiceURI = e.target.value;
    localStorage.setItem('enoch_speech_voice', selectedVoiceURI);
    // Restart active speech with new voice if playing
    if (currentSpeakingElement && speechSynth.speaking) {
      currentSpeakingElement.click();
    }
  });

  // Speed Slider
  document.getElementById('speed-slider')?.addEventListener('input', (e) => {
    speechRate = parseFloat(e.target.value);
    localStorage.setItem('enoch_speech_rate', speechRate);
    const valDisplay = document.getElementById('speed-val');
    if (valDisplay) valDisplay.textContent = `${speechRate.toFixed(2)}x`;
  });

  document.getElementById('font-increase-btn')?.addEventListener('click', () => setFontSize(currentFontSize + 2));
  document.getElementById('font-decrease-btn')?.addEventListener('click', () => setFontSize(currentFontSize - 2));
  document.getElementById('font-reset-btn')?.addEventListener('click', () => setFontSize(19));

  // Footer Navigation
  document.getElementById('prev-chap-btn')?.addEventListener('click', () => {
    goToChapter(currentChapterNum - 1);
  });
  document.getElementById('next-chap-btn')?.addEventListener('click', () => {
    goToChapter(currentChapterNum + 1);
  });

  // Back to top
  document.getElementById('back-to-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Scroll listener
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Quick search
  const searchInput = document.getElementById('quick-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleSearch(e.target.value);
      }, 250);
    });
  }

  // Keyboard navigation (Left / Right arrow keys for chapters)
  document.addEventListener('keydown', (e) => {
    // Avoid triggering when focused on input
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      goToChapter(currentChapterNum + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      goToChapter(currentChapterNum - 1);
    }
  });
});

