import buildfire from 'buildfire';
import CustomFieldsListUI from '../ui/customFieldsListUI';
import SettingsController from "../../settings.controller";
import { generateUUID } from '../../../../widget/js/global/helpers';
import constants from '../../../../widget/js/global/constants';
import DialogComponent from "../ui/dialog/dialog";

let _saveTimer;
const updateCustomFieldsWithDeilay = (customFields) => {
	clearTimeout(_saveTimer);
	_saveTimer = setTimeout(() => {
		const updatedCustomFields = {
			quickActions: customFields.quickActions.filter(item => item.label && item.type),
			content: customFields.content.filter(item => item.label && item.type)
		}
		SettingsController.updateSettings({ customFields: updatedCustomFields }).then(() => {
			updateAddButtonsState({ customFields });
			buildfire.messaging.sendMessageToWidget({
				cmd: 'sync',
				scope: 'customFields'
			});
		})
	}, 500);
}

const createVisibilityDialogTemplate = (item) => {
	const selectedVisibility = item?.visibility?.value || constants.CustomFieldVisibilityOptions.ALL;
	const container = document.createElement('div');
	container.className = 'padding-top-ten';
	container.innerHTML = `
	<div class="padding-left-ten padding-right-ten">
		<div class="margin-bottom-fifteen text-success">
			Choose who can see and fill in this field when adding or editing a location.
		</div>
		<div class="radio-primary radio margin-zero row w-100 margin-bottom-fifteen">
			<input type="radio" id="visibility-all-users" name="custom-field-visibility" value="${constants.CustomFieldVisibilityOptions.ALL}" ${selectedVisibility === constants.CustomFieldVisibilityOptions.ALL ? 'checked' : ''}>
			<label class="d-flex-column" for="visibility-all-users">
				<span class="text-success margin-bottom-five">All Users</span>
				<span class="font-size-13">Field is shown to everyone adding or editing a location</span>
			</label>
		</div>
		<div class="radio-primary radio margin-zero row w-100 margin-bottom-fifteen">
			<input type="radio" id="visibility-users-with-tags" name="custom-field-visibility" value="${constants.CustomFieldVisibilityOptions.TAGS}" ${selectedVisibility === constants.CustomFieldVisibilityOptions.TAGS ? 'checked' : ''}>
			<label class="d-flex-column" for="visibility-users-with-tags">
				<span class="text-success margin-bottom-five">Users with tags</span>
				<span class="font-size-13">Field is only shown to users with selected tags</span>
			</label>
		</div>
		<div class="margin-bottom-fifteen margin-left-thirty tags-container-${item.id} ${selectedVisibility === constants.CustomFieldVisibilityOptions.TAGS ? '' : 'hidden'}"/>
	</div>
	`;

	return container;
};

const showVisibilityDialog = (item, onSave) => {
	const selectedVisibility = item?.visibility?.value || constants.CustomFieldVisibilityOptions.ALL;
	const dialogTemplate = createVisibilityDialogTemplate(item);
	const dialog = new DialogComponent('dialogComponent', dialogTemplate);
	const dialogSaveButton = dialog.container.querySelector('.dialog-save-btn');

	const tagsInput = new window.buildfire.components.control.userTagsInput(`.tags-container-${item.id}`, {
		languageSettings: {
			placeholder: 'User Tags',
		},
		settings: {
			allowUserInput: false,
		}
	});
	tagsInput.onUpdate = (data) => {
		const selectedOption = dialog.container.querySelector('input[name="custom-field-visibility"]:checked')?.value;
		if (selectedOption === constants.CustomFieldVisibilityOptions.TAGS && data.tags.length === 0) {
			dialogSaveButton.classList.add('disabled');
		} else {
			dialogSaveButton.classList.remove('disabled');
		}
	}

	if (item.visibility && Array.isArray(item.visibility.tags)) {
		tagsInput.append(item.visibility.tags);
	}

	const dialogRadios = dialog.container.querySelectorAll('input[name="custom-field-visibility"]');
	dialogRadios.forEach(radio => {
		radio.onchange = (e) => {
			if (e.target.value === constants.CustomFieldVisibilityOptions.TAGS) {
				dialog.container.querySelector(`.tags-container-${item.id}`).classList.remove('hidden');
				const selectedTags = tagsInput.get();
				if (!selectedTags || selectedTags.length === 0) {
					dialogSaveButton.classList.add('disabled');
				} else {
					dialogSaveButton.classList.remove('disabled');
				}
			} else {
				dialog.container.querySelector(`.tags-container-${item.id}`).classList.add('hidden');
				dialogSaveButton.classList.remove('disabled');
			}
		}
	});

	dialog.showDialog({
		title: 'Field Access',
		saveText: 'Save',
	}, () => {
		const selectedInput = dialog.container.querySelector('input[name="custom-field-visibility"]:checked');
		const selectedValue = selectedInput?.value || constants.CustomFieldVisibilityOptions.ALL;

		const selectedTags = tagsInput.get();

		item.visibility = {
			value: selectedValue,
			tags: Array.isArray(selectedTags) ? selectedTags : []
		};

		onSave();
		dialog.close();
	});
};

