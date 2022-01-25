const reset = (position) => {
  const element = document.querySelector('.drawer');
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const positions = {
    expanded: screenHeight - 150,
    halfExpanded: (screenHeight / 2),
    collapsed: 75
  };
  element.style.height = `${position ? positions[position] : positions.halfExpanded}px`;
  element.style.top = `${screenHeight - (position ? positions[position] : positions.halfExpanded)}px`;
};

const initialize = (settings) => {
  const element = document.querySelector('.drawer');
  const resizer = document.querySelector('.drawer .resizer');
  const locationSummary = document.querySelector('#locationSummary');
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const lowerMargin = 75;
  const upperMargin = 115;
  let originalHeight = 0;
  let originalY = 0;
  let originalMouseY = 0;

  reset(settings.design?.listViewPosition);

  const positions = {
    expanded: screenHeight - 135,
    halfExpanded: (screenHeight / 2),
    collapsed: 75
  };

  const adjustDrawer = (e) => {
    let targetTop;
    let targetHeight;
    const pageY = e.pageY || e.changedTouches[0].pageY;
    if (pageY > originalMouseY) {
      if (originalHeight > positions.halfExpanded) {
        targetTop = screenHeight - positions.halfExpanded;
        targetHeight = positions.halfExpanded;
      } else {
        targetHeight = positions.collapsed;
        targetTop = screenHeight - positions.collapsed;
      }
    } else if (pageY < originalMouseY) {
      if (originalHeight >= positions.halfExpanded) {
        targetHeight = positions.expanded;
        targetTop = screenHeight - positions.expanded;
      } else {
        targetHeight = positions.halfExpanded;
        targetTop = screenHeight - positions.halfExpanded;
      }
      if (locationSummary.classList.contains('slide-in')) {
        locationSummary.classList.add('slide-out');
        locationSummary.classList.remove('slide-in');
      }
    }

    element.style.height = `${targetHeight}px`;
    element.style.top = `${targetTop}px`;
  };

  const resize = (e) => {
    const pageY = e.pageY || e.changedTouches[0].pageY;
    const height = originalHeight - (pageY - originalMouseY);
    if (height > lowerMargin && height < (screenHeight - upperMargin)) {
      element.style.height = `${height}px`;
      element.style.top = `${originalY + (pageY - originalMouseY)}px`;
    }
  };
  const stopResize = (e) => {
    e.preventDefault();
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
    adjustDrawer(e);
  };
  const stopTouchResize = (e) => {
    e.preventDefault();
    document.removeEventListener('touchmove', resize);
    document.removeEventListener('touchend', stopTouchResize);
    adjustDrawer(e);
  };

  resizer.addEventListener('mousedown', (e) => {
    // e.preventDefault();
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY || e.changedTouches[0].pageY;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  });

  resizer.addEventListener('touchstart', (e) => {
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY || e.changedTouches[0].pageY;
    document.addEventListener('touchmove', resize);
    document.addEventListener('touchend', stopTouchResize);
  });
};

export default { initialize, reset };
