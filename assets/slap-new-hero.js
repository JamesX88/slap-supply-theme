/**
 * Animated Typing Effect for New Hero Section
 */

(function() {
  'use strict';

  function initTypingEffect() {
    const typedElement = document.querySelector('.slap-new-hero__typed');
    if (!typedElement) return;

    const wordsData = typedElement.getAttribute('data-words');
    if (!wordsData) return;

    let words;
    try {
      words = JSON.parse(wordsData);
    } catch (e) {
      console.error('Failed to parse words data:', e);
      return;
    }

    let currentWordIndex = 0;
    let currentText = '';
    let isDeleting = false;

    function type() {
      const currentWord = words[currentWordIndex];

      if (isDeleting) {
        currentText = currentWord.substring(0, currentText.length - 1);
      } else {
        currentText = currentWord.substring(0, currentText.length + 1);
      }

      typedElement.textContent = currentText;

      let typeSpeed = isDeleting ? 50 : 100;

      if (!isDeleting && currentText === currentWord) {
        typeSpeed = 2000; // Pause at end
        isDeleting = true;
      } else if (isDeleting && currentText === '') {
        isDeleting = false;
        currentWordIndex = (currentWordIndex + 1) % words.length;
        typeSpeed = 500; // Pause before next word
      }

      setTimeout(type, typeSpeed);
    }

    // Start typing effect
    type();
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTypingEffect);
  } else {
    initTypingEffect();
  }

  // Reinitialize on Shopify section load (theme editor)
  document.addEventListener('shopify:section:load', function(event) {
    if (event.detail.sectionId && event.target.querySelector('.slap-new-hero')) {
      initTypingEffect();
    }
  });
})();
