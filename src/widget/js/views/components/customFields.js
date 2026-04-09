import state from '../../state';
import constants from '../../global/constants';

const customFieldsController = {
	init() {
		const { settings } = state;
		const locationCustomFields = document.querySelector('#locationCustomFields');

		if (settings.customFields.quickActions.length || settings.customFields.content.length) {
			const locationAdditionalDetailsContainer = document.querySelector('#locationAdditionalDetailsContainer');
			locationAdditionalDetailsContainer.innerHTML = '';

			this._injectCustomFields();

			locationCustomFields.classList.remove('hidden');
		} else {
			locationCustomFields.classList.add('hidden');
		}
	},

	_getCustomFieldPlaceholder(fieldType) {
		switch (fieldType) {
			case constants.QuickActionsOptions.EMAIL:
			case constants.ContentOptions.EMAIL:
				return window.strings?.get('locationEditing.enterEmailAddress')?.v || 'Enter email address';
			case constants.QuickActionsOptions.PHONE:
			case constants.ContentOptions.PHONE:
				return window.strings?.get('locationEditing.enterPhoneNumber')?.v || 'Enter phone number';
			case constants.QuickActionsOptions.URL:
			case constants.ContentOptions.URL:
				return window.strings?.get('locationEditing.enterURL')?.v || 'Enter URL';
			case constants.ContentOptions.RICH_TEXT:
				return window.strings?.get('locationEditing.addDescription')?.v || 'Add description';
			default:
				return window.strings?.get('locationEditing.enterDetails')?.v || 'Enter details';
		}
	},

	_createMDCInput(id, title, value = '', type = 'text', maxLength = 150) {
		const container = document.createElement('div');
		container.className = 'text-field-container';

		const mdcField = document.createElement('div');
		mdcField.className = 'mdc-text-field';
		mdcField.id = `${id}Field`;

		const input = document.createElement('input');
		input.className = 'mdc-text-field__input mdc-theme--text-primary-on-background';
		input.id = id;
		input.maxLength = maxLength;
		input.type = type;
		input.value = value;
		mdcField.appendChild(input);

		const lineRipple = document.createElement('div');
		lineRipple.className = 'mdc-line-ripple';
		mdcField.appendChild(lineRipple);

		const floatingLabel = document.createElement('label');
		floatingLabel.className = 'mdc-floating-label';
		floatingLabel.setAttribute('for', id);
		floatingLabel.textContent = title;
		mdcField.appendChild(floatingLabel);

		container.appendChild(mdcField);

		const helperLine = document.createElement('div');
		helperLine.className = `mdc-text-field-helper-line ${id}Helper hidden`;

		const helperText = document.createElement('p');
		helperText.className = 'mdc-theme--text-primary-on-background mdc-text-field-helper-text mdc-text-field-helper-text--persistent mdc-text-field-helper-text--validation-msg error-msg';
		helperText.textContent = window.strings?.get('locationEditing.required')?.v || 'Required';
		helperLine.appendChild(helperText);
		container.appendChild(helperLine);

		return { container, input };
	},

	_createMDCDialogTrigger(id, title, value = '') {
		const container = document.createElement('div');
		container.className = 'text-field-container';

		const descriptionId = `${id}Container`;

		const wysiwygContainer = document.createElement('div');
		wysiwygContainer.id = descriptionId;
		wysiwygContainer.className = 'custom-wysiwyg-container';

		if (value) {
			wysiwygContainer.innerHTML = value;
		} else {
			const labelSpan = document.createElement('label');
			labelSpan.className = 'mdc-floating-label mdc-theme--text-primary-on-background';
			labelSpan.textContent = title;
			wysiwygContainer.appendChild(labelSpan);
		}

		wysiwygContainer.dataset.value = value;
		container.appendChild(wysiwygContainer);

		const helperLine = document.createElement('div');
		helperLine.className = `mdc-text-field-helper-line ${id}Helper hidden`;

		const helperText = document.createElement('p');
		helperText.className = 'mdc-theme--text-primary-on-background mdc-text-field-helper-text mdc-text-field-helper-text--persistent mdc-text-field-helper-text--validation-msg error-msg';
		helperText.textContent = window.strings?.get('locationEditing.fieldRequired')?.v || 'Required';
		helperLine.appendChild(helperText);
		container.appendChild(helperLine);

		wysiwygContainer.onclick = (e) => {
			if (wysiwygContainer.classList.contains('disabled')) return;
			wysiwygContainer.classList.add('disabled');
			buildfire.input.showTextDialog(
				{
					placeholder: title,
					saveText: window.strings?.get('locationEditing.descriptionDialogSave')?.v || 'Save',
					cancelText: window.strings?.get('locationEditing.descriptionDialogCancel')?.v || 'Cancel',
					defaultValue: wysiwygContainer.dataset.value || '',
					wysiwyg: true,
				},
				(err, response) => {
					wysiwygContainer.classList.remove('disabled');
					if (err) return console.error(err);
					if (response.cancelled) return;

					wysiwygContainer.dataset.value = response.results[0].wysiwygValue;
					wysiwygContainer.innerHTML = '';

					if (response.results[0].wysiwygValue) {
						wysiwygContainer.innerHTML = response.results[0].wysiwygValue;
					} else {
						const labelSpan = document.createElement('label');
						labelSpan.className = 'mdc-floating-label mdc-theme--text-primary-on-background';
						labelSpan.textContent = title;
						wysiwygContainer.appendChild(labelSpan);
					}
				}
			);
		};

		return { container, input: wysiwygContainer };
	},

	_injectCustomFields() {
		const { settings, selectedLocation } = state;
		const locationAdditionalDetailsContainer = document.querySelector('#locationAdditionalDetailsContainer');

		const allFields = [
			...(settings.customFields?.quickActions || []),
			...(settings.customFields?.content || [])
		];

		const activeLocationFields = [
			...(selectedLocation?.additionalFields?.quickActions || []),
			...(selectedLocation?.additionalFields?.content || [])
		];

		allFields.forEach(field => {
			const activeField = activeLocationFields.find(f => f.id === field.id) || {};
			const isRichText = field.type === constants.ContentOptions.RICH_TEXT;

			const row = document.createElement('div');
			row.id = `custom-field-container-${field.id}`;
			row.className = 'custom-field-wrapper margin-bottom-twenty d-flex-column gap-half-rem';

			const fieldTitle = field.label;
			const fieldTitleSpan = document.createElement('span');
			fieldTitleSpan.className = field.required ? 'custom-field-title required' : 'custom-field-title';
			fieldTitleSpan.textContent = fieldTitle;
			row.appendChild(fieldTitleSpan);
			const placeholder = this._getCustomFieldPlaceholder(field.type);

			if (field.enableCustomLabel) {
				const innerFlex = document.createElement('div');
				innerFlex.className = 'd-flex-column gap-half-rem';

				const labelCol = document.createElement('div');
				labelCol.className = 'w-100';

				const { container: labelMdc } = this._createMDCInput(`custom-field-label-${field.id}`, window.strings?.get('locationEditing.locationCustomLabel')?.v || 'Label (optional)', activeField.customLabel || '', 'text', 50);
				labelCol.appendChild(labelMdc);

				const valueCol = document.createElement('div');
				valueCol.className = 'w-100';

				if (isRichText) {
					const { container: valueMdc } = this._createMDCDialogTrigger(`custom-field-input-${field.id}`, placeholder, activeField.value || '');
					valueCol.appendChild(valueMdc);
				} else {
					const { container: valueMdc, input } = this._createMDCInput(`custom-field-input-${field.id}`, placeholder, activeField.value || '', 'text', 150);
					input.addEventListener('blur', () => this._validateField(field));
					valueCol.appendChild(valueMdc);
				}

				innerFlex.appendChild(labelCol);
				innerFlex.appendChild(valueCol);
				row.appendChild(innerFlex);

			} else {
				if (isRichText) {
					const { container: valueMdc } = this._createMDCDialogTrigger(`custom-field-input-${field.id}`, placeholder, activeField.value || '');
					row.appendChild(valueMdc);
				} else {
					const { container: valueMdc, input } = this._createMDCInput(`custom-field-input-${field.id}`, placeholder, activeField.value || '', 'text', 150);
					input.addEventListener('blur', () => this._validateField(field));
					row.appendChild(valueMdc);
				}
			}

			locationAdditionalDetailsContainer.appendChild(row);

			row.querySelectorAll('.mdc-text-field').forEach((el) => {
				new mdc.textField.MDCTextField(el);
			});
		});
	},

	validate() {
		const { settings } = state;
		let isValid = true;
		const allFields = [
			...(settings.customFields?.quickActions || []),
			...(settings.customFields?.content || [])
		];

		allFields.forEach(field => {
			if (!this._validateField(field)) {
				isValid = false;
			}
		});

		return isValid;
	},

	_validateField(field) {
		let isValid = true;
		const isRichText = field.type === constants.ContentOptions.RICH_TEXT;
		let inputElement;
		let valueStr = '';

		if (isRichText) {
			inputElement = document.querySelector(`#custom-field-input-${field.id}Container`);
			valueStr = inputElement ? (inputElement.dataset.value || '') : '';
		} else {
			inputElement = document.querySelector(`#custom-field-input-${field.id}`);
			valueStr = inputElement ? (inputElement.value || '') : '';
		}

		if (!isRichText && inputElement) {
			valueStr = valueStr.trim();
			inputElement.value = valueStr;
		} else if (isRichText && inputElement) {
			valueStr = valueStr.trim();
			inputElement.dataset.value = valueStr;
		}

		const helperLine = document.querySelector(`.custom-field-input-${field.id}Helper`);
		const helperText = helperLine ? helperLine.querySelector('.error-msg') : null;

		if (helperLine) {
			helperLine.classList.add('hidden');
			helperLine.classList.remove('has-error');
		}
		if (inputElement && !isRichText) {
			const mdcField = inputElement.closest('.mdc-text-field');
			if (mdcField) mdcField.classList.remove('mdc-text-field--invalid');
		}

		let errorMessage = '';

		if (field.required && !valueStr) {
			errorMessage = window.strings?.get('locationEditing.fieldRequired')?.v || 'This field is required';
		} else if (valueStr) {
			if (field.type === constants.QuickActionsOptions.EMAIL || field.type === constants.ContentOptions.EMAIL) {
				const emailHasAt = valueStr.includes('@');
				const emailHasDotAfterAt = emailHasAt && valueStr.indexOf('.', valueStr.indexOf('@')) !== -1;
				const emailNoSpaces = !valueStr.includes(' ');

				if (!emailHasAt || !emailHasDotAfterAt || !emailNoSpaces) {
					errorMessage = window.strings?.get('locationEditing.validEmail')?.v || 'Enter a valid email address';
				}
			} else if (field.type === constants.QuickActionsOptions.PHONE || field.type === constants.ContentOptions.PHONE) {
				const phoneRegex = /^[\d\s+\-()]+$/;
				const hasLetters = /[a-zA-Z]/.test(valueStr);
				if (!phoneRegex.test(valueStr) || hasLetters) {
					errorMessage = window.strings?.get('locationEditing.validPhone')?.v || 'Enter a valid phone number';
				}
			} else if (field.type === constants.QuickActionsOptions.URL || field.type === constants.ContentOptions.URL) {
				if (valueStr.includes(' ') || !valueStr.includes('.')) {
					errorMessage = window.strings?.get('locationEditing.validURL')?.v || 'Enter a valid URL';
				} else {
					if (!/^https?:\/\//i.test(valueStr)) {
						valueStr = 'https://' + valueStr;
						if (inputElement && !isRichText) {
							inputElement.value = valueStr;
						}
					}
				}
			}
		}

		if (errorMessage) {
			isValid = false;
			if (helperLine && helperText) {
				helperText.textContent = errorMessage;
				helperLine.classList.remove('hidden');
				helperLine.classList.add('has-error');
			}
			if (inputElement && !isRichText) {
				const mdcField = inputElement.closest('.mdc-text-field');
				if (mdcField) mdcField.classList.add('mdc-text-field--invalid');
			}
		}

		return isValid;
	},

	getFieldsValues() {
		const { settings } = state;
		const values = {
			quickActions: [],
			content: []
		};

		const allFields = [
			...(settings.customFields?.quickActions || []),
			...(settings.customFields?.content || [])
		];

		allFields.forEach(field => {
			const isRichText = field.type === constants.ContentOptions.RICH_TEXT;
			let inputElement;
			let valueStr = '';
			let customLabelStr = '';

			if (isRichText) {
				inputElement = document.querySelector(`#custom-field-input-${field.id}Container`);
				valueStr = inputElement ? (inputElement.dataset.value || '') : '';
			} else {
				inputElement = document.querySelector(`#custom-field-input-${field.id}`);
				valueStr = inputElement ? (inputElement.value || '') : '';
			}

			if (field.enableCustomLabel) {
				const labelInput = document.querySelector(`#custom-field-label-${field.id}`);
				customLabelStr = labelInput ? (labelInput.value || '') : '';
			}

			const fieldData = {
				id: field.id,
				value: valueStr.trim()
			};

			if (field.enableCustomLabel) {
				fieldData.customLabel = customLabelStr.trim();
			}

			if (settings.customFields?.quickActions?.find(q => q.id === field.id)) {
				values.quickActions.push(fieldData);
			} else {
				values.content.push(fieldData);
			}
		});

		return values;
	}
};

export default {
	ui: {
		init: customFieldsController.init.bind(customFieldsController)
	},
	helper: {
		validate: customFieldsController.validate.bind(customFieldsController),
		getFieldsValues: customFieldsController.getFieldsValues.bind(customFieldsController)
	}
};