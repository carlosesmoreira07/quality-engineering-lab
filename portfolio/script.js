const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('#site-nav');
const dialog = document.querySelector('.evidence-dialog');
const dialogImage = dialog.querySelector('img');

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  navigation.classList.toggle('open', !isOpen);
});

navigation.addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  navigation.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
});

document.querySelectorAll('[data-modal-src]').forEach((button) => {
  button.addEventListener('click', () => {
    dialogImage.src = button.dataset.modalSrc;
    dialogImage.alt = button.dataset.modalAlt;
    dialog.showModal();
  });
});

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
