/* Mélodie de l’Âme — améliorations progressives (le site fonctionne sans JS). */
(function () {
  'use strict';

  var topbar = document.querySelector('[data-topbar]');
  var toggle = document.getElementById('nav-toggle');
  var burger = document.querySelector('[data-burger]');

  /* Barre de navigation : fond lisible une fois qu'on a défilé. */
  function onScroll() {
    if (!topbar) return;
    topbar.classList.toggle('is-scrolled', window.scrollY > 24);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Menu mobile : accessibilité clavier + état aria. */
  if (toggle && burger) {
    var sync = function () {
      var open = toggle.checked;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      document.body.classList.toggle('menu-open', open);
    };
    toggle.addEventListener('change', sync);
    burger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle.checked = !toggle.checked;
        sync();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.checked) {
        toggle.checked = false;
        sync();
        burger.focus();
      }
    });
    /* Ferme le menu quand on clique un lien d'ancre de la même page. */
    document.querySelectorAll('.nav-mobile a').forEach(function (a) {
      a.addEventListener('click', function () {
        toggle.checked = false;
        sync();
      });
    });
    sync();
  }

  /* Lien actif pour les ancres de l'accueil (sonothérapie / contact). */
  function markAnchorNav() {
    var hash = location.hash;
    if (!hash) return;
    document.querySelectorAll('.nav-list a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href.indexOf(hash) !== -1 && href.indexOf('index.html') !== -1 && document.body.classList.contains('page-accueil')) {
        document.querySelectorAll('.nav-list a.is-active').forEach(function (x) { x.classList.remove('is-active'); x.removeAttribute('aria-current'); });
        a.classList.add('is-active');
      }
    });
  }
  window.addEventListener('hashchange', markAnchorNav);
  markAnchorNav();
})();
