import buildfire from 'buildfire';
import WidgetController from './widget.controller';
import Accordion from './js/Accordion';
import authManager from '../UserAccessControl/authManager';

// todo tmp
import Settings from '../entities/Settings';
import DataMocks from '../DataMocks';

const settings = new Settings().toJSON();
console.log('current settings...', settings);

const inst = DataMocks.generate('LOCATION')[0];

// if (templateSection.childNodes.length === 0) {
//   injectTemplate(template);
// }

let CATEGORIES;
let userPosition;
let introductoryLocations = [];
let introductoryLocationsCount = 0;
let introductoryLocationsPending = false;
let currentIntroductoryPage = 0;
let filterElements = {};
let selectedLocation = {
  "id": null,
  "title": "Hacı Steakhouse",
  "subtitle": "The best burger in town",
  "pinIndex": null,
  "address": "Melikgazi/Kayseri, Turkey",
  "formattedAddress": "Melikgazi/Kayseri, Turkey",
  "addressAlias": "Haci Alias",
  "coordinates": {
    "lat": 38.7511567,
    "lng": 35.6969984
  },
  "marker": {
    "type": "pin",
    "image": null,
    "color": null,
    "base64Image": null
  },
  "categories": {
    "main": [
      "61b078405f30d606222ffb54"
    ],
    "subcategories": [
      "f40285cc-c46c-4d3c-b971-34479c88d2bd",
      "7e0f2288-2298-4892-8706-b685c5bb3fce"
    ]
  },
  "settings": {
    "showCategory": true,
    "showOpeningHours": false,
    "showPriceRange": true,
    "showStarRating": true,
    "allowChat": true
  },
  "openingHours": {
    "timezone": null,
    "days": {
      "monday": {
        "index": 0,
        "active": true,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          }
        ]
      },
      "tuesday": {
        "index": 1,
        "active": true,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          },
          {
            "from": "13:00",
            "to": "19:00"
          },
          {
            "from": "20:00",
            "to": "22:00"
          }
        ]
      },
      "wednesday": {
        "index": 2,
        "active": true,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          }
        ]
      },
      "thursday": {
        "index": 3,
        "active": true,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          }
        ]
      },
      "friday": {
        "index": 4,
        "active": true,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          }
        ]
      },
      "saturday": {
        "index": 5,
        "active": true,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          }
        ]
      },
      "sunday": {
        "index": 6,
        "active": false,
        "intervals": [
          {
            "from": "09:00",
            "to": "12:30"
          }
        ]
      }
    }
  },
  "images": [
    {
      "id": "1e4ec407-da35-49b9-8008-bd8f5be6f9a7",
      "imageUrl": "https://images.unsplash.com/photo-1554919428-20d72fa44a99?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8Mnx8YnVyZ2VyJTIwcmVzdGF1cmFudHxlbnwwfHx8fDE2Mzg5NTYwNDk&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "63382c21-41d5-48c7-bacd-9fc61baf5ab8",
      "imageUrl": "https://images.unsplash.com/photo-1541557435984-1c79685a082b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8NHx8YnVyZ2VyJTIwcmVzdGF1cmFudHxlbnwwfHx8fDE2Mzg5NTYwNDk&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "2c80db58-abf2-4cd4-9a24-9a5db610ee73",
      "imageUrl": "https://images.unsplash.com/photo-1632577237955-f73cb2a054ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8MjR8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDQ5&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "6d4cf478-2de7-41ce-a3d5-8b29acaf8f79",
      "imageUrl": "https://images.unsplash.com/photo-1618538701087-fb7e0312de34?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8Mjh8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDQ5&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "3cf536e9-618e-470c-b004-e484a7423748",
      "imageUrl": "https://images.unsplash.com/photo-1530524428108-f983ca74ad0f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8MzN8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDU2&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "a9cfa2fc-0d08-4c03-b3f6-a04357cc1dc6",
      "imageUrl": "https://images.unsplash.com/photo-1552604617-eea98aa27234?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8NDB8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDU2&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "b79b183b-b723-4b2c-9d3a-c0a2a377c47e",
      "imageUrl": "https://images.unsplash.com/photo-1600891964923-c75689eb86d0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8NDh8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDU2&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "ce7f2d42-72eb-4fc7-98d8-3ea5bcc54275",
      "imageUrl": "https://images.unsplash.com/photo-1468071174046-657d9d351a40?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8NTF8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDU2&ixlib=rb-1.2.1&q=80&w=1080"
    },
    {
      "id": "ead6b993-223c-4c15-a181-c03aec554349",
      "imageUrl": "https://images.unsplash.com/photo-1503022065603-daff0ed8a64a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8NjZ8fGJ1cmdlciUyMHJlc3RhdXJhbnR8ZW58MHx8fHwxNjM4OTU2MDYz&ixlib=rb-1.2.1&q=80&w=1080"
    }
  ],
  "listImage": "https://images.unsplash.com/photo-1582196016295-f8c8bd4b3a99?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=Mnw0NDA1fDB8MXxzZWFyY2h8MTl8fGJ1cmdlcnxlbnwwfHx8fDE2Mzg5NTYwMzM&ixlib=rb-1.2.1&q=80&w=1080",
  "description": "<div>\n<p><strong>Lorem Ipsum</strong>&nbsp;is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>\n</div>\n<div>&nbsp;</div>",
  "owner": {
    "userId": "61241b2ddec0be058398daed",
    "firstName": "Nour",
    "lastName": "Rizik",
    "displayName": "Nour",
    "username": "nrizik@madaincorp.com",
    "isActive": true,
    "userProfile": {
      "address": {
        "customFields": {}
      },
      "bio": "test",
      "birthDate": "1993-02-01T22:00:00.000Z",
      "tel": "0799998898"
    },
    "imageUrl": "https://s3.amazonaws.com/Kaleo.DevBucket/80wjgOipA9j6FK0HK8R3FmEo.jpg"
  },
  "views": 0,
  "price": {
    "range": "3",
    "currency": "€"
  },
  "rating": {
    "total": 0,
    "count": 0,
    "average": 0
  },
  "bookmarksCount": 0,
  "actionItems": [
    {
      "title": "SEND SMS",
      "action": "sendSms",
      "phoneNumber": "00962799556565",
      "id": "6c4ac807-4781-460b-b8b2-7dd49e31dc2f"
    },
    {
      "title": "CALL",
      "action": "callNumber",
      "phoneNumber": "00962799556565",
      "id": "3c3b0984-3429-4684-be33-b0e88dce9bed"
    },
    {
      "title": "INSTAGRAM",
      "action": "linkToSocialInstagram",
      "url": "https://www.instagram.com",
      "id": "e5993bdb-dda3-403d-9a62-ee1e5aec18d6"
    }
  ],
  "createdOn": "2021-12-08T09:37:22.077Z",
  "createdBy": {
    "_id": "60a160faeb40095b7c9cf66d",
    "createdOn": "2021-05-16T18:14:18.067Z",
    "isActive": true,
    "failedAttemptCount": 0,
    "imageUrl": "https://s3.amazonaws.com/Kaleo.DevBucket/FiNyY29zRryOi92zpeYesJLo.jpeg",
    "lastAccess": "2021-12-07T22:39:33.282Z",
    "displayName": null,
    "username": "iseenoob@outlook.com",
    "email": "iseenoob@outlook.com",
    "lastUpdated": "2021-10-10T20:52:39.428Z",
    "lastUsedIPAddress": "172.30.2.72, 35.153.57.200",
    "loginProviderType": "KAuth",
    "userProfile": {},
    "accessToken": "3kq8UbiqIPCRtm97P+aQwtrDqJdJoWorhLVVXXErxNA=",
    "accessTokenExpiresIn": "2023-05-16T00:00:00.000Z",
    "userToken": "90WIHhNp2pTkdcX5fqnx2O9RNZWClnly8g4drBKxbVo=",
    "_cpUser": {
      "userId": 484322,
      "username": "iseenoob@outlook.com",
      "loginMethod": "std",
      "isActive": 1,
      "isValidEmail": 1,
      "firstName": "Mahmoud",
      "lastName": "AlSharif",
      "userToken": "60a160faeb40095b7c9cf66d",
      "lastUpdatedOn": null,
      "lastUpdatedBy": null,
      "createdOn": "2021-05-16T18:14:18.000Z",
      "createdBy": null,
      "deletedOn": null,
      "deletedBy": null,
      "auth": "b4bda29655802ee20bf3bfec716bb2ea8b756feefe09b12982fd334491978774e69b1613f3f624f5deb33b6273e614227e01478bbbc810cf3dacc5a8461751e631bc2cf3b055dd5417cbe6274a258a4fb30e53a4bdcac2d7e736b3c0459b64901173005131199dfbbe5a3eded87afdc90d8a6ba0b12ba4fe03a4a3030724391cc6be4120",
      "whitelabelId": ""
    }
  },
  "lastUpdatedOn": "2021-12-08T09:29:48.537Z",
  "lastUpdatedBy": null,
  "deletedOn": null,
  "deletedBy": null,
  "isActive": 1,
  "_buildfire": {
    "index": {
      "string1": "hacı steakhouse",
      "date1": "2021-12-08T09:37:22.077Z",
      "array1": [
        {
          "string1": "c_61b078405f30d606222ffb54"
        },
        {
          "string1": "s_f40285cc-c46c-4d3c-b971-34479c88d2bd"
        },
        {
          "string1": "s_7e0f2288-2298-4892-8706-b685c5bb3fce"
        },
        {
          "string1": "v_0"
        },
        {
          "string1": "pr_3"
        }
      ],
      "number1": null
    },
    "geo": {
      "type": "Point",
      "coordinates": [
        35.6969984,
        38.7511567
      ]
    }
  }
};

