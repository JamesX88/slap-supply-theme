/**
 * SLAP Supply Mockup JavaScript
 * Handles draggable stickers and interactive elements
 */

(function() {
  'use strict';

  // Initialize draggable stickers
  function initDraggableStickers() {
    const stickers = document.querySelectorAll('.slap-mockup-draggable');
    
    stickers.forEach(sticker => {
      let isDragging = false;
      let currentX;
      let currentY;
      let initialX;
      let initialY;
      let xOffset = 0;
      let yOffset = 0;

      sticker.addEventListener('mousedown', dragStart);
      sticker.addEventListener('touchstart', dragStart);
      
      document.addEventListener('mousemove', drag);
      document.addEventListener('touchmove', drag);
      
      document.addEventListener('mouseup', dragEnd);
      document.addEventListener('touchend', dragEnd);

      function dragStart(e) {
        if (e.type === 'touchstart') {
          initialX = e.touches[0].clientX - xOffset;
          initialY = e.touches[0].clientY - yOffset;
        } else {
          initialX = e.clientX - xOffset;
          initialY = e.clientY - yOffset;
        }

        if (e.target === sticker || sticker.contains(e.target)) {
          isDragging = true;
        }
      }

      function drag(e) {
        if (isDragging) {
          e.preventDefault();
          
          if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
          } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
          }

          xOffset = currentX;
          yOffset = currentY;

          setTranslate(currentX, currentY, sticker);
        }
      }

      function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
      }

      function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
      }
    });
  }

  // Initialize marquee duplication for infinite scroll
  function initMarquee() {
    const marquees = document.querySelectorAll('.slap-mockup-marquee__track');
    
    marquees.forEach(track => {
      const content = track.innerHTML;
      track.innerHTML = content + content; // Duplicate content for seamless loop
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initDraggableStickers();
      initMarquee();
    });
  } else {
    initDraggableStickers();
    initMarquee();
  }
})();
