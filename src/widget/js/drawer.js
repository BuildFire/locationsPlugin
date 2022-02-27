import state from './state';

const TOP_MARGIN = 135;

const _calcBottomMargin = () => {
  const { sorting, filter } = state.settings;
  const headerHasOptions = (!sorting.hideSorting || !filter.hidePriceFilter || !filter.hideOpeningHoursFilter);
  let margin = 54;
  if (headerHasOptions) {
    margin = 90;
  } else if (!headerHasOptions && document.querySelector('html').getAttribute('safe-area') === 'true') {
    document.querySelector('.drawer-header').style.paddingBottom = '35px';
    margin = 70;
  }
  return margin;
};

const _calcPositions = () => {
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  return {
    expanded: screenHeight - TOP_MARGIN,
    halfExpanded: (screenHeight / 2),
    collapsed: _calcBottomMargin()
  };
};

const reset = (position) => {
  const element = document.querySelector('.drawer');
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const positions = _calcPositions();
  element.style.height = `${position ? positions[position] : positions.halfExpanded}px`;
  element.style.top = `${screenHeight - (position ? positions[position] : positions.halfExpanded)}px`;
};

const initialize = (settings) => {
  const element = document.querySelector('.drawer');
  const drawerHeader = document.querySelector('.drawer .drawer-header');
  const locationSummary = document.querySelector('#locationSummary');
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const upperMargin = 115;
  let originalHeight = 0;
  let originalY = 0;
  let originalMouseY = 0;

  reset(settings.design?.listViewPosition);

  const adjustDrawer = (e) => {
    let targetTop;
    let targetHeight;
    const positions = _calcPositions();
    const pageY = e.pageY || e.changedTouches[0]?.pageY;
    const pointsToExpanded = Math.abs(positions.expanded - (screenHeight - pageY));
    const pointsToHalfExpanded = Math.abs(positions.halfExpanded - (screenHeight - pageY));
    const pointsToCollapsed = Math.abs(positions.collapsed - (screenHeight - pageY));

    if (pageY > originalMouseY) {
      if (pointsToHalfExpanded > pointsToCollapsed) {
        targetHeight = positions.collapsed;
        targetTop = screenHeight - positions.collapsed;
      } else {
        targetHeight = positions.halfExpanded;
        targetTop = screenHeight - positions.halfExpanded;
      }
    } else if (pageY < originalMouseY) {
      if (pointsToExpanded > pointsToHalfExpanded) {
        targetHeight = positions.halfExpanded;
        targetTop = screenHeight - positions.halfExpanded;
      } else {
        targetHeight = positions.expanded;
        targetTop = screenHeight - positions.expanded;
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
    const pageY = e.pageY || e.changedTouches[0]?.pageY;
    const height = originalHeight - (pageY - originalMouseY);
    const lowerMargin = _calcBottomMargin();
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

  drawerHeader.addEventListener('mousedown', (e) => {
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY || e.changedTouches[0]?.pageY;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  });

  document.addEventListener('touchstart', (e) => {
    const draggableTargets = ['filter-options', 'drawer-header', 'resizer'];
    if (!draggableTargets.some((c) => e.target.classList?.contains(c))) return;
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY || e.changedTouches[0]?.pageY;
    document.addEventListener('touchmove', resize);
    document.addEventListener('touchend', stopTouchResize);
  });
};

export default { initialize, reset };
