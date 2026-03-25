/**
 * Breslev Flipbook Viewer — StPageFlip + PDF.js
 * Remplace FlipHTML5 ($40/mois) par une solution gratuite
 * Accès complet = utilisateurs payants uniquement
 * Aperçu = 5 premières pages gratuites
 */
(function() {
  const PREVIEW_PAGES = 5;
  const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
  const PDF_JS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

  window.initFlipbook = async function(containerId, pdfUrl, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isPaid = options.isPaid || false;
    const userName = options.userName || 'Visiteur';
    const maxPages = isPaid ? 9999 : PREVIEW_PAGES;

    container.innerHTML = '<div class="flipbook-loading"><div class="flipbook-spinner"></div><p>Chargement du livre...</p></div>';

    try {
      // Load PDF.js dynamically
      const pdfjsLib = await import(PDF_JS_CDN);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER;

      const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
      const totalPages = pdf.numPages;
      const pagesToShow = Math.min(totalPages, maxPages);

      // Create flipbook container
      container.innerHTML = `
        <div class="flipbook-wrapper">
          <div class="flipbook-controls-top">
            <span class="flipbook-page-info">Page <span id="fb-current">1</span> / ${pagesToShow}${!isPaid ? ' (Aperçu)' : ''}</span>
            <div class="flipbook-btns">
              <button id="fb-zoom-out" title="Zoom -">−</button>
              <button id="fb-fullscreen" title="Plein écran">⛶</button>
              <button id="fb-zoom-in" title="Zoom +">+</button>
            </div>
          </div>
          <div id="fb-book" class="flipbook-book"></div>
          <div class="flipbook-controls-bottom">
            <button id="fb-prev" class="fb-nav-btn">❮ Précédent</button>
            <div class="flipbook-progress">
              <div class="flipbook-progress-bar" id="fb-progress" style="width: ${(1/pagesToShow)*100}%"></div>
            </div>
            <button id="fb-next" class="fb-nav-btn">Suivant ❯</button>
          </div>
          ${!isPaid ? `
          <div class="flipbook-paywall">
            <div class="flipbook-paywall-content">
              <h3>📖 Aperçu terminé</h3>
              <p>Vous avez lu les ${PREVIEW_PAGES} premières pages gratuitement.</p>
              <p>Achetez ce livre pour accéder à l'intégralité des ${totalPages} pages.</p>
              <button onclick="document.querySelector('.btn-primary').click()" class="flipbook-buy-btn">
                Acheter ce livre
              </button>
            </div>
          </div>` : ''}
        </div>
      `;

      const bookEl = document.getElementById('fb-book');

      // Render pages to canvas
      for (let i = 1; i <= pagesToShow; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const pageDiv = document.createElement('div');
        pageDiv.className = 'flipbook-page';
        pageDiv.setAttribute('data-page', i);

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Watermark for paid users
        if (isPaid) {
          ctx.save();
          ctx.globalAlpha = 0.06;
          ctx.font = '24px serif';
          ctx.fillStyle = '#d4a843';
          ctx.translate(viewport.width / 2, viewport.height / 2);
          ctx.rotate(-Math.PI / 4);
          ctx.textAlign = 'center';
          ctx.fillText(userName + ' — Breslev Esther Ifrah', 0, 0);
          ctx.restore();

          // Footer watermark
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#d4a843';
          ctx.textAlign = 'center';
          ctx.fillText('© Esther Ifrah — ' + userName, viewport.width / 2, viewport.height - 8);
          ctx.restore();
        }

        pageDiv.appendChild(canvas);
        bookEl.appendChild(pageDiv);
      }

      // Initialize PageFlip
      const pageFlip = new St.PageFlip(bookEl, {
        width: bookEl.querySelector('canvas')?.width || 420,
        height: bookEl.querySelector('canvas')?.height || 594,
        size: 'stretch',
        minWidth: 280,
        maxWidth: 700,
        minHeight: 400,
        maxHeight: 1000,
        showCover: true,
        maxShadowOpacity: 0.3,
        mobileScrollSupport: true,
        useMouseEvents: true,
        flippingTime: 800,
        usePortrait: true,
        autoSize: true
      });

      pageFlip.loadFromHTML(bookEl.querySelectorAll('.flipbook-page'));

      // Controls
      const currentEl = document.getElementById('fb-current');
      const progressEl = document.getElementById('fb-progress');
      const paywallEl = container.querySelector('.flipbook-paywall');

      pageFlip.on('flip', (e) => {
        const page = e.data + 1;
        currentEl.textContent = page;
        progressEl.style.width = ((page / pagesToShow) * 100) + '%';

        // Show paywall on last preview page
        if (!isPaid && page >= pagesToShow && paywallEl) {
          paywallEl.style.display = 'flex';
        }
      });

      document.getElementById('fb-prev').onclick = () => pageFlip.flipPrev();
      document.getElementById('fb-next').onclick = () => pageFlip.flipNext();

      // Zoom
      let zoom = 1;
      document.getElementById('fb-zoom-in').onclick = () => {
        zoom = Math.min(zoom + 0.2, 2);
        bookEl.style.transform = 'scale(' + zoom + ')';
      };
      document.getElementById('fb-zoom-out').onclick = () => {
        zoom = Math.max(zoom - 0.2, 0.5);
        bookEl.style.transform = 'scale(' + zoom + ')';
      };

      // Fullscreen
      document.getElementById('fb-fullscreen').onclick = () => {
        const wrapper = container.querySelector('.flipbook-wrapper');
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          wrapper.requestFullscreen();
        }
      };

      // Disable right-click on the book
      bookEl.addEventListener('contextmenu', (e) => e.preventDefault());

    } catch (err) {
      container.innerHTML = '<div class="flipbook-error"><p>Impossible de charger le livre. Réessayez plus tard.</p></div>';
      console.error('Flipbook error:', err);
    }
  };
})();
