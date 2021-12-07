/**
 * Category data model
 * @class
 */
export default class Category {
  /**
   * @param {object} data
   * @constructor
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.title = data.title || "";
    this.iconUrl = data.iconUrl || null;
    this.iconClassName = data.iconClassName || null;
    this.subcategories = data.subcategories || [];
    this.quickAccess = [0, 1].includes(data.quickAccess) ? data.quickAccess : 0;
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
      id: this.id,
      title: this.title,
      iconUrl: this.iconUrl,
      iconClassName: this.iconClassName,
      subcategories: this.subcategories,
      quickAccess: this.quickAccess,
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
          date1: this.deletedOn,
          number1: this.quickAccess
        }
      }
    };
  }
}
