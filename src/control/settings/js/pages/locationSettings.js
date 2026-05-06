import SubscriptionOptionsListUI from '../ui/subscriptionOptionsListUI';
import Purchase from '../../../../shared/utils/purchase';
import SettingsController from '../../settings.controller';

const _uiElements = {};
let state;
let globalEntries;
let subscriptionList = [];
let globalEntrySubscriptionOptions = [];
let timeoutId;
let subscriptionsCached = false;

// ============================================================================
// CORE UTILITY
// ============================================================================

const saveSettingsWithDelay = (syncScope) => {
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    SettingsController.saveSettings(state.settings)
      .then(() => {
        if (syncScope) {
          syncWidgetWithScope(syncScope);
        } else {
          syncPaymentDetailsWithWidget();
        }
      })
      .catch(console.error);
  }, 300);
};

const initWysiwyg = () => {
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

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

const fetchSubscriptions = () => new Promise((resolve) => {
  if (!subscriptionsCached && globalEntries.charging.enabled !== 'none') {
    Purchase.getSubscriptions().then((subscriptions) => {
      subscriptionList = subscriptions || [];
      if (_uiElements.subscriptionOptionsSection) {
        _uiElements.subscriptionOptionsSection.classList.remove('hidden');
      }
      subscriptionsCached = true;
      resolve(subscriptionList);
    }).catch((error) => {
      console.error('Error fetching subscriptions:', error);
      subscriptionsCached = true;
      resolve([]);
    });
  } else {
    resolve([]);
  }
});

const isValidSubscription = (subscription) => subscription && subscription.subscriptionId;

const initGlobalEntrySubscriptionOptions = () => {
  globalEntrySubscriptionOptions = [...(globalEntries.charging.subscriptionOptions || [])];
};

const getSelectedSubscriptionIds = () => globalEntrySubscriptionOptions
  .filter(isValidSubscription)
  .map((item) => item.subscriptionId);

const getUnselectedSubscriptions = () => {
  const selectedIds = getSelectedSubscriptionIds();
  return subscriptionList.filter((sub) => !selectedIds.includes(sub.id));
};

const updateButtonState = () => {
  if (subscriptionList.length === 0) {
    _uiElements.addSubscriptionBtn.classList.add('hidden');
  } else {
    _uiElements.addSubscriptionBtn.classList.remove('hidden');
  }
  const canAddMore = globalEntrySubscriptionOptions.length < subscriptionList.length;
  _uiElements.addSubscriptionBtn.disabled = !canAddMore;
};

const updateDropdownOptions = (subscriptionOptionsList) => {
  subscriptionOptionsList.options.dropdownOptions = subscriptionList;
};

const updateNoSubscriptionsMessage = () => {
  const subscriptionOptionsContainer = document.querySelector('#subscription-options-container');
  if (_uiElements.noSubscriptionsAvailableContainer) {
    if (subscriptionList.length === 0) {
      _uiElements.noSubscriptionsAvailableContainer.classList.remove('hidden');
      if (subscriptionOptionsContainer) {
        subscriptionOptionsContainer.classList.add('hidden');
      }
    } else {
      _uiElements.noSubscriptionsAvailableContainer.classList.add('hidden');
      if (subscriptionOptionsContainer) {
        subscriptionOptionsContainer.classList.remove('hidden');
      }
    }
  }
};

const saveValidSubscriptions = (subscriptionOptionsList, isExplicitAction = false) => {
  const validSubscriptions = globalEntrySubscriptionOptions.filter(isValidSubscription);
  globalEntries.charging.subscriptionOptions = validSubscriptions;
  updateButtonState();
  updateDropdownOptions(subscriptionOptionsList);
  if (validSubscriptions.length > 0 || isExplicitAction) {
    saveSettingsWithDelay();
  }
};

const syncPaymentDetailsWithWidget = () => {
  if (buildfire && buildfire.messaging) {
    buildfire.messaging.sendMessageToWidget({
      cmd: 'sync',
      scope: 'paymentDetailsUpdated'
    });
  }
};

const syncWidgetWithScope = (scope) => {
  if (buildfire && buildfire.messaging) {
    buildfire.messaging.sendMessageToWidget({
      cmd: 'sync',
      scope
    });
  }
};

const handleSubscriptionItemDelete = (item, index, subscriptionOptionsList, callback) => {
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
        const itemIndex = globalEntrySubscriptionOptions.findIndex((i) => i.id === item.id);
        if (itemIndex > -1) {
          globalEntrySubscriptionOptions.splice(itemIndex, 1);
        }
        saveValidSubscriptions(subscriptionOptionsList, true);
        subscriptionOptionsList.init(globalEntrySubscriptionOptions);
        subscriptionOptionsList.refreshDropdownItems();
        callback(true);
      } else {
        callback(false);
      }
    }
  );
};

const handleAddSubscription = (subscriptionOptionsList) => {
  const unselectedSubscriptions = getUnselectedSubscriptions();
  if (unselectedSubscriptions.length > 0) {
    const firstAvailable = unselectedSubscriptions[0];
    const newItem = {
      id: Date.now(),
      name: '',
      description: '',
      subscriptionId: null,
      tag: '',
      type: '',
      order: globalEntrySubscriptionOptions.length,
    };
    globalEntrySubscriptionOptions.push(newItem);
    subscriptionOptionsList.addItem(newItem);
    updateButtonState();
  }
};

