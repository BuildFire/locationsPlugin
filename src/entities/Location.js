/* eslint-disable class-methods-use-this */
import buildfire from 'buildfire';

/**
 * Location data model
 * @class
 */
export default class Location {
  /**
   * @param {object} data
   * @constructor
   */
  constructor(data = {}) {
    this.id = data.id || undefined;
    this.clientId = data.clientId || undefined;
    this.title = data.title || null;
    this.subtitle = data.subtitle || null;
    this.pinIndex = data.pinIndex || null;
    this.address = data.address || null;
    this.formattedAddress = data.formattedAddress || null;
    this.addressAlias = data.addressAlias || null;
    this.subscribers = data.subscribers || [];
    this.coordinates = data.coordinates || { lat: null, lng: null };
    this.marker = data.marker || { type: "pin", image: null, color: null, base64Image: null };
    this.categories = data.categories || { main: [], subcategories: [] };
    this.settings = data.settings || {
      showCategory: true,
      showOpeningHours: false,
      showPriceRange: false,
      showStarRating: false,
    };
    this.openingHours = data.openingHours || {
      timezone: null,
      days: {}
    };
    this.editingPermissions = data.editingPermissions || {
      active: false,
      editors: [],
      tags: []
    };
    this.images = data.images || [];
    this.listImage = data.listImage || null;
    this.description = data.description || null;
    this.wysiwygSource = data.wysiwygSource || 'control'; // control || widget
    this.views = isNaN(parseInt(data.views)) ?  0  : parseInt(data.views);
    this.price = data.price || { range: 1, currency: '$' };
    this.rating = data.rating || { total: 0, count: 0, average: 0 };
    this.bookmarksCount = data.bookmarksCount || 0;
    this.actionItems = data.actionItems || [];
    this.createdOn = data.createdOn || new Date();
    this.createdBy = data.createdBy || null;
    this.lastUpdatedOn = data.lastUpdatedOn || new Date();
    this.lastUpdatedBy = data.lastUpdatedBy || null;
    this.deletedOn = data.deletedOn || null;
    this.deletedBy = data.deletedBy || null;
    this.isActive = [0, 1].includes(data.isActive) ? data.isActive : 1;
  }

  get instanceId() {
    return buildfire.getContext().instanceId;
  }

  toJSON() {
    return {
      id: this.id,
      clientId: this.clientId,
      title: this.title,
      subtitle: this.subtitle,
      pinIndex: this.pinIndex,
      address: this.address,
      formattedAddress: this.formattedAddress,
      addressAlias: this.addressAlias,
      subscribers: this.subscribers,
      coordinates: this.coordinates,
      marker: this.marker,
      categories: this.categories,
      settings: this.settings,
      openingHours: this.openingHours,
      images: this.images,
      listImage: this.listImage,
      description: this.description,
      wysiwygSource: this.wysiwygSource,
      views: this.views,
      price: this.price,
      rating: this.rating,
      bookmarksCount: this.bookmarksCount,
      actionItems: this.actionItems,
      editingPermissions: this.editingPermissions,
      createdOn: this.createdOn,
      createdBy: this.createdBy,
      lastUpdatedOn: this.lastUpdatedOn,
      lastUpdatedBy: this.lastUpdatedBy,
      deletedOn: this.deletedOn,
      deletedBy: this.deletedBy,
      isActive: this.isActive,
      _buildfire: {
        index: {
          text: `${this.title.toLowerCase()} ${this.subtitle ? this.subtitle : ''} ${this.address} ${this.formattedAddress} ${this.addressAlias ? this.addressAlias : ''}`,
          string1: this.title.toLowerCase(),
          date1: this.createdOn,
          array1: [...this.categories.main.map(elemId => ({ string1: 'c_' + elemId })),
            ...this.categories.subcategories.map(elemId => ({ string1: 's_' + elemId })),
            { string1: 'v_' + this.views },
            { string1: 'pr_' + this.price.range },
            { string1: 'cid_' + this.clientId },
            { string1: 'title_' + this.title.toLowerCase() }
          ],
          number1: this.pinIndex
        },
        geo: {
          type: "Point",
          coordinates: [this.coordinates.lng, this.coordinates.lat],
        }
      }
    };
  }
}
