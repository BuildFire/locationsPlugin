export const uploadImages = (options, onProgress, callback) => {
  const { allowMultipleFilesUpload } = options;
  buildfire.services.publicFiles.showDialog(
    { filter: ["image/*"], allowMultipleFilesUpload },
    onProgress,
    (onComplete) => {
      console.log(`onComplete${JSON.stringify(onComplete)}`);
    },
    (err, files) => {
      if (err) {
        console.error(err);
        return callback(err);
      }
      callback(null, files);
    }
  );
};

export const toggleFieldError = (element, hasError) => {
  if (typeof element === 'string') {
    element = document.querySelector(`#${element}`);
  }

  const fn = hasError ? 'add' : 'remove';
  if (element.classList.contains('mdc-text-field')) {
    element.classList[fn]('mdc-text-field--invalid');
  } else if (element.classList.contains('mdc-text-field-helper-line')) {
    element.classList[fn]('has-error');
  } else {
    element.classList[fn]('has-error');
  }
};

export const createImageHolder = (options, onClick, onDelete) => {
  const { hasSkeleton, hasImage, imageUrl } = options;

  const div = document.createElement('div');
  div.className = 'img-select-holder';
  const button = document.createElement('button');
  button.className = 'img-select margin-right-ten';
  if (hasImage) button.classList.add('has-img');

  div.appendChild(button);
  if(hasSkeleton){
    button.className = "img-skeleton-container margin-right-ten bf-skeleton-loader grid-block";
  }else{
    const i = document.createElement('i');
    i.className = 'material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background delete-img-btn';
    i.textContent = 'close';
    i.tabIndex = '0';

    const img = document.createElement('img');
    img.src = imageUrl ?? '';
    button.appendChild(i);
    button.appendChild(img);

    if (onClick) button.onclick = onClick;
    if (onDelete) i.onclick = onDelete;
  }
  return div;
};

export const validateOpeningHours = (openingHours) => {
  const { days } = openingHours;
  let isValid = true;
  for (const day in days) {
    if (days[day]) {
      isValid = days[day].intervals?.every((elem) => validateTimeInterval(elem.from, elem.to));
      if (!isValid) {
        return false;
      }
    }
  }
  return isValid;
};

export const validateTimeInterval = (start, end, errorElem) => {
  start = new Date(start).getTime();
  end = new Date(end).getTime();
  let isValid = true;
  if (start > end) {
    isValid = false;
  }

  if (errorElem) {
    toggleFieldError(errorElem, !isValid, 'Choose an end time later than the start time');
  }

  return isValid;
};
