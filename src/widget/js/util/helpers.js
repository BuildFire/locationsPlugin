import isObject from 'lodash.isobject';
import forEach from 'lodash.foreach';
import isEqual from 'lodash.isequal';
import { convertTimeToDate, getCurrentDayName, openingNowDate } from '../../../utils/datetime';
import state from '../state';
import Analytics from '../../../utils/analytics';
import WidgetController from '../../widget.controller';
import Location from '../../../entities/Location';

export const deepObjectDiff = (a, b, reversible) => {
  const r = {};
  _deepDiff(a, b, r, reversible);
  if (reversible) _deepDiff(b, a, r, reversible);
  return r;
};

const _deepDiff = (a, b, r, reversible) => {
  forEach(a, (v, k) => {
    // already checked this or equal...
    if (r.hasOwnProperty(k) || b[k] === v) return;
    // but what if it returns an empty object? still attach?
    r[k] = isObject(v) ? deepObjectDiff(v, b[k], reversible) : v;
  });
};

export const transformCategoriesToText = (locationCategories, categories) => {
  let text = '';
  if (!locationCategories.main.length) {
    return text;
  }
  const subCategories = categories.map((cat) => cat.subcategories).flat();
  const mainCategoriesTitles = [];
  const subCategoriesTitles = [];
  locationCategories.main.forEach((c) => {
    const item = categories.find((p) => p.id === c);
    if (item) mainCategoriesTitles.push(item.title);
  });
  locationCategories.subcategories.forEach((c) => {
    const item = subCategories.find((p) => p.id === c);
    if (item) subCategoriesTitles.push(item.title);
  });

  if (mainCategoriesTitles.length > 1) {
    text = mainCategoriesTitles.join(', ');
  } else if (mainCategoriesTitles[0]) {
    text = `${mainCategoriesTitles[0]}${subCategoriesTitles.length ? ` | ${subCategoriesTitles.join(', ')}` : ''}`;
  }

  if (text.length > 30) text = text.slice(0, 30).concat('...');
  return text;
};

export const cdnImage = (imageUrl) => {
  const { cloudImageHost } = buildfire.getContext().endPoints;
  return `${cloudImageHost}/${imageUrl}`;
};

export const generateUUID = () => {
  let dt = new Date().getTime();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === "x" ? replace : (replace & 0x3) | 0x8).toString(16);
  });
};

