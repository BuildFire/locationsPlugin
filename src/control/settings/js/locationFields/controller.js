import buildfire from 'buildfire';
import CustomFieldsListUI from '../ui/customFieldsListUI';
import SettingsController from "../../settings.controller";
import { generateUUID } from '../../../../shared/utils/helpers';
import constants from '../../../../widget/js/constants';

let _saveTimer;
const updateCustomFieldsWithDeilay = (customFields) => {
	clearTimeout(_saveTimer);
	_saveTimer = setTimeout(() => {
		customFields = {
			quickActions: customFields.quickActions.filter(item => item.label && item.type),
			content: customFields.content.filter(item => item.label && item.type)
		}
		SettingsController.updateSettings({ customFields }).then(() => {
			updateAddButtonsState({ customFields });
			buildfire.messaging.sendMessageToWidget({
				cmd: 'sync',
				scope: 'customFields'
			});
		})
	}, 500);
}

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
			enableCustomLabel: false
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
			enableCustomLabel: false
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