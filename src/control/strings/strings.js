import stringsUI from './js/stringsUI';
import '../../shared/strings';
import stringsConfig from '../../shared/stringsConfig';

let strings;

function loadLanguage(lang) {
  stringsContainer.classList.add("hidden");
  strings = new buildfire.services.Strings(lang, stringsConfig);
  strings.init().then(() => {
    if (strings.id) {
      showNewLanguageState(strings.id);
    } else {
      createLanguage("en-us");
    }
    strings.inject();
  });
  stringsUI.init("stringsContainer", strings, stringsConfig);
}
loadLanguage("en-us");

function showNewLanguageState(show) {
  if (show) {
    saveButton.classList.remove("hidden");
    stringsContainer.classList.remove("hidden");
  } else {
    saveButton.classList.add("hidden");
    stringsContainer.classList.add("hidden");
  }
}

function createLanguage(language) {
  stringsContainer.disabled = true;
  strings.createLanguage(language, () => {
    stringsContainer.disabled = false;
    strings.init().then(() => {
      showNewLanguageState(strings.id);
      strings.inject();
    });
  });
  return false;
}

function deleteLanguage() {
  buildfire.notifications.confirm(
    { message: "Are you sure you want to remove support fo this language?", confirmButton: { type: "danger" } },
    (e, r) => {
      if (r.selectedButton.key === "confirm") {
        strings.deleteLanguage(() => {
          loadLanguage(langOptions.value);
        });
      }
    }
  );
}

function save() {
  strings.save(() => {
    buildfire.messaging.sendMessageToWidget({
      cmd: 'sync',
      scope: 'strings'
    });
  });
}

document.querySelector('#saveButton').addEventListener('click', save);
