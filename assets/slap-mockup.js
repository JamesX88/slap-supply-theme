/**
 * SLAP Supply Mockup JavaScript
 * Handles draggable sticker functionality
 */

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    // Initialize draggable sticker
    const draggableSticker = document.getElementById('slap-draggable-sticker');
    if (draggableSticker) {
      makeDraggable(draggableSticker);
    }
    
    // Duplicate marquee content for seamless loop
    const marquees = document.querySelectorAll('.slap-mockup-marquee__track');
    marquees.forEach(function(marquee) {
      const content = marquee.innerHTML;
      marquee.innerHTML = content + content;
    });
    
    // Initialize typing effect
    const typingElement = document.getElementById('slap-typing-word');
    if (typingElement) {
      initTypingEffect(typingElement);
    }
  }
  
  function initTypingEffect(element) {
    const words = ['BRAND', 'EVENT', 'APP', 'BUSINESS', 'PRODUCT', 'BOXES', 'WINDOWS'];
    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typingSpeed = 150;
    
    function type() {
      const currentWord = words[wordIndex];
      
      if (isDeleting) {
        element.textContent = currentWord.substring(0, charIndex - 1);
        charIndex--;
        typingSpeed = 75;
      } else {
        element.textContent = currentWord.substring(0, charIndex + 1);
        charIndex++;
        typingSpeed = 150;
      }
      
      if (!isDeleting && charIndex === currentWord.length) {
        // Pause at end of word
        typingSpeed = 2000;
        isDeleting = true;
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        typingSpeed = 500;
      }
      
      setTimeout(type, typingSpeed);
    }
    
    type();
  }
  
  function makeDraggable(element) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    element.addEventListener('mousedown', dragStart);
    element.addEventListener('touchstart', dragStart);
    
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
      
      if (e.target === element || element.contains(e.target)) {
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
        
        setTranslate(currentX, currentY, element);
      }
    }
    
    function dragEnd(e) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
    }
    
    function setTranslate(xPos, yPos, el) {
      el.style.transform = 'translate3d(' + xPos + 'px, ' + yPos + 'px, 0) rotate(-8deg)';
    }
  }
})();
