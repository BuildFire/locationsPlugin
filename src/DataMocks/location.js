import faker from 'faker';
import Location from '../entities/Location';

function instance() {
  const payload = {
    title: faker.random.words(),
    subtitle: faker.random.words(),
    pinIndex: faker.random.arrayElement([0, 1, 2, 3, undefined]),
    type: faker.random.arrayElement(['address', 'coordinate']),
    address: `${faker.address.streetName()}, ${faker.address.cityName()}, ${faker.address.country()}`,
    formattedAddress: `${faker.address.streetName()}, ${faker.address.cityName()}, ${faker.address.country()}`,
    addressAlias: faker.random.word(),
    coordinates: { latitude: faker.address.latitude(), longitude: faker.address.longitude() },
    marker: { type: faker.random.arrayElement(['marker', 'circle', 'icon']), icon: faker.image.avatar(), color: faker.internet.color() },
    categories: { main: [faker.datatype.number()], subcategories: [faker.datatype.number()] },
    settings: {
      showCategory: faker.datatype.boolean(),
      showOpeningHours: faker.datatype.boolean(),
      showPriceRange: faker.datatype.boolean(),
      showStarRating: faker.datatype.boolean(),
      allowChat: faker.datatype.boolean()
    },
    openingHours: {},
    images: [faker.image.image(), faker.image.image()],
    listImage: faker.image.avatar(),
    description: faker.random.words(),
    views: faker.datatype.number(),
    priceRange: faker.random.arrayElement([1, 2, 3, 4]),
    rating: {
      total: faker.datatype.number(),
      count: faker.datatype.number(),
      average: faker.datatype.number()
    },
    bookmarksCount: faker.datatype.number(),
    actionItems: [],
    createdOn: faker.date.past(),
    createdBy: faker.datatype.number(),
    lastUpdatedOn: faker.date.past(),
    lastUpdatedBy: faker.datatype.number(),
    deletedOn: undefined,
    deletedBy: undefined,
    isActive: true,
    get _buildfire() {
      return {
        index: {
          string1: this.title.toLowerCase(),
          date1: this.createdOn,
          array1: this.categories.main,
          array2: this.categories.subcategories,
          number1: this.pinIndex,
          number2: this.priceRange,
          number3: this.views
        }
      };
    }
  };

  return new Location(payload).toJSON();
}

export default instance;
