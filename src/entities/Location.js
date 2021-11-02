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
          date1: this.createdOn
        }
      }
    };
  }
}
