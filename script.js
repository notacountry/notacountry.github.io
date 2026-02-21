const contentElement = document.getElementById('ascii-content');
const quoteElement = document.getElementById('quote-text');
const dialOne = document.getElementById('dial-1');
const dialTwo = document.getElementById('dial-2');
const asciiIcon = document.getElementById('ascii-icon');
let currentPage = 'home';
let isUpdating = false;
let lastRenderedText = '';
let contentFetchController = null;

if (!contentElement) {
  throw new Error('Missing required element: #ascii-content');
}
if (!quoteElement) {
  throw new Error('Missing required element: #quote-text');
}
if (!dialOne) {
  throw new Error('Missing required element: #dial-1');
}
if (!dialTwo) {
  throw new Error('Missing required element: #dial-2');
}
if (!asciiIcon) {
  throw new Error('Missing required element: #ascii-icon');
}

class ContentParser {
  static parse(text) {
    const parts = [];
    let lastIndex = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\\') {
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

  static needsRerender(oldText, newText) {
    const oldSignature = ContentParser.tokenSignature(oldText);
    const newSignature = ContentParser.tokenSignature(newText);
    return oldSignature !== newSignature;
  }

  static tokenSignature(text) {
    return ContentParser.parse(text)
      .filter(part => part.type !== 'text')
      .map(part => `${part.type}:${part.content}`)
      .join('|');
  }

  static unescapeDelimiters(text) {
    return text.replace(/\\!/g, '!').replace(/\\\[/g, '[').replace(/\\\]/g, ']');
  }

  static findClosingBracket(text, startIndex) {
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === ']') {
        return i;
      }
    }
    return -1;
  }
}

class CursorManager {
  static save(element) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(element);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      return preSelectionRange.toString().length;
    }
    return 0;
  }
  
  static restore(element, position) {
    const selection = window.getSelection();
    const range = document.createRange();
    let charCount = 0;
    let found = false;
    
    const traverse = (node) => {
      if (found) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharCount = charCount + node.length;
        if (position <= nextCharCount) {
          range.setStart(node, position - charCount);
          range.collapse(true);
          found = true;
          return;
        }
        charCount = nextCharCount;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
          if (found) return;
        }
      }
    };
    
    traverse(element);
    if (found) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
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
      const shouldOpen = window.confirm(`Open this link?\n${content}`);
      if (shouldOpen) {
        window.open(content, '_blank');
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

class ContentRenderer {
  static render(text) {
    if (isUpdating) return;
    isUpdating = true;
    
    const cursorPos = CursorManager.save(contentElement);
    contentElement.innerHTML = '';
    
    const parts = ContentParser.parse(text);
    
    parts.forEach(part => {
      if (part.type === 'text') {
        contentElement.appendChild(document.createTextNode(part.content));
      } else if (part.type === 'link') {
        contentElement.appendChild(document.createTextNode('['));
        contentElement.appendChild(LinkRenderer.render(part.content));
        contentElement.appendChild(document.createTextNode(']'));
      } else if (part.type === 'image') {
        contentElement.appendChild(document.createTextNode('!['));
        contentElement.appendChild(LinkRenderer.render(part.content));
        contentElement.appendChild(document.createTextNode(']'));
        
        const imgContainer = document.createElement('span');
        imgContainer.appendChild(ImageRenderer.render(part.content));
        contentElement.appendChild(imgContainer);
      }
    });
    
    CursorManager.restore(contentElement, cursorPos);
    lastRenderedText = text;
    isUpdating = false;
  }
}

function loadContent(page, options = {}) {
  if (contentFetchController) {
    contentFetchController.abort();
  }
  contentFetchController = new AbortController();

  fetchText(`txt/content/${page}.txt`, { signal: contentFetchController.signal })
    .then(data => {
      ContentRenderer.render(data);
      currentPage = page;
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

function loadFile(url, callback) {
  fetchText(url)
    .then(callback)
    .catch(error => console.error(`Error loading ${url}:`, error));
}

function fetchText(url, options = {}) {
  return fetch(url, options).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.text();
  });
}

contentElement.addEventListener('input', () => {
  if (!isUpdating) {
    const text = contentElement.textContent;
    if (ContentParser.needsRerender(lastRenderedText, text)) {
      ContentRenderer.render(text);
    } else {
      lastRenderedText = text;
    }
  }
});

loadFile('txt/quote.txt', (data) => {
  quoteElement.textContent = data;
});

function getPageFromPath() {
  const url = new URL(window.location.href);
  const pageParam = url.searchParams.get('page');
  if (!pageParam) {
    return 'about';
  }
  return pageParam;
}

function loadInitialPage() {
  const page = getPageFromPath();
  loadContent(page, { pushState: false });
  const url = new URL(window.location.href);
  url.searchParams.set('page', page);
  window.history.replaceState({ page }, '', url.toString());
}

loadInitialPage();

dialOne.addEventListener('click', () => loadContent('research', { pushState: true }));
dialTwo.addEventListener('click', () => loadContent('about', { pushState: true }));
asciiIcon.addEventListener('click', () => loadContent(currentPage, { pushState: true }));

window.addEventListener('popstate', (event) => {
  const page = event.state?.page || getPageFromPath();
  loadContent(page, { pushState: false });
});

function handleContentEditable() {
  contentElement.contentEditable = window.innerWidth > 600 ? 'true' : 'false';
}

handleContentEditable();
window.addEventListener('resize', handleContentEditable);
