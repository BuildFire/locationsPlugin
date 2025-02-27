import state from "../state";
import notifications from "../../services/notifications";
import views from "../Views";
import { addBreadcrumb } from "../util/helpers";
import widgetController from "../../widget.controller";

let notificationTitleText = '';
let notificationMessageText = '';

let notificationTitleInput;
let notificationMessageInput;
let submitNotificationBtn;

const resetForm = () => {
  notificationTitleInput.input_.value = '';
  notificationMessageInput.input_.value = '';

  notificationTitleText = '';
  notificationMessageText = '';

  submitNotificationBtn.disabled = true;
};

const validateForm = () => {
  if (!submitNotificationBtn) return;

  if (notificationTitleText && notificationMessageText) {
    submitNotificationBtn.disabled = false;
  } else {
    submitNotificationBtn.disabled = true;
  }
};

const initFormListeners = () => {
  notificationMessageInput.input_.onfocus = () => {
    notificationMessageInput.input_.blur();
    buildfire.input.showTextDialog(
      {
        placeholder: window.strings.get('details.notificationMessagePlaceholder').v,
        saveText: window.strings.get('details.done').v,
        cancelText: window.strings.get('details.cancel').v,
        maxLength: 300,
        defaultValue: notificationMessageText,
      },
      (err, response) => {
        if (err) return console.error(err);
        if (response.cancelled) return;

        if (response && response.results && response.results[0] && response.results[0].textValue) {
          notificationMessageInput.label_.root_.classList.add('mdc-floating-label--float-above');
          notificationMessageText = response.results[0].textValue;
        } else {
          notificationMessageInput.label_.root_.classList.remove('mdc-floating-label--float-above');
          notificationMessageText = response.results[0].textValue;
        }
        notificationMessageInput.input_.value = notificationMessageText;
        validateForm();
      }
    );
  };

  notificationTitleInput.input_.oninput = () => {
    notificationTitleText = notificationTitleInput.input_.value;
    validateForm();
  };

  submitNotificationBtn.onclick = () => {
    const { selectedLocation } = state;
    submitNotificationBtn.disabled = true;

    notifications.sendNotification({
      title: notificationTitleText,
      text: notificationMessageText,
      users: selectedLocation.subscribers,
      queryString: `&dld=${encodeURIComponent(JSON.stringify({ locationId: selectedLocation.id }))}`,
    }).then(() => {
      buildfire.dialog.toast({ message: window.strings.get('toast.sendNotificationSuccess').v, type: 'success' });
      resetForm();
      buildfire.history.pop();
    }).catch((err) => {
      console.error(err);
      resetForm();
      buildfire.history.pop();
    });
  };
};

const showNotificationForm = () => new Promise((resolve, reject) => {
  const { selectedLocation } = state;
  widgetController.getLocation(selectedLocation.id).then((updatedLocation) => {
    if (!updatedLocation.data.subscribers || !updatedLocation.data.subscribers.length) {
      return buildfire.dialog.toast({ message: window.strings.get('toast.locationHasNoSubscribers').v, type: 'danger' });
    }

    state.selectedLocation = {
      ...updatedLocation,
      ...updatedLocation.data
    };

    const currentActive = document.querySelector('section.active');
    currentActive?.classList.remove('active');

    const notificationForm = document.querySelector('section#notificationForm');
    notificationForm.classList.add('active');

    views.fetch('notificationForm').then(() => {
      views.inject('notificationForm');
      window.strings.inject(document.querySelector('section#notificationForm'), false);
      addBreadcrumb({ pageName: 'notificationForm', title: 'Notification Form' });

      resolve();
    });
  });
});

const renderNotificationForm = () => {
  showNotificationForm().then(() => {
    if (notificationTitleInput) {
      notificationTitleInput.destroy();
    }
    if (notificationMessageInput) {
      notificationMessageInput.destroy();
    }

    notificationTitleInput = new mdc.textField.MDCTextField(document.querySelector('section#notificationForm #notificationTitle'));
    notificationMessageInput = new mdc.textField.MDCTextField(document.querySelector('section#notificationForm #notificationMessage'));

    submitNotificationBtn = document.querySelector('#submitNotificationBtn');

    resetForm();
    initFormListeners();
  });
};

export default renderNotificationForm;
