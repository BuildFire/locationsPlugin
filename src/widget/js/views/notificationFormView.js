import state from "../state";
import notifications from "../../services/notifications";

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
        maxLength: 150,
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

const renderNotificationForm = () => {
  notificationTitleInput = new mdc.textField.MDCTextField(document.querySelector('section#notificationForm #notificationTitle'));
  notificationMessageInput = new mdc.textField.MDCTextField(document.querySelector('section#notificationForm #notificationMessage'));

  submitNotificationBtn = document.querySelector('#submitNotificationBtn');

  initFormListeners();
};

export default renderNotificationForm;