const initLocationFields = (settings) => {
	const quickActionsList = new CustomFieldsListUI('quick-actions-container', [
		{ id: constants.QuickActionsOptions.EMAIL, label: 'Email' },
		{ id: constants.QuickActionsOptions.PHONE, label: 'Phone' },
		{ id: constants.QuickActionsOptions.URL, label: 'URL' }
	]);
	const textContentList = new CustomFieldsListUI('text-content-container', [
		{ id: constants.ContentOptions.EMAIL, label: 'Email' },
		{ id: constants.ContentOptions.PHONE, label: 'Phone' },
		{ id: constants.ContentOptions.URL, label: 'URL' },
		{ id: constants.ContentOptions.TEXT, label: 'Text' },
		{ id: constants.ContentOptions.RICH_TEXT, label: 'Rich Text' },
	]);

	// Quick Actions Listeners
	quickActionsList.onUpdateItem = (item, index, divRow) => {
		if (item.label && item.type) {
			settings.customFields.quickActions = quickActionsList.items;
			updateCustomFieldsWithDeilay(settings.customFields);
		}
	};
	quickActionsList.onOrderChange = (item, oldIndex, newIndex) => {
		settings.customFields.quickActions = quickActionsList.items;
		updateCustomFieldsWithDeilay(settings.customFields);
	};
	quickActionsList.onDeleteItem = (item, index, callback) => {
		buildfire.dialog.confirm(
			{
				title: 'Delete Field',
				message: 'Are you sure you want to delete this field?',
				confirmButton: { text: 'Delete', type: 'danger' },
				cancelButtonText: 'Cancel'
			},
			(e, isConfirmed) => {
				if (e) console.error(e);
				if (isConfirmed) {
					quickActionsList.items.splice(index, 1);
					settings.customFields.quickActions = quickActionsList.items;
					updateCustomFieldsWithDeilay(settings.customFields);
					callback(true);
				} else {
					callback(false);
				}
			}
		);
	};
	quickActionsList.onItemVisibilityClick = (item) => {
		showVisibilityDialog(item, () => {
			settings.customFields.quickActions = quickActionsList.items;
			quickActionsList.init(settings.customFields.quickActions || []);
			updateCustomFieldsWithDeilay(settings.customFields);
		});
	};

	// Text Content Listeners
	textContentList.onUpdateItem = (item, index, divRow) => {
		if (item.label && item.type) {
			settings.customFields.content = textContentList.items;
			updateCustomFieldsWithDeilay(settings.customFields);
		}
	};
	textContentList.onOrderChange = (item, oldIndex, newIndex) => {
		settings.customFields.content = textContentList.items;
		updateCustomFieldsWithDeilay(settings.customFields);
	};
	textContentList.onDeleteItem = (item, index, callback) => {
		buildfire.dialog.confirm(
			{
				title: 'Delete Field',
				message: 'Are you sure you want to delete this field?',
				confirmButton: { text: 'Delete', type: 'danger' },
				cancelButtonText: 'Cancel'
			},
			(e, isConfirmed) => {
				if (e) console.error(e);
				if (isConfirmed) {
					textContentList.items.splice(index, 1);
					settings.customFields.content = textContentList.items;
					updateCustomFieldsWithDeilay(settings.customFields);
					callback(true);
				} else {
					callback(false);
				}
			}
		);
	};
	textContentList.onItemVisibilityClick = (item) => {
		showVisibilityDialog(item, () => {
			settings.customFields.content = textContentList.items;
			textContentList.init(settings.customFields.content || []);
			updateCustomFieldsWithDeilay(settings.customFields);
		});
	};

	if (settings && settings.customFields) {
		quickActionsList.init(settings.customFields.quickActions || []);
		textContentList.init(settings.customFields.content || []);
	}

	const addQuickActionBtn = document.getElementById('add-quick-action-field');
	addQuickActionBtn.onclick = () => {
		quickActionsList.addItem({
			id: generateUUID(),
			label: '',
			type: constants.QuickActionsOptions.EMAIL,
			required: false,
			enableCustomLabel: false,
			visibility: {
				value: constants.CustomFieldVisibilityOptions.ALL,
				tags: []
			}
		});
		settings.customFields.quickActions = quickActionsList.items;

		updateAddButtonsState(settings);
	};

	const addTextContentBtn = document.getElementById('add-text-content-field');
	addTextContentBtn.onclick = () => {
		textContentList.addItem({
			id: generateUUID(),
			label: '',
			type: constants.ContentOptions.EMAIL,
			required: false,
			enableCustomLabel: false,
			visibility: {
				value: constants.CustomFieldVisibilityOptions.ALL,
				tags: []
			}
		});
		settings.customFields.content = textContentList.items;

		updateAddButtonsState(settings);
	};

	updateAddButtonsState(settings);
};

const updateAddButtonsState = (settings) => {
	const { customFields } = settings;
	const allFields = [...customFields.quickActions, ...customFields.content];

	const addTextContentBtn = document.getElementById('add-text-content-field');
	const addQuickActionBtn = document.getElementById('add-quick-action-field');

	if (allFields.length < 10) {
		addTextContentBtn.classList.remove('disabled');
		addQuickActionBtn.classList.remove('disabled');
	} else {
		addTextContentBtn.classList.add('disabled');
		addQuickActionBtn.classList.add('disabled');
	}
};

export default initLocationFields;