const VALID_PAGES = ['about', 'research'];
const DEFAULT_PAGE = 'about';

class ContentParser {
  static isEscapeChar(char) {
    return char === '\\';
  }

  static parse(text) {
    const parts = [];
    let lastIndex = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (ContentParser.isEscapeChar(char)) {
        i += 1;
        continue;
      }

      const isImage = char === '!' && text[i + 1] === '[';
      const isLink = char === '[';
      if (!isImage && !isLink) {
        continue;
      }

      const openIndex = isImage ? i + 1 : i;
      const closeIndex = ContentParser.findClosingBracket(text, openIndex + 1);
      if (closeIndex === -1) {
        continue;
      }

      if (i > lastIndex) {
        parts.push({ type: 'text', content: ContentParser.unescapeDelimiters(text.slice(lastIndex, i)) });
      }

      const content = ContentParser.unescapeDelimiters(text.slice(openIndex + 1, closeIndex));
      parts.push({ type: isImage ? 'image' : 'link', content });
      lastIndex = closeIndex + 1;
      i = closeIndex;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: ContentParser.unescapeDelimiters(text.slice(lastIndex)) });
    }

    return parts;
  }

  static unescapeDelimiters(text) {
    return text.replace(/\\!/g, '!').replace(/\\\[/g, '[').replace(/\\\]/g, ']');
  }

  static findClosingBracket(text, startIndex) {
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      if (ContentParser.isEscapeChar(char)) {
        i += 1;
        continue;
      }
      if (char === '\n') {
        return -1;
      }
      if (char === ']') {
        return i;
      }
    }
    return -1;
  }
}

class LinkRenderer {
  static render(content) {
    const element = document.createElement('span');
    element.textContent = content;
    element.style.cursor = 'pointer';
    element.style.textDecoration = 'underline';
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const url = new URL(content);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.open(content, '_blank');
        } else {
          console.warn('Blocked non-http link:', content);
        }
      } catch {
        console.warn('Invalid URL:', content);
      }
    });
    return element;
  }
}

class ImageRenderer {
  static render(content) {
    const img = document.createElement('img');
    img.src = content;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.margin = '8px 0';
    img.alt = content;
    img.addEventListener('error', () => img.remove());
    return img;
  }
}

function appendBracketed(parent, prefix, innerEl, suffix) {
  parent.appendChild(document.createTextNode(prefix));
  parent.appendChild(innerEl);
  parent.appendChild(document.createTextNode(suffix));
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.text();
}

class App {
  constructor() {
    this.contentElement = document.getElementById('ascii-content');
    this.inputElement   = document.getElementById('ascii-input');
    this.quoteElement   = document.getElementById('quote-text');
    this.asciiIcon      = document.getElementById('ascii-icon');

    if (!this.contentElement) throw new Error('Missing required element: #ascii-content');
    if (!this.inputElement)   throw new Error('Missing required element: #ascii-input');
    if (!this.quoteElement)   throw new Error('Missing required element: #quote-text');
    if (!this.asciiIcon)      throw new Error('Missing required element: #ascii-icon');

    this.state = {
      currentPage:     DEFAULT_PAGE,
      fetchController: null,
    };
    this._renderFrame = null;

    this._setupEventListeners();
    this._loadQuote();
    this._loadInitialPage();
  }

  render(text) {
    const parts = ContentParser.parse(text);
    this._renderParts(parts);
  }

  _renderParts(parts) {
    try {
      this.contentElement.innerHTML = '';

      parts.forEach(part => {
        if (part.type === 'text') {
          this.contentElement.appendChild(document.createTextNode(part.content));
        } else if (part.type === 'link') {
          appendBracketed(this.contentElement, '[', LinkRenderer.render(part.content), ']');
        } else if (part.type === 'image') {
          appendBracketed(this.contentElement, '![', LinkRenderer.render(part.content), ']');
          const imgContainer = document.createElement('span');
          imgContainer.appendChild(ImageRenderer.render(part.content));
          this.contentElement.appendChild(imgContainer);
        }
      });
    } catch (e) {
      console.error('Render error:', e);
    }
  }

  loadContent(page, options = {}) {
    if (this.state.fetchController) {
      this.state.fetchController.abort();
    }
    this.state.fetchController = new AbortController();

    fetchText(`txt/content/${page}.txt`, { signal: this.state.fetchController.signal })
      .then(data => {
        this.inputElement.value = data;
        this.render(data);
        this.state.currentPage = page;
        if (options.pushState) {
          const url = new URL(window.location.href);
          url.searchParams.set('page', page);
          window.history.pushState({ page }, '', url.toString());
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          console.error(`Error loading ${page}:`, error);
        }
      });
  }

  _loadQuote() {
    fetchText('txt/quote.txt')
      .then(data => { this.quoteElement.textContent = data; })
      .catch(error => console.error('Error loading quote:', error));
  }

  _getPageFromPath() {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('page');
    return VALID_PAGES.includes(param) ? param : DEFAULT_PAGE;
  }

  _loadInitialPage() {
    const page = this._getPageFromPath();
    this.loadContent(page, { pushState: false });
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.history.replaceState({ page }, '', url.toString());
  }

  _setupEventListeners() {
    this.inputElement.addEventListener('input', () => {
      cancelAnimationFrame(this._renderFrame);
      this._renderFrame = requestAnimationFrame(() => {
        const parts = ContentParser.parse(this.inputElement.value);
        this._renderParts(parts);
      });
    });

    this.contentElement.addEventListener('click', () => this.inputElement.focus({ preventScroll: true }));

    document.querySelectorAll('.dial-button').forEach(dial => {
      dial.addEventListener('click', () => {
        const page = dial.dataset.page;
        if (VALID_PAGES.includes(page)) {
          this.loadContent(page, { pushState: true });
        }
      });
    });

    this.asciiIcon.addEventListener('click', () => {
      this.loadContent(this.state.currentPage, { pushState: true });
    });

    window.addEventListener('popstate', (event) => {
      const page = event.state?.page || this._getPageFromPath();
      this.loadContent(page, { pushState: false });
    });
  }
}

new App();