const handleSubscriptionItemUpdate = (item, subscriptionOptionsList) => {
  const itemIndex = globalEntrySubscriptionOptions.findIndex((i) => i.id === item.id);
  if (itemIndex > -1) {
    globalEntrySubscriptionOptions[itemIndex] = item;
  }
  if (!isValidSubscription(item)) {
    return;
  }
  saveValidSubscriptions(subscriptionOptionsList);
  subscriptionOptionsList.refreshDropdownItems();
  updateButtonState();
};

const handleSubscriptionOrderChange = (item, oldIndex, newIndex, subscriptionOptionsList) => {
  if (oldIndex > -1 && newIndex > -1) {
    const [movedItem] = globalEntrySubscriptionOptions.splice(oldIndex, 1);
    globalEntrySubscriptionOptions.splice(newIndex, 0, movedItem);
    globalEntrySubscriptionOptions.forEach((sub, idx) => {
      sub.order = idx;
    });
  }
  saveValidSubscriptions(subscriptionOptionsList, true);
  subscriptionOptionsList.refreshDropdownItems();
  updateButtonState();
};

const initSubscriptionOptions = (subscriptionsListParam) => {
  initGlobalEntrySubscriptionOptions();

  const subscriptionOptionsList = new SubscriptionOptionsListUI(
    'subscription-options-container',
    subscriptionsListParam || [],
    globalEntries
  );

  subscriptionOptionsList.onUpdateItem = (item, index) => {
    handleSubscriptionItemUpdate(item, subscriptionOptionsList);
  };

  subscriptionOptionsList.onOrderChange = (item, oldIndex, newIndex) => {
    handleSubscriptionOrderChange(item, oldIndex, newIndex, subscriptionOptionsList);
  };

  subscriptionOptionsList.onDeleteItem = (item, index, callback) => {
    handleSubscriptionItemDelete(item, index, subscriptionOptionsList, callback);
  };

  subscriptionOptionsList.init(globalEntrySubscriptionOptions);

  _uiElements.addSubscriptionBtn.onclick = () => {
    handleAddSubscription(subscriptionOptionsList);
  };

  updateButtonState();
  updateDropdownOptions(subscriptionOptionsList);
  updateNoSubscriptionsMessage();
};

const handleChargingChange = (value, shouldSave = true) => {
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
    subscriptionsCached = false;
    fetchSubscriptions().then((subscriptionsListParam) => {
      initSubscriptionOptions(subscriptionsListParam);
    });
  }
  if (shouldSave) {
    saveSettingsWithDelay();
  }
};

// ============================================================================
// LOCATION CREATION CONTROL
// ============================================================================

const handleLocationCreationChange = (value) => {
  if (_uiElements.chargeContainer) {
    _uiElements.chargeContainer.classList.remove('hidden');
    const isDisabled = value === 'none';
    Array.from(_uiElements.allowChargingRadios).forEach(radio => {
      radio.disabled = isDisabled;
    });

    if (_uiElements.enableLocationCreationMessage) {
      if (isDisabled) {
        _uiElements.enableLocationCreationMessage.classList.remove('hidden');
      } else {
        _uiElements.enableLocationCreationMessage.classList.add('hidden');
      }
    }

    if (isDisabled) {
      globalEntries.charging.enabled = 'none';
      globalEntries.charging.tags = [];
      Array.from(_uiElements.allowChargingRadios).forEach(radio => {
        if (radio.value === 'none') radio.checked = true;
      });
      if (_uiElements.paymentDetailsSection) {
        _uiElements.paymentDetailsSection.classList.add('hidden');
      }
      if (_uiElements.subscriptionOptionsSection) {
        _uiElements.subscriptionOptionsSection.classList.add('hidden');
      }
    }
  }
};

// ============================================================================
// FIELD ACCESS & PERMISSIONS
// ============================================================================

const updateFieldAccessVisibility = () => {
  const isOpenHoursEnabled = _uiElements.allowOpenHoursCheckbox.checked;
  const isPriceRangeEnabled = _uiElements.allowPriceRangeCheckbox.checked;

  if (_uiElements.openHoursAccessSection) {
    _uiElements.openHoursAccessSection.classList.remove('hidden');
    const isDisabled = !isOpenHoursEnabled;
    Array.from(_uiElements.allowHoursAccessRadios).forEach(radio => {
      radio.disabled = isDisabled;
    });
    const enableOpenHoursMessage = document.getElementById('enableOpenHoursMessage');
    if (enableOpenHoursMessage) {
      if (isDisabled) {
        enableOpenHoursMessage.classList.remove('hidden');
      } else {
        enableOpenHoursMessage.classList.add('hidden');
      }
    }
  }

  if (_uiElements.priceRangeAccessSection) {
    _uiElements.priceRangeAccessSection.classList.remove('hidden');
    const isDisabled = !isPriceRangeEnabled;
    Array.from(_uiElements.allowPriceRangeAccessRadios).forEach(radio => {
      radio.disabled = isDisabled;
    });
    const enablePriceRangeMessage = document.getElementById('enablePriceRangeMessage');
    if (enablePriceRangeMessage) {
      if (isDisabled) {
        enablePriceRangeMessage.classList.remove('hidden');
      } else {
        enablePriceRangeMessage.classList.add('hidden');
      }
    }
  }

  if (_uiElements.fieldAccessSection) {
    _uiElements.fieldAccessSection.classList.remove('hidden');
  }
};