export const getDefaultOpeningHours = () => {
  const intervals = [{ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") }];
  return {
    days: {
      monday: { index: 0, active: true, intervals: [...intervals] },
      tuesday: { index: 1, active: true, intervals: [...intervals] },
      wednesday: { index: 2, active: true, intervals: [...intervals] },
      thursday: { index: 3, active: true, intervals: [...intervals] },
      friday: { index: 4, active: true, intervals: [...intervals] },
      saturday: { index: 5, active: true, intervals: [...intervals] },
      sunday: { index: 6, active: true, intervals: [...intervals] },
    }
  };
};

export const createTemplate = (templateId) => {
  const template = document.getElementById(`${templateId}`);
  return document.importNode(template.content, true);
};

export const showToastMessage = (message, duration = 3000) => {
  buildfire.dialog.toast({ message: window.strings.get(`toast.${message}`).v, duration });
};

export const addBreadcrumb = ({ pageName, label }, showLabel = true) => {
  if (state.breadcrumbs.length && state.breadcrumbs[state.breadcrumbs.length - 1].name === pageName) {
    return;
  }
  state.breadcrumbs.push({ name: pageName });
  buildfire.history.push(label, {
    showLabelInTitlebar: false
  });
};

export const getActiveTemplate = () => (getComputedStyle(document.querySelector('section#listing'), null).display !== 'none' ? 'listing' : 'intro');

export const cropImage = (url, options) => {
  if (!url) {
    return '';
  }
  return buildfire.imageLib.cropImage(url, options);
};

export const isLocationOpen = (location) => {
  let isOpen = false;
  const today = location.openingHours.days[getCurrentDayName()];
  const now = openingNowDate();

  if (today.active) {
    const interval = today.intervals.find((i) => (new Date(i.from) <= now) && (new Date(i.to) > now));
    if (interval) isOpen = true;
  }
  return isOpen;
};

export const areArraysEqual = (array1, array2) => {
  const array1Sorted = array1.slice().sort();
  const array2Sorted = array2.slice().sort();
  return isEqual(array1Sorted, array2Sorted);
};

export const shareLocation = () => {
  buildfire.deeplink.generateUrl(
    {
      title: state.selectedLocation.title,
      description: state.selectedLocation.subtitle || undefined,
      imageUrl: cdnImage(state.selectedLocation.listImage),
      data: { locationId: state.selectedLocation.id },
    },
    (err, result) => {
      if (err) return console.error(err);
      buildfire.device.share({
        subject: state.selectedLocation.title,
        text: state.selectedLocation.title,
        link: result.url
      }, (err, result) => {
        if (err) console.error(err);
        if (result) console.log(result);
        Analytics.locationShareUsed();
      });
    }
  );
};

export const bookmarkLocation = (locationId, e) => {
  const location = state.listLocations.find((i) => i.id === locationId);
  const { bookmarks } = state.settings;

  if (state.bookmarkLoading || !location || !bookmarks.enabled || !bookmarks.allowForLocations) return;

  state.bookmarkLoading = true;
  setTimeout(() => { state.bookmarkLoading = false; }, 1000);

  if (location.clientId && state.bookmarks.find((l) => l.id === location.clientId)) {
    buildfire.bookmarks.delete(location.clientId, () => {
      showToastMessage('bookmarksRemoved');
    });
    state.bookmarks.splice(state.bookmarks.findIndex((l) => l.id === location.clientId), 1);
    e.target.textContent = 'star_outline';
  } else {
    showToastMessage('bookmarksAdded');
    console.log('location: ', location);
    if (!location.clientId) {
      console.log('updating location: ', location);
      location.clientId = generateUUID();
      WidgetController.updateLocation(location.id, new Location(location).toJSON());
    }
    buildfire.bookmarks.add(
      {
        id: location.clientId,
        title: location.title,
        icon: location.listImage,
        payload: {
          locationId: location.id
        },
      },
      (err, bookmark) => {
        if (err) {
          console.error(err);
          showToastMessage('bookmarksError');
          return;
        }
        Analytics.locationBookmarkUsed();
        state.bookmarks.push({
          id: location.clientId,
          title: location.title
        });
        if (e && e.target) {
          e.target.textContent = 'star';
        }
        console.log("Bookmark added", bookmark);
      }
    );
  }
};

export const getDistanceString = (distance) => {
  let result;
  if (distance < 0.2) {
    result = `${Math.round(distance * 5280).toLocaleString()} ${window.strings.get('general.distanceUnitFt').v}`;
  } else if (state.settings.measurementUnit === 'metric') {
    result = `${Math.round(distance * 1.60934).toLocaleString()} ${window.strings.get('general.distanceUnitKm').v}`;
  } else {
    result = `${Math.round(distance).toLocaleString()} ${window.strings.get('general.distanceUnitMi').v}`;
  }
  return result;
};

export const calculateLocationDistance = (address, userPosition) => {
  if (!userPosition) return null;

  const destination = { latitude: address.lat, longitude: address.lng };
  const distance = buildfire.geo.calculateDistance(userPosition, destination, { decimalPlaces: 5 });

  return distance;
};

export const getCategoriesAndSubCategoriesByName = (name, categories = []) => {
  name = name.toLowerCase();
  const subcategoryIds = [];
  const categoryIds = [];

  categories.forEach((category) => {
    if (name === category.title.toLowerCase()) {
      categoryIds.push(category.id);
    }

    category.subcategories.forEach((subcategory) => {
      if (name === subcategory.title.toLowerCase()) {
        subcategoryIds.push(subcategory.id);
      }
    });
  });

  return { subcategoryIds, categoryIds };
};
