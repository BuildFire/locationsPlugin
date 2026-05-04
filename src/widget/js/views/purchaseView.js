import state from '../state';
import views from '../Views';
import { navigateTo } from '../util/ui';
import Purchase from '../../../shared/utils/purchase';
import UserPurchases from '../global/repository/UserPurchases';
import UserPurchase from '../global/data/UserPurchase';

const renderChargingDescription = () => {
  const descriptionElement = document.querySelector(
    '#purchase #chargingDescription'
  );
  if (descriptionElement && state.settings.globalEntries.charging.description) {
    descriptionElement.innerHTML = state.settings.globalEntries.charging
      .description;
  }
};

const setupPurchaseListener = () => {
  Purchase.onPurchaseResult((product) => {
    console.log(`Purchase result for ${product.type}: ${product.productId}. Order was ${product.result}`);
    if (product.result === 'completed') {
      const userPurchase = new UserPurchase({
        purchase: [{ productId: product.productId, type: product.type }]
      });
      UserPurchases.save(userPurchase)
        .then(() => {
          buildfire.dialog.toast({
            message: 'Congratulations! You can add a location now.',
            type: 'success'
          });
          buildfire.history.pop();
        })
        .catch((error) => {
          console.error('Error saving purchase:', error);
          buildfire.dialog.toast({
            message: 'Error saving purchase. Please try again.',
            type: 'danger'
          });
        });
    }
  });
};

const handleSubscriptionClick = (subscriptionId) => {
  Purchase.purchase(subscriptionId)
    .then((result) => {
      console.log('Purchase request result', result);
    })
    .catch((error) => {
      console.error('Error initiating purchase:', error);
      buildfire.dialog.toast({
        message: 'Error initiating purchase. Please try again.',
        type: 'danger'
      });
    });
};

const renderSubscriptions = () => {
  Purchase.getSubscriptions().then((availableSubscriptions) => {
    const subscriptionOptions = state.settings.globalEntries.charging.subscriptionOptions || [];

    if (!availableSubscriptions || availableSubscriptions.length === 0
        || subscriptionOptions.length === 0) {
      return;
    }

    // Filter subscriptionOptions to only include those that exist in availableSubscriptions
    const isValidOption = (option) => availableSubscriptions.some(
      (sub) => sub.id === option.subscriptionId
    );
    const validSubscriptions = subscriptionOptions.filter(isValidOption);

    const carousel = document.querySelector('#subscriptionsCarousel');
    if (!carousel) return;

    validSubscriptions.forEach((subscription) => {
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'bf-carousel-item-wrapper';
      itemWrapper.id = `subscription-${subscription.subscriptionId}`;

      const link = document.createElement('a');
      link.className = 'bf-carousel-item btn-primary';
      link.role = 'button';
      link.tabIndex = 0;
      link.addEventListener('click', () => handleSubscriptionClick(subscription.subscriptionId));
      const callout = document.createElement('span');
      callout.className = 'callout';
      callout.style.color = '#ffffff !important';
      callout.textContent = subscription.name || '';

      const titles = document.createElement('div');
      titles.className = 'titles';

      const title = document.createElement('span');
      title.className = 'title';
      title.style.color = '#ffffff !important';
      title.textContent = subscription.name || '';

      const subtitle = document.createElement('span');
      subtitle.className = 'subtitle';
      subtitle.style.color = '#ffffff !important';
      subtitle.textContent = subscription.tag || '';

      titles.appendChild(title);
      titles.appendChild(subtitle);

      const descriptionWrapper = document.createElement('span');
      descriptionWrapper.className = 'description-wrapper';

      const description = document.createElement('span');
      description.className = 'description';
      description.style.color = '#ffffff !important';
      description.textContent = subscription.description || '';

      descriptionWrapper.appendChild(description);

      link.appendChild(callout);
      link.appendChild(titles);
      link.appendChild(descriptionWrapper);
      itemWrapper.appendChild(link);
      carousel.appendChild(itemWrapper);
    });
  }).catch((error) => {
    console.error('Error rendering subscriptions:', error);
  });
};

export default {
  navigateTo() {
    views.fetch('purchase').then(() => {
      navigateTo('purchase');
      views.inject('purchase');
      renderChargingDescription();
      setupPurchaseListener();
      renderSubscriptions();
    });
  }
};