// ============================================================================
// RADIO GROUPS & TAGS SETUP
// ============================================================================

const createTagsInputManager = () => ({
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
});

const initRadioGroup = (config, tagsInputManager) => {
  const {
    radios, settingsObj, propName, tagsContainer, onChangeCallback, syncScope
  } = config;

  if (!settingsObj[propName]) {
    settingsObj[propName] = '';
  }

  Array.from(radios).forEach((radio) => {
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

      saveSettingsWithDelay(syncScope);
    };
  });
};

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

const initLocationSettings = (stateParam) => {
  state = stateParam;
  globalEntries = state.settings.globalEntries;

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
  _uiElements.enableLocationCreationMessage = document.getElementById('enableLocationCreationMessage');

  // Setup checkboxes
  _uiElements.allowPriceRangeCheckbox.checked = globalEntries.priceRange.enabled;
  _uiElements.allowPriceRangeCheckbox.onchange = (e) => {
    globalEntries.priceRange.enabled = e.target.checked;
    if (!e.target.checked) {
      globalEntries.priceRange.inAppEnabled = 'none';
      globalEntries.priceRange.tags = [];
      Array.from(_uiElements.allowPriceRangeAccessRadios).forEach(radio => {
        if (radio.value === 'none') radio.checked = true;
      });
    }
    updateFieldAccessVisibility();
    saveSettingsWithDelay('locationSettings');
  };

  _uiElements.allowOpenHoursCheckbox.checked = globalEntries.openHours.enabled;
  _uiElements.allowOpenHoursCheckbox.onchange = (e) => {
    globalEntries.openHours.enabled = e.target.checked;
    if (!e.target.checked) {
      globalEntries.openHours.inAppEnabled = 'none';
      globalEntries.openHours.tags = [];
      Array.from(_uiElements.allowHoursAccessRadios).forEach(radio => {
        if (radio.value === 'none') radio.checked = true;
      });
    }
    updateFieldAccessVisibility();
    saveSettingsWithDelay('locationSettings');
  };

  const tagsInputManager = createTagsInputManager();

  // Setup radio groups
  const radioGroups = [
    {
      radios: _uiElements.allowNewEntriesRadios,
      settingsObj: globalEntries.locations,
      propName: 'allowAdding',
      tagsContainer: _uiElements.addingLocationsUserTags,
      onChangeCallback: (value) => handleLocationCreationChange(value),
      syncScope: 'locationSettings'
    },
    {
      radios: _uiElements.allowNewPhotosRadios,
      settingsObj: globalEntries.photos,
      propName: 'allowAdding',
      tagsContainer: _uiElements.addingPhotosUserTags,
      syncScope: 'locationSettings'
    },
    {
      radios: _uiElements.allowHoursAccessRadios,
      settingsObj: globalEntries.openHours,
      propName: 'inAppEnabled',
      tagsContainer: _uiElements.allowHoursAccessUserTags,
      syncScope: 'locationSettings'
    },
    {
      radios: _uiElements.allowPriceRangeAccessRadios,
      settingsObj: globalEntries.priceRange,
      propName: 'inAppEnabled',
      tagsContainer: _uiElements.allowPriceRangeAccessUserTags,
      syncScope: 'locationSettings'
    },
    {
      radios: _uiElements.allowChargingRadios,
      settingsObj: globalEntries.charging,
      propName: 'enabled',
      tagsContainer: _uiElements.chargingUserTags,
      onChangeCallback: (value) => handleChargingChange(value),
      syncScope: 'charging'
    }
  ];

  radioGroups.forEach((config) => initRadioGroup(config, tagsInputManager));

  // Setup initial visibility
  if (_uiElements.chargeContainer) {
    _uiElements.chargeContainer.classList.remove('hidden');
    const isLocationCreationDisabled = globalEntries.locations.allowAdding === 'none';
    Array.from(_uiElements.allowChargingRadios).forEach(radio => {
      radio.disabled = isLocationCreationDisabled;
    });
    if (_uiElements.enableLocationCreationMessage) {
      if (isLocationCreationDisabled) {
        _uiElements.enableLocationCreationMessage.classList.remove('hidden');
      } else {
        _uiElements.enableLocationCreationMessage.classList.add('hidden');
      }
    }
  }

  handleChargingChange(globalEntries.charging.enabled, false);
  updateFieldAccessVisibility();

  initWysiwyg();

  // Fetch and init subscriptions
  fetchSubscriptions().then((subscriptionsListParam) => {
    initSubscriptionOptions(subscriptionsListParam);
  });
};

export default initLocationSettings;
