import constants from '../../../../widget/js/constants';
import globalState from '../../state';

const locationCustomFieldsController = {
	activeLocation: {},

	_getCustomFieldPlaceholder(fieldType) {
		switch (fieldType) {
			case constants.QuickActionsOptions.EMAIL:
			case constants.ContentOptions.EMAIL:
				return 'Enter email address';
			case constants.QuickActionsOptions.PHONE:
			case constants.ContentOptions.PHONE:
				return 'Enter phone number';
			case constants.QuickActionsOptions.URL:
			case constants.ContentOptions.URL:
				return 'Enter URL';
			default:
				return 'Enter details';
		}
	},

	validateFieldValue(value, fieldType) {
		if (!value) return { isValid: true, value };

		let parsedValue = value.trim();

		switch (fieldType) {
			case constants.QuickActionsOptions.PHONE:
			case constants.ContentOptions.PHONE: {
				const phoneRegex = /^[0-9\s+\-()]+$/;
				if (!phoneRegex.test(parsedValue)) {
					return { isValid: false, error: 'Enter a valid phone number' };
				}
				break;
			}
			case constants.QuickActionsOptions.EMAIL:
			case constants.ContentOptions.EMAIL: {
				if (parsedValue.indexOf(' ') !== -1) {
					return { isValid: false, error: 'Enter a valid email address' };
				}
				const atIndex = parsedValue.indexOf('@');
				if (atIndex === -1 || parsedValue.indexOf('.', atIndex) === -1) {
					return { isValid: false, error: 'Enter a valid email address' };
				}
				break;
			}
			case constants.QuickActionsOptions.URL:
			case constants.ContentOptions.URL: {
				if (parsedValue.indexOf(' ') !== -1) {
					return { isValid: false, error: 'Enter a valid URL' };
				}
				if (parsedValue.indexOf('.') === -1) {
					return { isValid: false, error: 'Enter a valid URL' };
				}
				if (!/^https?:\/\//i.test(parsedValue)) {
					parsedValue = 'https://' + parsedValue;
				}
				break;
			}
		}

		return { isValid: true, value: parsedValue };
	},

	getCustomFieldsValues() {
		const { settings } = globalState;
		const quickActions = settings.customFields.quickActions || [];
		const content = settings.customFields.content || [];

		const getFieldValue = (field) => {
			let value = '';
			const valueInput = document.getElementById(`custom-field-input-${field.id}`);
			const wysiwygInput = document.getElementById(`custom-field-wysiwyg-${field.id}`);

			if (valueInput) {
				value = valueInput.value;
			} else if (wysiwygInput) {
				const editor = tinymce.get(`custom-field-wysiwyg-${field.id}`);
				if (editor) {
					// Use text format to properly detect empty rich text content
					const textContent = editor.getContent({ format: 'text' }).trim();
					value = textContent === '' ? '' : editor.getContent();
				}
			}

			const validatedObj = this.validateFieldValue(value, field.type);
			const formattedValue = validatedObj.isValid ? validatedObj.value : value;

			const newFieldData = { id: field.id, value: formattedValue };

			if (field.enableCustomLabel) {
				const labelInput = document.getElementById(`custom-field-label-${field.id}`);
				if (labelInput) {
					newFieldData.customLabel = labelInput.value;
				}
			}

			return newFieldData;
		};

		return {
			quickActions: quickActions.map(getFieldValue),
			content: content.map(getFieldValue)
		};
	},

	validateCustomFields() {
		const { settings } = globalState;
		const configQuickActions = settings.customFields.quickActions || [];
		const configContent = settings.customFields.content || [];
		const allConfigFields = [...configQuickActions, ...configContent];

		const { quickActions, content } = this.getCustomFieldsValues();
		const allExtractedFields = [...quickActions, ...content];

		let isCustomFieldsValid = true;

		allConfigFields.forEach(configField => {
			const extractedField = allExtractedFields.find(f => f.id === configField.id) || {};
			const value = extractedField.value || '';

			let errorMsg = null;
			if (configField.required && !value.trim()) {
				errorMsg = 'This field is required';
				isCustomFieldsValid = false;
			} else if (value.trim()) {
				const validatedObj = this.validateFieldValue(value, configField.type);
				if (!validatedObj.isValid) {
					errorMsg = validatedObj.error;
					isCustomFieldsValid = false;
				}
			}

			const container = document.getElementById(`custom-field-container-${configField.id}`);
			if (container) {
				const errSpan = container.querySelector('.custom-field-error');
				if (errorMsg) {
					errSpan.innerHTML = errorMsg;
					errSpan.classList.remove('hidden');
					container.classList.add('has-error');
				} else {
					errSpan.classList.add('hidden');
					container.classList.remove('has-error');
				}
			}
		});

		return isCustomFieldsValid;
	},

	_createValueInput(field, initialValue = '') {
		if (field.type === constants.ContentOptions.RICH_TEXT) {
			const valueInput = document.createElement('div');
			valueInput.id = `custom-field-wysiwyg-${field.id}`;

			setTimeout(() => {
				tinymce.EditorManager.execCommand('mceRemoveEditor', true, valueInput.id);
				tinymce.init({
					selector: `#${valueInput.id}`,
					setup: (ed) => {
						ed.on('init', () => {
							if (initialValue) {
								ed.setContent(initialValue);
							}
						});
						ed.on('keyup change', () => {
							this.activeLocation.customFields = locationCustomFieldsController.getCustomFieldsValues();
							if (window.triggerWidgetOnLocationsUpdate) window.triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
						});
					}
				});
			}, 0);
			return valueInput;
		}

		const valueInput = document.createElement('input');
		valueInput.id = `custom-field-input-${field.id}`;
		valueInput.type = 'text';
		valueInput.className = 'form-control';
		valueInput.placeholder = this._getCustomFieldPlaceholder(field.type);
		valueInput.value = initialValue;
		valueInput.setAttribute('maxlength', 150);

		valueInput.addEventListener('keyup', () => {
			this.activeLocation.customFields = locationCustomFieldsController.getCustomFieldsValues();
			if (window.triggerWidgetOnLocationsUpdate) window.triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
		});

		return valueInput;
	},

	_injectCustomFields() {
		const { settings } = globalState;
		const locationCustomFieldsContainer = document.querySelector('#locationCustomFieldsContainer');

		const allFields = [
			...(settings.customFields.quickActions || []),
			...(settings.customFields.content || [])
		];

		const locationQuickActions = this.activeLocation?.customFields?.quickActions || [];
		const locationContent = this.activeLocation?.customFields?.content || [];
		const activeLocationFields = [...locationQuickActions, ...locationContent];

		allFields.forEach(field => {
			const activeField = activeLocationFields.find(f => f.id === field.id) || {};

			const row = document.createElement('div');
			row.id = `custom-field-container-${field.id}`;
			row.className = 'row margin-bottom-fifteen';

			const labelCol = document.createElement('div');
			labelCol.className = 'col-md-3';
			labelCol.innerHTML = `<span>${field.label}${field.required ? ' <span class="text-danger">*</span>' : ''}</span>`;
			row.appendChild(labelCol);

			const inputCol = document.createElement('div');
			inputCol.className = field.type === constants.ContentOptions.RICH_TEXT ? 'col-md-12 margin-top-ten' : 'col-md-9';

			if (field.enableCustomLabel) {
				const innerRow = document.createElement('div');
				innerRow.className = 'row';

				const customLabelCol = document.createElement('div');
				customLabelCol.className = field.type === constants.ContentOptions.RICH_TEXT
					? 'col-md-12 margin-bottom-ten'
					: 'col-md-4 padding-right-zero';

				const customLabelInput = document.createElement('input');
				customLabelInput.id = `custom-field-label-${field.id}`;
				customLabelInput.type = 'text';
				customLabelInput.className = 'form-control custom-field-label';
				customLabelInput.placeholder = 'Label (optional)';
				customLabelInput.value = activeField.customLabel || '';
				customLabelInput.setAttribute('maxlength', 50);

				customLabelInput.addEventListener('keyup', () => {
					this.activeLocation.customFields = locationCustomFieldsController.getCustomFieldsValues();
					if (window.triggerWidgetOnLocationsUpdate) window.triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
				});

				customLabelCol.appendChild(customLabelInput);
				innerRow.appendChild(customLabelCol);

				const valueCol = document.createElement('div');
				valueCol.className = field.type === constants.ContentOptions.RICH_TEXT
					? 'col-md-12'
					: 'col-md-8 padding-left-ten';

				const valueInput = this._createValueInput(field, activeField.value);
				valueCol.appendChild(valueInput);

				const errorSpan = document.createElement('div');
				errorSpan.className = 'text-danger hidden custom-field-error';
				valueCol.appendChild(errorSpan);

				innerRow.appendChild(valueCol);

				inputCol.appendChild(innerRow);
			} else {
				const valueInput = this._createValueInput(field, activeField.value);
				inputCol.appendChild(valueInput);

				const errorSpan = document.createElement('div');
				errorSpan.className = 'text-danger hidden custom-field-error';
				inputCol.appendChild(errorSpan);
			}

			row.appendChild(inputCol);

			locationCustomFieldsContainer.appendChild(row);
		});
	},

	init(location) {
		this.activeLocation = location || {};
		const { settings } = globalState;

		const locationCustomFields = document.querySelector('#locationCustomFields');

		if (settings.customFields.quickActions.length || settings.customFields.content.length) {
			const locationCustomFieldsContainer = document.querySelector('#locationCustomFieldsContainer');
			locationCustomFieldsContainer.innerHTML = '';

			this._injectCustomFields();

			locationCustomFields.classList.remove('hidden');
		} else {
			locationCustomFields.classList.add('hidden');
		}
	}
};

export default locationCustomFieldsController;