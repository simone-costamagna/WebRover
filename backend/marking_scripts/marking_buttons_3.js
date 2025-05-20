function captureInteractiveElements(options = {}) {
  const DEBUG_HIGHLIGHT = options.debugHighlight || false;
  const highlightColors = ['#FF0000', '#00FF00', '#0000FF', '#FFA500'];
  let elementIndex = 0;
  let highlightContainer = null;
  let capturedElements = [];

  // --- PDF Detection ---
  const url = window.location.href.toLowerCase();
  if (
    url.endsWith('.pdf') ||
    document.querySelector("embed[type*='pdf'], iframe[src*='.pdf']")
  ) {
    console.warn('PDF detected - skipping element detection');
    return [{
      index: 0,
      type: "pdf",
      xpath: "",
      description: "PDF viewer detected",
      text: "",
      x: 0,
      y: 0,
      inViewport: false
    }];
  }

  // --- Debug Setup ---
  if (DEBUG_HIGHLIGHT) {
    highlightContainer = document.createElement('div');
    Object.assign(highlightContainer.style, {
      position: 'fixed',
      pointerEvents: 'none',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      zIndex: '2147483647'
    });
    highlightContainer.id = 'web-agent-highlight-container';
    document.body.appendChild(highlightContainer);
  }

  // --- Helper Function: Check if Element is in Viewport ---
  function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // --- Core Functions ---
  function getXPath(element, frameInfo = '') {
    if (element.id) return `//*[@id="${element.id}"]`;
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = Array.from(current.parentNode.children)
        .filter(e => e.tagName === current.tagName)
        .indexOf(current) + 1;
      parts.unshift(
        index > 0
          ? `${current.tagName.toLowerCase()}[${index}]`
          : current.tagName.toLowerCase()
      );
      current = current.parentNode;
    }
    return parts.length ? `${parts.join('/')}` : '';
  }

  function isInteractiveElement(element) {
    if (!element.offsetWidth || !element.offsetHeight) return false;
    const style = window.getComputedStyle(element);
    if (
      ['none', 'hidden', '0'].includes(style.display) ||
      style.visibility === 'hidden'
    )
      return false;

    const interactiveTags = new Set([
      'a',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      'video'
    ]);
    const role = element.getAttribute('role')?.toLowerCase() || '';
    const interactiveRoles = new Set([
      'button',
      'link',
      'textbox',
      'checkbox',
      'radio',
      'menuitem',
      'switch'
    ]);

    return (
      interactiveTags.has(element.tagName.toLowerCase()) ||
      interactiveRoles.has(role) ||
      element.hasAttribute('onclick') ||
      style.cursor === 'pointer'
    );
  }

  function getElementType(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role')?.toLowerCase() || '';
    const hasClickHandler = !!element.onclick || element.getAttribute('onclick');
    const isIconContainer = !!element.querySelector('svg, img, i');
    const classList = Array.from(element.classList);
    const parentRole = element.parentElement?.getAttribute('role')?.toLowerCase() || '';

    // --- Enhanced Input Handling ---
    if (tag === 'input') {
      const inputType = element.getAttribute('type')?.toLowerCase() || 'text';

      // Special handling for search inputs
      if (
        inputType === 'search' ||
        element.getAttribute('aria-label')?.toLowerCase().includes('search') ||
        element.getAttribute('name')?.toLowerCase().includes('search') ||
        element.getAttribute('id')?.toLowerCase().includes('search')
      ) {
        return 'search-input';
      }

      // For input buttons, check if the button's value is purely numeric.
      switch (inputType) {
        case 'button':
        case 'submit':
        case 'reset': {
          const val = (element.value || "").trim();
          if (val && /^\d+$/.test(val)) {
            return 'date-button';
          }
          return 'button';
        }
        case 'checkbox':
          return 'checkbox';
        case 'radio':
          return 'radio';
        case 'email':
          return 'email-input';
        case 'password':
          return 'password-input';
        case 'number':
          return 'number-input';
        case 'date':
          return 'date-input';
        case 'time':
          return 'time-input';
        case 'tel':
          return 'phone-input';
        case 'url':
          return 'url-input';
        case 'range':
          return 'range-input';
        case 'color':
          return 'color-input';
        case 'file':
          return 'file-input';
        default:
          return 'text-input';
      }
    }

    // --- Enhanced Menu/Item Handling ---
    if (tag === 'div') {
      // Document-specific items (Google Docs/Microsoft 365)
      if (classList.some(c => c.includes('docs-') || c.includes('owa-'))) {
        if (classList.some(c => c.match(/menu(-item)?/i))) return 'doc-menu-item';
        if (classList.some(c => c.match(/toolbar(-button)?/i))) return 'doc-toolbar-button';
      }
      // Standard menu system
      if (
        role === 'menuitem' ||
        parentRole === 'menu' ||
        classList.some(c => c.includes('menu-item'))
      ) {
        return 'menu-item';
      }
      if (role === 'menu' || parentRole === 'menubar') return 'menu-container';

      // List system
      if (role === 'option' || parentRole === 'listbox') return 'list-item';
      if (role === 'listbox') return 'list-container';

      // Toolbar system
      if ((role === 'button' || parentRole === 'toolbar') && isIconContainer) {
        return 'toolbar-button';
      }

      // Generic interactive divs
      if (hasClickHandler) return isIconContainer ? 'icon-button' : 'clickable-div';
      if (isIconContainer) return 'icon-container';
      if (element.hasAttribute('aria-expanded')) return 'expandable-section';
      // Otherwise, this remains a plain div.
    }

    // --- Special Elements ---
    if ((tag === 'a' || role === 'link') && isIconContainer) {
      return element.href ? 'icon-link' : 'icon-button';
    }
    if (tag === 'button' || role === 'button') {
      // For native <button> elements, check their text content.
      const btnText = element.textContent.trim();
      if (btnText && /^\d+$/.test(btnText)) {
        return 'date-button';
      }
      return isIconContainer ? 'icon-button' : 'button';
    }
    // Modified textarea handling:
    if (tag === 'textarea') {
      if (
        element.getAttribute('aria-label')?.toLowerCase().includes('search') ||
        element.getAttribute('placeholder')?.toLowerCase().includes('search') ||
        element.getAttribute('name')?.toLowerCase().includes('search') ||
        element.getAttribute('id')?.toLowerCase().includes('search')
      ) {
        return 'search-input';
      }
      return 'text-area';
    }
    if (tag === 'select') return 'dropdown';
    if (element.isContentEditable) return 'rich-text-editor';
    if (tag === 'a' && element.href) return 'link';
    if (tag === 'video') return 'video-player';

    // --- Final Fallback ---
    let finalType = tag || role;
    if (finalType === 'div' || finalType === 'a') {
      const style = window.getComputedStyle(element);
      if (hasClickHandler || style.cursor === 'pointer') {
        finalType = 'clickable-element';
      } else if (element.textContent.trim().length > 0) {
        finalType = 'text-container';
      } else {
        finalType = 'container';
      }
    }
    return finalType;
  }

  function getElementText(element, type) {
    const visibleText = element.textContent.trim().replace(/\s+/g, ' ');
    if (visibleText) return visibleText;

    if (type.endsWith('-input') || ['checkbox', 'radio', 'dropdown'].includes(type)) {
      const id = element.id;
      if (id) {
        const label = element.ownerDocument.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent.trim();
      }
    }

    if (element.tagName === 'IMG') {
      return element.getAttribute('alt')?.trim() || '';
    }

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const refElement = element.ownerDocument.getElementById(labelledBy);
      if (refElement) return refElement.textContent.trim();
    }

    return '';
  }

  function getElementDescription(element, type) {
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    const title = element.getAttribute('title')?.trim();
    const baseText = ariaLabel || title || getElementText(element, type);

    const states = [];
    if (element.disabled) states.push('disabled');
    if (element.checked) states.push('checked');
    const statePrefix = states.length ? `[${states.join(',')}] ` : '';

    if (type.endsWith('-input')) {
      const inputType = type.replace('-input', '');
      const placeholder = element.getAttribute('placeholder') || '';
      const label = element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.closest('label')?.textContent.trim() ||
        inputType;

      return `${statePrefix}${inputType.replace(/\b\w/g, l => l.toUpperCase())} field${placeholder ? `: ${placeholder}` : ''}${label ? ` (${label})` : ''}`;
    }

    switch (type) {
      case 'menu-container':
        return `${statePrefix}Menu: ${baseText || 'Context options'}`;
      case 'menu-item':
        const menuParent = element.closest('[role="menu"], [role="menubar"]');
        const menuLabel = menuParent?.getAttribute('aria-label') || '';
        return `${statePrefix}Menu option${menuLabel ? ` in ${menuLabel}` : ''}: ${baseText}`;
      case 'doc-menu-item':
        const menuPath = Array.from(element.closest('[role="menu"]')?.querySelectorAll('[role="menuitem"]') || [])
          .map(item => item.textContent.trim())
          .join(' ▸ ');
        return `${statePrefix}Document menu: ${menuPath}`;
      case 'doc-toolbar-button':
        const toolbar = element.closest('[role="toolbar"]');
        const toolbarLabel = toolbar?.getAttribute('aria-label') || 'Document tools';
        return `${statePrefix}${toolbarLabel}: ${baseText}`;
      case 'list-container':
        return `${statePrefix}List: ${baseText || 'Selectable items'}`;
      case 'list-item':
        const listParent = element.closest('[role="listbox"]');
        const listLabel = listParent?.getAttribute('aria-label') || '';
        return `${statePrefix}List item${listLabel ? ` in ${listLabel}` : ''}: ${baseText}`;
      case 'toolbar-button':
        const toolbarParent = element.closest('[role="toolbar"]');
        const toolbarParentLabel = toolbarParent?.getAttribute('aria-label') || '';
        return `${statePrefix}Toolbar button${toolbarParentLabel ? ` in ${toolbarParentLabel}` : ''}: ${baseText}`;
      case 'expandable-section':
        const expandedState = element.getAttribute('aria-expanded') === 'true' ? 'expanded' : 'collapsed';
        return `${statePrefix}Expandable section (${expandedState}): ${baseText}`;
      default:
        return `${statePrefix}${type.replace(/-/g, ' ')}${baseText ? `: ${baseText}` : ''}`;
    }
  }

  // --- Modified Highlight Function ---
  function highlightElement(element, index, frameRect = null) {
    if (!DEBUG_HIGHLIGHT || !highlightContainer) return;

    const type = getElementType(element);
    const description = getElementDescription(element, type);

    const topLabelText = `${index}`;
    const bottomLabelText = description;

    // Get element's rects relative to its own document
    const elementRects = Array.from(element.getClientRects());

    elementRects.forEach(rect => {
      // If this element is in an iframe, adjust its coordinates
      let adjustedRect = { ...rect };
      if (frameRect) {
        adjustedRect = {
          top: rect.top + frameRect.top,
          left: rect.left + frameRect.left,
          bottom: rect.bottom + frameRect.top,
          right: rect.right + frameRect.left,
          width: rect.width,
          height: rect.height
        };
      }

      const overlay = document.createElement('div');
      const color = highlightColors[index % highlightColors.length];

      Object.assign(overlay.style, {
        position: 'absolute',
        border: `1px dashed ${color}`,
        backgroundColor: `${color}10`,
        top: `${adjustedRect.top + window.scrollY + 2}px`,
        left: `${adjustedRect.left + window.scrollX + 2}px`,
        width: `${adjustedRect.width - 4}px`,
        height: `${adjustedRect.height - 4}px`,
        pointerEvents: 'none',
        zIndex: '2147483647'
      });

      // Top label: shows only the index above the box.
      const topLabel = document.createElement('div');
      topLabel.textContent = topLabelText;
      Object.assign(topLabel.style, {
        position: 'absolute',
        top: '-16px',
        left: '0',
        background: color + '80',
        color: 'white',
        padding: '1px 3px',
        borderRadius: '2px',
        fontSize: '10px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: '1',
        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
        zIndex: '2147483647'
      });
      overlay.appendChild(topLabel);

      // Bottom label: shows the associated descriptive text below the box.
      if (bottomLabelText) {
        const bottomLabel = document.createElement('div');
        bottomLabel.textContent = bottomLabelText;
        Object.assign(bottomLabel.style, {
          position: 'absolute',
          bottom: '-16px',
          left: '0',
          background: color + '80',
          color: 'white',
          padding: '1px 3px',
          borderRadius: '2px',
          fontSize: '10px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '1',
          textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
          zIndex: '2147483647'
        });
        overlay.appendChild(bottomLabel);
      }

      highlightContainer.appendChild(overlay);
    });
  }

  // --- Process a document (main or iframe) ---
  function processDocument(doc, frameElement = null) {
    // Calculate iframe position if this is an iframe document
    let frameRect = null;
    if (frameElement) {
      frameRect = frameElement.getBoundingClientRect();
    }

    // Create a TreeWalker to find interactive elements
    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: node => {
          if (!isInteractiveElement(node)) return NodeFilter.FILTER_SKIP;
          const type = getElementType(node);
          // Only accept if the type is exactly 'button' or 'icon-button'
          return (type === 'button' || type === 'icon-button')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );

    // Collect elements from this document
    const docElements = [];
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (!docElements.some(el => el.contains(current))) {
        docElements.push(current);
      }
    }

    // Get iframe path part for XPath
    const framePathPart = frameElement ? `iframe[${Array.from(frameElement.parentNode.children).filter(el => el.tagName === 'IFRAME').indexOf(frameElement) + 1}]` : '';

    // Add elements to the global list and highlight them
    docElements.forEach(el => {
      highlightElement(el, elementIndex, frameRect);

      // Calculate coordinates based on frame position if needed
      const rect = el.getBoundingClientRect();
      let x = Math.round(rect.left + rect.width / 2);
      let y = Math.round(rect.top + rect.height / 2);

      if (frameRect) {
        x += frameRect.left;
        y += frameRect.top;
      }

      x += window.scrollX;
      y += window.scrollY;

      const type = getElementType(el);

      capturedElements.push({
        index: elementIndex,
        type: type,
        xpath: getXPath(el, framePathPart),
        description: getElementDescription(el, type),
        text: getElementText(el, type),
        x: x,
        y: y,
        inViewport: isElementInViewport(el),
        fromIframe: !!frameElement,
        iframeTitle: frameElement ? frameElement.getAttribute('title') || '' : ''
      });

      elementIndex++;
    });

    // Return the count of elements found
    return docElements.length;
  }

  // --- Process all iframes recursively ---
  function processIframes(doc = document) {
    const iframes = doc.querySelectorAll('iframe');
    let totalIframeElements = 0;

    iframes.forEach(iframe => {
      try {
        // Try to access the iframe's content document
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

        // If we can access it, process it
        if (iframeDoc) {
          console.log(`Processing iframe: ${iframe.getAttribute('title') || iframe.getAttribute('src') || 'Unnamed iframe'}`);

          // Process the document itself
          const elementsFound = processDocument(iframeDoc, iframe);
          totalIframeElements += elementsFound;

          // Recursively process nested iframes
          totalIframeElements += processIframes(iframeDoc);
        } else {
          console.warn(`Cannot access iframe content (likely cross-origin): ${iframe.getAttribute('src') || 'No src'}`);
        }
      } catch (error) {
        console.warn(`Error accessing iframe: ${error.message}`);
      }
    });

    return totalIframeElements;
  }

  // --- Entry point: process main document and all iframes ---
  function processAll() {
    // First process the main document
    const mainDocElements = processDocument(document);
    console.log(`Found ${mainDocElements} button elements in main document`);

    // Then process all accessible iframes
    const iframeElements = processIframes();
    console.log(`Found ${iframeElements} button elements in iframes`);

    return capturedElements;
  }

  // Run the detection
  const results = processAll();
  console.log('Detection complete. Total:', results.length, 'button elements found');
  return results;
}

// --- Execution Handler ---
(function() {
  try {
    const runDetection = () => {
      console.clear();
      console.log('Starting intelligent element detection (buttons only) with iframe support...');
      const results = captureInteractiveElements({ debugHighlight: true });
      console.log(
        'Detection complete. Found %c' +
          results.length +
          '%c button elements (including inside iframes)',
        'color: #4CAF50; font-weight: bold;',
        ''
      );
      console.log('Detailed results:', results);
      return results;
    };

    if (document.readyState === 'complete') {
      runDetection();
    } else {
      document.addEventListener('DOMContentLoaded', runDetection);
    }
  } catch (error) {
    console.error('Element Detection Error:', error);
  }
})();