// todo to be removed
const testingFn = () => {
  settings.showIntroductoryListView = true;
  settings.design.listViewStyle = 'image';
  if (settings.introductoryListView.images.length === 0) {
    settings.introductoryListView.images = [
      {
        iconUrl: "https://placeimg.com/800/400",
      },
      {
        iconUrl: "https://placeimg.com/800/400",
      },
      {
        iconUrl: "https://placeimg.com/800/400",
      },
    ];
  }

  if (!settings.introductoryListView.description) {
    settings.introductoryListView.description = '<h2 style="text-align: center;">Introduction to TinyMCE!</h2>';
  }
};

testingFn();

const templates = {};

/** template management start */
const injectTemplate = (template) => {
  if (!templates[template]) {
    console.warn(`template ${template} not found.`);
    return;
  }
  const createTemplate = document.importNode(templates[template].querySelector('template').content, true);
  document.querySelector(`#${template}`).appendChild(createTemplate);
};

const fetchTemplate = (template, done) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    return done();
  }

  const xhr = new XMLHttpRequest();
  xhr.onload = () => {
    const content = xhr.responseText;
    templates[template] = new DOMParser().parseFromString(content, 'text/html');
    done(template);
  };
  xhr.onerror = () => {
    console.error(`fetching template ${template} failed.`);
  };
  xhr.open('GET', `./templates/${template}.html`);
  xhr.send(null);
};
/** template management end */

