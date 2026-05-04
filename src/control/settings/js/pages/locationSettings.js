import SubscriptionOptionsListUI from '../ui/subscriptionOptionsListUI';
import Purchase from '../../../../shared/utils/purchase';

const _uiElements = {};

const initWysiwyg = (globalEntries, saveSettingsWithDelay) => {
  console.log(globalEntries.charging.description, 'globalEntries.charging.description');
  tinymce.EditorManager.execCommand('mceRemoveEditor', true, 'paymentDetailsDescription');
  tinymce.init({
    selector: '#paymentDetailsDescription',
    init_instance_callback: (editor) => {
      if (globalEntries.charging.description) {
        tinymce.activeEditor?.setContent(globalEntries.charging.description || '');
      }
    },
    setup: (ed) => {
      ed.on('keyup change', () => {
        if (tinymce.activeEditor.id === 'paymentDetailsDescription') {
          globalEntries.charging.description = tinymce.activeEditor.getContent();
          saveSettingsWithDelay();
        }
      });
    }
  });
};

const isValidSubscription = (subscription) => {
  return subscription && subscription.subscriptionId;
};

const getSelectedSubscriptionIds = (subscriptionOptionsList) => {
  return subscriptionOptionsList.items
    .filter(isValidSubscription)
    .map((item) => item.subscriptionId);
};

const getUnselectedSubscriptions = (subscriptionsList, subscriptionOptionsList) => {
  const selectedIds = getSelectedSubscriptionIds(subscriptionOptionsList);
  return subscriptionsList.filter((sub) => !selectedIds.includes(sub.id));
};

const updateButtonState = (subscriptionOptionsList, subscriptionsList) => {
  const validCount = subscriptionOptionsList.items.filter(isValidSubscription).length;
  const canAddMore = validCount < subscriptionsList.length;
  _uiElements.addSubscriptionBtn.disabled = !canAddMore;
};

const updateDropdownOptions = (subscriptionOptionsList, subscriptionsList) => {
  const unselectedSubscriptions = getUnselectedSubscriptions(subscriptionsList, subscriptionOptionsList);
  subscriptionOptionsList.options.dropdownOptions = unselectedSubscriptions;
};

const saveValidSubscriptions = (subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay) => {
  const validSubscriptions = subscriptionOptionsList.items.filter(isValidSubscription);
  globalEntries.charging.subscriptionOptions = validSubscriptions;
  updateButtonState(subscriptionOptionsList, subscriptionsList);
  updateDropdownOptions(subscriptionOptionsList, subscriptionsList);
  saveSettingsWithDelay();
};

