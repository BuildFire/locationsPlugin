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
    categories: { main: [faker.random.number()], subcategories: [faker.random.number()] },
    settings: {
      showCategory: faker.random.boolean(),
      showOpeningHours: faker.random.boolean(),
      showPriceRange: faker.random.boolean(),
      showStarRating: faker.random.boolean(),
      allowChat: faker.random.boolean()
    },
    openingHours: {},
    images: [faker.image.image(), faker.image.image()],
    listImage: faker.image.avatar(),
    description: faker.random.words(),
    owner: {},
    views: faker.random.number(),
    priceRange: faker.random.arrayElement([1, 2, 3, 4]),
    rating: {
      total: faker.random.number(),
      count: faker.random.number(),
      average: faker.random.number()
    },
    bookmarksCount: faker.random.number(),
    actionItems: [],
    createdOn: faker.date.past(),
    createdBy: faker.random.number(),
    lastUpdatedOn: faker.date.past(),
    lastUpdatedBy: faker.random.number(),
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