const searchLocations = () => {
  console.log('search Locations triggered')
};

/** ui helpers start */
const showElement = (selector) => {
  let element = selector;
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }

  if (!element || !(element instanceof Element) || !element.style) {
    console.warn(`invalid selector ${selector}.`);
  } else {
    element.style.display = 'block';
  }
};
const hideElement = (selector) => {
  let element = selector;
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }

  if (!element || !(element instanceof Element) || !element.style) {
    console.warn(`invalid selector ${selector}.`);
  } else {
    element.style.display = 'none';
  }
};
/** ui helpers end */

const fetchSettings = (callback) => {
  setTimeout(() => {
    callback();
  }, 500);
};

const fetchCategories = (done) => {
  WidgetController
    .searchCategories({
      sort: { title: -1 }
    })
    .then((result) => {
      // todo make sure data is parsed correctly
      CATEGORIES = result;
      done();
    })
    .catch((err) => {
      console.error('search error: ', err);
    });
};

const renderIntroductoryLocations = (list) => {
  const container = document.querySelector('#introLocationsList');
  const content = list.map((n) => (`<div class="mdc-ripple-surface pointer location-item" data-id=${n.id}>
        <div class="d-flex">
          <img src=${n.listImage} alt="Location image">
          <div class="location-item__description">
            <p class="mdc-theme--text-header">${n.title}</p>
            <p class="mdc-theme--text-body text-truncate">${n.subtitle}</p>
            <p class="mdc-theme--text-body text-truncate">${n.address}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            <p class="mdc-theme--text-body">${n.distance ? n.distance : '--'}</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">

         ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip list-action-item" role="row" data-action-id="${a.id}">
              <div class="mdc-chip__ripple"></div>
              <span role="gridcell">
                  <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                    <span class="mdc-chip__text">${a.title}</span>
                  </span>
                </span>
            </div>`).join('\n')}
         ${n.actionItems.length > 3 ? '<span style="align-self: center; padding: 4px;">...</span>' : ''}
        </div>
      </div>`)).join('\n');
  container.insertAdjacentHTML('beforeend', content);
};
const renderListingLocations = () => {
  const container = document.querySelector('#listingLocationsList');

  if (settings.design.listViewStyle === 'image') {
    container.innerHTML = introductoryLocations.map((n) => (`<div class="mdc-ripple-surface pointer location-image-item" style="background-image: linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(https://placeimg.com/800/400);">
            <div class="location-image-item__header">
              <p>1 mi</p>
              <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button">star_outline</i>
            </div>
            <div class="location-image-item__body">
              <p class="margin-bottom-five">${n.subtitle}</p>
              <p class="margin-top-zero">Category | Subcategory</p>
              <p>
                <span>${n.subtitle}</span>
                <span>$$$</span>
              </p>
            </div>
            <div class="mdc-chip-set" role="grid">
              <div class="mdc-chip" role="row">
                <div class="mdc-chip__ripple"></div>
                <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Send Email</span>
                </span>
              </span>
              </div>
              <div class="mdc-chip" role="row">
                <div class="mdc-chip__ripple"></div>
                <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Call</span>
                </span>
              </span>
              </div>
              <div class="mdc-chip" role="row">
                <div class="mdc-chip__ripple"></div>
                <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Reservation</span>
                </span>
              </span>
              </div>
            </div>
          </div>
`)).join('\n');
  } else {
    container.innerHTML = introductoryLocations.map((n) => (`<div class="mdc-ripple-surface pointer location-item">
        <div class="d-flex">
          <img src="https://placekitten.com/200/300" alt="Location image">
          <div class="location-item__description">
            <p>${n.title}</p>
            <p class="mdc-theme--text-body">${n.subtitle}</p>
            <p class="mdc-theme--text-body">${n.address}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button">star_outline</i>
            <p class="mdc-theme--text-body">1 mi</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Call</span>
                </span>
              </span>
          </div>
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Send Email</span>
                </span>
              </span>
          </div>
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Reservation</span>
                </span>
              </span>
          </div>
        </div>
      </div>`)).join('\n');
  }
};

const fetchIntroductoryLocations = (done) => {
  introductoryLocationsPending = true;
  WidgetController
    .searchLocations({ page: currentIntroductoryPage })
    .then((response) => {
      introductoryLocations = introductoryLocations.concat(response.result.map((r) => ({ ...r, ...{ distance: calculateLocationDistance(r.coordinates) } })));
      introductoryLocationsCount = response.totalRecord;
      introductoryLocationsPending = false;
      done(null, response.result);
    })
    .catch((err) => {
      console.error('search error: ', err);
    });
};

const refreshQuickFilter = () => {
  const quickFilterItems = CATEGORIES.slice(0, 10);
  const container = document.querySelector('.header-qf');
  const advancedFilterBtn = document.querySelector('#filterIconBtn');

  if (quickFilterItems.length === 0) {
    container.innerHTML = '<small class="mdc-theme--text-body d-block text-center margin-top-five margin-bottom-five">No Categories Added</small>';
    advancedFilterBtn.classList.add('disabled');
    return;
  }

  container.innerHTML = quickFilterItems.map((n) => `<div class="mdc-chip" role="row">
        <div class="mdc-chip__ripple"></div>
        <i class="material-icons-outlined mdc-chip__icon mdc-chip__icon--leading">fmd_good</i>
        <span class="mdc-chip__checkmark"> <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
          <path class="mdc-chip__checkmark-path" fill="none" stroke="black" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
        </span>
        <span role="gridcell">
          <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
            <span class="mdc-chip__text">${n.title}</span>
          </span>
        </span>
      </div>`).join('\n');
  const chipSets = document.querySelectorAll('#home .mdc-chip-set');
  Array.from(chipSets).forEach((c) => new mdc.chips.MDCChipSet(c));
};

const refreshIntroductoryDescription = () => {
  if (settings.introductoryListView.description) {
    const container = document.querySelector('.intro-details');
    container.innerHTML = `<h2 style="text-align: center;">Introduction to TinyMCE!</h2>`;
  }
};

const refreshIntroductoryCarousel = () => {
  const { introductoryListView } = settings;
  if (introductoryListView.images.length > 0) {
    const carousel = new buildfire.components.carousel.view('.carousel');
    const carouselItems = introductoryListView.images;
    carousel.loadItems(carouselItems);
  }
};

const toggleFilterOverlay = () => {
  const filterOverlay = document.querySelector('section#filter');
  const homeView = document.querySelector('section#home');

  if (filterOverlay.classList.contains('overlay')) {
    homeView.classList.add('active');
    filterOverlay.classList.remove('overlay');
  } else {
    filterOverlay.classList.add('overlay');
    homeView.classList.remove('active');
    buildfire.history.push('Advanced Filter', {
      showLabelInTitlebar: true
    });
  }
};
const toggleDropdownMenu = (element) => {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  const menu = new mdc.menu.MDCMenu(element);
  menu.open = true;
};

const initDrawer = () => {
  const element = document.querySelector('.drawer');
  const resizer = document.querySelector('.drawer .resizer');
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const lowerMargin = 100;
  const upperMargin = 125;
  let originalHeight = 0;
  let originalY = 0;
  let originalMouseY = 0;

  const resize = (e) => {
    const height = originalHeight - (e.pageY - originalMouseY);
    if (height > lowerMargin && height < (screenHeight - upperMargin)) {
      console.log('resize called in if');
      element.style.height = `${height}px`;
      element.style.top = `${originalY + (e.pageY - originalMouseY)}px`;
    }
  };
  const stopResize = () => {
    document.removeEventListener('mousemove', resize);
  };
  const stopTouchResize = () => {
    document.removeEventListener('touchmove', resize);
  };

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  });

  resizer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY;
    document.addEventListener('touchmove', resize);
    document.addEventListener('touchend', stopTouchResize);
  });
};
const transformCategories = (categories) => {
  const subCategories = CATEGORIES.map((cat) => cat.subcategories).flat();
  const mainCategoriesTitles = categories.main.map((c) => CATEGORIES.find((p) => p.id === c).title);
  const subCategoriesTitles = categories.subcategories.map((c) => subCategories.find((p) => p.id === c).title);
  return mainCategoriesTitles.length > 1
    ? categories.main.join(', ')
    : `${mainCategoriesTitles[0]} | ${subCategoriesTitles.join(', ')}`;
};
const showLocationDetail = () => {
  fetchTemplate('detail', () => {
    injectTemplate('detail');
    const currentActive = document.querySelector('section.active');
    currentActive.classList.remove('active');
    document.querySelector('section#detail').classList.add('active');
    const container = document.querySelector('.location-detail__carousel');

    const locationTitleElement = document.querySelector('.location-detail__top-header h1');
    const locationSubtitleElement = document.querySelector('.location-detail__top-header h5');
    const locationCategoriesElement = document.querySelector('.location-detail__top-subtitle p');
    const locationAddressElement = document.querySelector('.location-detail__address p:first-child');
    const locationDistanceElement = document.querySelector('.location-detail__address p:last-child');

    locationTitleElement.textContent = selectedLocation.title;
    locationSubtitleElement.textContent = selectedLocation.subtitle;
    locationCategoriesElement.textContent = transformCategories(selectedLocation.categories);
    locationAddressElement.textContent = selectedLocation.formattedAddress;
    locationDistanceElement.childNodes[0].nodeValue = calculateLocationDistance(selectedLocation.coordinates)

    container.innerHTML = selectedLocation.images.map((n) => `<div style="background-image: url(${n.imageUrl});" data-id="${n.id}"></div>`).join('\n');
    buildfire.components.ratingSystem.injectRatings();
    buildfire.history.push('Location Detail', {
      showLabelInTitlebar: true
    });
    const detailMap = new google.maps.Map(document.querySelector('.location-detail__map--top-view'), {
      mapTypeControl: true,
      disableDefaultUI: true,
      center: { lat: selectedLocation.coordinates.lat, lng: selectedLocation.coordinates.lng },
      zoom: 14,
    });
    navigateTo('detail');
  });
};
const showWorkingHoursDrawer = () => {
  const { days } = selectedLocation.openingHours;
  buildfire.components.drawer.open(
    {
      header: 'Open Hours',
      content: `<table style="width: 100%;border-collapse: separate;border-spacing: 10px; border: none;">
      ${Object.entries(days).map(([day, prop]) => `<tr>
        <td style="vertical-align: top; font-weight: bold; text-transform: capitalize;">${day}</td>
        <td style="vertical-align: top;">
          ${!prop.active ? 'Closed' : prop.intervals.map((t, i) => `<p style="margin: ${i > 0 ? '10px 0 0' : '0'};">${t.from} - ${t.to}</p>`).join('\n')}
        </td>
      </tr>`).join('\n')}
    </table>`,
      isHTML: true,
      enableFilter: false
    }
  );
};

const chatWithOwner = () => {
  const { currentUser } = authManager;
  const users = [];

  if (!currentUser) {
    return console.warn('undefined currentUser');
  }
  users.push(selectedLocation.owner.userId);
  users.push(currentUser._id);
  buildfire.navigation.navigateToSocialWall(
    {
      title: selectedLocation.title,
      wallUserIds: users
    },
    (err, result) => {
      if (err) console.error(err);
    }
  );
};
const shareLocation = () => {
  console.log('share Location clicked');
  buildfire.deeplink.generateUrl(
    {
      data: { locationId: 'THIS-IS-TEST-ID' },
    },
    (err, result) => {
      if (err) return console.error(err);
      buildfire.device.share({
        subject: 'Location URL',
        text: 'Location shared: ',
        link: result.url
      }, (err, result) => {
        if (err) console.error(err);
        if (result) console.log(result);
      });
    }
  );
  // todo getData()
  // todo testing
};

const handleListActionItem = (e) => {
  const actionItemId = e.target.dataset.actionId;
  const actionItem = introductoryLocations
    .reduce((prev, next) => prev.concat(next.actionItems), [])
    .find((entity) => entity.id === actionItemId);
  buildfire.actionItems.execute(
    actionItem,
    (err) => {
      if (err) {
        console.error(err);
      }
    }
  );
};
const fetchMoreIntroductoryLocations = (e) => {
  const listContainer = document.querySelector('section#intro');
  const activeTemplate = getComputedStyle(document.querySelector('section#listing'), null).display !== 'none' ? 'listing' : 'intro';

  if (activeTemplate === 'intro' && !introductoryLocationsPending && introductoryLocationsCount > introductoryLocations.length) {
    if (e.target.scrollTop + e.target.offsetHeight > listContainer.offsetHeight) {
      currentIntroductoryPage += 1;
      fetchIntroductoryLocations((err, result) => {
        renderIntroductoryLocations(result);
      });
    }
  }
};

const viewFullImage = (url) => {
  buildfire.imagePreviewer.show({ images: [url] });
};

const initEventListeners = () => {
  document.querySelector('body').addEventListener('scroll', fetchMoreIntroductoryLocations, false);
  document.addEventListener('focus', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchTextField') {
      showElement('#areaSearchLabel');
      hideElement('.header-qf');
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchLocationsBtn') {
      searchLocations(e);
    } else if (e.target.id === 'filterIconBtn') {
      toggleFilterOverlay();
    } else if (e.target.id === 'showMapView') {
      showMapView();
    } else if (['priceSortingBtn', 'otherSortingBtn'].includes(e.target.id)) {
      toggleDropdownMenu(e.target.nextElementSibling);
    } else if (e.target.classList.contains('location-item'))  {
      selectedLocation = introductoryLocations.find((i) => i.id === e.target.dataset.id);
      showLocationDetail();
    } else if (e.target.id === 'workingHoursBtn') {
      showWorkingHoursDrawer();
    } else if (e.target.id === 'chatWithOwnerBtn') {
      chatWithOwner();
    } else if (e.target.id === 'shareLocationBtn') {
      shareLocation();
    } else if (e.target.classList.contains('list-action-item')) {
      handleListActionItem(e);
    } else if (e.target.parentNode.classList.contains('location-detail__carousel')) {
      viewFullImage(selectedLocation.images.find((i) => i.id === e.target.dataset.id).imageUrl);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!e.target) return;

    const keyCode = e.which || e.keyCode;

    if (keyCode === 13 && e.target.id === 'searchTextField') {
      searchLocations(e);
    }
  });
};

const initFilterOverlay = () => {
  if (Object.keys(filterElements).length > 0) {
    return;
  }

  let html = '';
  const container = document.querySelector('.expansion-panel__container .accordion');
  CATEGORIES.forEach((category) => {
    filterElements[category.id] = [];
    html += `<div class="expansion-panel" data-cid="${category.id}">
        <button class="expansion-panel-header mdc-ripple-surface">
          <div class="expansion-panel-header-content">
            <span class="expansion-panel-title">
            <i class="${category.iconClassName ?? 'glyphicon glyphicon-map-marker'}"></i>
              ${category.title}
            </span>
            <div class="expansion-panel-actions margin-right-ten">
              <div class="mdc-touch-target-wrapper">
                <div class="mdc-checkbox mdc-checkbox--touch">
                  <input type="checkbox"
                         class="mdc-checkbox__native-control"
                         id="checkbox-1"/>
                  <div class="mdc-checkbox__background">
                    <svg class="mdc-checkbox__checkmark mdc-theme--on-primary"
                         viewBox="0 0 24 24">
                      <path class="mdc-checkbox__checkmark-path"
                            fill="none"
                            d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
                    </svg>
                    <div class="mdc-checkbox__mixedmark"></div>
                  </div>
                  <div class="mdc-checkbox__ripple"></div>
                </div>
              </div>
              <div class="expansion-panel-indicator"></div>
            </div>
          </div>
        </button>
        <div class="expansion-panel-body">
          <div class="mdc-chip-set mdc-chip-set--filter expansion-panel-body-content" role="grid">
          ${category.subcategories.map((subcategory) => `<div class="mdc-chip" role="row" data-sid="${subcategory.id}">
              <div class="mdc-chip__ripple"></div>
              <i class="material-icons-outlined mdc-chip__icon mdc-chip__icon--leading">fmd_good</i>
              <span class="mdc-chip__checkmark">
                <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
                  <path class="mdc-chip__checkmark-path" fill="none" stroke="black" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
              </span>
              <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">${subcategory.title}</span>
                </span>
              </span>
            </div>`).join('\n')}
        </div>
      </div>
      </div>`;
  });
  container.innerHTML = html;

  new Accordion({
    element: document.querySelector('.accordion'),
    multi: true
  });

  const chipSetsElements = document.querySelectorAll('#filter .mdc-chip-set');
  const chipSets = {};
  Array.from(chipSetsElements).forEach((c) => {
    const parent = c.closest('div.expansion-panel');
    chipSets[parent.dataset.cid] = new mdc.chips.MDCChipSet(c);
  });

  const expansionPanelCheckBox = document.querySelectorAll('.mdc-checkbox input');
  Array.from(expansionPanelCheckBox).forEach((c) => c.addEventListener('change', (e) => {
    const { target } = e;
    const mdcCheckBox = target.closest('.mdc-checkbox');
    const parent = target.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;
    if (!target.checked) {
      filterElements[categoryId] = [];
    }

    chipSets[categoryId].chips.forEach((c) => {
      const { sid } = c.root_.dataset;
      if (target.checked && !filterElements[categoryId].includes(sid)) {
        filterElements[categoryId].push(sid);
      }
      c.selected = target.checked;
    });
    target.disabled = true;
    mdcCheckBox.classList.add('mdc-checkbox--disabled');
    setTimeout(() => {
      target.disabled = false;
      mdcCheckBox.classList.remove('mdc-checkbox--disabled');
    }, 500);
  }));

  const subcategoriesChips = document.querySelectorAll('#filter .mdc-chip');
  Array.from(subcategoriesChips).forEach((c) => c.addEventListener('click', (e) => {
    const { target } = e;
    const mdcChip = target.closest('.mdc-chip');

    if (mdcChip.classList.contains('disabled')) {
      return;
    }

    const parent = target.closest('div.expansion-panel');
    const input = parent.querySelector('.mdc-checkbox__native-control');
    const chipCheckbox = mdcChip.querySelector('.mdc-chip__primary-action');
    const selected = chipCheckbox.getAttribute('aria-checked') === 'true';
    const categoryId = parent.dataset.cid;
    const subcategoryId = mdcChip.dataset.sid;
    const category = CATEGORIES.find((c) => c.id === categoryId);

    if (selected && !filterElements[categoryId].includes(subcategoryId)) {
      filterElements[categoryId].push(subcategoryId);
    } else {
      filterElements[categoryId] = filterElements[categoryId].filter((item) => item !== subcategoryId);
    }

    input.indeterminate = false;
    if (filterElements[categoryId].length === 0) {
      input.checked = false;
    } else if (filterElements[categoryId].length === category.subcategories.length) {
      input.checked = true;
    } else {
      input.indeterminate = true;
    }

    mdcChip.classList.add('disabled');
    setTimeout(() => mdcChip.classList.remove('disabled'), 500);
  }));
};

const showMapView = () => {
  hideElement('section#intro');
  showElement('section#listing');
  initDrawer();
  renderListingLocations();
};

const navigateTo = (template) => {
    const currentActive = document.querySelector('section.active');
    currentActive.classList.remove('active');
    document.querySelector(`section#${template}`).classList.add('active');
};

