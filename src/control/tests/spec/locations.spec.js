import "../lib/jasmine";
import "../lib/jasmine-html";
import "../lib/boot";

import Categories from "../../../repository/Categories";
import Locations from "../../../repository/Locations";
import authManager from "../../../UserAccessControl/authManager";
import Location from "../../../entities/Location";

const run = () => {
  describe("Locations", () => {

    let categories = []
    beforeEach((done) => {
      Categories.search().then((result) => {
        categories = result;
        done();
      }).catch((err) => {
        done(err);
      });
    });

    const location = {
      title: "Moe Test",
      subTitle: 'Test',
      address: 'Amman, Jordan',
      coordinates: { lat: 31.954043, lng:  35.910560 },
      description: 'This test location',
      createdBy: authManager.sanitizedCurrentUser,
      createdAt: new Date()
    }

    it("create location", (done) => {
      location.categories = { main: categories.slice(0, 4).map(elem => elem.id), subcategories: [] };
      Locations.add(new Location(location).toJSON()).then((resp) => {
        location.id = resp.id;
        expect(resp.id).toBeDefined();
        done();
      });
    });

    it("search locations", (done) => {
      Locations.search({
        recordCount: true
      }).then((resp) => {
        expect(Array.isArray(resp.result)).toBeTrue();
        expect(resp.totalRecord).toBeGreaterThan(0);
        done();
      });
    });

    it("update location", (done) => {
      Locations.search({recordCount: true}).then((result) => {
        const loc = result.result[result.result.length -1];
        loc.title = 'Moe Restaurant'
        Locations.update(loc.id, new Location(loc).toJSON()).then((resp) => {
          expect(resp.data.title).toEqual('Moe Restaurant');
          done();
        });
      })
    });

    it("delete location", (done) => {
      Locations.search({recordCount: true}).then((result) => {
        const loc = result.result[result.result.length -1];
        Locations.delete(loc.id).then((resp) => {
          expect(resp.status).toEqual('deleted');
          done();
        });
      })
    });
  });

}

export default {
  run
}
