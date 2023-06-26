import { getActiveTemplate, showToastMessage } from './util/helpers';
import widgetController from '../widget.controller';
import introView from './views/introView';
import state from './state';
import mapView from './views/mapView';

export default {
  _removeLocationFromUI(locationId) {
    const activeTemplate = getActiveTemplate();
    const locationIndex = state.listLocations.findIndex((location) => location.id === locationId);
    const pinnedLocationIndex = state.pinnedLocations.findIndex((location) => location.id === locationId);

    if (locationIndex > -1) state.listLocations.splice(locationIndex, 1);
    if (pinnedLocationIndex > -1) state.pinnedLocations.splice(pinnedLocationIndex, 1);

    if (activeTemplate === 'intro') {
      introView.clearIntroViewList();
      introView.renderIntroductoryLocations(state.listLocations, true);
      introView.refreshIntroductoryCarousel();
    } else {
      mapView.clearMapViewList();
      mapView.renderListingLocations(state.listLocations);
    }
  },
  _handleLocationDeletion(locationId) {
    return widgetController.deleteLocation(locationId)
      .then(() => {
        this._removeLocationFromUI(locationId);
        buildfire.bookmarks.getAll((err, bookmarks) => {
          if (err) return console.error(err);
          const bookmarkExists = bookmarks.find((el) => el.payload.locationId === locationId);
          if (bookmarkExists) buildfire.bookmarks.delete(bookmarkExists.id);
        });
        buildfire.history.pop();
      })
      .catch((err) => {
        console.error(err);
      });
  },
  init() {
    buildfire.services.reportAbuse.triggerWidgetReadyForAdminResponse();
    buildfire.services.reportAbuse.onAdminResponse((event) => {
      if (event.report.data.itemType !== 'Subject') return;
      const triggerResponse = () => {
        buildfire.services.reportAbuse.triggerOnAdminResponseHandled({ reportId: event.report.id });
      };

      if (event.action === 'markAbuse') {
        this._handleLocationDeletion(event.report.data.itemId).then(triggerResponse);
      } else {
        triggerResponse();
      }
    }, true);
  },
  report({ createdBy, id }) {
    const payload = {
      itemId: id,
      reportedUserId: createdBy,
      deeplink: {
        type: 'reportAbuse',
        locationId: id,
      },
      itemType: 'Subject',
    };

    buildfire.services.reportAbuse.report(
      payload,
      (err, result) => {
        if (err) {
          if (typeof err === 'string' && err === 'This item is already reported!') {
            showToastMessage('alreadyReported');
          }
          console.warn(err);
        }
        if (result) showToastMessage('reportedSuccessfully');
      }
    );
  },
};
