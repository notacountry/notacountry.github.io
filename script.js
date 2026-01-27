const contentElement = document.getElementById('ascii-content');
let currentPage = 'home';

function loadContent(page) {
  fetch(`txt/content/${page}.txt`)
    .then(response => response.text())
    .then(data => {
      contentElement.textContent = data;
      currentPage = page;
    })
    .catch(error => console.error(`Error loading ${page}:`, error));
}

fetch('txt/button.txt')
  .then(response => response.text())
  .then(data => {
    document.getElementById('dial-1').innerHTML = `<span class="button-label">research</span><div style="white-space: pre; font-size: 14px; line-height: 1.2; margin-top: 4px;">${data}</div>`;
    document.getElementById('dial-2').innerHTML = `<span class="button-label">about</span><div style="white-space: pre; font-size: 14px; line-height: 1.2; margin-top: 4px;">${data}</div>`;
  })
  .catch(error => console.error('Error loading button:', error));

fetch('txt/quote.txt')
  .then(response => response.text())
  .then(data => {
    document.getElementById('quote-text').textContent = data;
  })
  .catch(error => console.error('Error loading quote:', error));

// Load home page initially
loadContent('home');

// Add click handlers to buttons
document.getElementById('dial-1').addEventListener('click', () => loadContent('research'));
document.getElementById('dial-2').addEventListener('click', () => loadContent('about'));

// Add click handler to icon to load home page
document.getElementById('ascii-icon').addEventListener('click', () => loadContent('home'));

// Handle contenteditable based on window size
function handleContentEditable() {
  if (window.innerWidth <= 600) {
    contentElement.contentEditable = 'false';
  } else {
    contentElement.contentEditable = 'true';
  }
}

// Check on load
handleContentEditable();

// Check on resize
window.addEventListener('resize', handleContentEditable);
