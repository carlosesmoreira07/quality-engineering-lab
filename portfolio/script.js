// Portal de Evidências de Qualidade — Visualizador Interativo de Relatórios PDF

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('pdf-modal');
  const modalFrame = document.getElementById('modal-pdf-frame');
  const modalTitle = document.getElementById('modal-title');
  const modalDownloadBtn = document.getElementById('modal-download-btn');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  let lastActiveElement = null;

  function openPdfModal(pdfUrl, title) {
    if (!modal || !modalFrame) return;

    lastActiveElement = document.activeElement;
    modalFrame.src = pdfUrl;
    if (modalTitle) modalTitle.textContent = title || 'Quality Report — EverShop 2.2.1';
    if (modalDownloadBtn) {
      modalDownloadBtn.href = pdfUrl;
      modalDownloadBtn.setAttribute('download', pdfUrl.split('/').pop() || 'quality-report.pdf');
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (modalCloseBtn) {
      modalCloseBtn.focus();
    }
  }

  function closePdfModal() {
    if (!modal || !modalFrame) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalFrame.src = '';
    document.body.style.overflow = '';

    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      lastActiveElement.focus();
    }
  }

  // Delegar cliques para botões de abertura de modal
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-open-pdf]');
    if (!trigger) return;

    event.preventDefault();
    const pdfUrl = trigger.getAttribute('data-pdf-url') || trigger.getAttribute('href');
    const title = trigger.getAttribute('data-pdf-title') || 'Quality Report — EverShop 2.2.1';
    if (pdfUrl && !pdfUrl.startsWith('#')) {
      openPdfModal(pdfUrl, title);
    }
  });

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closePdfModal);
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closePdfModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && modal.classList.contains('open')) {
      closePdfModal();
    }
  });
});
