import { convertTimeToDate } from '../../../utils/datetime';
import DialogComponent from '../js/dialog/dialog';

export const generateUUID = () => {
  let dt = new Date().getTime();
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c == "x" ? replace : (replace & 0x3) | 0x8).toString(16);
  });

  return uuid;
};

export const createTemplate = (templateId) => {
  const template = document.getElementById(`${templateId}`);
  return document.importNode(template.content, true);
};

export const getDefaultOpeningHours = () => {
  const intervals = [{ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") }];
  return {
    days: {
      monday: {index: 0, active: true, intervals: [...intervals]},
      tuesday: {index: 1, active: true, intervals: [...intervals]},
      wednesday: {index: 2, active: true, intervals: [...intervals]},
      thursday: {index: 3, active: true, intervals: [...intervals]},
      friday: {index: 4, active: true, intervals: [...intervals]},
      saturday: {index: 5, active: true, intervals: [...intervals]},
      sunday: {index: 6, active: true, intervals: [...intervals]},
    }
  }
};

export const toggleDropdown = (dropdownElement, forceClose) => {
  if (!dropdownElement) {
    return;
  }
  if (dropdownElement.classList.contains("open") || forceClose) {
    dropdownElement.classList.remove("open");
  } else {
    dropdownElement.classList.add("open");
  }
};

export const handleInputError = (elem, hasError, message) => {
  if (!elem) {
    return;
  }

  if (hasError) {
    elem.parentNode.classList.add('has-error');
    elem.classList.remove('hidden');
    elem.innerHTML = message || 'Required';
  } else {
    elem.classList.add('hidden');
    elem.parentNode.classList.remove('has-error');
  }
};

export const isLatitude = (num) => Number(num) && isFinite(num) && Math.abs(num) <= 90;

export const isLongitude = (num) => Number(num) && isFinite(num) && Math.abs(num) <= 180;

export const showProgressDialog = ({ title, message }) => {
  const progressDialog = new DialogComponent("dialogComponent", 'progressDialogTemplate');
  progressDialog.container.querySelector('.progress-message').innerHTML = message || 'Please wait...';
  progressDialog.showDialog({
    title: title || `Importing Locations`,
    hideDelete: true,
    hideCancel: true,
    hideSave: true,
    hideFooter: true
  });
  return progressDialog;
};

export const isValidColor = (color) => {
  const rgbRegex = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
  const rgbaRegex = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/i;

  const rgbMatch = color.match(rgbRegex);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch.map(Number);
    return [r, g, b].every((v) => v >= 0 && v <= 255);
  }

  const rgbaMatch = color.match(rgbaRegex);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch.map(Number);
    return [r, g, b].every((v) => v >= 0 && v <= 255) && a >= 0 && a <= 1;
  }

  // Explicitly reject all other formats
  return false;
};

export const rgbaToHex = (rgba) => {
  const [r, g, b] = rgba.match(/\d+/g).map(Number);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

export const getOpacityFromRGBA = (rgba)=> {
  const match = rgba.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d?\.?\d+)\s*\)/);
  if (!match) return "100";
  return String(Math.round(parseFloat(match[1]) * 100));
};
