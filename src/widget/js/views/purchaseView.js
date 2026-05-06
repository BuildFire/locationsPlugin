import state from '../state';
import views from '../Views';
import { navigateTo, showElement } from '../util/ui'
import { addBreadcrumb } from '../util/helpers';
import Purchase from '../../../shared/utils/purchase';

const renderChargingDescription = () => {
  const descriptionElement = document.querySelector(
    '#purchase #chargingDescription'
  );
  if (descriptionElement && state.settings.globalEntries.charging.description) {
    descriptionElement.innerHTML = state.settings.globalEntries.charging
      .description;
  }
};

const renderSubscriptionsCarousel = (carouselElement, onSubscriptionClick) => {
  if (!carouselElement) return;

  Purchase.getSubscriptions().then((availableSubscriptions) => {
    const subscriptionOptions = state.settings.globalEntries.charging.subscriptionOptions || [];

    if (!availableSubscriptions || availableSubscriptions.length === 0
        || subscriptionOptions.length === 0) {
      carouselElement.innerHTML = '';
      return;
    }

    const isValidOption = (option) => availableSubscriptions.some(
      (sub) => sub.id === option.subscriptionId
    );
    const validSubscriptions = subscriptionOptions.filter(isValidOption);

    carouselElement.innerHTML = '';
    validSubscriptions.forEach((subscription) => {
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'bf-carousel-item-wrapper';
      itemWrapper.id = `subscription-${subscription.subscriptionId}`;

      const link = document.createElement('a');
      link.className = 'bf-carousel-item btn-primary';
      link.role = 'button';
      link.tabIndex = 0;
      link.addEventListener('click', () => onSubscriptionClick(subscription.subscriptionId));

      const callout = document.createElement('span');
      callout.className = 'callout';
      callout.innerHTML = '';

      const defaultSubscription = availableSubscriptions.find(
        (sub) => sub.id === subscription.subscriptionId
      );

      const titles = document.createElement('div');
      titles.className = 'titles';

      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = subscription.name || defaultSubscription?.name || '';

      const subtitle = document.createElement('span');
      subtitle.className = 'subtitle';
      subtitle.innerHTML = subscription.description;

      titles.appendChild(title);
      titles.appendChild(subtitle);

      const descriptionWrapper = document.createElement('span');
      descriptionWrapper.className = 'description-wrapper';

      const description = document.createElement('span');
      description.className = 'description';
      description.textContent = '';

      descriptionWrapper.appendChild(description);

      link.appendChild(callout);
      link.appendChild(titles);
      link.appendChild(descriptionWrapper);
      itemWrapper.appendChild(link);
      carouselElement.appendChild(itemWrapper);
    });
  }).catch((error) => {
    console.error('Error rendering subscriptions:', error);
  });
};

const setupPurchaseListener = () => {
  Purchase.onPurchaseResult((product) => {
    if (product.result === 'success') {
      buildfire.dialog.toast({
        message: window.strings.get('general.purchaseSuccessful').v,
        type: 'success'
      });
      buildfire.history.pop();
    } else if (product.result === 'canceled') {
      buildfire.dialog.toast({
        message: window.strings.get('general.purchaseCancelled').v,
        type: 'warning'
      });
    } else if (product.result === 'failed') {
      buildfire.dialog.toast({
        message: window.strings.get('general.genericError').v,
        type: 'danger'
      });
    }
  });
};

const handleSubscriptionClick = (subscriptionId) => {
  if (buildfire.getContext().device.platform === 'web') {
    buildfire.dialog.toast({
      message: window.strings.get('general.pwaUnsupported').v,
      type: 'danger'
    });
    return;
  }

  buildfire.spinner.show();
  Purchase.purchase(subscriptionId,
    (err, result) => {
      buildfire.spinner.hide();
      if (err) {
        console.error('Error initiating purchase:', err);
        buildfire.dialog.toast({
          message: window.strings.get('general.genericError').v,
          type: 'danger'
        });
        return;
      }
    });
};

const renderSubscriptions = () => {
  const carousel = document.querySelector('#subscriptionsCarousel');
  renderSubscriptionsCarousel(carousel, handleSubscriptionClick);
};

export default {
  navigateTo() {
    views.fetch('purchase').then(() => {
      navigateTo('purchase');
      showElement('#purchase', true);
      addBreadcrumb({ pageName: 'purchase', title: 'Purchase' });
      views.inject('purchase');
      renderChargingDescription();
      setupPurchaseListener();
      renderSubscriptions();
    });
  }
};

export { renderSubscriptionsCarousel };