const initHomeView = () => {
  const { showIntroductoryListView, introductoryListView } = settings;
  injectTemplate('home');
  fetchCategories(() => {
    initFilterOverlay();
    refreshQuickFilter(); // todo if quick filter enabled
    fetchIntroductoryLocations(() => {
      if (showIntroductoryListView) {
        renderIntroductoryLocations(introductoryLocations);
        refreshIntroductoryDescription();
        showElement('section#intro');
        refreshIntroductoryCarousel();

        if (introductoryListView.images.length === 0
          && introductoryLocations.length === 0
          && !introductoryListView.description) {
          showElement('div.empty-page');
        }

        // eslint-disable-next-line no-new
        new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
      } else {
        showMapView();
      }
    });
  });
};

const calculateLocationDistance = (address) => {
  if (!userPosition) return null;
  const origin = {
    latitude: userPosition.latitude,
    longitude: userPosition.longitude,
  };
  const destination = {
    latitude: address.lat,
    longitude: address.lng
  };
  const distance = buildfire.geo.calculateDistance(origin, destination, { decimalPlaces: 5 });
  let result;
  if (distance < 0.5) {
    result = `${Math.round(distance * 5280).toLocaleString()} ft`;
  } else if (settings.measurementUnit === 'metric') {
    result = `${Math.round(distance * 1.60934).toLocaleString()} km`;
  } else {
    result = `${Math.round(distance).toLocaleString()} mi`;
  }
  return result;
};

