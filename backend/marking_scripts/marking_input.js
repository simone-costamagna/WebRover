function captureInteractiveElements(options = {}) {
  const DEBUG_HIGHLIGHT = options.debugHighlight || false;
  const highlightColors = ['#FF0000', '#00FF00', '#0000FF', '#FFA500'];
  let elementIndex = 0;
  let highlightContainer = null;

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
  function getXPath(element, frameContext = null) {
    // If the element is in an iframe, start with iframe's xpath
    let prefix = '';
    if (frameContext && frameContext.frameElement) {
      prefix = '';
    }

    if (element.id) return `${prefix}//*[@id="${element.id}"]`;

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

    return parts.length ? `${prefix}/${parts.join('/')}` : '';
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

      // Standard input types
      switch (inputType) {
        case 'button':
        case 'submit':
        case 'reset':
          return 'button';
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
    const nameVal = element.getAttribute('nameval')?.trim();
    const baseText = ariaLabel || title || nameVal || getElementText(element, type);

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
  // For each input-type element, a top label shows the index above the marking box.
  // A bottom label is always displayed below the box showing the associated descriptive text.
  function highlightElement(element, index, frameContext = null) {
    if (!DEBUG_HIGHLIGHT || !highlightContainer) return;

    const type = getElementType(element);
    const description = getElementDescription(element, type);

    const topLabelText = `${index}`;
    const bottomLabelText = description; // Always show descriptive text for input elements

    // Get element rect relative to the top document
    const getAbsoluteRect = (el, context) => {
      const rect = el.getBoundingClientRect();

      // Start with the element's rect
      let absoluteRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };

      // If it's in an iframe, adjust position
      if (context && context.frameElement) {
        const frameRect = context.frameElement.getBoundingClientRect();
        absoluteRect.top += frameRect.top;
        absoluteRect.left += frameRect.left;
      }

      // Add scroll offset of the main document
      absoluteRect.top += window.scrollY;
      absoluteRect.left += window.scrollX;

      return absoluteRect;
    };

    const abRect = getAbsoluteRect(element, frameContext);

    const overlay = document.createElement('div');
    const color = highlightColors[index % highlightColors.length];

    Object.assign(overlay.style, {
      position: 'absolute',
      border: `1px dashed ${color}`,
      backgroundColor: `${color}10`,
      top: `${abRect.top + 2}px`,
      left: `${abRect.left + 2}px`,
      width: `${abRect.width - 4}px`,
      height: `${abRect.height - 4}px`,
      pointerEvents: 'none'
    });

    // Top label: displays only the index above the box.
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
      textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
    });
    overlay.appendChild(topLabel);

    // Bottom label: displays the descriptive text below the box.
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
        textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
      });
      overlay.appendChild(bottomLabel);
    }

    highlightContainer.appendChild(overlay);
  }

  // --- New Function to Safely Access Iframe Content ---
  function safelyAccessIframe(iframe) {
    try {
      // Try to access the iframe's contentWindow
      const iframeWindow = iframe.contentWindow;

      // Check if we can access the document
      if (iframeWindow && iframeWindow.document) {
        return iframeWindow;
      }
    } catch (e) {
      console.warn(`Cannot access iframe content due to same-origin policy: ${e.message}`);
    }
    return null;
  }

  // --- Modified Element Collection ---
  // Define the set of accepted input types
  const inputTypes = new Set([
    'text-input',
    'search-input',
    'checkbox',
    'radio',
    'email-input',
    'password-input',
    'number-input',
    'date-input',
    'time-input',
    'phone-input',
    'url-input',
    'range-input',
    'color-input',
    'file-input',
    'text-area',
    'dropdown'  // Added to capture select elements
  ]);

  // Function to process elements using a tree walker
  function processDocumentWithWalker(doc, frameContext = null) {
    const elements = [];

    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: node => {
          if (!isInteractiveElement(node)) return NodeFilter.FILTER_SKIP;
          const type = getElementType(node);
          return inputTypes.has(type)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (!elements.some(el => el.contains(current))) {
        elements.push(current);
        highlightElement(current, elementIndex, frameContext);
        elementIndex++;
      }
    }

    return elements;
  }

  // Process iframe contents
  function processIframes(doc = document) {
    let allElements = [];

    // Get all iframe elements in the document
    const iframes = doc.querySelectorAll('iframe');

    // First process the main document
    const mainDocElements = processDocumentWithWalker(doc);
    allElements = allElements.concat(mainDocElements);

    // Then process each iframe
    iframes.forEach(iframe => {
      const frameWindow = safelyAccessIframe(iframe);
      if (frameWindow) {
        try {
          // Process the iframe document
          const frameElements = processDocumentWithWalker(frameWindow.document, frameWindow);
          allElements = allElements.concat(frameElements.map(el => ({ element: el, frameContext: frameWindow })));

          // Recursively process nested iframes
          const nestedFrameElements = processIframes(frameWindow.document);
          allElements = allElements.concat(nestedFrameElements);
        } catch (e) {
          console.warn(`Error processing iframe: ${e.message}`);
        }
      }
    });

    return allElements;
  }

  // --- Collect Elements ---
  const capturedElements = processIframes();

  // --- Map Elements to Result Objects ---
  const result = capturedElements.map((item, idx) => {
    const el = item.element || item;
    const frameContext = item.frameContext;

    // Calculate the absolute position (relative to top document)
    let x = 0, y = 0;

    try {
      const rect = el.getBoundingClientRect();
      x = rect.left + (rect.width / 2);
      y = rect.top + (rect.height / 2);

      if (frameContext && frameContext.frameElement) {
        const frameRect = frameContext.frameElement.getBoundingClientRect();
        x += frameRect.left;
        y += frameRect.top;
      }

      // Add scroll position
      x += window.scrollX;
      y += window.scrollY;

      x = Math.round(x);
      y = Math.round(y);
    } catch (e) {
      console.warn(`Error calculating position: ${e.message}`);
    }

    const type = getElementType(el);

    return {
      index: idx,
      type: type,
      xpath: getXPath(el, frameContext),
      description: getElementDescription(el, type),
      text: getElementText(el, type),
      x: x,
      y: y,
      inViewport: frameContext ? isElementInViewport(frameContext.frameElement) : isElementInViewport(el),
      // Add reference to the frame if applicable
      frameInfo: frameContext ? {
        src: frameContext.frameElement.getAttribute('src') || frameContext.frameElement.getAttribute('iframesrc') || '',
        title: frameContext.frameElement.getAttribute('title') || ''
      } : null
    };
  });

  console.log('Interactive Elements:', result);
  return result;
}

// --- Execution Handler ---
(function() {
  try {
    const runDetection = () => {
      console.clear();
      console.log('Starting intelligent element detection (including iframe content)...');
      const results = captureInteractiveElements({ debugHighlight: true });
      console.log(
        'Detection complete. Found %c' +
          results.length +
          '%c input elements',
        'color: #4CAF50; font-weight: bold;',
        ''
      );
      console.log('Detailed results:', results);
      return results;
    };

    // Use a delay to ensure iframes have loaded
    if (document.readyState === 'complete') {
      // Small delay to ensure all iframes are loaded
      setTimeout(runDetection, 1000);
    } else {
      window.addEventListener('load', () => {
        setTimeout(runDetection, 1000);
      });
    }
  } catch (error) {
    console.error('Element Detection Error:', error);
  }
})();