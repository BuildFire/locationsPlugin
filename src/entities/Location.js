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
    this.title = data.title || null;
    this.subtitle = data.subtitle || null;
    this.pinIndex = data.pinIndex || null;
    this.address = data.address || null;
    this.formattedAddress = data.formattedAddress || null;
    this.addressAlias = data.addressAlias || null;
    this.coordinates = data.coordinates || { latitude: null, longitude: null };
    this.marker = data.marker || { type: null, icon: null, color: null };
    this.categories = data.categories || { main: [], subcategories: [] };
    this.settings = data.settings || {
      showCategory: true,
      showOpeningHours: false,
      showPriceRange: false,
      showStarRating: false,
      allowChat: true
    };
    this.openingHours = data.openingHours || {
      timezone: null,
      days: {}
    };
    this.images = data.images || [];
    this.listImage = data.listImage || null;
    this.description = data.description || null;
    this.owner = data.owner || {};
    this.views = data.views || 0;
    this.priceRange = data.priceRange || 0;
    this.price = data.price || { range: 0, currency: '$' };
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

  toJSON() {
    return {
      title: this.title,
      subtitle: this.subtitle,
      pinIndex: this.pinIndex,
      address: this.address,
      formattedAddress: this.formattedAddress,
      addressAlias: this.addressAlias,
      coordinates: this.coordinates,
      marker: this.marker,
      categories: this.categories,
      settings: this.settings,
      openingHours: this.openingHours,
      images: this.images,
      listImage: this.listImage,
      description: this.description,
      owner: this.owner,
      views: this.views,
      price: this.price,
      rating: this.rating,
      bookmarksCount: this.bookmarksCount,
      actionItems: this.actionItems,
      createdOn: this.createdOn,
      createdBy: this.createdBy,
      lastUpdatedOn: this.lastUpdatedOn,
      lastUpdatedBy: this.lastUpdatedBy,
      deletedOn: this.deletedOn,
      deletedBy: this.deletedBy,
      isActive: this.isActive,
      _buildfire: {
        index: {
          string1: this.title.toLowerCase(),
          date1: this.createdOn,
          array1: this.categories.main,
          array2: this.categories.subcategories,
          number1: this.pinIndex,
          number2: this.priceRange,
          number3: this.views
        }
      }
    };
  }
}
