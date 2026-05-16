/**
 * AELC Premium Animation Engine  •  animations.js
 * Load at bottom of <body> on every page
 */

(function () {
  'use strict';

  /* ── 1. CUSTOM CURSOR ── */
  if (window.matchMedia('(pointer: fine)').matches) {
    const c = document.createElement('div');
    const r = document.createElement('div');
    c.className = 'aelc-cursor';
    r.className = 'aelc-cursor-ring';
    document.body.appendChild(c);
    document.body.appendChild(r);
    
    let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;
    document.addEventListener('mousemove', e => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      c.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
    });
    
    const loop = () => {
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      r.style.transform = `translate(${ringX}px, ${ringY}px)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    document.querySelectorAll('a, button, input, textarea, select, .nav-logo-mark, .faq-q, .tour-acc-card').forEach(el => {
      el.addEventListener('mouseenter', () => { c.classList.add('hovering'); r.classList.add('hovering'); });
      el.addEventListener('mouseleave', () => { c.classList.remove('hovering'); r.classList.remove('hovering'); });
    });
    
    document.addEventListener('mousedown', () => c.classList.add('clicking'));
    document.addEventListener('mouseup', () => c.classList.remove('clicking'));
  }

  /* ── 2. PAGE TRANSITION OVERLAY ── */
  const pt = document.createElement('div');
  pt.id = 'page-transition';
  document.body.appendChild(pt);

  // Animate in on arrival
  pt.classList.add('out');

  // Intercept in-site links
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('http')) return;
    if (a.target === '_blank') return;
    e.preventDefault();
    pt.classList.remove('out');
    pt.classList.add('in');
    setTimeout(() => { window.location.href = href; }, 520);
  });

  /* ── 3. SCROLL REVEAL (IntersectionObserver) ── */
  const revealEls = document.querySelectorAll('.rv, .rv-l, .rv-r, .rv-scale, .rv-fade');
  if (revealEls.length) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => obs.observe(el));
  }

  /* ── 5. ANIMATED STAT COUNTER ── */
  function animateCounter(el, target, duration) {
    const start = performance.now();
    const isFloat = target % 1 !== 0;
    const update = (time) => {
      const elapsed = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const val = eased * target;
      el.textContent = isFloat ? val.toFixed(1) : Math.round(val).toLocaleString();
      if (elapsed < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  const statObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target.querySelector('.stat-num');
      if (!el) return;
      const raw = el.textContent.replace(/[^0-9.]/g,'');
      const suffix = el.textContent.replace(/[0-9.,\s]/g,'');
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        el.dataset.suffix = suffix;
        const orig = animateCounter;
        animateCounter(el, num, 1600);
        // re-append suffix after each tick
        const origText = el.textContent;
        const ticker = setInterval(() => {
          if (el.textContent && !el.textContent.includes(suffix)) {
            el.textContent = el.textContent + suffix;
          }
        }, 16);
        setTimeout(() => clearInterval(ticker), 1700);
      }
      statObs.unobserve(entry.target);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.stat-block').forEach(b => statObs.observe(b));

  /* ── 6. MAGNETIC BUTTONS ── */
  document.querySelectorAll('.btn-primary, .btn-enroll-nav, .sticky-call').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top  + r.height / 2);
      btn.style.transform = `translate(${dx * 0.18}px, ${dy * 0.18}px) translateY(-2px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });

  /* ── 7. 3D CARD TILT ── */
  document.querySelectorAll('.prog-card, .why-card, .feature-card, .instrument-card, .curriculum-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width  - 0.5;
      const y = (e.clientY - r.top)  / r.height - 0.5;
      card.style.transform = `perspective(600px) rotateY(${x * 12}deg) rotateX(${-y * 10}deg) translateY(-10px) scale(1.02)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  /* ── 8. NAVBAR SCROLL ── */
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
  }

  /* ── 9. SMOOTH SCROLL for anchor links ── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  /* ── 10. TYPEWRITER for hero h1 if it has .typewrite class ── */
  document.querySelectorAll('.typewrite').forEach(el => {
    const text = el.textContent;
    el.textContent = '';
    el.style.borderRight = '3px solid var(--coral, #FF6B6B)';
    el.style.animation = 'cursorBlink 0.8s step-end infinite';
    let i = 0;
    const type = () => {
      if (i < text.length) { el.textContent += text[i++]; setTimeout(type, 55); }
      else { el.style.borderRight = 'none'; }
    };
    setTimeout(type, 800);
  });

  /* ── 11. SECTION ENTRY ANIMATION (for sections without .rv) ── */
  const sectionObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        sectionObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.07 });

  document.querySelectorAll('section:not(#hero):not(.hero)').forEach(sec => {
    if (!sec.classList.contains('rv') && !sec.classList.contains('rv-l')) {
      sec.style.opacity = '0';
      sec.style.transform = 'translateY(30px)';
      sec.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
      sectionObs.observe(sec);
    }
  });

  /* ── 12. MOBILE HAMBURGER ── */
  const ham = document.getElementById('ham');
  const mobMenu = document.getElementById('mob-menu');
  const mobClose = document.getElementById('mob-close');
  const mobOverlay = document.querySelector('.mob-overlay');
  function openMenu() {
    ham && ham.classList.add('open');
    mobMenu && mobMenu.classList.add('open');
    mobOverlay && mobOverlay.classList.add('show');
  }
  function closeMenu() {
    ham && ham.classList.remove('open');
    mobMenu && mobMenu.classList.remove('open');
    mobOverlay && mobOverlay.classList.remove('show');
  }
  ham && ham.addEventListener('click', openMenu);
  mobClose && mobClose.addEventListener('click', closeMenu);
  mobOverlay && mobOverlay.addEventListener('click', closeMenu);

  /* ── 13. TAB SWITCHING (kept from original) ── */
  if (typeof window.showTab === 'undefined') {
    window.showTab = function(event, tabName) {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      const tab = document.getElementById(tabName);
      if (tab) { tab.classList.add('active'); tab.style.animation = 'fadeInUp 0.4s both'; }
      event.target.closest('.tab-button').classList.add('active');
      document.querySelector('.tab-container') && document.querySelector('.tab-container').scrollIntoView({ behavior: 'smooth' });
    };
  }

  /* ── 14. FAQ accordion ── */
  document.querySelectorAll('.faq-q').forEach(btn => {
    if (btn.dataset.animBound) return;
    btn.dataset.animBound = '1';
    btn.addEventListener('click', () => {
      const isOpen = btn.classList.contains('open');
      document.querySelectorAll('.faq-q.open').forEach(b => {
        b.classList.remove('open');
        const a = b.nextElementSibling;
        if (a) a.classList.remove('open');
      });
      if (!isOpen) {
        btn.classList.add('open');
        const ans = btn.nextElementSibling;
        if (ans) ans.classList.add('open');
      }
    });
  });

  /* ── 15. TOUR ACCORDION ── */
  document.querySelectorAll('.tour-acc-card').forEach(card => {
    card.addEventListener('click', () => {
      const wasActive = card.classList.contains('active');
      document.querySelectorAll('.tour-acc-card').forEach(c => c.classList.remove('active'));
      if (!wasActive) card.classList.add('active');
    });
  });

  /* ── 16. Confetti on CTA click ── */
  function spawnConfetti(x, y) {
    const colors = ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A78BFA','#FFB347'];
    for (let i = 0; i < 28; i++) {
      const dot = document.createElement('div');
      const size = Math.random() * 8 + 4;
      dot.style.cssText = `
        position:fixed; width:${size}px; height:${size}px;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
        left:${x}px; top:${y}px;
        pointer-events:none; z-index:999999;
        transform-origin:center;
      `;
      document.body.appendChild(dot);
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.random() * 120 + 60;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 80;
      dot.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${tx}px,${ty}px) rotate(${Math.random()*720}deg) scale(0)`, opacity: 0 }
      ], { duration: 700 + Math.random()*400, easing: 'cubic-bezier(.25,.46,.45,.94)' })
        .onfinish = () => dot.remove();
    }
  }
  document.querySelectorAll('.btn-primary, .btn-enroll-nav, .btn-form').forEach(btn => {
    btn.addEventListener('click', e => spawnConfetti(e.clientX, e.clientY));
  });

  /* ── 17. CONTACT FORM → /api/contact ── */
  function bindContactForm() {
    // Left empty intentionally to allow native HTML form submission to Netlify.
    // Netlify will handle the POST request automatically.
  }

  // Try binding immediately, then watch for dynamically-rendered form
  bindContactForm();
  const formWatcher = new MutationObserver(() => bindContactForm());
  formWatcher.observe(document.body, { childList: true, subtree: true });

})();

  /* -- 18. HERO PARALLAX -- */
  const hero = document.getElementById('hero');
  if (hero) {
    document.addEventListener('mousemove', e => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      document.querySelectorAll('.hb1').forEach(el => el.style.transform = "translate($(*1.5)px, $(*1.5)px)");
      document.querySelectorAll('.hb2').forEach(el => el.style.transform = "translate($(-*1.2)px, $(-*1.2)px)");
      document.querySelectorAll('.hf').forEach(el => el.style.transform = "translate($(-*2.5)px, $(-*2.5)px)");
    });
  }