const handleSubscriptionItemUpdate = (subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay) => {
  saveValidSubscriptions(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
};

const handleSubscriptionOrderChange = (subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay) => {
  saveValidSubscriptions(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
};

const handleSubscriptionItemDelete = (item, index, subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay, callback) => {
  buildfire.dialog.confirm(
    {
      title: 'Delete Subscription Option',
      message: 'Are you sure you want to delete this subscription option?',
      confirmButton: { text: 'Delete', type: 'danger' },
      cancelButtonText: 'Cancel'
    },
    (e, isConfirmed) => {
      if (e) console.error(e);
      if (isConfirmed) {
        subscriptionOptionsList.items.splice(index, 1);
        saveValidSubscriptions(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
        callback(true);
      } else {
        callback(false);
      }
    }
  );
};

const handleAddSubscription = (subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay) => {
  const unselectedSubscriptions = getUnselectedSubscriptions(subscriptionsList, subscriptionOptionsList);
  const firstUnselectedSubscription = unselectedSubscriptions[0];
  if (firstUnselectedSubscription) {
    subscriptionOptionsList.addItem({
      id: Date.now(),
      name: firstUnselectedSubscription?.name || '',
      description: '',
      subscriptionId: firstUnselectedSubscription?.id || '',
      tag: firstUnselectedSubscription?.tag || '',
      type: firstUnselectedSubscription?.id || '',
      order: subscriptionOptionsList.items.length + 1
    });
    globalEntries.charging.subscriptionOptions = subscriptionOptionsList.items;
    saveValidSubscriptions(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
  }
};

const initSubscriptionOptions = (globalEntries, saveSettingsWithDelay, subscriptionsList) => {
  const subscriptionOptionsList = new SubscriptionOptionsListUI(
    'subscription-options-container',
    subscriptionsList || []
  );

  subscriptionOptionsList.onUpdateItem = () => {
    handleSubscriptionItemUpdate(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
  };

  subscriptionOptionsList.onOrderChange = () => {
    handleSubscriptionOrderChange(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
  };

  subscriptionOptionsList.onDeleteItem = (item, index, callback) => {
    handleSubscriptionItemDelete(item, index, subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay, callback);
  };

  subscriptionOptionsList.init(globalEntries.charging.subscriptionOptions || []);

  _uiElements.addSubscriptionBtn.onclick = () => {
    handleAddSubscription(subscriptionOptionsList, subscriptionsList, globalEntries, saveSettingsWithDelay);
  };

  updateButtonState(subscriptionOptionsList, subscriptionsList);
  updateDropdownOptions(subscriptionOptionsList, subscriptionsList);
  updateNoSubscriptionsMessage(subscriptionsList);
};

const updateFieldAccessVisibility = () => {
  const isOpenHoursEnabled = _uiElements.allowOpenHoursCheckbox.checked;
  const isPriceRangeEnabled = _uiElements.allowPriceRangeCheckbox.checked;

  if (_uiElements.openHoursAccessSection) {
    if (isOpenHoursEnabled) {
      _uiElements.openHoursAccessSection.classList.remove('hidden');
    } else {
      _uiElements.openHoursAccessSection.classList.add('hidden');
    }
  }

  if (_uiElements.priceRangeAccessSection) {
    if (isPriceRangeEnabled) {
      _uiElements.priceRangeAccessSection.classList.remove('hidden');
    } else {
      _uiElements.priceRangeAccessSection.classList.add('hidden');
    }
  }

  if (_uiElements.fieldAccessSection) {
    if (!isOpenHoursEnabled && !isPriceRangeEnabled) {
      _uiElements.fieldAccessSection.classList.add('hidden');
    } else {
      _uiElements.fieldAccessSection.classList.remove('hidden');
    }
  }
};

let subscriptionsCached = false;

const fetchSubscriptions = (globalEntries) => {
  return new Promise((resolve) => {
    if (!subscriptionsCached && globalEntries.charging.enabled !== 'none') {
      Purchase.getSubscriptions().then((subscriptions) => {
        const subscriptionsList = subscriptions || [];
        console.log('Subscriptions fetched:', subscriptionsList);
        if (_uiElements.subscriptionOptionsSection) {
          _uiElements.subscriptionOptionsSection.classList.remove('hidden');
        }
        subscriptionsCached = true;
        resolve(subscriptionsList);
      }).catch((error) => {
        console.error('Error fetching subscriptions:', error);
        subscriptionsCached = true;
        resolve([]);
      });
    } else {
      resolve([]);
    }
  });
};

const createTagsInputManager = (saveSettingsWithDelay) => {
  return {
    init(element, tags) {
      const tagsInput = new window.buildfire.components.control.userTagsInput(`#${element.id}`, {
        languageSettings: {
          placeholder: 'User Tags',
        },
        settings: {
          allowUserInput: false,
        }
      });

      tagsInput.onUpdate = (data) => {
        if (data && data.tags) {
          tags.length = 0;
          tags.push(...data.tags.map((tag) => ({
            id: tag.id,
            tagName: tag.tagName,
            value: tag.value,
          })));
          saveSettingsWithDelay();
        }
      };
      tagsInput.set(tags);
    },
    clear(element) {
      element.innerHTML = '';
    }
  };
};

const initRadioGroup = (config, tagsInputManager, saveSettingsWithDelay) => {
  const { radios, settingsObj, propName, tagsContainer, onChangeCallback } = config;

  if (!settingsObj[propName]) {
    settingsObj[propName] = '';
  }

  for (const radio of radios) {
    if (radio.value === settingsObj[propName]) {
      radio.checked = true;
    }

    if (settingsObj[propName] === 'limited') {
      tagsInputManager.init(tagsContainer, settingsObj.tags);
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      settingsObj[propName] = value;

      tagsInputManager.clear(tagsContainer);

      if (value === 'limited') {
        tagsInputManager.init(tagsContainer, settingsObj.tags);
      }

      if (onChangeCallback) {
        onChangeCallback(value);
      }

      saveSettingsWithDelay();
    };
  }
};

const handleLocationCreationChange = (value) => {
  if (_uiElements.chargeContainer) {
    if (value === 'none') {
      _uiElements.chargeContainer.classList.add('hidden');
    } else {
      _uiElements.chargeContainer.classList.remove('hidden');
    }
  }
};

const handleChargingChange = (value) => {
  if (value === 'none') {
    if (_uiElements.paymentDetailsSection) {
      _uiElements.paymentDetailsSection.classList.add('hidden');
    }
    if (_uiElements.subscriptionOptionsSection) {
      _uiElements.subscriptionOptionsSection.classList.add('hidden');
    }
  } else {
    if (_uiElements.paymentDetailsSection) {
      _uiElements.paymentDetailsSection.classList.remove('hidden');
    }
    if (_uiElements.subscriptionOptionsSection) {
      _uiElements.subscriptionOptionsSection.classList.remove('hidden');
    }
  }
};

const updateNoSubscriptionsMessage = (subscriptionsList) => {
  if (_uiElements.noSubscriptionsAvailableContainer) {
    if (subscriptionsList.length === 0) {
      _uiElements.noSubscriptionsAvailableContainer.classList.remove('hidden');
    } else {
      _uiElements.noSubscriptionsAvailableContainer.classList.add('hidden');
    }
  }
};

const initLocationSettings = (state, saveSettingsWithDelay) => {
  const { globalEntries } = state.settings;

  // Initialize all DOM elements
  _uiElements.allowPriceRangeCheckbox = document.querySelector('#allowAddingPriceRange');
  _uiElements.allowOpenHoursCheckbox = document.querySelector('#allowAddingOpenHours');
  _uiElements.openHoursAccessSection = document.querySelector('#openHoursAccessSection');
  _uiElements.priceRangeAccessSection = document.querySelector('#priceRangeAccessSection');
  _uiElements.fieldAccessSection = document.querySelector('#fieldAccessSection');
  _uiElements.chargeContainer = document.querySelector('#chargeForAddingLocationsContainer');
  _uiElements.paymentDetailsSection = document.querySelector('#paymentDetailsSection');
  _uiElements.subscriptionOptionsSection = document.querySelector(
    '#subscriptionOptionsSection'
  );
  _uiElements.addSubscriptionBtn = document.getElementById('add-subscription-option-btn');
  _uiElements.noSubscriptionsAvailableContainer = document.getElementById(
    'noSubscriptionsAvailableContainer'
  );
  _uiElements.allowNewEntriesRadios = document.querySelectorAll(
    'input[name="allowNewEntries"]'
  );
  _uiElements.allowNewPhotosRadios = document.querySelectorAll(
    'input[name="allowNewPhotos"]'
  );
  _uiElements.allowHoursAccessRadios = document.querySelectorAll(
    'input[name="allowHoursAccess"]'
  );
  _uiElements.allowPriceRangeAccessRadios = document.querySelectorAll(
    'input[name="allowPriceRangeAccess"]'
  );
  _uiElements.allowChargingRadios = document.querySelectorAll('input[name="allowCharging"]');
  _uiElements.addingLocationsUserTags = document.querySelector('#addingLocationsUserTags');
  _uiElements.addingPhotosUserTags = document.querySelector('#addingPhotosUserTags');
  _uiElements.allowHoursAccessUserTags = document.querySelector(
    '#allowHoursAccessUserTags'
  );
  _uiElements.allowPriceRangeAccessUserTags = document.querySelector(
    '#allowPriceRangeAccessUserTags'
  );
  _uiElements.chargingUserTags = document.querySelector('#chargingUserTags');

  // Setup checkboxes
  _uiElements.allowPriceRangeCheckbox.checked = globalEntries.priceRange.inAppEnabled;
  _uiElements.allowPriceRangeCheckbox.onchange = (e) => {
    globalEntries.priceRange.inAppEnabled = e.target.checked;
    globalEntries.allowPriceRange = e.target.checked;
    updateFieldAccessVisibility();
    saveSettingsWithDelay();
  };

  _uiElements.allowOpenHoursCheckbox.checked = globalEntries.openHours.inAppEnabled;
  _uiElements.allowOpenHoursCheckbox.onchange = (e) => {
    globalEntries.openHours.inAppEnabled = e.target.checked;
    globalEntries.allowOpenHours = e.target.checked;
    updateFieldAccessVisibility();
    saveSettingsWithDelay();
  };

  const tagsInputManager = createTagsInputManager(saveSettingsWithDelay);

  // Setup radio groups
  const radioGroups = [
    {
      radios: _uiElements.allowNewEntriesRadios,
      settingsObj: globalEntries.locations,
      propName: 'allowAdding',
      tagsContainer: _uiElements.addingLocationsUserTags,
      onChangeCallback: (value) => handleLocationCreationChange(value)
    },
    {
      radios: _uiElements.allowNewPhotosRadios,
      settingsObj: globalEntries.photos,
      propName: 'allowAdding',
      tagsContainer: _uiElements.addingPhotosUserTags
    },
    {
      radios: _uiElements.allowHoursAccessRadios,
      settingsObj: globalEntries.openHours,
      propName: 'allowAdding',
      tagsContainer: _uiElements.allowHoursAccessUserTags
    },
    {
      radios: _uiElements.allowPriceRangeAccessRadios,
      settingsObj: globalEntries.priceRange,
      propName: 'allowAdding',
      tagsContainer: _uiElements.allowPriceRangeAccessUserTags
    },
    {
      radios: _uiElements.allowChargingRadios,
      settingsObj: globalEntries.charging,
      propName: 'enabled',
      tagsContainer: _uiElements.chargingUserTags,
      onChangeCallback: (value) => handleChargingChange(value)
    }
  ];

  radioGroups.forEach((config) => initRadioGroup(config, tagsInputManager, saveSettingsWithDelay));

  // Setup initial visibility
  if (_uiElements.chargeContainer) {
    if (globalEntries.locations.allowAdding === 'none') {
      _uiElements.chargeContainer.classList.add('hidden');
    } else {
      _uiElements.chargeContainer.classList.remove('hidden');
    }
  }

  handleChargingChange(globalEntries.charging.enabled);
  updateFieldAccessVisibility();

  initWysiwyg(globalEntries, saveSettingsWithDelay);

  // Fetch and init subscriptions
  fetchSubscriptions(globalEntries).then((subscriptionsList) => {
    initSubscriptionOptions(globalEntries, saveSettingsWithDelay, subscriptionsList);
  });
};

export default initLocationSettings;
