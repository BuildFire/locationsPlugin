import Analytics from '../../../utils/analytics';
import editView from './editView';
import state from '../state';
import { shareLocation, bookmarkLocation, getActiveTemplate } from '../util/helpers';
import accessManager from '../accessManager';
import reportAbuse from '../reportAbuse';

export default {
  handleLocationDetailDrawerClick(err, result) {
    if (err) return console.error(err);
    buildfire.components.drawer.closeDrawer();
    switch (result.name) {
      case 'reportAbuse':
        reportAbuse.report({ id: state.selectedLocation.id, createdBy: state.selectedLocation.createdBy._id });
        break;
      case 'share':
        shareLocation();
        break;
      case 'edit':
        Analytics.inAppEditUsed();
        editView.init();
        break;
      case 'addPhotos':
        // todo handle adding photos
        break;
      case 'bookmark':
        bookmarkLocation(state.selectedLocation.id);
        break;
      default:
        console.error('unhandled action ', result.name);
    }
  },
  getEnabledActions() {
    const { bookmarks } = state.settings;
    const { selectedLocation } = state;

    const actions = [
      {
        text: window.strings?.get('details.reportAbuse')?.v,
        name: 'reportAbuse',
        order: 0,
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon mdc-theme--text-icon-on-background pointer',
        textContent: 'report',
        id: 'reportAbuseBtn',
      },
      {
        text: window.strings?.get('details.share')?.v,
        name: 'share',
        order: 1,
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer mdc-theme--text-icon-on-background',
        textContent: 'share',
        id: 'shareLocationBtn',
      },
    ];

    if (selectedLocation.id && accessManager.canEditLocations()) {
      actions.push({
        text: window.strings?.get('details.edit')?.v,
        name: 'edit',
        order: 2,
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon mdc-theme--text-icon-on-background pointer',
        textContent: 'edit',
        id: 'editLocationBtn',
      });
    } else if (accessManager.canAddLocationPhotos()) {
      actions.push({
        text: window.strings?.get('details.addPhotos')?.v,
        name: 'addPhotos',
        order: 2,
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon mdc-theme--text-icon-on-background pointer',
        textContent: 'add_to_photos',
        id: 'addPhotosBtn',
      });
    }

    if (bookmarks.enabled && bookmarks.allowForLocations) {
      actions.push({
        text: window.strings?.get('details.bookmark')?.v,
        name: 'bookmark',
        order: 2,
        classNames: 'material-icons-outlined mdc-text-field__icon margin-left-fifteen mdc-theme--text-icon-on-background pointer',
        textContent: 'star_outline',
        id: 'bookmarkLocationBtn',
      });
    }

    return actions;
  },
  renderLocationActions() {
    const { bookmarks } = state.settings;
    const isTopMapPosition = state.settings.design.detailsMapPosition === 'top';
    const { selectedLocation } = state;
    const isLocationBookmarked = state.bookmarks.find((l) => l.id === selectedLocation.clientId);
    const bookmarkLocationBtn = document.querySelector('#bookmarkLocationBtn');
    const actionsContainer = document.querySelector(
      isTopMapPosition ? '.location-detail__top-header-icons' : '.location-detail__cover'
    );

    const actions = this.getEnabledActions();

    if (actions.length > 3) {
      const i = document.createElement('i');
      i.textContent = 'more_horiz';
      i.className = 'icon-1 material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background pointer';
      i.tabIndex = '0';
      i.role = 'button';
      i.id = 'moreOptionsBtn';
      actionsContainer.appendChild(i);
    } else {
      actions.forEach((action) => {
        const i = document.createElement('i');
        i.textContent = action.textContent;
        i.className = `${action.classNames} icon-${action.order}`;
        i.tabIndex = '0';
        i.role = 'button';
        i.id = action.id;
        actionsContainer.appendChild(i);
      });

      if (bookmarks.enabled && bookmarks.allowForLocations && isLocationBookmarked) {
        bookmarkLocationBtn.textContent = 'star';
      }
    }
  },
};