const updateLocationsDistance = () => {
  introductoryLocations = introductoryLocations.map((location) => {
    const distance = calculateLocationDistance(location.coordinates);
    const distanceSelector = document.querySelector(`.location-item[data-id="${location.id}"] .location-item__actions p`);
    if (distanceSelector) distanceSelector.textContent = distance;
    return { ...location, ...{ distance } };
  });
};
const clearTemplate = (template) => {
  if (!templates[template]) {
    console.warn(`template ${template} not found.`);
    return;
  }
  document.querySelector(`section#${template}`).innerHTML = '';
};
const init = () => {
  fetchSettings(() => {
    // fetchTemplate('filter', injectTemplate);
    // fetchTemplate('home', initHomeView);
    fetchCategories(() => {
      showLocationDetail();
    });
    initEventListeners();

    buildfire.deeplink.getData((deeplinkData) => {
      if (deeplinkData?.locationId) {
        // todo fetch location where id;
        // todo navigate to location
      }
    });

    buildfire.geo.getCurrentPosition({ enableHighAccuracy: true }, (err, position) => {
      if (err) {
        return console.error(err);
      }
      userPosition = position.coords;
      updateLocationsDistance();
    });

    buildfire.history.onPop((breadcrumb) => {
      console.log('Breadcrumb popped', breadcrumb);
      if (document.querySelector('section#filter').classList.contains('overlay')) {
        toggleFilterOverlay();
      } else if (document.querySelector('section#detail').classList.contains('active')) {
        clearTemplate('detail');
        navigateTo('home');
      }
    });

    buildfire.appearance.getAppTheme((err, appTheme) => {
      if (err) return console.error(err);
      const root = document.documentElement;
      const { colors } = appTheme;
      root.style.setProperty('--body-theme', colors.bodyText);
      root.style.setProperty('--header-theme', colors.headerText);
      root.style.setProperty('--background-color', colors.backgroundColor);
      root.style.setProperty('--primary-color', colors.primaryTheme);
    });
  });
};

authManager.enforceLogin(init);
