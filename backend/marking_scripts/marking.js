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
      inViewport: false // Added inViewport flag for PDF case
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
  function getXPath(element, doc = document) {
    // For elements in iframes, we need to consider the iframe too
    if (doc !== document) {
      // Find the parent iframe
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument === doc) {
            // Get the iframe's XPath
            const iframePath = getXPath(iframe);
            // Get the element's XPath within the iframe
            const elementPath = getXPathInternal(element, doc);
            // Combine them
            return `${elementPath}`;
          }
        } catch (e) {
          // Skip iframes we can't access due to same-origin policy
          console.warn("Cannot access iframe content due to same-origin policy", e);
        }
      }
    }
    return getXPathInternal(element, doc);
  }

  function getXPathInternal(element, doc) {
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
    return parts.length ? `/${parts.join('/')}` : '';
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
      'video',
      'iframe' // Keep iframe in the list for iframe detection
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
    if (tag === 'iframe') return 'iframe';

    // --- Final Fallback ---
    // If nothing specific was determined and the tag is simply 'div' or 'a',
    // use additional cues (click handler, cursor style, or text content) to decide.
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

  function getElementText(element, type, doc = document) {
    // Special handling for iframes - get title or name attribute
    if (type === 'iframe') {
      return element.getAttribute('title')?.trim() ||
             element.getAttribute('name')?.trim() ||
             element.getAttribute('src')?.trim() || '';
    }

    // Prioritize visible text
    const visibleText = element.textContent.trim().replace(/\s+/g, ' ');
    if (visibleText) return visibleText;

    // Label associations
    if (type.endsWith('-input') || ['checkbox', 'radio', 'dropdown'].includes(type)) {
      const id = element.id;
      if (id) {
        const label = doc.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent.trim();
      }
    }

    // Image handling
    if (element.tagName === 'IMG') {
      return element.getAttribute('alt')?.trim() || '';
    }

    // ARIA labels
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const refElement = doc.getElementById(labelledBy);
      if (refElement) return refElement.textContent.trim();
    }

    return '';
  }

  function getElementDescription(element, type, doc = document) {
    // Special handling for iframes
    if (type === 'iframe') {
      const title = element.getAttribute('title')?.trim();
      const src = element.getAttribute('src')?.trim();
      const name = element.getAttribute('name')?.trim();

      return `Iframe: ${title || name || 'Embedded content'}${src ? ` (${src.split('?')[0]})` : ''}`;
    }

    // Base information
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    const title = element.getAttribute('title')?.trim();
    const baseText = ariaLabel || title || getElementText(element, type, doc);

    // For iframe content elements, add a prefix
    const inIframe = doc !== document;
    const iframePrefix = inIframe ? '[In iframe] ' : '';

    // State tracking
    const states = [];
    if (element.disabled) states.push('disabled');
    if (element.checked) states.push('checked');
    const statePrefix = states.length ? `[${states.join(',')}] ` : '';

    // --- Enhanced Descriptions ---
    if (type.endsWith('-input')) {
      const inputType = type.replace('-input', '');
      const placeholder = element.getAttribute('placeholder') || '';
      const label = element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.closest('label')?.textContent.trim() ||
        inputType;

      return `${iframePrefix}${statePrefix}${inputType.replace(/\b\w/g, l => l.toUpperCase())} field${placeholder ? `: ${placeholder}` : ''}${label ? ` (${label})` : ''}`;
    }

    switch (type) {
      case 'menu-container':
        return `${iframePrefix}${statePrefix}Menu: ${baseText || 'Context options'}`;

      case 'menu-item':
        const menuParent = element.closest('[role="menu"], [role="menubar"]');
        const menuLabel = menuParent?.getAttribute('aria-label') || '';
        return `${iframePrefix}${statePrefix}Menu option${menuLabel ? ` in ${menuLabel}` : ''}: ${baseText}`;

      case 'doc-menu-item':
        const menuPath = Array.from(element.closest('[role="menu"]')?.querySelectorAll('[role="menuitem"]') || [])
          .map(item => item.textContent.trim())
          .join(' ▸ ');
        return `${iframePrefix}${statePrefix}Document menu: ${menuPath}`;

      case 'doc-toolbar-button':
        const toolbar = element.closest('[role="toolbar"]');
        const toolbarLabel = toolbar?.getAttribute('aria-label') || 'Document tools';
        return `${iframePrefix}${statePrefix}${toolbarLabel}: ${baseText}`;

      case 'list-container':
        return `${iframePrefix}${statePrefix}List: ${baseText || 'Selectable items'}`;

      case 'list-item':
        const listParent = element.closest('[role="listbox"]');
        const listLabel = listParent?.getAttribute('aria-label') || '';
        return `${iframePrefix}${statePrefix}List item${listLabel ? ` in ${listLabel}` : ''}: ${baseText}`;

      case 'toolbar-button':
        const toolbarParent = element.closest('[role="toolbar"]');
        const toolbarParentLabel = toolbarParent?.getAttribute('aria-label') || '';
        return `${iframePrefix}${statePrefix}Toolbar button${toolbarParentLabel ? ` in ${toolbarParentLabel}` : ''}: ${baseText}`;

      case 'expandable-section':
        const expandedState = element.getAttribute('aria-expanded') === 'true' ? 'expanded' : 'collapsed';
        return `${iframePrefix}${statePrefix}Expandable section (${expandedState}): ${baseText}`;

      default:
        return `${iframePrefix}${statePrefix}${type.replace(/-/g, ' ')}${baseText ? `: ${baseText}` : ''}`;
    }
  }

  // --- Modified Highlight Function ---
  function highlightElement(element, index, iframeOffset = { x: 0, y: 0 }) {
    if (!DEBUG_HIGHLIGHT || !highlightContainer) return;

    // Determine type and description for the overlay label.
    const type = getElementType(element);
    const doc = element.ownerDocument;
    const inIframe = doc !== document;
    const description = getElementDescription(element, type, doc);

    // Define an array of important keywords for button text.
    const importantKeywords = ['login', 'submit', 'done', 'search'];
    let showFullText = false;
    // Show full text for text input elements.
    if (type === 'text-input' || type === 'search-input') {
      showFullText = true;
    }
    // For buttons, check if the description contains one of the keywords.
    else if (type === 'button' || type === 'icon-button') {
      const lowerDesc = description.toLowerCase();
      for (const keyword of importantKeywords) {
        if (lowerDesc.includes(keyword)) {
          showFullText = true;
          break;
        }
      }
    }
    // Always show full text for iframes
    else if (type === 'iframe') {
      showFullText = true;
    }
    // Always show full text for iframe content
    else if (inIframe) {
      showFullText = true;
    }

    // Create a top label that shows only the index.
    const topLabelText = `${index}`;
    // Create a bottom label text only if showFullText is true.
    const bottomLabelText = showFullText ? description : '';

    Array.from(element.getClientRects()).forEach(rect => {
      const overlay = document.createElement('div');
      // Choose a color from our palette.
      const color = highlightColors[index % highlightColors.length];

      // Adjust position for iframe elements
      const rectTop = rect.top + window.scrollY + iframeOffset.y;
      const rectLeft = rect.left + window.scrollX + iframeOffset.x;

      // Reduce the overlay box size slightly to avoid visual clutter.
      Object.assign(overlay.style, {
        position: 'absolute',
        border: `1px dashed ${color}`,
        backgroundColor: `${color}10`, // very light background
        top: `${rectTop + 2}px`,
        left: `${rectLeft + 2}px`,
        width: `${rect.width - 4}px`,
        height: `${rect.height - 4}px`,
        pointerEvents: 'none'
      });

      // Top label: displays the index above the box.
      const topLabel = document.createElement('div');
      topLabel.textContent = topLabelText;
      Object.assign(topLabel.style, {
        position: 'absolute',
        top: '-16px',
        left: '0',
        background: color + '80', // using the highlight color with added opacity
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

      // Bottom label: displays the full text below the box if applicable.
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
    });
  }

  // --- Process elements within an iframe ---
  function processIframeContent(iframe, capturedElements) {
    try {
      // Try to access iframe content - may fail due to cross-origin restrictions
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

      if (!iframeDoc) {
        console.warn('Cannot access iframe content due to same-origin restrictions:', iframe.src);
        return;
      }

      // Calculate iframe offset for highlighting
      const iframeRect = iframe.getBoundingClientRect();
      const iframeOffset = {
        x: iframeRect.left,
        y: iframeRect.top
      };

      // Create a tree walker for the iframe document
      const iframeWalker = iframeDoc.createTreeWalker(
        iframeDoc.body,
        NodeFilter.SHOW_ELEMENT,
        { acceptNode: node => isInteractiveElement(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
      );

      // Process each interactive element in the iframe
      while (iframeWalker.nextNode()) {
        const current = iframeWalker.currentNode;
        if (!capturedElements.some(el => el.element === current)) {
          capturedElements.push({
            element: current,
            document: iframeDoc,
            iframe: iframe,
            iframeOffset: iframeOffset
          });
          highlightElement(current, elementIndex, iframeOffset);
          elementIndex++;
        }
      }

      // Recursively process nested iframes
      const nestedIframes = Array.from(iframeDoc.querySelectorAll('iframe'));
      for (const nestedIframe of nestedIframes) {
        // Adjust offset for nested iframes
        const nestedOffset = {
          x: iframeOffset.x + nestedIframe.getBoundingClientRect().left,
          y: iframeOffset.y + nestedIframe.getBoundingClientRect().top
        };
        processIframeContent(nestedIframe, capturedElements);
      }
    } catch (error) {
      console.warn('Error accessing iframe content:', error);
    }
  }

  // --- Element Collection ---
  const capturedElements = [];

  // First, process main document
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    { acceptNode: node => isInteractiveElement(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
  );

  while (walker.nextNode()) {
    const current = walker.currentNode;
    // Skip if this element is already contained by another captured element
    if (!capturedElements.some(item => item.element && item.element.contains(current))) {
      capturedElements.push({
        element: current,
        document: document,
        iframe: null,
        iframeOffset: { x: 0, y: 0 }
      });
      highlightElement(current, elementIndex);
      elementIndex++;
    }
  }

  // Then, process each iframe
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const iframe of iframes) {
    processIframeContent(iframe, capturedElements);
  }

  // --- Coordinate Calculation ---
  const result = capturedElements.map((item, idx) => {
    const { element, document: doc, iframeOffset } = item;
    const rects = Array.from(element.getClientRects());
    const type = getElementType(element);
    const primaryRect = rects[0] || element.getBoundingClientRect();
    const inIframe = doc !== document;

    // Calculate coordinates, adjusting for iframe position if needed
    const x = Math.round(primaryRect.left + primaryRect.width / 2 + window.scrollX + iframeOffset.x);
    const y = Math.round(primaryRect.top + primaryRect.height / 2 + window.scrollY + iframeOffset.y);

    // For iframe content elements, check if they're in viewport relative to the iframe
    let inViewport = false;
    if (inIframe) {
      // First check if iframe itself is in viewport
      const containingIframe = item.iframe;
      const iframeInViewport = isElementInViewport(containingIframe);
      if (iframeInViewport) {
        // Then check if element is in the iframe's viewport
        const rect = element.getBoundingClientRect();
        inViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= containingIframe.clientHeight &&
          rect.right <= containingIframe.clientWidth
        );
      }
    } else {
      inViewport = isElementInViewport(element);
    }

    return {
      index: idx,
      type: type,
      xpath: getXPath(element, doc),
      description: getElementDescription(element, type, doc),
      text: getElementText(element, type, doc),
      x: x,
      y: y,
      inViewport: inViewport,
      inIframe: inIframe
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
      console.log('Starting intelligent element detection...');
      const results = captureInteractiveElements({ debugHighlight: true });
      console.log(
        'Detection complete. Found %c' +
          results.length +
          '%c interactive elements',
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