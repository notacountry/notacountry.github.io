const contentElement = document.getElementById('ascii-content');
let currentPage = 'home';
let isUpdating = false;
let lastRenderedText = '';

class ContentParser {
  static parse(text) {
    const unescaped = text.replace(/\\!/g, '!').replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    const imageRegex = /(?<!\\)!\[([^\]]+)\]/g;
    const linkRegex = /(?<!\\)\[([^\]]+)\]/g;
    
    const tokens = [];
    let match;
    
    while ((match = imageRegex.exec(unescaped)) !== null) {
      tokens.push({ index: match.index, length: match[0].length, type: 'image', content: match[1] });
    }
    
    while ((match = linkRegex.exec(unescaped)) !== null) {
      const isPartOfImage = tokens.some(t => match.index > t.index && match.index < t.index + t.length);
      if (!isPartOfImage) {
        tokens.push({ index: match.index, length: match[0].length, type: 'link', content: match[1] });
      }
    }
    
    tokens.sort((a, b) => a.index - b.index);
    
    const parts = [];
    let lastIndex = 0;
    tokens.forEach(token => {
      if (token.index > lastIndex) {
        parts.push({ type: 'text', content: unescaped.slice(lastIndex, token.index) });
      }
      parts.push(token);
      lastIndex = token.index + token.length;
    });
    
    if (lastIndex < unescaped.length) {
      parts.push({ type: 'text', content: unescaped.slice(lastIndex) });
    }
    
    return parts;
  }
  
  static needsRerender(oldText, newText) {
    const oldPatterns = (oldText.match(/(?<!\\)!\[[^\]]+\]|(?<!\\)\[[^\]]+\]/g) || []).join('|');
    const newPatterns = (newText.match(/(?<!\\)!\[[^\]]+\]|(?<!\\)\[[^\]]+\]/g) || []).join('|');
    return oldPatterns !== newPatterns;
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
      window.open(content, '_blank');
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

function loadContent(page) {
  fetch(`txt/content/${page}.txt`)
    .then(response => response.text())
    .then(data => {
      ContentRenderer.render(data);
      currentPage = page;
    })
    .catch(error => console.error(`Error loading ${page}:`, error));
}

function loadFile(url, callback) {
  fetch(url)
    .then(response => response.text())
    .then(callback)
    .catch(error => console.error(`Error loading ${url}:`, error));
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

loadFile('txt/button.txt', (data) => {
  document.getElementById('dial-1').innerHTML = `<span class="button-label">research</span><div style="white-space: pre; font-size: 14px; line-height: 1.2; margin-top: 4px;">${data}</div>`;
  document.getElementById('dial-2').innerHTML = `<span class="button-label">about</span><div style="white-space: pre; font-size: 14px; line-height: 1.2; margin-top: 4px;">${data}</div>`;
});

loadFile('txt/quote.txt', (data) => {
  document.getElementById('quote-text').textContent = data;
});

loadContent('home');

document.getElementById('dial-1').addEventListener('click', () => loadContent('research'));
document.getElementById('dial-2').addEventListener('click', () => loadContent('about'));
document.getElementById('ascii-icon').addEventListener('click', () => loadContent('home'));

function handleContentEditable() {
  contentElement.contentEditable = window.innerWidth > 600 ? 'true' : 'false';
}

handleContentEditable();
window.addEventListener('resize', handleContentEditable);
